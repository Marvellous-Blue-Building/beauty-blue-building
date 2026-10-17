FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
# requirements.txt pins torch>=2.4 only (no index), and on Linux arm64
# PyPI's default torch wheel drags in the full CUDA toolkit (nvidia-cudnn,
# cuda-toolkit, etc.) even though app/gemma.py forces device_map="cpu" —
# multi-GB of unused GPU libraries that blew through disk during the
# image's layer export. Installing the CPU-only build first satisfies
# the >=2.4 constraint so the next line's `pip install -r requirements.txt`
# leaves it alone instead of pulling the CUDA variant.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Gemma weights are fetched lazily at runtime via kagglehub on the first
# /advise call (app/gemma.py), not baked in here — that needs Kaggle
# credentials as runtime env vars (KAGGLE_USERNAME/KAGGLE_KEY/
# KAGGLE_API_TOKEN), not build secrets. Keep the cache writable by the
# non-root user below.
RUN useradd --system --uid 1001 --create-home appuser && chown -R appuser /app
USER appuser

ENV PORT=3004
EXPOSE 3004
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
