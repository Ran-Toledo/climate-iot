#include "AcTransmitter.h"

namespace {

// Real Electra AC states captured via the Stage 2 IR receiver from the
// physical remote (see ../../captures/electra-ac-commands.md). Never
// invented/placeholder data.
const uint8_t kStatePowerOn[kElectraAcStateLength] = {
    0xC3, 0x7F, 0xF5, 0x2F, 0x40, 0x00, 0x20, 0x00, 0x00, 0x20, 0x00, 0x05, 0xEB};
const uint8_t kStatePowerOff[kElectraAcStateLength] = {
    0xC3, 0x7F, 0xF5, 0x2E, 0x40, 0x00, 0x20, 0x00, 0x00, 0x00, 0x00, 0x05, 0xCA};
const uint8_t kStateTempUp[kElectraAcStateLength] = {
    0xC3, 0x7F, 0xF5, 0x2E, 0x40, 0x00, 0x20, 0x00, 0x00, 0x20, 0x00, 0x00, 0xE5};
const uint8_t kStateTempDown[kElectraAcStateLength] = {
    0xC3, 0x77, 0xF5, 0x2D, 0x40, 0x00, 0x20, 0x00, 0x00, 0x20, 0x00, 0x01, 0xDD};
const uint8_t kStateFanChange[kElectraAcStateLength] = {
    0xC3, 0x7F, 0xF5, 0x30, 0x40, 0x00, 0x20, 0x00, 0x00, 0x20, 0x00, 0x04, 0xEB};

}  // namespace

AcTransmitter::AcTransmitter(uint8_t pin) : irsend_(pin) {}

void AcTransmitter::begin() { irsend_.begin(); }

AcSendResult AcTransmitter::send(AcCommand command) {
  const uint8_t *state;
  switch (command) {
    case AcCommand::PowerOn:
      state = kStatePowerOn;
      break;
    case AcCommand::PowerOff:
      state = kStatePowerOff;
      break;
    case AcCommand::TempUp:
      state = kStateTempUp;
      break;
    case AcCommand::TempDown:
      state = kStateTempDown;
      break;
    case AcCommand::FanChange:
      state = kStateFanChange;
      break;
    default:
      return AcSendResult::UnknownCommand;
  }

  irsend_.setRaw(state);
  // Frame + one repeat: power on/off worked with a single frame, but
  // temp/fan changes needed the repeat to be reliably received by the AC
  // (confirmed on real hardware in Stage 3).
  irsend_.send(1);
  return AcSendResult::Ok;
}

const char *AcTransmitter::commandName(AcCommand command) {
  switch (command) {
    case AcCommand::PowerOn:
      return "power on";
    case AcCommand::PowerOff:
      return "power off";
    case AcCommand::TempUp:
      return "temperature up";
    case AcCommand::TempDown:
      return "temperature down";
    case AcCommand::FanChange:
      return "fan level change";
    default:
      return "unknown";
  }
}
