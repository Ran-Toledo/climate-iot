#pragma once

#include <Arduino.h>
#include <ir_Electra.h>

// The fixed set of real commands captured from the physical Electra AC
// remote in Stage 2 (see captures/electra-ac-commands.md), used by the
// serial diagnostic commands (u/d/n/o/f). send() only ever reproduces
// these exact captured byte sequences. For backend-driven commands that
// need other values, see sendState() below.
enum class AcCommand { PowerOn, PowerOff, TempUp, TempDown, FanChange };

enum class AcSendResult { Ok, UnknownCommand };

class AcTransmitter {
 public:
  explicit AcTransmitter(uint8_t pin);

  void begin();
  AcSendResult send(AcCommand command);

  // Constructs and transmits an arbitrary power/temperature state using
  // IRElectraAc's own setPower()/setTemp() encoders (real, tested
  // protocol-specific library code, not hand-guessed bits), seeded from a
  // known-good captured baseline so mode/fan stay exactly as physically
  // verified in Stages 2-3. Used for backend set_state commands, which
  // can request temperatures beyond the 2 exact values captured from the
  // remote. Caller is responsible for range validation.
  AcSendResult sendState(bool power, uint8_t targetTemperatureC);

  static const char *commandName(AcCommand command);

 private:
  IRElectraAc irsend_;
};
