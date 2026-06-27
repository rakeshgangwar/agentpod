/**
 * Permission Bar Component
 * 
 * A sticky bar at the bottom of the chat that displays the current permission
 * request and allows the user to approve, always allow, or reject it.
 * 
 * Design:
 * - Sticky at bottom of chat area
 * - Shows permission type icon, title, and details
 * - Three buttons: Allow Once, Always Allow, Reject
 * - Subtle animation when appearing
 * - Shows loading state when responding
 */

import { useState } from "react";
import { usePermissions } from "./PermissionContext";
import type { PermissionResponseType } from "../api/tauri";

// =============================================================================
// Icon Components (inline SVG for simplicity)
// =============================================================================

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  );
}

function TerminalIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" x2="20" y1="19" y2="19" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className || ""}`}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--cyber-cyan)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the appropriate icon for a permission type
 */
function getPermissionIcon(type: string): React.ReactNode {
  const iconClass = "size-5";
  
  switch (type.toLowerCase()) {
    case "bash":
    case "command":
      return <TerminalIcon className={iconClass} />;
    case "edit":
    case "write":
    case "file":
      return <FileIcon className={iconClass} />;
    case "webfetch":
    case "web":
    case "http":
      return <GlobeIcon className={iconClass} />;
    case "external_directory":
    case "directory":
      return <FolderIcon className={iconClass} />;
    default:
      return <ShieldIcon className={iconClass} />;
  }
}

/**
 * Format the permission pattern for display
 */
function formatPattern(pattern: string | string[] | undefined): string {
  if (!pattern) return "";
  if (Array.isArray(pattern)) {
    return pattern.join(", ");
  }
  return pattern;
}

/**
 * Get a user-friendly label for the permission type
 */
function getPermissionTypeLabel(type: string): string {
  switch (type.toLowerCase()) {
    case "bash":
      return "Run Command";
    case "edit":
      return "Edit File";
    case "write":
      return "Write File";
    case "webfetch":
      return "Fetch URL";
    case "external_directory":
      return "Access Directory";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

// =============================================================================
// PermissionBar Component
// =============================================================================

interface PermissionBarProps {
  /** Additional CSS classes */
  className?: string;
}

export function PermissionBar({ className }: PermissionBarProps) {
  const { currentPermission, respondToPermission, pendingPermissions } = usePermissions();
  const [error, setError] = useState<string | null>(null);

  // Don't render if no pending permissions
  if (!currentPermission) {
    return null;
  }

  const handleRespond = async (response: PermissionResponseType) => {
    setError(null);
    try {
      await respondToPermission(currentPermission.id, response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to respond");
    }
  };

  const permission = currentPermission;
  const pattern = formatPattern(permission.pattern);
  const queueCount = pendingPermissions.length;

  return (
    <div
      className={`
        border-t border-[var(--cyber-amber)]/30 bg-background/95 backdrop-blur-sm
        p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.2)] animate-in slide-in-from-bottom-2 duration-200
        ${className || ""}
      `}
    >
      {/* Error message */}
      {error && (
        <div className="mb-3 rounded border border-[var(--cyber-red)]/30 bg-[var(--cyber-red)]/10 px-3 py-2 font-mono text-xs text-[var(--cyber-red)]">
          {error}
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="flex-shrink-0 rounded border border-[var(--cyber-amber)]/30 bg-[var(--cyber-amber)]/10 p-2 text-[var(--cyber-amber)]">
          {getPermissionIcon(permission.type)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs font-medium uppercase tracking-wider text-[var(--cyber-amber)]">
              [{getPermissionTypeLabel(permission.type)}]
            </span>
            {queueCount > 1 && (
              <span className="rounded border border-border/30 bg-muted/50 px-2 py-0.5 font-mono text-xs text-muted-foreground">
                +{queueCount - 1} more
              </span>
            )}
          </div>

          {/* Title */}
          <h4 className="font-mono text-sm font-medium text-foreground">
            {permission.title}
          </h4>

          {/* Pattern (if present) */}
          {pattern && (
            <code className="mt-1 block truncate font-mono text-xs text-[var(--cyber-cyan)]">
              {pattern}
            </code>
          )}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {permission.isResponding ? (
            <div className="flex items-center gap-2 text-[var(--cyber-cyan)]">
              <LoadingSpinner className="size-4" />
              <span className="font-mono text-xs uppercase tracking-wider">Processing...</span>
            </div>
          ) : (
            <>
              {/* Reject button */}
              <button
                onClick={() => handleRespond("reject")}
                className="
                  inline-flex items-center justify-center rounded px-3 py-1.5
                  font-mono text-xs uppercase tracking-wider
                  bg-transparent border border-[var(--cyber-red)]/30 text-[var(--cyber-red)]
                  hover:bg-[var(--cyber-red)]/10 hover:border-[var(--cyber-red)]/50
                  transition-colors
                "
              >
                Reject
              </button>

              {/* Always Allow button */}
              <button
                onClick={() => handleRespond("always")}
                className="
                  inline-flex items-center justify-center rounded px-3 py-1.5
                  font-mono text-xs uppercase tracking-wider
                  bg-transparent border border-border/50 text-foreground
                  hover:bg-muted/50 hover:border-[var(--cyber-cyan)]/30
                  transition-colors
                "
              >
                Always
              </button>

              {/* Allow Once button (primary) */}
              <button
                onClick={() => handleRespond("once")}
                className="
                  inline-flex items-center justify-center rounded px-3 py-1.5
                  font-mono text-xs uppercase tracking-wider
                  bg-[var(--cyber-emerald)] text-[var(--cyber-emerald-foreground)]
                  hover:bg-[var(--cyber-emerald)]/90
                  transition-colors shadow-[0_0_12px_var(--cyber-emerald)/20]
                "
              >
                Allow
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default PermissionBar;
