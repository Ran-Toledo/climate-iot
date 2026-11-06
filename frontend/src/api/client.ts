// API paths are relative (`/api/...`): the browser calls the same origin
// that served the SPA, and the frontend's server proxies those requests to
// the backend (see vite.config.ts). There's no separate API URL to
// configure, and no CORS involved.

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!response.ok) {
    // FastAPI errors look like {"detail": "device not found"}; show that
    // text rather than the raw body.
    let message = response.statusText || `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") message = body.detail;
    } catch {
      // Not JSON: keep the status text.
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function apiDelete(path: string): Promise<void> {
  return request<void>(path, { method: "DELETE" });
}
