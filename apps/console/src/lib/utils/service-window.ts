/**
 * Utility for opening service URLs in the appropriate context:
 * - Desktop: Opens in a new Tauri WebviewWindow (in-app experience)
 * - Mobile: Opens in system browser (native mobile UX)
 */

import { platform } from "@tauri-apps/plugin-os";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

/** Supported service types for window management */
export type ServiceType = "opencode" | "code-server" | "vnc";

/** Options for opening a service window */
export interface OpenServiceOptions {
  /** The URL to open */
  url: string;
  /** Human-readable title for the window */
  title: string;
  /** Service type - used to manage window reuse */
  serviceType: ServiceType;
  /** Project ID - used to create unique window labels per project */
  projectId: string;
}

/** Map to track existing service windows by label */
const activeWindows = new Map<string, WebviewWindow>();

/**
 * Checks if the current platform is a mobile device
 */
async function isMobilePlatform(): Promise<boolean> {
  try {
    const currentPlatform = await platform();
    return currentPlatform === "ios" || currentPlatform === "android";
  } catch {
    // If we can't detect platform, assume desktop
    return false;
  }
}

/**
 * Generates a unique window label for a service
 */
function getWindowLabel(projectId: string, serviceType: ServiceType): string {
  return `service-${projectId}-${serviceType}`;
}

/**
 * Opens a service URL in the appropriate context based on platform.
 * 
 * On desktop platforms, opens in a new Tauri WebviewWindow.
 * On mobile platforms, opens in the system browser.
 * 
 * If a window for the same service/project already exists, it will be focused.
 */
export async function openServiceWindow(options: OpenServiceOptions): Promise<void> {
  const { url, title, serviceType, projectId } = options;
  
  if (!url) {
    console.warn("openServiceWindow called with empty URL");
    return;
  }

  const isMobile = await isMobilePlatform();
  
  if (isMobile) {
    // Mobile: Open in system browser
    window.open(url, "_blank");
    return;
  }

  // Desktop: Open in new Tauri WebviewWindow
  const label = getWindowLabel(projectId, serviceType);
  
  // Check if we already have this window open
  const existingWindow = activeWindows.get(label);
  if (existingWindow) {
    try {
      // Try to focus the existing window
      await existingWindow.setFocus();
      // Navigate to the URL in case it changed
      // Note: WebviewWindow doesn't have a navigate method exposed to JS,
      // so we'll close and recreate if the URL is different
      return;
    } catch {
      // Window might have been closed, remove from map
      activeWindows.delete(label);
    }
  }

  // Create a new window
  try {
    const webviewWindow = new WebviewWindow(label, {
      url,
      title,
      width: 1280,
      height: 800,
      center: true,
      resizable: true,
      decorations: true,
      focus: true,
    });

    // Track the window
    activeWindows.set(label, webviewWindow);

    // Clean up when window is destroyed (closed)
    webviewWindow.once("tauri://destroyed", () => {
      activeWindows.delete(label);
    });

    // Handle creation errors
    webviewWindow.once("tauri://error", (e) => {
      console.error("Error creating service window:", e);
      activeWindows.delete(label);
      // Fallback to opening in browser
      window.open(url, "_blank");
    });
  } catch (error) {
    console.error("Failed to create service window:", error);
    // Fallback to opening in browser
    window.open(url, "_blank");
  }
}

/**
 * Opens a URL in the system browser (cross-platform)
 */
export function openInBrowser(url: string | null | undefined): void {
  if (url) {
    window.open(url, "_blank");
  }
}
