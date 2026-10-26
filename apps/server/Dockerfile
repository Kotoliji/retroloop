# Built from the repository root: docker build -f apps/server/Dockerfile .
FROM node:24-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/server/prisma apps/server/prisma
COPY apps/server/prisma.config.ts apps/server/
RUN npm ci --workspace @retro/server

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build --workspace @retro/server

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/server/prisma apps/server/prisma
COPY apps/server/prisma.config.ts apps/server/
RUN npm ci --workspace @retro/server --omit=dev && npm cache clean --force
COPY --from=build /repo/apps/server/dist apps/server/dist
USER node
WORKDIR /repo/apps/server
EXPOSE 4000
# Apply pending migrations, then start. Safe to run on every deploy.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/index.js"]
