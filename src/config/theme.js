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

// All-black theme (JAMES-DENNING default). Surfaces are near-black rather
// than pure #000 so cards/panels still read as distinct layers; true black
// is reserved for the page background. Accent colours stay saturated so
// they still pop against black.
export const DARK = {
  orange:"#FB923C", orangePale:"#1C0D00", orangeLight:"#7C2D12",
  blue:"#60A5FA",   bluePale:"#0A0E14",   blueDark:"#000000",   blueLight:"#111827",
  green:"#4ADE80",  greenPale:"#051006",  greenLight:"#0F2415",
  red:"#F87171",    redPale:"#140505",    redLight:"#2D0A0A",
  purple:"#A78BFA", purplePale:"#0F0A1A",
  amber:"#FCD34D",  amberPale:"#120D00",
  teal:"#2DD4BF",   tealPale:"#00100E",
  white:"#0A0A0A",  offWhite:"#000000",
  border:"#1F1F1F", borderLight:"#141414",
  text:"#F5F5F5",   textSoft:"#C7C7C7",   muted:"#8A8A8A", light:"#666666",
  shadow:"0 1px 3px rgba(0,0,0,.6),0 1px 2px rgba(0,0,0,.4)",
  shadowMd:"0 4px 12px rgba(0,0,0,.65),0 2px 4px rgba(0,0,0,.4)",
  shadowLg:"0 20px 40px rgba(0,0,0,.7),0 8px 16px rgba(0,0,0,.5)",
  shadowXl:"0 32px 64px rgba(0,0,0,.8),0 16px 32px rgba(0,0,0,.6)",
};

/** Live theme reference — set by DarkProvider at runtime. Always import `C`.
 *  Defaults to DARK (all-black) since that's now the product's default theme. */
export let C = DARK;
export const setTheme = (dark) => { C = dark ? DARK : LIGHT; };

// ── Plan badge colours (used by platform admin UI) ─────────────────────────
export const PLAN_COLORS = {
  free:       { bg:"#f1f5f9", color:"#64748b" },
  starter:    { bg:"#dbeafe", color:"#1d4ed8" },
  pro:        { bg:"#d1fae5", color:"#065f46" },
  enterprise: { bg:"#fce7f3", color:"#9d174d" },
};
