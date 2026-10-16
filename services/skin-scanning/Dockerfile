FROM python:3.12-slim

WORKDIR /app

# opencv-python-headless + mediapipe runtime deps. mediapipe's
# FaceLandmarker loads an EGL/GLES backend at import time (app/face_landmarks.py)
# even for CPU inference — without libegl1/libgles2 it fails with
# "OSError: libEGL.so.1: cannot open shared object file".
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 libgomp1 libegl1 libgles2 \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN python scripts/download_model.py

RUN useradd --system --uid 1001 appuser && chown -R appuser /app
USER appuser

ENV PORT=3003
EXPOSE 3003
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
