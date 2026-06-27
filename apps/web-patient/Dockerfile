FROM node:20-alpine AS base
RUN corepack enable pnpm
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/web-patient/package.json ./apps/web-patient/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN pnpm install --frozen-lockfile --filter @mediflow/web-patient...

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @mediflow/web-patient build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder --chown=nextjs:nodejs /app/apps/web-patient/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web-patient/.next/static ./apps/web-patient/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web-patient/public ./apps/web-patient/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "apps/web-patient/server.js"]
