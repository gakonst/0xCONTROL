FROM python:3.12-slim AS base
WORKDIR /app

# ffmpeg for decode, bun for TS runtime, yt-dlp on supported Python
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates ffmpeg unzip \
  && curl -fsSL https://bun.sh/install | bash \
  && mv /root/.bun/bin/bun /usr/local/bin/bun \
  && python -m pip install --no-cache-dir --upgrade pip \
  && python -m pip install --no-cache-dir yt-dlp==2025.11.12 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json /app/package.json
RUN bun install --production

# Add analyzer sources
COPY server.ts /app/server.ts
COPY src/lib /app/src/lib

EXPOSE 3000
CMD ["bun", "server.ts"]
