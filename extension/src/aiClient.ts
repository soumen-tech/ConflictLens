/**
 * geminiClient.ts
 *
 * Enriches an AnalysisResult by generating AI explanations for each risk.
 *
 * Phase 3: reads `conflictlens.geminiApiKey` from VS Code settings and calls
 *   Gemini directly (all risks batched in one request).
 *
 * Phase 4: proxy-first call flow —
 *   1. If `conflictlens.proxyUrl` is set:
 *      → call POST {proxyUrl}/api/explain once per risk (no key on the client)
 *      → on 429 (limit reached): show friendly message, fall back to BYO-key path
 *      → on other proxy failure:  fall back to BYO-key path silently (logged only)
 *   2. If proxy is empty/unset, or proxy fallback triggered:
 *      → use existing BYO-key path (batched Gemini call) — Phase 3 unchanged
 *   3. If neither proxy nor BYO-key is available: return result unchanged
 *      ("Pending AI response..." stays) — identical to Phase 3 no-key behaviour.
 *
 * No VS Code UI code here — this file is pure data transformation, except for
 * the one informational message shown when the free limit is reached.
 *
 * Requires `context: vscode.ExtensionContext` so it can read/write `globalState`
 * for the persistent anonymous deviceId.
 */

import * as vscode from 'vscode';
import { AnalysisResult, Risk } from './analyzerClient';

// ─── Gemini REST API types (BYO-key direct path) ─────────────────────────────

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

// ─── Proxy response shapes ────────────────────────────────────────────────────

interface ProxySuccessResponse {
  explanation: string;
  remainingFreeScans: number;
}

interface ProxyErrorResponse {
  error: string;
  message: string;
  remainingFreeScans?: number;
}

// ─── Device ID ────────────────────────────────────────────────────────────────

const DEVICE_ID_KEY = 'conflictlens.deviceId';

/**
 * Returns the persistent anonymous device ID for this VS Code install.
 * Created once with crypto.randomUUID() and stored in globalState so it
 * survives extension restarts without being tied to any personal data.
 */
function getOrCreateDeviceId(context: vscode.ExtensionContext): string {
  const existing = context.globalState.get<string>(DEVICE_ID_KEY);
  if (existing) { return existing; }

  const newId = crypto.randomUUID();
  void context.globalState.update(DEVICE_ID_KEY, newId);
  console.log(`[ConflictLens] Generated new anonymous deviceId: ${newId}`);
  return newId;
}

// ─── Proxy path (per-risk) ────────────────────────────────────────────────────

/**
 * Calls the hosted proxy for a single risk.
 *
 * Returns:
 *   { explanation: string }  on success
 *   null                     on any failure (caller falls back to BYO-key)
 *
 * Side-effects:
 *   Shows a VS Code information message if the free limit is reached (429).
 */
