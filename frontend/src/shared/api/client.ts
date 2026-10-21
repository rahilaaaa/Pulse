export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details: Array<{ field: string; code: string; message: string }>;
    request_id: string | null;
  };
};

export class ApiError extends Error {
  status: number;
  code: string;
  details: ApiErrorBody["error"]["details"];

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.status = status;
    this.code = body.error.code;
    this.details = body.error.details;
  }
}

let csrfToken: string | null = null;

export function clearCsrfToken() {
  csrfToken = null;
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const match = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  if (!match) {
    return null;
  }
  return decodeURIComponent(match.slice(prefix.length));
}

async function readCsrfToken(): Promise<string> {
  const fromCookie = readCookie("csrftoken");
  if (fromCookie) {
    csrfToken = fromCookie;
    return fromCookie;
  }
  if (csrfToken) {
    return csrfToken;
  }
  const response = await fetch("/api/v1/auth/csrf/", { credentials: "include" });
  const body = (await response.json()) as { csrf_token: string };
  csrfToken = body.csrf_token;
  return csrfToken;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const method = (options.method ?? "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("X-CSRFToken", await readCsrfToken());
  }
  const response = await fetch(path, { ...options, headers, credentials: "include" });
  if (response.status === 204) {
    return undefined as T;
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const body = payload ?? {
      error: { code: "server_error", message: "The request failed.", details: [], request_id: null },
    };
    throw new ApiError(response.status, body);
  }
  return payload as T;
}
