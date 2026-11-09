/**
 * JAMES-DENNING design tokens.
 * Calm monochrome surfaces, charcoal actions and semantic status colours.
 */
const semanticLight={green:"#16794b",greenPale:"#eaf5ee",greenLight:"#cce8d5",red:"#b42318",redPale:"#fff0ee",redLight:"#f6cbc6",amber:"#946200",amberPale:"#fff7e5",purple:"#5c6470",purplePale:"#f1f2f4",teal:"#46515d",tealPale:"#f0f2f4"};
export const LIGHT={
 orange:"#202124",orangeDark:"#111315",orangePale:"#f1f2f3",orangeLight:"#d7dade",
 blue:"#202124",bluePale:"#f1f2f3",blueDark:"#111315",blueLight:"#d7dade",
 white:"#ffffff",offWhite:"#f7f8f8",card:"#ffffff",filter:"#f2f3f4",
 border:"#e5e7e9",borderLight:"#eff0f1",text:"#202124",textSoft:"#44484e",muted:"#737980",light:"#969ba2",
 ...semanticLight,shadow:"0 1px 2px rgba(20,24,28,.04)",shadowMd:"0 5px 18px rgba(20,24,28,.06)",shadowLg:"0 14px 36px rgba(20,24,28,.08)",shadowXl:"0 24px 56px rgba(20,24,28,.10)"
};
export const DARK={
 orange:"#f2f3f4",orangeDark:"#ffffff",orangePale:"#252729",orangeLight:"#aeb4ba",
 blue:"#f2f3f4",bluePale:"#252729",blueDark:"#ffffff",blueLight:"#aeb4ba",
 white:"#151719",offWhite:"#101214",card:"#191c1f",filter:"#222629",
 border:"#303438",borderLight:"#262a2e",text:"#f3f4f5",textSoft:"#d1d4d7",muted:"#a0a6ac",light:"#737a81",
 green:"#72c99a",greenPale:"#172b20",greenLight:"#28533a",red:"#ff9b91",redPale:"#321d1b",redLight:"#61302b",
 amber:"#f2ca71",amberPale:"#332a18",purple:"#c1c7cf",purplePale:"#282d33",teal:"#aeb9c3",tealPale:"#252c32",
 shadow:"0 1px 3px rgba(0,0,0,.24)",shadowMd:"0 8px 24px rgba(0,0,0,.24)",shadowLg:"0 20px 45px rgba(0,0,0,.30)",shadowXl:"0 32px 64px rgba(0,0,0,.38)"
};
export let C=LIGHT;
export const setTheme=dark=>{C=dark?DARK:LIGHT};
export const PLAN_COLORS={free:{bg:"#f1f2f3",color:"#555b62"},starter:{bg:"#e8eaec",color:"#343a40"},pro:{bg:"#d9dde1",color:"#202124"},enterprise:{bg:"#202124",color:"#ffffff"}};
