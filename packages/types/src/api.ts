/**
 * API response wrapper types.
 */

/** Generic success response */
export interface SuccessResponse {
  success: true;
  message?: string;
}

/** Generic error response */
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: unknown;
}

/** Generic API response wrapper */
export type ApiResponse<T> = 
  | { success: true; data: T }
  | ErrorResponse;

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

/** Health check response */
export interface HealthResponse {
  status: "healthy" | "unhealthy";
  version: string;
  uptime?: number;
  services?: Record<string, boolean>;
}