async function callViaProxy(
  risk: Risk,
  deviceId: string,
  proxyUrl: string,
  timeout: number,
): Promise<{ explanation: string } | null> {
  const endpoint = `${proxyUrl.replace(/\/$/, '')}/api/explain`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, risk }),
      signal: controller.signal,
    });

    if (response.status === 429) {
      const body = await response.json().catch(() => ({} as ProxyErrorResponse));
      const msg = (body as ProxyErrorResponse).message
        ?? 'Free AI explanations used up — add your own Gemini API key in ConflictLens settings for unlimited scans.';

      // Show the message once (VS Code deduplicates identical messages automatically)
      void vscode.window.showInformationMessage(`ConflictLens: ${msg}`);
      return null; // Trigger BYO-key fallback
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.warn(`[ConflictLens] Proxy error HTTP ${response.status}:`, text);
      return null; // Trigger BYO-key fallback silently
    }

    const body = await response.json() as ProxySuccessResponse;
    if (!body.explanation) {
      console.warn('[ConflictLens] Proxy returned empty explanation.');
      return null;
    }

    return { explanation: body.explanation };

  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    console.warn(
      isTimeout
        ? '[ConflictLens] Proxy request timed out — falling back to BYO-key path.'
        : '[ConflictLens] Proxy request failed — falling back to BYO-key path:', err
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── BYO-key path (batched) ───────────────────────────────────────────────────

function buildBatchPrompt(risks: Risk[]): string {
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

function parseBatchResponse(raw: string): AiEnrichment[] {
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

/**
 * Calls Gemini directly with the user's own API key — all risks batched.
 * Phase 3 behaviour, unchanged. Returns enrichments or empty array on failure.
 */
async function callGeminiDirectly(
  risks: Risk[],
  apiKey: string,
  timeout: number,
  modelId: string = 'gemma-4-26b-a4b-it',
): Promise<AiEnrichment[]> {
  const effectiveModel = modelId.trim() || 'gemma-4-26b-a4b-it';
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${effectiveModel}:generateContent?key=${apiKey}`;

  const body: GeminiRequest = {
    contents: [{ parts: [{ text: buildBatchPrompt(risks) }] }],
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
      return [];
    }

    const json = (await response.json()) as Record<string, unknown>;
    const candidates = json.candidates as Array<{ content: { parts: Array<{ text: string }> } }>;
    raw = candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    console.warn(
      isTimeout
        ? '[ConflictLens] Gemini request timed out — AI enrichment skipped.'
        : '[ConflictLens] Gemini request failed:', err
    );
    return [];
  } finally {
    clearTimeout(timer);
  }

  try {
    return parseBatchResponse(raw);
  } catch (err) {
    console.warn('[ConflictLens] Could not parse Gemini response:', err, '\nRaw:', raw);
    return [];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enriches each risk in the AnalysisResult with AI-generated explanation text.
 * Returns a new AnalysisResult (original is not mutated).
 *
 * Call flow (Phase 4):
 *   proxyUrl set   → try proxy per-risk → on failure/limit, fall back to BYO-key
 *   proxyUrl empty → BYO-key direct call (Phase 3, unchanged)
 *   neither set    → return result unchanged ("Pending AI response..." stays)
 *
 * This function never throws — the worst outcome is the result being returned
 * as-is with placeholder AI text.
 */
export async function enrichWithAI(
  result: AnalysisResult,
  context: vscode.ExtensionContext,
): Promise<AnalysisResult> {
  if (result.risks.length === 0) {
    return result;
  }

  const config   = vscode.workspace.getConfiguration();
  const proxyUrl = config.get<string>('conflictlens.proxyUrl', '').trim();
  const apiKey   = (config.get<string>('conflictlens.gemmaApiKey', '').trim()) ||
                   (config.get<string>('conflictlens.aiApiKey', '').trim()) ||
                   (config.get<string>('conflictlens.geminiApiKey', '').trim());
  const timeout  = config.get<number>('conflictlens.apiTimeoutMs', 8000);
  const modelId  = config.get<string>('conflictlens.modelId', 'gemma-4-26b-a4b-it').trim();

  // ── Proxy path ─────────────────────────────────────────────────────────────
  if (proxyUrl) {
    const deviceId = getOrCreateDeviceId(context);
    console.log(`[ConflictLens] Proxy path — deviceId: ${deviceId}, url: ${proxyUrl}`);

    let proxyFailed = false;
    const enrichedRisks: Risk[] = [...result.risks];

    for (let i = 0; i < result.risks.length; i++) {
      const risk = result.risks[i];
      const proxyResult = await callViaProxy(risk, deviceId, proxyUrl, timeout);

      if (proxyResult === null) {
        // Proxy failed or limit reached — break and fall through to BYO-key
        proxyFailed = true;
        break;
      }

      enrichedRisks[i] = {
        ...risk,
        ai_context: {
          explanation:    proxyResult.explanation,
          recommendation: 'Follow the specific fix recommendation provided in the explanation above.',
        },
      };
    }

    // If proxy succeeded for all risks, return enriched result
    if (!proxyFailed) {
      return { ...result, risks: enrichedRisks };
    }

    // Proxy path failed — fall through to BYO-key below
    console.log('[ConflictLens] Proxy path failed — attempting BYO-key fallback.');
  }

  // ── BYO-key path (Phase 3, unchanged) ──────────────────────────────────────
  if (!apiKey) {
    // ── Fallback when AI enrichment is unavailable or fails ────────────────────
    const fallbackMessage = !proxyUrl && !apiKey
      ? 'AI enrichment skipped — configure conflictlens.proxyUrl or conflictlens.gemmaApiKey in settings.'
      : 'AI explanation unavailable — check that local gemma-proxy is running on port 3001 or verify your API key.';

    const fallbackRisks: Risk[] = result.risks.map((risk: Risk) => {
      if (risk.ai_context.explanation.startsWith('Pending AI response')) {
        return {
          ...risk,
          ai_context: {
            explanation: fallbackMessage,
            recommendation: 'Verify proxy server status or API key in ConflictLens settings.',
          },
        };
      }
      return risk;
    });

    return { ...result, risks: fallbackRisks };
  }

  console.log(`[ConflictLens] BYO-key path — calling Gemini directly (${modelId || 'gemma-4-26b-a4b-it'}).`);
  const enrichments = await callGeminiDirectly(result.risks, apiKey, timeout, modelId);

  if (enrichments.length === 0) {
    const fallbackMessage = 'AI explanation unavailable — verify your API key in ConflictLens settings.';
    const fallbackRisks: Risk[] = result.risks.map((risk: Risk) => {
      if (risk.ai_context.explanation.startsWith('Pending AI response')) {
        return {
          ...risk,
          ai_context: {
            explanation: fallbackMessage,
            recommendation: 'Check API key or network connection.',
          },
        };
      }
      return risk;
    });
    return { ...result, risks: fallbackRisks };
  }

  const enrichMap = new Map(enrichments.map((e) => [e.id, e]));

  const enrichedRisks: Risk[] = result.risks.map((risk: Risk) => {
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
