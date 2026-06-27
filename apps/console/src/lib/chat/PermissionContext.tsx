/**
 * Permission Context for managing human-in-the-loop permission requests
 * 
 * This context tracks pending permission requests from OpenCode and provides
 * functions to respond to them. Permission requests are received via SSE events
 * when a tool requires user approval (permission is set to "ask").
 * 
 * The context maintains a queue of pending permissions that should be displayed
 * in the UI, typically as a sticky bar at the bottom of the chat.
 */

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import {
  sandboxOpencodeRespondPermission,
  type PermissionRequest,
  type PermissionResponseType,
} from "../api/tauri";

// =============================================================================
// Types
// =============================================================================

export interface PendingPermission extends PermissionRequest {
  /** Whether a response is currently being sent */
  isResponding: boolean;
}

export interface PermissionContextValue {
  /** Currently pending permission requests (queue) */
  pendingPermissions: PendingPermission[];
  
  /** Add a new permission request to the queue */
  addPermission: (permission: PermissionRequest) => void;
  
  /** Remove a permission from the queue (e.g., when replied to elsewhere) */
  removePermission: (permissionId: string) => void;
  
  /** Respond to a permission request */
  respondToPermission: (
    permissionId: string,
    response: PermissionResponseType
  ) => Promise<void>;
  
  /** Clear all pending permissions (e.g., when changing sessions) */
  clearPermissions: () => void;
  
  /** Check if there are any pending permissions */
  hasPendingPermissions: boolean;
  
  /** Get the first (oldest) pending permission */
  currentPermission: PendingPermission | null;
}

// =============================================================================
// Context
// =============================================================================

const PermissionContext = createContext<PermissionContextValue | null>(null);

// =============================================================================
// Provider Props
// =============================================================================

interface PermissionProviderProps {
  projectId: string;
  children: ReactNode;
}

// =============================================================================
// Provider Implementation
// =============================================================================

export function PermissionProvider({ projectId, children }: PermissionProviderProps) {
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermission[]>([]);

  // Add a permission to the queue
  const addPermission = useCallback((permission: PermissionRequest) => {
    setPendingPermissions((prev) => {
      // Don't add duplicates
      if (prev.some((p) => p.id === permission.id)) {
        return prev;
      }
      return [
        ...prev,
        {
          ...permission,
          isResponding: false,
        },
      ];
    });
  }, []);

  // Remove a permission from the queue
  const removePermission = useCallback((permissionId: string) => {
    setPendingPermissions((prev) => prev.filter((p) => p.id !== permissionId));
  }, []);

  // Respond to a permission request
  const respondToPermission = useCallback(
    async (permissionId: string, response: PermissionResponseType) => {
      // Find the permission
      const permission = pendingPermissions.find((p) => p.id === permissionId);
      if (!permission) {
        console.warn(`[PermissionContext] Permission not found: ${permissionId}`);
        return;
      }

      // Mark as responding
      setPendingPermissions((prev) =>
        prev.map((p) =>
          p.id === permissionId ? { ...p, isResponding: true } : p
        )
      );

      try {
        // Call the Tauri command to respond (projectId is actually sandboxId in v2 API)
        await sandboxOpencodeRespondPermission(
          projectId,
          permission.sessionID,
          permissionId,
          response
        );

        // Remove from queue on success
        removePermission(permissionId);
      } catch (err) {
        console.error(`[PermissionContext] Failed to respond to permission:`, err);
        
        // Reset the responding state on error
        setPendingPermissions((prev) =>
          prev.map((p) =>
            p.id === permissionId ? { ...p, isResponding: false } : p
          )
        );
        
        // Re-throw so caller can handle
        throw err;
      }
    },
    [projectId, pendingPermissions, removePermission]
  );

  // Clear all permissions
  const clearPermissions = useCallback(() => {
    setPendingPermissions([]);
  }, []);

  // Derived state
  const hasPendingPermissions = pendingPermissions.length > 0;
  const currentPermission = pendingPermissions.length > 0 ? pendingPermissions[0] : null;

  const value = useMemo<PermissionContextValue>(() => ({
    pendingPermissions,
    addPermission,
    removePermission,
    respondToPermission,
    clearPermissions,
    hasPendingPermissions,
    currentPermission,
  }), [pendingPermissions, addPermission, removePermission, respondToPermission, clearPermissions, hasPendingPermissions, currentPermission]);

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access the permission context.
 * Must be used within a PermissionProvider.
 */
export function usePermissions(): PermissionContextValue {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error("usePermissions must be used within a PermissionProvider");
  }
  return context;
}

/**
 * Hook to get just the current permission (for components that only care about the first one).
 */
export function useCurrentPermission(): PendingPermission | null {
  const { currentPermission } = usePermissions();
  return currentPermission;
}

export default PermissionProvider;
