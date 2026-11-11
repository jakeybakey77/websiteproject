FROM node:22.16.0-bookworm-slim
WORKDIR /app
COPY . .
ENV NODE_ENV=production \
    PORT=4173 \
    HOST=0.0.0.0 \
    GCP_DEMO_MODE=true \
    GCP_DB_PATH=/data/gcp.sqlite \
    COOKIE_SECURE=true
# Persistent storage: attach a Railway volume mounted at /data (no Dockerfile VOLUME
# instruction; Railway manages volumes itself and PORT is injected at runtime).
RUN mkdir -p /data
EXPOSE 4173
CMD ["node", "scripts/server.mjs"]
