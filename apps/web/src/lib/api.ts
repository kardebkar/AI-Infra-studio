import type { ApiError } from '@ai-infra-studio/types';
import { getApiBaseUrl } from './env';

export class ApiClientError extends Error {
  status: number;
  url: string;
  code?: string;
  details?: unknown;

  constructor(input: { message: string; status: number; url: string; code?: string; details?: unknown }) {
    super(input.message);
    this.name = 'ApiClientError';
    this.status = input.status;
    this.url = input.url;
    this.code = input.code;
    this.details = input.details;
  }
}

function isApiError(value: unknown): value is ApiError {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.code === 'string' && typeof v.message === 'string';
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBaseUrl().replace(/\/+$/, '');
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const contentType = res.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    const payload = isJson ? ((await res.json()) as unknown) : await res.text();
    if (isApiError(payload)) {
      throw new ApiClientError({
        status: res.status,
        url,
        code: payload.code,
        message: payload.message,
        details: payload.details,
      });
    }
    throw new ApiClientError({
      status: res.status,
      url,
      message: `Request failed (${res.status})`,
      details: payload,
    });
  }

  if (!isJson) {
    throw new ApiClientError({
      status: res.status,
      url,
      message: 'Unexpected non-JSON response from API.',
      details: { contentType },
    });
  }

  return (await res.json()) as T;
}

