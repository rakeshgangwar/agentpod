/**
 * HTTP Request Helper for Integration Tests
 * 
 * Provides a clean interface for making HTTP requests to the API
 * during integration testing.
 */

import { app } from '../../src/index';

export interface TestResponse<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

export interface TestApp {
  get<T = unknown>(path: string, options?: RequestOptions): Promise<TestResponse<T>>;
  post<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<TestResponse<T>>;
  put<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<TestResponse<T>>;
  patch<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<TestResponse<T>>;
  delete<T = unknown>(path: string, options?: RequestOptions): Promise<TestResponse<T>>;
  close(): Promise<void>;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  auth?: 'api-key' | 'bearer' | 'none';
  token?: string;
}

const DEFAULT_API_KEY = 'test-token';
const DEFAULT_BEARER_TOKEN = 'test-bearer-token';

/**
 * Create a test app instance for making requests
 */
export async function createTestApp(options: { apiKey?: string } = {}): Promise<TestApp> {
  const apiKey = options.apiKey ?? DEFAULT_API_KEY;

  const getAuthHeader = (opts?: RequestOptions): Record<string, string> => {
    const authType = opts?.auth ?? 'api-key';
    const token = opts?.token;

    switch (authType) {
      case 'api-key':
        return { 'X-API-Key': token ?? apiKey };
      case 'bearer':
        return { Authorization: `Bearer ${token ?? DEFAULT_BEARER_TOKEN}` };
      case 'none':
        return {};
      default:
        return { 'X-API-Key': apiKey };
    }
  };

  const request = async <T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<TestResponse<T>> => {
    const headers: Record<string, string> = {
      ...getAuthHeader(options),
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    const res = await app.request(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let responseBody: T;
    const contentType = res.headers.get('Content-Type');
    
    if (contentType?.includes('application/json')) {
      responseBody = await res.json() as T;
    } else if (res.status === 204) {
      responseBody = undefined as T;
    } else {
      responseBody = await res.text() as T;
    }

    return {
      status: res.status,
      body: responseBody,
      headers: res.headers,
    };
  };

  return {
    get: <T>(path: string, options?: RequestOptions) => 
      request<T>('GET', path, undefined, options),
    
    post: <T>(path: string, body?: unknown, options?: RequestOptions) => 
      request<T>('POST', path, body, options),
    
    put: <T>(path: string, body?: unknown, options?: RequestOptions) => 
      request<T>('PUT', path, body, options),
    
    patch: <T>(path: string, body?: unknown, options?: RequestOptions) => 
      request<T>('PATCH', path, body, options),
    
    delete: <T>(path: string, options?: RequestOptions) => 
      request<T>('DELETE', path, undefined, options),
    
    close: async () => {
      // Cleanup resources if needed
    },
  };
}

/**
 * Helper to create request with specific user context
 */
export function withUser(app: TestApp, userId: string): TestApp {
  const wrapOptions = (options?: RequestOptions): RequestOptions => ({
    ...options,
    headers: {
      ...options?.headers,
      'X-User-Id': userId,
    },
  });

  return {
    get: (path, options) => app.get(path, wrapOptions(options)),
    post: (path, body, options) => app.post(path, body, wrapOptions(options)),
    put: (path, body, options) => app.put(path, body, wrapOptions(options)),
    patch: (path, body, options) => app.patch(path, body, wrapOptions(options)),
    delete: (path, options) => app.delete(path, wrapOptions(options)),
    close: () => app.close(),
  };
}

/**
 * Helper to assert common response patterns
 */
export const assertResponse = {
  ok: <T>(res: TestResponse<T>) => {
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Expected success status, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res;
  },

  created: <T>(res: TestResponse<T>) => {
    if (res.status !== 201) {
      throw new Error(`Expected 201 Created, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res;
  },

  noContent: <T>(res: TestResponse<T>) => {
    if (res.status !== 204) {
      throw new Error(`Expected 204 No Content, got ${res.status}`);
    }
    return res;
  },

  badRequest: <T>(res: TestResponse<T>) => {
    if (res.status !== 400) {
      throw new Error(`Expected 400 Bad Request, got ${res.status}`);
    }
    return res;
  },

  unauthorized: <T>(res: TestResponse<T>) => {
    if (res.status !== 401) {
      throw new Error(`Expected 401 Unauthorized, got ${res.status}`);
    }
    return res;
  },

  forbidden: <T>(res: TestResponse<T>) => {
    if (res.status !== 403) {
      throw new Error(`Expected 403 Forbidden, got ${res.status}`);
    }
    return res;
  },

  notFound: <T>(res: TestResponse<T>) => {
    if (res.status !== 404) {
      throw new Error(`Expected 404 Not Found, got ${res.status}`);
    }
    return res;
  },

  serverError: <T>(res: TestResponse<T>) => {
    if (res.status < 500) {
      throw new Error(`Expected 5xx Server Error, got ${res.status}`);
    }
    return res;
  },
};
