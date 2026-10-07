FROM node:22-alpine AS build

WORKDIR /app
ENV DATABASE_URL=postgresql://church:build-only@localhost:5432/church_management?schema=public

COPY package.json package-lock.json ./
COPY tsconfig.json tsconfig.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY apps/api apps/api
COPY packages/shared packages/shared

RUN npm run db:generate --workspace @church/api \
  && npm run build --workspace @church/shared \
  && npm run build --workspace @church/api \
  && npm prune --omit=dev --workspace @church/api

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV API_PORT=3000
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/package-lock.json ./package-lock.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=node:node /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist

USER node
EXPOSE 3000

CMD ["sh", "-c", "npm run db:deploy --workspace @church/api && npm run start:prod --workspace @church/api"]
