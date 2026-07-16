FROM node:20-alpine AS builder

WORKDIR /app
RUN apk add --no-cache openssl

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --no-audit --no-fund

COPY prisma ./prisma
RUN npx prisma generate

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner

ENV NODE_ENV=production \
    PORT=4000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
RUN apk add --no-cache openssl

COPY package.json package-lock.json tsconfig.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --no-audit --no-fund \
    && npx prisma generate \
    && npm cache clean --force

COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN mkdir -p /app/uploads && chown node:node /app/uploads

USER node

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=10 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["sh", "./docker-entrypoint.sh"]
