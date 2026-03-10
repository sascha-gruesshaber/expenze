# ── Stage 1: Build ────────────────────────────────────────────────────
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts/ scripts/
COPY .env.template ./
RUN npm ci

COPY prisma/ prisma/
COPY prisma.config.ts ./
RUN npx prisma generate

COPY . .
RUN npx vite build

# ── Stage 2: Runtime ──────────────────────────────────────────────────
FROM node:20-slim

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/dist/client ./dist/client
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/.env.template ./
COPY --from=builder /app/scripts ./scripts

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=file:../data/banking.db

EXPOSE 3000

CMD ["npm", "start"]
