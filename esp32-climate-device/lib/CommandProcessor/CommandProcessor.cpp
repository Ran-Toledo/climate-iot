#include "CommandProcessor.h"

namespace {
constexpr unsigned long kPollIntervalMs = 3000; // matches COMMAND_POLL_INTERVAL_SECONDS default
// Sanity bound, not a protocol-verified limit: only 22/23C were
// physically confirmed on real hardware (Stage 2-3). Other values in
// this range rely on IRElectraAc's own tested setTemp() encoder.
constexpr int kMinTempC = 16;
constexpr int kMaxTempC = 30;
}  // namespace

CommandProcessor::CommandProcessor(BackendClient &backendClient, AcTransmitter &acTransmitter,
                                    AcDeviceState &acState)
    : backendClient_(backendClient),
      acTransmitter_(acTransmitter),
      acState_(acState),
      lastPollMs_(0),
      lastHandledCommandId_(-1) {}

void CommandProcessor::update(unsigned long nowMs, const String &hardwareId) {
  if (nowMs - lastPollMs_ < kPollIntervalMs) {
    return;
  }
  lastPollMs_ = nowMs;

  BackendCommand command;
  CommandFetchResult fetchResult = backendClient_.getNextCommand(hardwareId, command);
  if (fetchResult != CommandFetchResult::Available) {
    return; // none pending, or a transient HTTP error -- try again next poll
  }

  if (command.id == lastHandledCommandId_) {
    return; // already transmitted + acked; avoid a duplicate IR send
  }

  if (!command.typeSupported) {
    Serial.println("Command rejected: unsupported type (only set_state is handled).");
    if (backendClient_.submitCommandResult(command.id, CommandResultStatus::Failed, acState_)) {
      lastHandledCommandId_ = command.id;
    }
    return;
  }

  if (!command.hasPower && !command.hasTargetTemperature) {
    Serial.println("Command rejected: payload has neither power nor target_temperature.");
    if (backendClient_.submitCommandResult(command.id, CommandResultStatus::Failed, acState_)) {
      lastHandledCommandId_ = command.id;
    }
    return;
  }

  if (command.hasTargetTemperature &&
      (command.targetTemperature < kMinTempC || command.targetTemperature > kMaxTempC)) {
    Serial.print("Command rejected: target_temperature ");
    Serial.print(command.targetTemperature);
    Serial.println("C outside supported 16-30C range.");
    if (backendClient_.submitCommandResult(command.id, CommandResultStatus::Failed, acState_)) {
      lastHandledCommandId_ = command.id;
    }
    return;
  }

  bool power = command.hasPower ? command.power : (acState_.power == PowerState::On);
  uint8_t targetTempC = command.hasTargetTemperature
                            ? static_cast<uint8_t>(command.targetTemperature)
                            : (acState_.targetTemperatureC > 0
                                   ? static_cast<uint8_t>(acState_.targetTemperatureC)
                                   : 23);

  Serial.print("Command: set power=");
  Serial.print(power ? "on" : "off");
  Serial.print(", target_temperature=");
  Serial.println(targetTempC);

  AcSendResult sendResult = acTransmitter_.sendState(power, targetTempC);
  if (sendResult != AcSendResult::Ok) {
    if (backendClient_.submitCommandResult(command.id, CommandResultStatus::Failed, acState_)) {
      lastHandledCommandId_ = command.id;
    }
    return;
  }

  acState_.power = power ? PowerState::On : PowerState::Off;
  acState_.targetTemperatureC = static_cast<int8_t>(targetTempC);

  if (backendClient_.submitCommandResult(command.id, CommandResultStatus::Completed, acState_)) {
    lastHandledCommandId_ = command.id;
  }
  // If the ack POST itself failed (not a 200/409), lastHandledCommandId_
  // is left unset so the next poll retries acking. Known Stage 6 edge
  // case: if the AC transmission succeeded but only this ack failed, the
  // retry could re-transmit -- see docs/esp32-firmware-status.md Stage 6
  // notes; Stage 7 (reliability) is where the plan revisits command dedup.
}
