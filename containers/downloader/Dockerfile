FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg \
  && curl -LsSf https://astral.sh/uv/install.sh | sh \
  && ln -s /root/.local/bin/uv /usr/local/bin/uv \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN uv pip install --system --no-cache -r requirements.txt

COPY server.py /app/server.py

ENV PORT=4000
EXPOSE 4000

CMD ["uv", "run", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "4000"]
