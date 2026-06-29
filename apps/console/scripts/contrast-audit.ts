#!/usr/bin/env bun
/**
 * WCAG Contrast Audit Script
 * 
 * Analyzes all color schemes in the AgentPod theme system for WCAG AA/AAA compliance.
 * Dynamically imports themes from the actual source files.
 * Supports both OKLCH and HEX color formats.
 * 
 * Usage: bun run scripts/contrast-audit.ts
 */

import { themePresets } from "../src/lib/themes/presets";
import type { ThemePreset } from "../src/lib/themes/presets/types";

// =============================================================================
// Color Conversion Utilities
// =============================================================================

/**
 * Parse OKLCH color string to linear RGB values
 * Format: "oklch(L C H)" or "oklch(L C H / alpha)"
 */
function parseOklch(oklchStr: string): { r: number; g: number; b: number } | null {
  const match = oklchStr.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.%]+)?\s*\)/);
  if (!match) return null;

  const L = parseFloat(match[1]);
  const C = parseFloat(match[2]);
  const H = parseFloat(match[3]);

  // OKLCH to OKLab
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);

  // OKLab to linear sRGB
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  // Clamp to [0, 1]
  r = Math.max(0, Math.min(1, r));
  g = Math.max(0, Math.min(1, g));
  bl = Math.max(0, Math.min(1, bl));

  return { r: r * 255, g: g * 255, b: bl * 255 };
}

/**
 * Parse HEX color string to RGB values
 */
function parseHex(hexStr: string): { r: number; g: number; b: number } | null {
  const hex = hexStr.replace("#", "");
  if (hex.length !== 6 && hex.length !== 3) return null;

  let r: number, g: number, b: number;
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  }

  return { r, g, b };
}

/**
 * Parse any color string (OKLCH or HEX) to RGB
 */
function parseColor(colorStr: string): { r: number; g: number; b: number } | null {
  if (colorStr.startsWith("oklch")) {
    return parseOklch(colorStr);
  } else if (colorStr.startsWith("#")) {
    return parseHex(colorStr);
  }
  return null;
}

// =============================================================================
// Contrast Calculation (WCAG 2.1)
// =============================================================================

