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
};

export const DARK = {
  orange: "#D9B650", orangeDark: "#F0D77C", orangePale: "#292315", orangeLight: "#8B7435",
  blue: "#D9B650", bluePale: "#292315", blueDark: "#080808", blueLight: "#8B7435",
  white: "#101010", offWhite: "#080808", card: "#101010", filter: "#171717",
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
