const API_BASE = import.meta.env.VITE_API_BASE ?? '';

type RequestOptions = Omit<RequestInit, 'body'> & {
  params?: Record<string, string>;
  body?: unknown;
};

export async function request<T = unknown>(
  url: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, body, headers, ...rest } = options;

  let fullUrl = `${API_BASE}${url}`;
  if (params) {
    fullUrl += `?${new URLSearchParams(params).toString()}`;
  }

  const init: RequestInit = { ...rest, headers: { ...headers } };

  if (body !== undefined) {
    if (body instanceof FormData) {
      init.body = body;
    } else {
      init.headers = {
        'Content-Type': 'application/json',
        ...init.headers,
      };
      init.body = JSON.stringify(body);
    }
  }

  const res = await fetch(fullUrl, init);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return res as unknown as T;
}

export function getWsBase(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return import.meta.env.VITE_WS_BASE ?? `${proto}//${window.location.host}`;
}
