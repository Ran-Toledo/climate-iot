// Cycles the onboard addressable RGB LED (GPIO48) through red, green, blue,
// and off, to verify a fresh ESP32-S3-WROOM-1-N16R8 dev board is alive.

#include <Arduino.h>
#include <Adafruit_NeoPixel.h>

#define LED_PIN 48
#define LED_COUNT 1
#define BRIGHTNESS 20 // out of 255

Adafruit_NeoPixel pixel(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

void showColor(const char *name, uint32_t color) {
  Serial.println(name);
  pixel.setPixelColor(0, color);
  pixel.show();
  delay(500);
}

void setup() {
  Serial.begin(115200);
  delay(1000); // give the serial monitor time to attach

  pixel.begin();
  pixel.setBrightness(BRIGHTNESS);
  pixel.show(); // start with the LED off
}

void loop() {
  showColor("RED", pixel.Color(255, 0, 0));
  showColor("GREEN", pixel.Color(0, 255, 0));
  showColor("BLUE", pixel.Color(0, 0, 255));
  showColor("OFF", pixel.Color(0, 0, 0));
}
