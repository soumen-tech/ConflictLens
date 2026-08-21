# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (layer cache: only reinstall when deps change)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy source and compile
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ─── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Copy only the compiled output and production node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Don't run as root
USER node

EXPOSE 3001

# GEMINI_API_KEY and FREE_SCAN_LIMIT must be supplied as env vars at runtime.
# They are NOT baked into the image — never use ARG or ENV for secrets.
CMD ["node", "dist/server.js"]
