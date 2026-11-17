/** The supplied JD reference palette, shared by every workspace route.
 * Legacy semantic names remain API-compatible; labels/icons, not hue, convey status.
 */
const statusLight={green:"#34353b",greenPale:"#f1f2f5",greenLight:"#dddfe5",red:"#34353b",redPale:"#f1f2f5",redLight:"#dddfe5",amber:"#52545f",amberPale:"#f5f5f7",purple:"#52545f",purplePale:"#f1f2f5",teal:"#52545f",tealPale:"#f1f2f5"};
export const LIGHT={
 orange:"#17191c",orangeDark:"#090a0c",orangePale:"#f1f2f5",orangeLight:"#dddfe5",
 blue:"#17191c",bluePale:"#f1f2f5",blueDark:"#090a0c",blueLight:"#dddfe5",
 white:"#ffffff",offWhite:"#f7f8fb",card:"#ffffff",filter:"#f1f2f5",
 border:"#dedfe4",borderLight:"#ececf0",text:"#101114",textSoft:"#34353b",muted:"#60616b",light:"#60616b",
 ...statusLight,shadow:"0 2px 4px rgba(0,0,0,.035)",shadowMd:"0 5px 18px rgba(0,0,0,.055)",shadowLg:"0 14px 36px rgba(0,0,0,.08)",shadowXl:"0 24px 56px rgba(0,0,0,.12)"
};
export const DARK={
 orange:"#f2f3f5",orangeDark:"#ffffff",orangePale:"#252629",orangeLight:"#b6b7bf",
 blue:"#f2f3f5",bluePale:"#252629",blueDark:"#ffffff",blueLight:"#b6b7bf",
 white:"#17181b",offWhite:"#111214",card:"#1d1e22",filter:"#252629",
 border:"#38393f",borderLight:"#2b2c31",text:"#f3f4f5",textSoft:"#d1d2d8",muted:"#b6b7bf",light:"#94959f",
 green:"#d1d2d8",greenPale:"#252629",greenLight:"#38393f",red:"#d1d2d8",redPale:"#252629",redLight:"#38393f",
 amber:"#d1d2d8",amberPale:"#252629",purple:"#d1d2d8",purplePale:"#252629",teal:"#d1d2d8",tealPale:"#252629",
 shadow:"0 2px 4px rgba(0,0,0,.18)",shadowMd:"0 8px 24px rgba(0,0,0,.20)",shadowLg:"0 20px 45px rgba(0,0,0,.24)",shadowXl:"0 32px 64px rgba(0,0,0,.28)"
};
export let C=LIGHT;
export const setTheme=dark=>{C=dark?DARK:LIGHT};
export const PLAN_COLORS={free:{bg:"#f1f2f5",color:"#60616b"},starter:{bg:"#ececf0",color:"#34353b"},pro:{bg:"#dddfe5",color:"#17191c"},enterprise:{bg:"#17191c",color:"#ffffff"}};
