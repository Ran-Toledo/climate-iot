// Stage 3: adds IR transmission on GPIO6, reproducing real commands
// captured from the physical Electra AC remote in Stage 2 (see
// captures/electra-ac-commands.md) via the library's protocol-specific
// IRElectraAc class. Transmission only happens on an explicit serial
// command — never on startup. DHT11 (GPIO4) and IR reception (GPIO5)
// keep working; reception is paused during transmission to avoid the
// receiver picking up our own signal.

#include <Arduino.h>
#include <DHT.h>
#include <IRrecv.h>
#include <IRac.h>
#include <IRutils.h>
#include <ir_Electra.h>

#define DHT_PIN 4
#define DHT_TYPE DHT11
#define DHT_READ_INTERVAL_MS 2000

#define IR_RECV_PIN 5
// AC remotes can send long, stateful messages — size the capture buffer
// generously and use a resume-on-full buffer so long messages aren't cut
// off, per the library's own recommendation for AC protocols.
#define IR_CAPTURE_BUFFER_SIZE 1024
#define IR_TIMEOUT_MS 15

#define IR_SEND_PIN 6

DHT dht(DHT_PIN, DHT_TYPE);
unsigned long lastDhtReadMs = 0;

IRrecv irrecv(IR_RECV_PIN, IR_CAPTURE_BUFFER_SIZE, IR_TIMEOUT_MS, true);
decode_results irResults;

IRElectraAc irsend(IR_SEND_PIN);

// Real Electra AC states captured via the Stage 2 IR receiver from the
// physical remote (see captures/electra-ac-commands.md). Never
// invented/placeholder data.
const uint8_t kCmdTempUp[kElectraAcStateLength] = {
    0xC3, 0x7F, 0xF5, 0x2E, 0x40, 0x00, 0x20, 0x00, 0x00, 0x20, 0x00, 0x00, 0xE5};
const uint8_t kCmdTempDown[kElectraAcStateLength] = {
    0xC3, 0x77, 0xF5, 0x2D, 0x40, 0x00, 0x20, 0x00, 0x00, 0x20, 0x00, 0x01, 0xDD};
const uint8_t kCmdPowerOff[kElectraAcStateLength] = {
    0xC3, 0x7F, 0xF5, 0x2E, 0x40, 0x00, 0x20, 0x00, 0x00, 0x00, 0x00, 0x05, 0xCA};
const uint8_t kCmdPowerOn[kElectraAcStateLength] = {
    0xC3, 0x7F, 0xF5, 0x2F, 0x40, 0x00, 0x20, 0x00, 0x00, 0x20, 0x00, 0x05, 0xEB};
const uint8_t kCmdFanChange[kElectraAcStateLength] = {
    0xC3, 0x7F, 0xF5, 0x30, 0x40, 0x00, 0x20, 0x00, 0x00, 0x20, 0x00, 0x04, 0xEB};

void printTransmitHelp() {
  Serial.println("Type a letter + Enter to send a captured test command:");
  Serial.println("  u = temperature up (23C)");
  Serial.println("  d = temperature down (22C)");
  Serial.println("  n = power on");
  Serial.println("  o = power off");
  Serial.println("  f = fan level change");
}

void sendCommand(const char *name, const uint8_t state[kElectraAcStateLength]) {
  Serial.print("Transmitting: ");
  Serial.println(name);

  // Pause reception so we don't decode our own transmission.
  irrecv.disableIRIn();

  irsend.setRaw(state);
  // Send the frame plus one repeat: on/off worked with a single frame, but
  // temp/fan changes didn't — the physical remote likely sends those as
  // two back-to-back frames, which this reproduces via the library's own
  // protocol-correct repeat timing (not a guessed delay).
  irsend.send(1);

  delay(50);
  irrecv.enableIRIn();

  Serial.println("Transmit done.");
}

void handleSerialCommand() {
  if (!Serial.available()) {
    return;
  }
  char c = Serial.read();
  switch (c) {
    case 'u':
      sendCommand("temperature up", kCmdTempUp);
      break;
    case 'd':
      sendCommand("temperature down", kCmdTempDown);
      break;
    case 'n':
      sendCommand("power on", kCmdPowerOn);
      break;
    case 'o':
      sendCommand("power off", kCmdPowerOff);
      break;
    case 'f':
      sendCommand("fan level change", kCmdFanChange);
      break;
    case '\r':
    case '\n':
      break; // ignore line endings
    default:
      Serial.print("Unknown command: ");
      Serial.println(c);
      printTransmitHelp();
      break;
  }
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

void setup() {
  Serial.begin(115200);
  delay(1000); // give the serial monitor time to attach

  dht.begin();
  irrecv.enableIRIn();
  irsend.begin();

  Serial.println(
      "Stage 3: DHT11 (GPIO4) + IR receiver (GPIO5) + IR transmitter (GPIO6) starting...");
  printTransmitHelp();
}

void loop() {
  handleIr();
  handleDht();
  handleSerialCommand();
}
