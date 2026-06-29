/**
 * Custom error classes for better error handling
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toJSON() {
    return {
      error: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

export class CoolifyApiError extends ApiError {
  constructor(message: string, statusCode: number = 500, details?: unknown) {
    super(message, statusCode, 'COOLIFY_ERROR', details);
    this.name = 'CoolifyApiError';
  }
}

export class ForgejoApiError extends ApiError {
  constructor(message: string, statusCode: number = 500, details?: unknown) {
    super(message, statusCode, 'FORGEJO_ERROR', details);
    this.name = 'ForgejoApiError';
  }
}

export class GitHubApiError extends ApiError {
  constructor(message: string, statusCode: number = 500, details?: unknown) {
    super(message, statusCode, 'GITHUB_ERROR', details);
    this.name = 'GitHubApiError';
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} not found: ${id}` : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(message, 409, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

export class ProjectNotFoundError extends NotFoundError {
  constructor(projectId: string) {
    super('Project', projectId);
    this.name = 'ProjectNotFoundError';
  }
}

export class ProviderNotFoundError extends NotFoundError {
  constructor(providerId: string) {
    super('Provider', providerId);
    this.name = 'ProviderNotFoundError';
  }
}

export class ProjectCreationError extends ApiError {
  constructor(message: string, cause?: unknown) {
    super(message, 500, 'PROJECT_CREATION_ERROR', cause);
    this.name = 'ProjectCreationError';
  }
}
