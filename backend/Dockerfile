# syntax=docker/dockerfile:1
FROM python:3.13-slim

# Faster, quieter, unbuffered Python in containers.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies first for better layer caching.
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy the application source.
COPY app ./app
COPY alembic ./alembic

EXPOSE 8008

# One worker keeps the in-memory ADK session service and SSE streaming simple.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8008"]
