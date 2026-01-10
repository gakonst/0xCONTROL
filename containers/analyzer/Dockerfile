FROM oven/bun:1.1.26 AS base
WORKDIR /app

# ffmpeg is required for decoding audio to PCM
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fuse3 ca-certificates curl bash \
  && rm -rf /var/lib/apt/lists/*

COPY package.json /app/package.json
RUN bun install --production

# Install tigrisfs for R2 FUSE mounting
RUN ARCH=$(uname -m) \
  && if [ "$ARCH" = "x86_64" ]; then ARCH="amd64"; fi \
  && if [ "$ARCH" = "aarch64" ]; then ARCH="arm64"; fi \
  && VERSION=$(curl -s https://api.github.com/repos/tigrisdata/tigrisfs/releases/latest | grep -o '"tag_name": "[^"]*' | cut -d'"' -f4) \
  && curl -L "https://github.com/tigrisdata/tigrisfs/releases/download/${VERSION}/tigrisfs_${VERSION#v}_linux_${ARCH}.tar.gz" -o /tmp/tigrisfs.tar.gz \
  && tar -xzf /tmp/tigrisfs.tar.gz -C /usr/local/bin/ \
  && rm /tmp/tigrisfs.tar.gz \
  && chmod +x /usr/local/bin/tigrisfs

# Add analyzer sources
COPY server.ts /app/server.ts
COPY src/lib /app/src/lib

ARG BUILD_ID=manual
ENV BUILD_ID=$BUILD_ID

# Create startup script that mounts R2 via FUSE and starts the analyzer
RUN printf '#!/bin/sh\nset -e\n\nMOUNT_PATH="${R2_MOUNT_PATH:-/mnt/r2}"\nmkdir -p "$MOUNT_PATH"\n\nif [ -n "$R2_ACCOUNT_ID" ] && [ -n "$R2_BUCKET_NAME" ]; then\n  R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"\n  echo "Mounting R2 bucket ${R2_BUCKET_NAME} at ${MOUNT_PATH}..."\n  /usr/local/bin/tigrisfs --endpoint "${R2_ENDPOINT}" -f "${R2_BUCKET_NAME}" "$MOUNT_PATH" &\n  sleep 3\nelse\n  echo "R2_ACCOUNT_ID or R2_BUCKET_NAME not set; skipping R2 mount."\nfi\n\nexec bun /app/server.ts\n' > /app/startup.sh \
  && chmod +x /app/startup.sh

EXPOSE 3000
CMD ["/app/startup.sh"]
