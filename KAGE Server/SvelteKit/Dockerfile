FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY src ./src
COPY static ./static
COPY scripts ./scripts
COPY db_migrations ./db_migrations
COPY vite.config.ts tsconfig.json ./

ARG ORIGIN
ENV ORIGIN=${ORIGIN}
# SvelteKit validates these names during route analysis. Real values are runtime only.
RUN DATABASE_HOST=localhost \
    DATABASE_PORT=5432 \
    DATABASE_NAME=kage_build \
    DATABASE_USER=kage_build \
    DATABASE_PASSWORD=build-only-placeholder \
    npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8060

WORKDIR /app

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/db_migrations ./db_migrations
COPY --from=build --chown=node:node /app/src/lib/server ./src/lib/server

USER node
EXPOSE 8060

CMD ["node", "build"]
