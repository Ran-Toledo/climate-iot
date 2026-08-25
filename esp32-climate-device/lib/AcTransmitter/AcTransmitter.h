#pragma once

#include <Arduino.h>
#include <ir_Electra.h>

// The fixed set of real commands captured from the physical Electra AC
// remote in Stage 2 (see captures/electra-ac-commands.md). This firmware
// only reproduces these exact captured states — it does not synthesize
// arbitrary AC states.
enum class AcCommand { PowerOn, PowerOff, TempUp, TempDown, FanChange };

enum class AcSendResult { Ok, UnknownCommand };

class AcTransmitter {
 public:
  explicit AcTransmitter(uint8_t pin);

  void begin();
  AcSendResult send(AcCommand command);

  static const char *commandName(AcCommand command);

 private:
  IRElectraAc irsend_;
};
