#pragma once

// Copy this file to secrets.h (gitignored — never commit real
// credentials) and fill in real values for your environment.

#define WIFI_SSID "your-wifi-ssid"
#define WIFI_PASSWORD "your-wifi-password"

// The ESP32 is a separate device on your network — "localhost" or
// "127.0.0.1" here would mean the ESP32 itself, not your computer. Use
// your computer's LAN IP address and the backend's port instead, e.g.
// "http://192.168.1.50:8000". Find your computer's LAN IP with
// `ipconfig` (Windows) and make sure the backend is bound to 0.0.0.0
// (not 127.0.0.1) so it accepts connections from other devices.
#define BACKEND_BASE_URL "http://192.168.1.50:8000"

// Optional human-readable name sent at registration. Leave as "" to omit
// (the backend contract treats name as nullable).
#define DEVICE_NAME "ESP32 Climate Device"
