/**
 * server.ts — ConflictLens Gemini Proxy
 *
 * Implements POST /api/explain from the Phase 4 shared API contract:
 *
 *   Request:  { deviceId: string, risk: <Risk JSON> }
 *   Success:  { explanation: string, remainingFreeScans: number }
 *   Limit:    { error: "free_limit_reached", message: string, remainingFreeScans: 0 }  (429)
 *   Failure:  { error: string, message: string }  (500/502)
 *
 * The GEMINI_API_KEY is read from the environment and NEVER returned to clients.
 * FREE_SCAN_LIMIT (default 20) is also env-configurable — no code changes needed.
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { usageStore } from './usageStore';

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT            = parseInt(process.env.PORT ?? '3001', 10);
const FREE_SCAN_LIMIT = parseInt(process.env.FREE_SCAN_LIMIT ?? '20', 10);
const GEMINI_API_KEY  = process.env.GEMINI_API_KEY ?? '';

if (!GEMINI_API_KEY) {
  console.error('[gemini-proxy] ❌  GEMINI_API_KEY is not set. Set it in .env or as an environment variable.');
  process.exit(1);
}

// ─── Gemini client ────────────────────────────────────────────────────────────

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(risk: unknown): string {
  return `You are a senior code reviewer for ConflictLens, an AI-powered tool that detects semantic merge conflicts and security risks in Git diffs.

Analyze the following single risk detected in a developer's codebase and write a concise, developer-friendly explanation.

Risk:
${JSON.stringify(risk, null, 2)}

Respond with a single plain-English explanation: 2–3 sentences describing exactly what the risk is and why it could cause a bug or security incident. Include a brief, actionable recommendation at the end.

Respond with ONLY the explanation text — no JSON, no markdown, no preamble.`;
}

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();

app.use(cors());
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ─── POST /api/explain ────────────────────────────────────────────────────────

app.post('/api/explain', async (req: Request, res: Response) => {
  const { deviceId, risk } = req.body as { deviceId?: unknown; risk?: unknown };

  // 400 — missing required fields
  if (!deviceId || typeof deviceId !== 'string' || deviceId.trim() === '') {
    res.status(400).json({ error: 'bad_request', message: '`deviceId` is required and must be a non-empty string.' });
    return;
  }
  if (!risk || typeof risk !== 'object') {
    res.status(400).json({ error: 'bad_request', message: '`risk` is required and must be an object.' });
    return;
  }

  const id = deviceId.trim();

  // 429 — free scan limit reached (check BEFORE calling Gemini to avoid wasting quota)
  const usedCount = usageStore.getCount(id);
  if (usedCount >= FREE_SCAN_LIMIT) {
    res.status(429).json({
      error: 'free_limit_reached',
      message: `You have used all ${FREE_SCAN_LIMIT} free AI explanations. Add your own Gemini API key in ConflictLens settings for unlimited scans.`,
      remainingFreeScans: 0,
    });
    return;
  }

  // Call Gemini
  let explanation: string;
  try {
    const prompt = buildPrompt(risk);
    const result = await model.generateContent(prompt);
    explanation = result.response.text().trim();

    if (!explanation) {
      throw new Error('Empty response from Gemini');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Determine whether this is a Gemini-side failure (502) or unexpected (500)
    const isGeminiError =
      message.includes('fetch') ||
      message.includes('ECONNREFUSED') ||
      message.includes('timeout') ||
      message.includes('quota') ||
      message.includes('API');

    const statusCode = isGeminiError ? 502 : 500;

    console.error('[gemini-proxy] Gemini call failed:', message);
    // NEVER include the raw error (may contain API key traces) — sanitize first
    res.status(statusCode).json({
      error: isGeminiError ? 'gemini_error' : 'internal_error',
      message: 'AI explanation unavailable. Please try again later.',
    });
    return;
  }

  // Increment usage AFTER a successful Gemini response
  const newCount = usageStore.increment(id);
  const remainingFreeScans = Math.max(0, FREE_SCAN_LIMIT - newCount);

  res.json({ explanation, remainingFreeScans });
});

// ─── Global error handler (catch-all — prevents process crash) ────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[gemini-proxy] Unhandled error:', err.message);
  res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[gemini-proxy] ✅  Server running on http://localhost:${PORT}`);
  console.log(`[gemini-proxy]    Free scan limit: ${FREE_SCAN_LIMIT} per device`);
  console.log(`[gemini-proxy]    POST /api/explain to serve AI explanations`);
});
