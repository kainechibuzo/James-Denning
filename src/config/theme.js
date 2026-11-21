/** The supplied JD reference palette, shared by every workspace route.
 * Legacy semantic names remain API-compatible; labels/icons, not hue, convey status.
 */
const statusLight={green:"#3d434c",greenPale:"#f1e9dc",greenLight:"#ded2bf",red:"#8d2f26",redPale:"#f6e7e3",redLight:"#e3c9c4",amber:"#6e5a35",amberPale:"#f4ecdd",purple:"#3d434c",purplePale:"#f1e9dc",teal:"#3d434c",tealPale:"#f1e9dc"};
export const LIGHT={
 // Warm paper workspace: the reference's ivory canvas, ink text and hairline rules.
 orange:"#1e2a52",orangeDark:"#121c38",orangePale:"#f1e9dc",orangeLight:"#ded2bf",
 blue:"#1e2a52",bluePale:"#f1e9dc",blueDark:"#121c38",blueLight:"#ded2bf",
 white:"#fcfaf5",offWhite:"#f6efe4",card:"#fcfaf5",filter:"#f1e9dc",
 border:"rgba(34,37,43,.16)",borderLight:"rgba(34,37,43,.10)",text:"#22252b",textSoft:"#3d434c",muted:"#62636b",light:"#9a9589",
 ...statusLight,shadow:"0 2px 4px rgba(0,0,0,.035)",shadowMd:"0 5px 18px rgba(0,0,0,.055)",shadowLg:"0 14px 36px rgba(0,0,0,.08)",shadowXl:"0 24px 56px rgba(0,0,0,.12)"
};
export const DARK={
 // True-black canvas with restrained near-black layers for readable depth.
 orange:"#f5f5f5",orangeDark:"#ffffff",orangePale:"#111111",orangeLight:"#a3a3a3",
 blue:"#f5f5f5",bluePale:"#111111",blueDark:"#ffffff",blueLight:"#a3a3a3",
 white:"#000000",offWhite:"#000000",card:"#090909",filter:"#111111",
 border:"#262626",borderLight:"#1b1b1b",text:"#f5f5f5",textSoft:"#d4d4d4",muted:"#a3a3a3",light:"#858585",
 green:"#d4d4d4",greenPale:"#111111",greenLight:"#262626",red:"#d4d4d4",redPale:"#111111",redLight:"#262626",
 amber:"#d4d4d4",amberPale:"#111111",purple:"#d4d4d4",purplePale:"#111111",teal:"#d4d4d4",tealPale:"#111111",
 shadow:"0 2px 4px rgba(0,0,0,.45)",shadowMd:"0 8px 24px rgba(0,0,0,.5)",shadowLg:"0 20px 45px rgba(0,0,0,.58)",shadowXl:"0 32px 64px rgba(0,0,0,.65)"
};
export let C=LIGHT;
export const setTheme=dark=>{C=dark?DARK:LIGHT};
export const PLAN_COLORS={free:{bg:"#f1f2f5",color:"#60616b"},starter:{bg:"#ececf0",color:"#34353b"},pro:{bg:"#dddfe5",color:"#17191c"},enterprise:{bg:"#17191c",color:"#ffffff"}};
