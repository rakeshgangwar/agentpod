/**
 * status-badge.ts
 *
 * Theme-robust outline status badge helper.
 * Returns Tailwind classes that are legible under all 20 colour schemes because
 * they use *token* colours (not hard-coded hex) with the outline pattern:
 *   text-<token>  border-<token>  bg-<token>/10
 *
 * Usage:
 *   import { statusBadgeClass } from "$lib/utils/status-badge";
 *   <Badge variant="outline" class={statusBadgeClass(node.status)}>{node.status}</Badge>
 */

type Token =
  | "chart-2"          // green  — running / online / healthy / active / connected
  | "destructive"      // red    — error / unhealthy / crashed
  | "chart-4"          // amber  — starting / stopping / warning / pending
  | "chart-5"          // purple — sleeping / hibernated
  | "muted-foreground"; // grey  — stopped / offline / unknown / default

function tokenFor(status: string): Token {
  switch (status.toLowerCase()) {
    case "running":
    case "online":
    case "healthy":
    case "active":
    case "connected":
      return "chart-2";

    case "error":
    case "unhealthy":
    case "crashed":
      return "destructive";

    case "starting":
    case "stopping":
    case "warning":
    case "pending":
      return "chart-4";

    case "sleeping":
    case "hibernated":
      return "chart-5";

    // stopped / offline / unknown / anything else
    default:
      return "muted-foreground";
  }
}

/**
 * Returns the CSS class string for a status badge.
 * Always pair with `variant="outline"` on the Badge component so the base
 * outline badge resets remove conflicting bg/text defaults.
 */
export function statusBadgeClass(status: string): string {
  const t = tokenFor(status);
  return `text-${t} border-${t} bg-${t}/10`;
}
