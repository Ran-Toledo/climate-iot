#include "SerialDiagnostics.h"

void printSerialHelp() {
  Serial.println("Type a letter + Enter to send a captured AC command:");
  Serial.println("  u = temperature up (23C)");
  Serial.println("  d = temperature down (22C)");
  Serial.println("  n = power on");
  Serial.println("  o = power off");
  Serial.println("  f = fan level change");
}

bool pollSerialCommand(AcCommand &outCommand) {
  if (!Serial.available()) {
    return false;
  }

  char c = Serial.read();
  switch (c) {
    case 'u':
      outCommand = AcCommand::TempUp;
      return true;
    case 'd':
      outCommand = AcCommand::TempDown;
      return true;
    case 'n':
      outCommand = AcCommand::PowerOn;
      return true;
    case 'o':
      outCommand = AcCommand::PowerOff;
      return true;
    case 'f':
      outCommand = AcCommand::FanChange;
      return true;
    case '\r':
    case '\n':
      return false; // ignore line endings
    default:
      Serial.print("Unknown command: ");
      Serial.println(c);
      printSerialHelp();
      return false;
  }
}
