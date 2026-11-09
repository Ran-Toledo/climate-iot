import type { ClimateState, Device } from "../api/types";

/** The name the app shows: the app-side name, else the device's own, else its hardware ID. */
export function deviceLabel(device: Device): string {
  return device.display_name ?? device.name ?? device.hardware_id;
}

/**
 * True when the device has acknowledged every setting the user asked for.
 *
 * The AC has no feedback channel, so "reported" is just what the device last
 * transmitted. It also carries fields the user never asked for (e.g. the
 * firmware's default temperature after a power-only command), so only fields
 * present in `desired` are compared.
 */
export function isApplied(desired: ClimateState, reported: ClimateState): boolean {
  return (
    (desired.power == null || desired.power === reported.power) &&
    (desired.target_temperature == null || desired.target_temperature === reported.target_temperature)
  );
}

// Must match the firmware's accepted range (kMinTempC/kMaxTempC in CommandProcessor.cpp);
// it rejects anything outside it as a failed command.
export const MIN_TARGET_TEMP = 16;
export const MAX_TARGET_TEMP = 30;
