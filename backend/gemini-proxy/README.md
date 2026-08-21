# ConflictLens — Gemini Proxy Server

A minimal Express server that holds the Gemini API key server-side and serves AI conflict explanations to ConflictLens extension users. Each anonymous device ID gets a configurable free-scan allowance (default: 20 scans) before being prompted to supply their own key.

## How it works

```
Extension ──POST /api/explain──▶ Proxy ──▶ Gemini API
          ◀── { explanation } ──          (key never leaves server)
```

1. The extension sends `{ deviceId, risk }` — `deviceId` is a random UUID generated once per install, stored in VS Code's `globalState`. It contains no personal data.
2. The proxy checks the per-device scan count (in-memory). If the limit is reached, it returns HTTP 429 without calling Gemini.
3. On success, the proxy calls `gemini-2.5-flash`, returns `{ explanation, remainingFreeScans }`.

---

## Local Development

### Prerequisites

- Node.js ≥ 20
- A Gemini API key — get one free at [aistudio.google.com](https://aistudio.google.com/app/apikey)

### Setup

```bash
cd backend/gemini-proxy

# Install dependencies
npm install

# Create your local .env from the template
cp .env.example .env
# Then edit .env and paste in your GEMINI_API_KEY
```

### Run

```bash
# Development (ts-node, auto-restarts not included — use nodemon if preferred)
npm run dev

# Production (compile first, then start)
npm run build
npm start
```

The server starts on `http://localhost:3001` by default.

### Test it manually

```bash
# Health check
curl http://localhost:3001/health

# Explain a risk
curl -X POST http://localhost:3001/api/explain \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "test-device-001",
    "risk": {
      "id": "risk_001",
      "type": "semantic_conflict",
      "riskLevel": "high",
      "location": { "file": "src/cart.js", "line": 42 },
      "details": { "functionName": "calculateTotal", "changeType": "signature_parameter_added" },
      "ai_context": { "explanation": "Pending AI response...", "recommendation": "Pending AI response..." }
    }
  }'
```

Expected success response:
```json
{
  "explanation": "...",
  "remainingFreeScans": 19
}
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | ✅ Yes | — | Gemini API key. Never hardcoded, never returned to clients. |
| `PORT` | No | `3001` | Port the server listens on. |
| `FREE_SCAN_LIMIT` | No | `20` | Max free scans per `deviceId`. Adjust without code changes. |

---

## Rate Limiting

### Current behaviour

- Scans are tracked per `deviceId` in an **in-memory Map**.
- The limit is checked **before** calling Gemini, so no API quota is wasted on rejected requests.
- On limit reached: HTTP 429 with `{ error: "free_limit_reached", remainingFreeScans: 0 }`.

### ⚠️ Known limitation — in-memory storage resets on server restart

Because counts are stored in RAM, restarting the server resets all counts. This is intentional for the initial version — it keeps the proxy stateless and dependency-free.

**Persistence upgrade path** (when you need it):

1. Add a `UsageStore` implementation that writes to Redis or SQLite (the `UsageStore` interface in `src/usageStore.ts` is already designed for this swap).
2. Replace the `inMemoryStore` singleton export with your persistent implementation.
3. No changes needed in `server.ts`.

---

## Deployment (Render — Recommended)

We use [Render](https://render.com) (free tier) because:
- Express runs as-is — no serverless rewrites needed
- Free tier web services keep the process alive (important for in-memory rate limiting)
- `render.yaml` provides reproducible Infrastructure-as-Code

### Steps

1. **Fork / push** this repo to GitHub if you haven't already.

2. **Create a new Web Service** on Render:
   - Go to [dashboard.render.com](https://dashboard.render.com) → **New → Web Service**
   - Connect your GitHub repo
   - Render will auto-detect `render.yaml` — confirm the settings

3. **Set environment variables** in the Render dashboard (not in any committed file):
   - `GEMINI_API_KEY` → paste your key
   - `FREE_SCAN_LIMIT` → e.g. `20` (or leave unset to use the default)
   - `PORT` → Render sets this automatically; you don't need to set it manually

4. **Deploy** — Render builds from `backend/gemini-proxy/` using the `Dockerfile`.

5. **Copy the service URL** (e.g. `https://conflictlens-proxy.onrender.com`) and paste it into VS Code:
   ```
   File → Preferences → Settings → search "conflictlens.proxyUrl"
   → set to https://conflictlens-proxy.onrender.com
   ```

6. **Verify** by running a ConflictLens scan — the AI explanation should appear without needing a personal API key.

### Free tier note

Render's free tier spins down services after 15 minutes of inactivity. The **first request after idle** may take 30–60 seconds to respond (cold start). Subsequent requests are fast. Upgrade to a paid instance ($7/mo) to eliminate cold starts.

---

## API Reference

### `POST /api/explain`

| Field | Type | Description |
|---|---|---|
| `deviceId` | `string` | Anonymous, extension-generated UUID. Must be non-empty. |
| `risk` | `object` | Risk JSON — same shape as `@conflictlens/shared` Risk type. |

**Success (200):**
```json
{ "explanation": "string", "remainingFreeScans": 19 }
```

**Limit reached (429):**
```json
{ "error": "free_limit_reached", "message": "string", "remainingFreeScans": 0 }
```

**Bad request (400):**
```json
{ "error": "bad_request", "message": "string" }
```

**Gemini failure (502) / unexpected error (500):**
```json
{ "error": "gemini_error" | "internal_error", "message": "string" }
```

### `GET /health`

```json
{ "status": "ok", "uptime": 42.3 }
```
