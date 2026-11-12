FROM node:22-alpine

WORKDIR /app
COPY services/api/package*.json ./services/api/
RUN apk add --no-cache libstdc++ \
    && apk add --no-cache --virtual .native-build python3 make g++ \
    && cd services/api && npm ci --omit=dev \
    && apk del .native-build

COPY services/api/src ./services/api/src
COPY services/api/migrations ./services/api/migrations
COPY services/api/scripts ./services/api/scripts
COPY services/api/skills ./services/api/skills
COPY apps/web ./apps/web

ENV BIND_HOST=0.0.0.0
WORKDIR /app/services/api
CMD ["node", "src/server.js"]
