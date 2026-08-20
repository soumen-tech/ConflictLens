/**
 * geminiClient.ts
 *
 * Enriches an AnalysisResult by calling the Gemini AI API for each risk.
 * All risks are sent in a single batched request for efficiency.
 *
 * Phase 3: reads `conflictlens.geminiApiKey` from VS Code settings.
 *   • Key set   → calls gemini-2.5-flash, fills in ai_context per risk.
 *   • Key unset → returns the result unchanged ("Pending AI response..." stays).
 *
 * No VS Code UI code here — this file is pure data transformation.
 */

import * as vscode from 'vscode';
import { AnalysisResult, Risk } from './analyzerClient';

// ─── Gemini REST API types ────────────────────────────────────────────────────

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  parts: GeminiPart[];
}

interface GeminiRequest {
  contents: GeminiContent[];
  generationConfig: {
    responseMimeType: string;
  };
}

interface AiEnrichment {
  id: string;
  explanation: string;
  recommendation: string;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(risks: Risk[]): string {
  const riskSummaries = risks.map((r) => ({
    id: r.id,
    type: r.type,
    riskLevel: r.riskLevel,
    file: r.location.file,
    line: r.location.line,
    details: r.details,
  }));

  return `You are a senior code reviewer for ConflictLens, an AI-powered tool that detects semantic merge conflicts and security risks in Git diffs.

Analyze the following risks detected in a developer's codebase and write concise, developer-friendly explanations.

Risks:
${JSON.stringify(riskSummaries, null, 2)}

For EACH risk, respond with:
- explanation: 2–3 plain-English sentences describing exactly what the risk is and why it could cause a bug or security incident.
- recommendation: 1–2 sentences with a specific, actionable fix the developer should apply.

Respond ONLY as a valid JSON array — no markdown, no extra text:
[
  {
    "id": "<risk id>",
    "explanation": "<explanation>",
    "recommendation": "<recommendation>"
  }
]`;
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parseGeminiResponse(raw: string): AiEnrichment[] {
  // Strip any accidental markdown fences Gemini may have added
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  const parsed = JSON.parse(cleaned) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error('Gemini response was not a JSON array');
  }

  return parsed.map((item: unknown) => {
    const obj = item as Record<string, unknown>;
    return {
      id:             String(obj.id ?? ''),
      explanation:    String(obj.explanation ?? ''),
      recommendation: String(obj.recommendation ?? ''),
    };
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enriches each risk in the AnalysisResult with a Gemini-generated explanation
 * and recommendation. Returns a new AnalysisResult (original is not mutated).
 *
 * Graceful degradation:
 *   • No API key         → returns result unchanged (no API call).
 *   • Gemini unreachable → logs warning, returns result unchanged.
 *   • Bad JSON response  → logs warning, returns result unchanged.
 *
 * This means the extension never crashes on Gemini failure — the worst outcome
 * is diagnostics staying with "Pending AI response..." placeholder text.
 */
export async function enrichWithAI(result: AnalysisResult): Promise<AnalysisResult> {
  const config  = vscode.workspace.getConfiguration();
  const apiKey  = config.get<string>('conflictlens.geminiApiKey', '').trim();
  const timeout = config.get<number>('conflictlens.apiTimeoutMs', 8000);

  if (!apiKey) {
    console.log('[ConflictLens] geminiApiKey not set — skipping AI enrichment.');
    return result;
  }

  if (result.risks.length === 0) {
    return result; // Nothing to enrich.
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const body: GeminiRequest = {
    contents: [{ parts: [{ text: buildPrompt(result.risks) }] }],
    generationConfig: { responseMimeType: 'application/json' },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let raw: string;
  try {
    const response = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`[ConflictLens] Gemini API error HTTP ${response.status}:`, errText);
      return result;
    }

    const json = (await response.json()) as Record<string, unknown>;
    // Gemini wraps the content in candidates[0].content.parts[0].text
    const candidates = json.candidates as Array<{ content: { parts: Array<{ text: string }> } }>;
    raw = candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    console.warn(
      isTimeout
        ? '[ConflictLens] Gemini request timed out — AI enrichment skipped.'
        : '[ConflictLens] Gemini request failed:', err
    );
    return result;
  } finally {
    clearTimeout(timer);
  }

  // Parse and apply enrichments
  let enrichments: AiEnrichment[];
  try {
    enrichments = parseGeminiResponse(raw);
  } catch (err) {
    console.warn('[ConflictLens] Could not parse Gemini response:', err, '\nRaw:', raw);
    return result;
  }

  // Build a lookup map for O(1) matching
  const enrichMap = new Map(enrichments.map((e) => [e.id, e]));

  const enrichedRisks: Risk[] = result.risks.map((risk) => {
    const enrichment = enrichMap.get(risk.id);
    if (!enrichment) { return risk; }

    return {
      ...risk,
      ai_context: {
        explanation:    enrichment.explanation    || risk.ai_context.explanation,
        recommendation: enrichment.recommendation || risk.ai_context.recommendation,
      },
    };
  });

  return { ...result, risks: enrichedRisks };
}
