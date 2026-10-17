FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --system --uid 1001 appuser && chown -R appuser /app
USER appuser

ENV PORT=3004
EXPOSE 3004
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
