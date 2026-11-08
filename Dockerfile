# syntax=docker/dockerfile:1
# Run tests and compile the architecture-independent frontend once on the
# native builder platform. BuildKit overrides this default automatically.
ARG BUILDPLATFORM=linux/amd64
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY index.html vite.config.js ./
COPY src ./src
COPY tests ./tests
RUN npm run test && npm run build

FROM node:24-alpine AS production
WORKDIR /app
USER root
ENV NODE_ENV=production DATABASE_PATH=/data/database.sqlite LEGACY_DATABASE_PATH=/database.sqlite \
    MAX_IMAGE_BYTES=5242880 MAX_ENTRY_BYTES=10485760 MAX_DATABASE_BYTES=262144000
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src/backend ./backend
COPY --from=build /app/dist ./dist
RUN mkdir -p /data
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1
CMD ["node", "/app/backend/server.js"]
