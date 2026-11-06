import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type {
  Command,
  CreateCommandPayload,
  Device,
  Telemetry,
  TelemetryQuery,
} from "./types";

const MANAGEMENT_BASE = "/api/v1/management";

export function listDevices(): Promise<Device[]> {
  return apiGet<Device[]>(`${MANAGEMENT_BASE}/devices`);
}

export function getDevice(deviceId: number): Promise<Device> {
  return apiGet<Device>(`${MANAGEMENT_BASE}/devices/${deviceId}`);
}

/** Sets the app-side name; null or "" clears it (the device's own name shows again). */
export function renameDevice(deviceId: number, displayName: string | null): Promise<Device> {
  return apiPatch<Device>(`${MANAGEMENT_BASE}/devices/${deviceId}`, { display_name: displayName });
}

export function deleteDevice(deviceId: number): Promise<void> {
  return apiDelete(`${MANAGEMENT_BASE}/devices/${deviceId}`);
}

export function createCommand(
  deviceId: number,
  payload: CreateCommandPayload,
): Promise<Command> {
  return apiPost<Command>(`${MANAGEMENT_BASE}/devices/${deviceId}/commands`, payload);
}

export function getCommand(commandId: number): Promise<Command> {
  return apiGet<Command>(`${MANAGEMENT_BASE}/commands/${commandId}`);
}

export function listTelemetry(
  deviceId: number,
  query: TelemetryQuery = {},
): Promise<Telemetry[]> {
  const params = new URLSearchParams();
  if (query.since) params.set("since", query.since);
  if (query.until) params.set("until", query.until);
  if (query.limit !== undefined) params.set("limit", String(query.limit));

  const qs = params.toString();
  return apiGet<Telemetry[]>(
    `${MANAGEMENT_BASE}/devices/${deviceId}/telemetry${qs ? `?${qs}` : ""}`,
  );
}