/**
 * Calculate relative luminance according to WCAG 2.1
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const sRGB = c / 255;
    return sRGB <= 0.04045
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
function getContrastRatio(
  color1: { r: number; g: number; b: number },
  color2: { r: number; g: number; b: number }
): number {
  const l1 = getRelativeLuminance(color1.r, color1.g, color1.b);
  const l2 = getRelativeLuminance(color2.r, color2.g, color2.b);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

// =============================================================================
// Contrast Analysis
// =============================================================================

interface ContrastResult {
  pair: string;
  bgColor: string;
  fgColor: string;
  ratio: number;
  wcagAA: {
    normalText: boolean; // 4.5:1
    largeText: boolean; // 3:1
    uiComponents: boolean; // 3:1
  };
  wcagAAA: {
    normalText: boolean; // 7:1
    largeText: boolean; // 4.5:1
  };
}

interface ThemeAuditResult {
  schemeId: string;
  schemeLabel: string;
  category: string;
  mode: "light" | "dark";
  results: ContrastResult[];
  summary: {
    totalPairs: number;
    passAA: number;
    failAA: number;
    passAAA: number;
    failAAA: number;
  };
}

// Color pairs to test (background -> foreground relationships)
const colorPairs: [string, string][] = [
  ["background", "foreground"],
  ["card", "card-foreground"],
  ["popover", "popover-foreground"],
  ["primary", "primary-foreground"],
  ["secondary", "secondary-foreground"],
  ["muted", "muted-foreground"],
  ["accent", "accent-foreground"],
  ["destructive", "destructive-foreground"],
  ["sidebar", "sidebar-foreground"],
  ["sidebar-primary", "sidebar-primary-foreground"],
  ["sidebar-accent", "sidebar-accent-foreground"],
  // Also test cyber colors against common backgrounds
  ["background", "cyber-cyan"],
  ["background", "cyber-emerald"],
  ["background", "cyber-magenta"],
  ["background", "cyber-amber"],
  ["background", "cyber-red"],
  ["card", "cyber-cyan"],
  ["card", "cyber-emerald"],
  ["card", "cyber-magenta"],
  ["card", "cyber-amber"],
  ["card", "cyber-red"],
];

function analyzeContrast(
  bgColor: string,
  fgColor: string,
  pairName: string
): ContrastResult | null {
  const bg = parseColor(bgColor);
  const fg = parseColor(fgColor);

  if (!bg || !fg) {
    return null;
  }

  const ratio = getContrastRatio(bg, fg);

  return {
    pair: pairName,
    bgColor,
    fgColor,
    ratio: Math.round(ratio * 100) / 100,
    wcagAA: {
      normalText: ratio >= 4.5,
      largeText: ratio >= 3,
      uiComponents: ratio >= 3,
    },
    wcagAAA: {
      normalText: ratio >= 7,
      largeText: ratio >= 4.5,
    },
  };
}

function auditTheme(preset: ThemePreset, mode: "light" | "dark"): ThemeAuditResult {
  const styles = preset.styles[mode];
  const results: ContrastResult[] = [];

  for (const [bgKey, fgKey] of colorPairs) {
    const bgColor = styles[bgKey as keyof typeof styles] as string | undefined;
    const fgColor = styles[fgKey as keyof typeof styles] as string | undefined;

    if (bgColor && fgColor) {
      const result = analyzeContrast(bgColor, fgColor, `${bgKey} / ${fgKey}`);
      if (result) {
        results.push(result);
      }
    }
  }

  const passAA = results.filter((r) => r.wcagAA.normalText).length;
  const passAAA = results.filter((r) => r.wcagAAA.normalText).length;

  return {
    schemeId: preset.id,
    schemeLabel: preset.label,
    category: preset.category,
    mode,
    results,
    summary: {
      totalPairs: results.length,
      passAA,
      failAA: results.length - passAA,
      passAAA,
      failAAA: results.length - passAAA,
    },
  };
}

// =============================================================================
// Report Generation
// =============================================================================

function generateReport(audits: ThemeAuditResult[]): void {
  console.log("\n");
  console.log("═".repeat(80));
  console.log("                    WCAG CONTRAST AUDIT REPORT");
  console.log("                         AgentPod Themes");
  console.log("═".repeat(80));
  console.log(`\nAudit Date: ${new Date().toISOString()}`);
  console.log(`Total Themes: ${themePresets.length}`);
  console.log(`Total Audits: ${audits.length} (${themePresets.length} themes × 2 modes)`);
  console.log("\n");

  // Group by category
  const byCategory = new Map<string, ThemeAuditResult[]>();
  for (const audit of audits) {
    const existing = byCategory.get(audit.category) || [];
    existing.push(audit);
    byCategory.set(audit.category, existing);
  }

  // Summary table
  console.log("─".repeat(80));
  console.log("SUMMARY BY THEME");
  console.log("─".repeat(80));
  console.log(
    "Theme".padEnd(25) +
      "Mode".padEnd(8) +
      "AA Pass".padEnd(12) +
      "AA Fail".padEnd(12) +
      "AAA Pass".padEnd(12) +
      "Status"
  );
  console.log("─".repeat(80));

  let totalPassAA = 0;
  let totalFailAA = 0;
  let totalPassAAA = 0;
  let totalFailAAA = 0;

  // Define category order for display
  const categoryOrder = ["default", "developer", "creative", "nature", "minimal", "brand"];
  const sortedCategories = [...byCategory.keys()].sort((a, b) => {
    const aIdx = categoryOrder.indexOf(a);
    const bIdx = categoryOrder.indexOf(b);
    return aIdx - bIdx;
  });

  for (const category of sortedCategories) {
    const categoryAudits = byCategory.get(category) || [];
    console.log(`\n[${category.toUpperCase()}]`);
    for (const audit of categoryAudits) {
      const status =
        audit.summary.failAA === 0 ? "✅ PASS" : `❌ ${audit.summary.failAA} issues`;
      console.log(
        audit.schemeLabel.padEnd(25) +
          audit.mode.padEnd(8) +
          String(audit.summary.passAA).padEnd(12) +
          String(audit.summary.failAA).padEnd(12) +
          String(audit.summary.passAAA).padEnd(12) +
          status
      );
      totalPassAA += audit.summary.passAA;
      totalFailAA += audit.summary.failAA;
      totalPassAAA += audit.summary.passAAA;
      totalFailAAA += audit.summary.failAAA;
    }
  }

  console.log("─".repeat(80));
  console.log(
    "TOTAL".padEnd(25) +
      "".padEnd(8) +
      String(totalPassAA).padEnd(12) +
      String(totalFailAA).padEnd(12) +
      String(totalPassAAA).padEnd(12) +
      (totalFailAA === 0 ? "✅ ALL PASS" : `❌ ${totalFailAA} issues`)
  );
  console.log("─".repeat(80));

  // Detailed failures
  const failures = audits.filter((a) => a.summary.failAA > 0);
  if (failures.length > 0) {
    console.log("\n\n");
    console.log("═".repeat(80));
    console.log("                         DETAILED FAILURES");
    console.log("═".repeat(80));

    for (const audit of failures) {
      const failedPairs = audit.results.filter((r) => !r.wcagAA.normalText);
      if (failedPairs.length > 0) {
        console.log(`\n[${audit.schemeLabel}] (${audit.mode} mode)`);
        console.log("─".repeat(60));
        for (const pair of failedPairs) {
          const status =
            pair.ratio >= 3
              ? "⚠️  (Large text OK)"
              : "❌ (Fails all)";
          console.log(
            `  ${pair.pair.padEnd(40)} Ratio: ${pair.ratio.toFixed(2).padEnd(8)} ${status}`
          );
          console.log(`    BG: ${pair.bgColor}`);
          console.log(`    FG: ${pair.fgColor}`);
        }
      }
    }
  }

  // AAA-only issues (warnings)
  const aaaOnlyIssues = audits.filter(
    (a) => a.summary.failAA === 0 && a.summary.failAAA > 0
  );
  if (aaaOnlyIssues.length > 0) {
    console.log("\n\n");
    console.log("═".repeat(80));
    console.log("                    AAA COMPLIANCE WARNINGS");
    console.log("        (These pass AA but fail AAA - nice to improve)");
    console.log("═".repeat(80));

    for (const audit of aaaOnlyIssues) {
      const aaaFailedPairs = audit.results.filter(
        (r) => r.wcagAA.normalText && !r.wcagAAA.normalText
      );
      if (aaaFailedPairs.length > 0) {
        console.log(`\n[${audit.schemeLabel}] (${audit.mode} mode)`);
        console.log("─".repeat(60));
        for (const pair of aaaFailedPairs) {
          console.log(
            `  ${pair.pair.padEnd(40)} Ratio: ${pair.ratio.toFixed(2)} (needs 7:1 for AAA)`
          );
        }
      }
    }
  }

  // Final summary
  console.log("\n\n");
  console.log("═".repeat(80));
  console.log("                         FINAL SUMMARY");
  console.log("═".repeat(80));
  console.log(`\nTotal Color Pairs Tested: ${totalPassAA + totalFailAA}`);
  console.log(`WCAG AA Compliance: ${((totalPassAA / (totalPassAA + totalFailAA)) * 100).toFixed(1)}%`);
  console.log(`WCAG AAA Compliance: ${((totalPassAAA / (totalPassAAA + totalFailAAA)) * 100).toFixed(1)}%`);
  
  if (totalFailAA === 0) {
    console.log("\n✅ ALL THEMES PASS WCAG 2.1 AA CONTRAST REQUIREMENTS!");
  } else {
    console.log(`\n❌ ${totalFailAA} contrast issues need to be fixed for WCAG AA compliance.`);
  }
  console.log("\n" + "═".repeat(80) + "\n");
}

// =============================================================================
// Main Execution
// =============================================================================

function main() {
  console.log("Starting WCAG Contrast Audit...\n");
  console.log(`Loading ${themePresets.length} theme presets from source files...\n`);

  const audits: ThemeAuditResult[] = [];

  for (const preset of themePresets) {
    audits.push(auditTheme(preset, "light"));
    audits.push(auditTheme(preset, "dark"));
  }

  generateReport(audits);
}

main();
