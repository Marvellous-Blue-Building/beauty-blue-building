// Thin fetch wrapper. All calls are same-origin (`/api/*`) against this
// Next.js app's own route handlers.
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export class ApiError extends Error {
  status: number;
  constructor(path: string, status: number) {
    super(`Request to ${path} failed with ${status}`);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...init,
  });
  if (!res.ok) {
    throw new ApiError(path, res.status);
  }
  return res.json() as Promise<T>;
}

export function getJSON<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function postJSON<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
}

export function patchJSON<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined });
}

export function deleteJSON<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}
