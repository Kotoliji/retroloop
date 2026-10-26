# Built from the repository root: docker build -f apps/web/Dockerfile .
FROM node:24-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @retro/web --ignore-scripts

FROM deps AS build
# NEXT_PUBLIC_* values are compiled into the browser bundle, so they are build arguments.
ARG NEXT_PUBLIC_SERVER_URL
ARG NEXT_PUBLIC_CONTACT_EMAIL
ENV NEXT_TELEMETRY_DISABLED=1
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build --workspace @retro/web

FROM node:24-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
