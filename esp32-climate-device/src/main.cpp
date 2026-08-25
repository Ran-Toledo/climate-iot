// Stage 2: adds IR reception on GPIO5 alongside the Stage 1 DHT11 sensor
// test. Captures and prints AC remote commands (protocol, bit count,
// decoded value/state bytes, raw timing, repeat status) so they can be
// reproduced by the transmitter in Stage 3. No transmission happens here.

#include <Arduino.h>
#include <DHT.h>
#include <IRrecv.h>
#include <IRac.h>
#include <IRutils.h>

#define DHT_PIN 4
#define DHT_TYPE DHT11
#define DHT_READ_INTERVAL_MS 2000

#define IR_RECV_PIN 5
// AC remotes can send long, stateful messages — size the capture buffer
// generously and use a resume-on-full buffer so long messages aren't cut
// off, per the library's own recommendation for AC protocols.
#define IR_CAPTURE_BUFFER_SIZE 1024
#define IR_TIMEOUT_MS 15

DHT dht(DHT_PIN, DHT_TYPE);
unsigned long lastDhtReadMs = 0;

IRrecv irrecv(IR_RECV_PIN, IR_CAPTURE_BUFFER_SIZE, IR_TIMEOUT_MS, true);
decode_results irResults;

void setup() {
  Serial.begin(115200);
  delay(1000); // give the serial monitor time to attach

  dht.begin();
  irrecv.enableIRIn();

  Serial.println("Stage 2: DHT11 on GPIO4 + IR receiver on GPIO5 starting...");
}

void handleDht() {
  unsigned long now = millis();
  if (now - lastDhtReadMs < DHT_READ_INTERVAL_MS) {
    return;
  }
  lastDhtReadMs = now;

  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();

  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("DHT11 read failed (sensor not responding or invalid data)");
    return;
  }

  Serial.print("Temperature: ");
  Serial.print(temperature);
  Serial.print(" C  Humidity: ");
  Serial.print(humidity);
  Serial.println(" %");
}

void handleIr() {
  if (!irrecv.decode(&irResults)) {
    return;
  }

  if (irResults.overflow) {
    Serial.println(
        "IR: buffer overflow — message longer than the capture buffer, "
        "data may be incomplete");
  }

  Serial.println("---- IR message received ----");
  Serial.println(resultToHumanReadableBasic(&irResults));

  String acDescription = IRAcUtils::resultAcToString(&irResults);
  if (acDescription.length()) {
    Serial.println(acDescription);
  }

  Serial.print("Repeat: ");
  Serial.println(irResults.repeat ? "yes" : "no");

  // Full state/raw-timing dump as reproducible source code — needed for
  // Stage 3 transmission, especially for UNKNOWN or state-based protocols.
  Serial.println(resultToSourceCode(&irResults));
  Serial.println("------------------------------");

  irrecv.resume();
}

void loop() {
  handleIr();
  handleDht();
}
