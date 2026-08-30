// Mirrors backend/app/schemas/*.py exactly. Keep in sync by hand -- there is
// no shared schema generation between the two projects.

export interface ClimateState {
  power: boolean | null;
  target_temperature: number | null;
}

export interface DeviceState {
  desired_state: ClimateState;
  reported_state: ClimateState;
  updated_at: string;
}

export interface Telemetry {
  temperature: number;
  humidity: number;
  recorded_at: string;
}

export interface Device {
  id: number;
  hardware_id: string;
  device_type: string;
  name: string | null;
  last_heartbeat_at: string | null;
  created_at: string;
  online: boolean;
  latest_telemetry: Telemetry | null;
  device_state: DeviceState | null;
}

export type CommandStatus = "pending" | "completed" | "failed";

export interface Command {
  id: number;
  device_id: number;
  type: string;
  payload: ClimateState;
  status: CommandStatus;
  result: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

export interface CreateCommandPayload {
  type?: string;
  payload: {
    power?: boolean;
    target_temperature?: number;
  };
}

export interface TelemetryQuery {
  since?: string;
  until?: string;
  limit?: number;
}
