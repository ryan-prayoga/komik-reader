FROM node:22-alpine AS builder

WORKDIR /app
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV AUTH_DB_PATH=/app/data/auth.db

# su-exec lets the entrypoint fix volume ownership as root, then hand off to the
# unprivileged node user — the actual node process never runs as root.
RUN apk add --no-cache su-exec

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /app/data && chown -R node:node /app/data

VOLUME ["/app/data"]
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "build"]