# ESP32-S3 Onboard RGB LED Test

A minimal PlatformIO/Arduino sketch that cycles the onboard addressable RGB
LED on an ESP32-S3-WROOM-1-N16R8 dev board through red, green, blue, and
off, printing each state to the serial monitor. It's a quick sanity check
that a new board and your toolchain are working.

## Wiring

The onboard RGB LED is already wired internally to **GPIO48** — there is
nothing to connect. Leave the GPIO48 header/pin unconnected for this test.

## Build and upload

1. Open this folder in VS Code (PlatformIO IDE is already installed).
2. Connect the board to your computer using the USB-C port labeled
   **`UART`** or **`COM`** (not any port labeled `USB` for native USB-OTG) —
   a USB-C-to-USB-A cable/adapter is fine as long as it carries data, not
   just power.
3. Use the PlatformIO toolbar at the bottom of VS Code:
   - **Build** (checkmark icon) to compile.
   - **Upload** (right-arrow icon) to flash the board.

## Serial monitor

Click the **plug icon** in the PlatformIO toolbar (or run "PlatformIO: Serial
Monitor" from the command palette) to open the serial monitor at 115200
baud. You should see `RED`, `GREEN`, `BLUE`, `OFF` printed in a loop, in
sync with the LED.

## Troubleshooting

- **Board not detected / no COM port shows up:** try a different
  (data-capable) USB-C cable, plug directly into a computer USB port rather
  than through a hub, or try the board's other USB-C port.
- **Upload stuck on "Connecting...":** hold the **BOOT** button, briefly
  press and release **RST** while still holding BOOT, then release BOOT
  once uploading begins.
