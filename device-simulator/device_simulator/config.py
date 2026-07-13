import os

API_BASE_URL = os.environ.get("API_BASE_URL", "http://api:8000")
HARDWARE_ID = os.environ.get("DEVICE_HARDWARE_ID", "sim-bedroom-001")
DEVICE_NAME = os.environ.get("DEVICE_NAME")

HEARTBEAT_INTERVAL_SECONDS = float(os.environ.get("HEARTBEAT_INTERVAL_SECONDS", "10"))
TELEMETRY_INTERVAL_SECONDS = float(os.environ.get("TELEMETRY_INTERVAL_SECONDS", "5"))
COMMAND_POLL_INTERVAL_SECONDS = float(os.environ.get("COMMAND_POLL_INTERVAL_SECONDS", "3"))

AMBIENT_TEMPERATURE = float(os.environ.get("AMBIENT_TEMPERATURE", "26.0"))
STARTING_TEMPERATURE = float(os.environ.get("STARTING_TEMPERATURE", "24.0"))
TEMPERATURE_STEP = float(os.environ.get("TEMPERATURE_STEP", "0.5"))
