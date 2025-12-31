/**
 * Admin Types
 * 
 * Shared types for admin functionality across frontend and API.
 */

// =============================================================================
// User Roles
// =============================================================================

export type UserRole = "user" | "admin";

// =============================================================================
// Resource Limits
// =============================================================================

/**
 * User resource limits configuration
 */
export interface UserResourceLimits {
  id: string;
  userId: string;
  
  // Sandbox limits
  maxSandboxes: number;
  maxConcurrentRunning: number;
  
  // Tier restrictions
  allowedTierIds: string[];
  maxTierId: string;
  
  // Storage limits
  maxTotalStorageGb: number;
  
  // Aggregate resource limits
  maxTotalCpuCores: number;
  maxTotalMemoryGb: number;
  
  // Addon restrictions (null = all allowed)
  allowedAddonIds: string[] | null;
  
  // Admin notes
  notes: string | null;
  
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for updating user resource limits
 */
export interface UpdateUserResourceLimitsInput {
  maxSandboxes?: number;
  maxConcurrentRunning?: number;
  allowedTierIds?: string[];
  maxTierId?: string;
  maxTotalStorageGb?: number;
  maxTotalCpuCores?: number;
  maxTotalMemoryGb?: number;
  allowedAddonIds?: string[] | null;
  notes?: string | null;
}

/**
 * Default resource limits for new users
 */
export const DEFAULT_RESOURCE_LIMITS: Omit<UserResourceLimits, "id" | "userId" | "createdAt" | "updatedAt"> = {
  maxSandboxes: 1,
  maxConcurrentRunning: 1,
  allowedTierIds: ["starter"],
  maxTierId: "starter",
  maxTotalStorageGb: 10,
  maxTotalCpuCores: 2,
  maxTotalMemoryGb: 4,
  allowedAddonIds: null,
  notes: null,
};

// =============================================================================
// Admin User View
// =============================================================================

/**
 * Extended user view for admin display
 */
export interface AdminUserView {
  id: string;
  email: string;
  name: string;
  image: string | null;
  emailVerified: boolean;
  role: UserRole;
  banned: boolean;
  bannedReason: string | null;
  bannedAt: string | null;
  createdAt: string;
  updatedAt: string;
  
  // Stats
  sandboxCount: number;
  runningSandboxCount: number;
  
  // Resource limits (optional, loaded on detail view)
  limits?: UserResourceLimits;
}

/**
 * User resource usage statistics
 */
export interface UserResourceUsage {
  sandboxCount: number;
  runningSandboxCount: number;
  totalCpuCores: number;
  totalMemoryGb: number;
}

// =============================================================================
// Admin Statistics
// =============================================================================

/**
 * System-wide admin statistics
 */
export interface AdminStats {
  totalUsers: number;
  adminUsers: number;
  bannedUsers: number;
  totalSandboxes: number;
  runningSandboxes: number;
  usersThisWeek: number;
}

// =============================================================================
// Admin Audit Log
// =============================================================================

/**
 * Admin action types for audit logging
 */
export type AdminAction =
  | "user_ban"
  | "user_unban"
  | "user_role_change"
  | "limits_update"
  | "sandbox_force_delete"
  | "sandbox_force_stop";

/**
 * Admin audit log entry
 */
export interface AdminAuditLogEntry {
  id: string;
  adminUserId: string;
  adminEmail?: string;
  adminName?: string;
  action: AdminAction;
  targetUserId: string | null;
  targetEmail?: string;
  targetName?: string;
  targetResourceId: string | null;
  targetResourceType: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

// =============================================================================
// List Query Options
// =============================================================================

/**
 * Options for listing users
 */
export interface ListUsersOptions {
  search?: string;
  role?: UserRole;
  banned?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: "email" | "name" | "createdAt" | "role";
  sortDirection?: "asc" | "desc";
}

/**
 * Paginated admin list response
 */
export interface AdminPaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  page: number;
  totalPages: number;
}

// =============================================================================
// API Response Types
// =============================================================================

/**
 * List users API response
 */
export interface ListUsersResponse {
  users: AdminUserView[];
  total: number;
  limit: number;
  offset: number;
  page: number;
  totalPages: number;
}

/**
 * Get user API response
 */
export interface GetUserResponse {
  user: AdminUserView;
  usage: UserResourceUsage;
}

/**
 * Get user limits API response
 */
export interface GetUserLimitsResponse {
  limits: UserResourceLimits;
  usage: UserResourceUsage;
}

/**
 * Ban user request body
 */
export interface BanUserRequest {
  reason: string;
}

/**
 * Update role request body
 */
export interface UpdateRoleRequest {
  role: UserRole;
}

/**
 * Audit log API response
 */
export interface AuditLogResponse {
  entries: AdminAuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

// =============================================================================
// Limit Check Types
// =============================================================================

/**
 * Result of a resource limit check
 */
export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  current?: number;
  limit?: number;
}

/**
 * Error response when limit is exceeded
 */
export interface LimitExceededError {
  error: "Resource limit exceeded";
  message: string;
  current?: number;
  limit?: number;
}
