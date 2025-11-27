FROM oven/bun:1.1.26 AS base
WORKDIR /app

# ffmpeg is required for decoding audio to PCM
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json /app/package.json
RUN bun install --production

# Add analyzer sources
COPY server.ts /app/server.ts
COPY src/lib /app/src/lib

EXPOSE 3000
CMD ["bun", "server.ts"]
