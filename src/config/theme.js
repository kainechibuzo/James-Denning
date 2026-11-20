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
