export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiEnvelope<T> {
  data: T;
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown };
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as ApiEnvelope<T> & ErrorEnvelope;
  if (!response.ok) {
    throw new ApiError(
      body.error?.message ?? "The operation could not be completed.",
      body.error?.code ?? "REQUEST_FAILED",
      body.error?.details,
    );
  }
  return body.data;
}

export function jsonRequest(
  method: "POST" | "PATCH",
  body?: unknown,
): RequestInit {
  const request: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  return body === undefined
    ? request
    : { ...request, body: JSON.stringify(body) };
}
