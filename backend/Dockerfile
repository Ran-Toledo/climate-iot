FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY alembic.ini .
COPY alembic ./alembic
COPY scripts ./scripts

# The SQLite database file lives in /data (a volume in docker-compose.yml).
RUN mkdir -p /data

# Apply migrations on every start (a no-op when already current), so a fresh
# volume gets its schema without a manual step.
CMD python -m alembic upgrade head && exec python -m app.serve
