FROM node:22-alpine

RUN apk add --no-cache bash git python3 curl \
    && npm install --global @earendil-works/pi-coding-agent@1.4.0 \
    && npm install --prefix /opt/pi-provider --legacy-peer-deps pi-antigravity@0.11.0 \
    && git config --system --add safe.directory '*'

RUN rm /usr/local/bin/pi

COPY services/pi-worker/run-pi.py /opt/feedback/run-pi.py
COPY services/pi-worker/pi-interactive /usr/local/bin/pi
ENV PI_PROVIDER_EXTENSION=/opt/pi-provider/node_modules/pi-antigravity/src/index.ts \
    PI_PROVIDER_USAGE=/opt/pi-provider/node_modules/pi-antigravity/src/usage/usage.ts \
    PI_TELEMETRY=0
CMD ["sleep", "infinity"]
