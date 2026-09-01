/**
 * JAMES-DENNING design tokens.
 *
 * The product uses a restrained monochrome palette. Semantic colours remain
 * available for statuses and warnings, while primary navigation and actions
 * use charcoal instead of the former school blue/orange combination.
 */

const semantic = {
  green: "#166534", greenPale: "#F0FDF4", greenLight: "#BBF7D0",
  red: "#991B1B", redPale: "#FEF2F2", redLight: "#FECACA",
  amber: "#92400E", amberPale: "#FFFBEB",
  purple: "#4B5563", purplePale: "#F3F4F6",
  teal: "#374151", tealPale: "#F3F4F6",
};

export const LIGHT = {
  // Primary brand is charcoal/black. Legacy token names remain so every
  // existing feature keeps working without a visual rewrite in each page.
  orange: "#111827", orangeDark: "#030712", orangePale: "#F3F4F6", orangeLight: "#D1D5DB",
  blue: "#111827", bluePale: "#F3F4F6", blueDark: "#030712", blueLight: "#D1D5DB",
  white: "#FFFFFF", offWhite: "#F7F7F5", card: "#FFFFFF", filter: "#F9FAFB",
  border: "#E5E7EB", borderLight: "#F3F4F6",
  text: "#111827", textSoft: "#374151", muted: "#6B7280", light: "#9CA3AF",
  ...semantic,
  shadow: "0 1px 2px rgba(17,24,39,.05), 0 1px 3px rgba(17,24,39,.04)",
  shadowMd: "0 8px 24px rgba(17,24,39,.08), 0 2px 6px rgba(17,24,39,.05)",
  shadowLg: "0 20px 45px rgba(17,24,39,.12), 0 8px 18px rgba(17,24,39,.06)",
  shadowXl: "0 32px 64px rgba(17,24,39,.16), 0 16px 32px rgba(17,24,39,.08)",
  // ── Premium tokens (Phase 7 visual pass) ─────────────────────────────────
  // Ink = near-black charcoal used for the sidebar, hero bands, and primary
  // surfaces. accent = restrained warm accent used sparingly.
  ink: "#0B0F17", ink2: "#121826", ink3: "#1A2233",
  accent: "#F59E0B", accentSoft: "#FBBF24",
  ring: "0 0 0 3px rgba(245,158,11,.18)",
  cardGlow: "0 1px 0 rgba(255,255,255,.6) inset, 0 10px 30px -12px rgba(17,24,39,.14)",
  sidebarGrad: "linear-gradient(180deg,#0B0F17 0%,#0E1420 40%,#080B11 100%)",
  heroGrad: "radial-gradient(1100px 520px at 50% -10%, rgba(245,158,11,.10), transparent 60%), radial-gradient(800px 420px at 85% 10%, rgba(59,130,246,.08), transparent 55%), linear-gradient(180deg,#0B0F17 0%,#0B0F17 100%)",
  gridLine: "rgba(255,255,255,.05)",
};

export const DARK = {
  orange: "#F3F4F6", orangeDark: "#FFFFFF", orangePale: "#1F2937", orangeLight: "#4B5563",
  blue: "#F3F4F6", bluePale: "#1F2937", blueDark: "#000000", blueLight: "#4B5563",
  white: "#111111", offWhite: "#000000", card: "#111111", filter: "#171717",
  border: "#2A2A2A", borderLight: "#1F1F1F",
  text: "#F9FAFB", textSoft: "#D1D5DB", muted: "#9CA3AF", light: "#6B7280",
  green: "#86EFAC", greenPale: "#052E16", greenLight: "#166534",
  red: "#FCA5A5", redPale: "#450A0A", redLight: "#7F1D1D",
  amber: "#FCD34D", amberPale: "#451A03",
  purple: "#D1D5DB", purplePale: "#1F2937",
  teal: "#9CA3AF", tealPale: "#1F2937",
  shadow: "0 1px 3px rgba(0,0,0,.65), 0 1px 2px rgba(0,0,0,.4)",
  shadowMd: "0 8px 24px rgba(0,0,0,.65), 0 2px 6px rgba(0,0,0,.4)",
  shadowLg: "0 20px 45px rgba(0,0,0,.75), 0 8px 18px rgba(0,0,0,.45)",
  shadowXl: "0 32px 64px rgba(0,0,0,.85), 0 16px 32px rgba(0,0,0,.6)",
  // ── Premium tokens (Phase 7 visual pass) ─────────────────────────────────
  ink: "#0B0F17", ink2: "#121826", ink3: "#1A2233",
  accent: "#F59E0B", accentSoft: "#FBBF24",
  ring: "0 0 0 3px rgba(245,158,11,.22)",
  cardGlow: "0 1px 0 rgba(255,255,255,.04) inset, 0 10px 30px -12px rgba(0,0,0,.5)",
  sidebarGrad: "linear-gradient(180deg,#0B0F17 0%,#0E1420 40%,#080B11 100%)",
  heroGrad: "radial-gradient(1100px 520px at 50% -10%, rgba(245,158,11,.08), transparent 60%), linear-gradient(180deg,#080B11 0%,#0B0F17 100%)",
  gridLine: "rgba(255,255,255,.05)",
};

/** Live palette reference. */
export let C = LIGHT;
export const setTheme = (dark) => { C = dark ? DARK : LIGHT; };

export const PLAN_COLORS = {
  free:       { bg: "#F3F4F6", color: "#4B5563" },
  starter:    { bg: "#E5E7EB", color: "#1F2937" },
  pro:        { bg: "#D1D5DB", color: "#111827" },
  enterprise: { bg: "#111827", color: "#FFFFFF" },
};
