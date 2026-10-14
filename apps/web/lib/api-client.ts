// Thin fetch wrapper. All calls are same-origin (`/api/*`) against this
// Next.js app's own route handlers.
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export class ApiError extends Error {
  status: number;
  /** Machine-readable reason from the response body's `code`, when given. */
  code?: string;
  constructor(path: string, status: number, code?: string) {
    super(`Request to ${path} failed with ${status}`);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
    throw new ApiError(path, res.status, typeof body?.code === "string" ? body.code : undefined);
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
