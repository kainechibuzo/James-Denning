/**
 * Theme — brand colours and shadow tokens.
 *
 * `C` is a mutable reference that flips between LIGHT and DARK at runtime
 * when the user toggles dark mode.  AppDemo.jsx sets it via `C = dark ? DARK : LIGHT`
 * inside <DarkProvider>.  Every module that needs colours imports this file
 * and references `C` — they always see the current theme.
 *
 * Do NOT freeze or deepClone LIGHT/DARK — the live reference swap must work.
 */

export const LIGHT = {
  orange:"#E8560A", orangePale:"#FFF4EE", orangeLight:"#FED7AA",
  blue:"#1A4FA0",   bluePale:"#EFF6FF",   blueDark:"#0d2d6e", blueLight:"#BFDBFE",
  green:"#15803D",  greenPale:"#F0FDF4",  greenLight:"#BBF7D0",
  red:"#DC2626",    redPale:"#FEF2F2",    redLight:"#FECACA",
  purple:"#7C3AED", purplePale:"#F5F3FF",
  amber:"#D97706",  amberPale:"#FFFBEB",
  teal:"#0F766E",   tealPale:"#F0FDFA",
  white:"#FFFFFF",  offWhite:"#F8FAFC",
  border:"#E2E8F0", borderLight:"#F1F5F9",
  text:"#0F172A",   textSoft:"#334155",   muted:"#64748B", light:"#94A3B8",
  shadow:"0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04)",
  shadowMd:"0 4px 12px rgba(0,0,0,.08),0 2px 4px rgba(0,0,0,.04)",
  shadowLg:"0 20px 40px rgba(0,0,0,.10),0 8px 16px rgba(0,0,0,.06)",
  shadowXl:"0 32px 64px rgba(0,0,0,.14),0 16px 32px rgba(0,0,0,.08)",
};

export const DARK = {
  orange:"#FB923C", orangePale:"#1C0D00", orangeLight:"#7C2D12",
  blue:"#60A5FA",   bluePale:"#0C1A3A",   blueDark:"#030712",   blueLight:"#1E3A5F",
  green:"#4ADE80",  greenPale:"#052E16",  greenLight:"#14532D",
  red:"#F87171",    redPale:"#1F0A0A",    redLight:"#450A0A",
  purple:"#A78BFA", purplePale:"#1E1030",
  amber:"#FCD34D",  amberPale:"#1A1000",
  teal:"#2DD4BF",   tealPale:"#021B18",
  white:"#1E2D3D",  offWhite:"#141C28",
  border:"#2E4258", borderLight:"#1E293B",
  text:"#F1F5F9",   textSoft:"#CBD5E1",   muted:"#9FB3C8", light:"#7F96AC",
  shadow:"0 1px 3px rgba(0,0,0,.3),0 1px 2px rgba(0,0,0,.2)",
  shadowMd:"0 4px 12px rgba(0,0,0,.35),0 2px 4px rgba(0,0,0,.2)",
  shadowLg:"0 20px 40px rgba(0,0,0,.45),0 8px 16px rgba(0,0,0,.3)",
  shadowXl:"0 32px 64px rgba(0,0,0,.55),0 16px 32px rgba(0,0,0,.4)",
};

/** Live theme reference — set by DarkProvider at runtime. Always import `C`. */
export let C = LIGHT;
export const setTheme = (dark) => { C = dark ? DARK : LIGHT; };

// ── Plan badge colours (used by platform admin UI) ─────────────────────────
export const PLAN_COLORS = {
  free:       { bg:"#f1f5f9", color:"#64748b" },
  starter:    { bg:"#dbeafe", color:"#1d4ed8" },
  pro:        { bg:"#d1fae5", color:"#065f46" },
  enterprise: { bg:"#fce7f3", color:"#9d174d" },
};
