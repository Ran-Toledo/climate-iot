FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY device_simulator ./device_simulator

CMD ["python", "-m", "device_simulator.main"]
