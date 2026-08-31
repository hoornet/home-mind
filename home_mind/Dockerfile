ARG BUILD_FROM
ARG SHODH_IMAGE=varunshodh/shodh-memory:0.2.0

# Shodh Memory: the server binary, the ONNX runtime and the bundled
# embedding/NER models. Taken from the same image docker-compose.yml uses.
FROM ${SHODH_IMAGE} AS shodh

# Build the Home Mind server from a pinned upstream tag. The add-on build
# context is the add-on folder, so the source is fetched rather than copied.
FROM node:20-bookworm-slim AS builder
ARG HOME_MIND_REF=v0.16.5
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/home-mind
RUN curl -fsSL "https://codeload.github.com/hoornet/home-mind/tar.gz/refs/tags/${HOME_MIND_REF}" \
    | tar -xz --strip-components=3 "home-mind-${HOME_MIND_REF#v}/src/home-mind-server"
RUN npm ci \
    && npm run build \
    && npm prune --omit=dev \
    && npm cache clean --force \
    && rm -rf src tsconfig.json

ARG BUILD_FROM
FROM ${BUILD_FROM}

# libssl3 is needed by the Shodh binary, libstdc++6 by node and better-sqlite3.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl libssl3 libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=shodh /usr/local/bin/shodh-memory /usr/local/bin/shodh-memory
COPY --from=shodh /usr/local/lib/libonnxruntime.so /usr/local/lib/libonnxruntime.so
COPY --from=shodh /home/shodh/.cache/shodh-memory/models /usr/share/shodh-memory/models
RUN ldconfig

COPY --from=builder /usr/local/bin/node /usr/local/bin/node
COPY --from=builder /opt/home-mind /opt/home-mind

# Shodh listens on loopback only — the add-on exposes the Home Mind API, not
# the memory backend. Models ship in the image, so nothing is downloaded.
ENV ORT_DYLIB_PATH=/usr/local/lib/libonnxruntime.so \
    SHODH_MODEL_PATH=/usr/share/shodh-memory/models/minilm-l6 \
    SHODH_NER_MODEL_PATH=/usr/share/shodh-memory/models/bert-tiny-ner \
    SHODH_HOST=127.0.0.1 \
    SHODH_PORT=3030 \
    SHODH_MEMORY_PATH=/data/shodh \
    SHODH_OFFLINE=1 \
    NODE_ENV=production

COPY rootfs /

ARG BUILD_DESCRIPTION
ARG BUILD_NAME
ARG BUILD_REF
ARG BUILD_REPOSITORY
ARG BUILD_VERSION
LABEL \
    io.hass.name="${BUILD_NAME}" \
    io.hass.description="${BUILD_DESCRIPTION}" \
    io.hass.type="addon" \
    io.hass.version="${BUILD_VERSION}" \
    org.opencontainers.image.source="https://github.com/${BUILD_REPOSITORY}" \
    org.opencontainers.image.revision="${BUILD_REF}" \
    org.opencontainers.image.licenses="AGPL-3.0-only"
