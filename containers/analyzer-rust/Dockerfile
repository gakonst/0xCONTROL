FROM rust:1.81-slim AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends pkg-config libssl-dev \
  && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml /app/Cargo.toml
COPY src /app/src

RUN cargo build --release

FROM debian:bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/analyzer-rust /usr/local/bin/analyzer

EXPOSE 3000
ENV PORT=3000
CMD ["analyzer"]
