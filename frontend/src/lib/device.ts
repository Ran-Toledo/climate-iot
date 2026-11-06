import type { Device } from "../api/types";

/** The name the app shows: the app-side name, else the device's own, else its hardware ID. */
export function deviceLabel(device: Device): string {
  return device.display_name ?? device.name ?? device.hardware_id;
}

export const MIN_TARGET_TEMP = 10;
export const MAX_TARGET_TEMP = 32;
