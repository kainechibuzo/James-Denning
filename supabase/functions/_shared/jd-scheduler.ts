export type ScheduleFrequency = "daily" | "weekly";
export type LocalSchedule = { frequency: ScheduleFrequency; localTime: string; timezone: string; weekdays?: number[] };

type LocalParts = { year:number; month:number; day:number; hour:number; minute:number; second:number };
const formatterCache = new Map<string,Intl.DateTimeFormat>();
function formatter(timezone:string){
 let f=formatterCache.get(timezone);
 if(!f){f=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});formatterCache.set(timezone,f);}
 return f;
}
function partsAt(instant:Date,timezone:string):LocalParts{
 const p=Object.fromEntries(formatter(timezone).formatToParts(instant).filter(x=>x.type!=="literal").map(x=>[x.type,Number(x.value)]));
 return {year:p.year,month:p.month,day:p.day,hour:p.hour,minute:p.minute,second:p.second};
}
function same(a:LocalParts,b:LocalParts){return a.year===b.year&&a.month===b.month&&a.day===b.day&&a.hour===b.hour&&a.minute===b.minute&&a.second===b.second;}
function validTimezone(timezone:string){try{formatter(timezone).format(new Date(0));return true;}catch{return false;}}
function exactLocalInstants(target:LocalParts,timezone:string):number[]{
 const targetUtc=Date.UTC(target.year,target.month-1,target.day,target.hour,target.minute,target.second);
 let guess=targetUtc;
 for(let i=0;i<5;i++){
  const local=partsAt(new Date(guess),timezone);
  const represented=Date.UTC(local.year,local.month-1,local.day,local.hour,local.minute,local.second);
  const next=targetUtc-(represented-guess);
  if(next===guess)break;
  guess=next;
 }
 const matches:number[]=[];
 for(let offset=-180;offset<=180;offset+=15){
  const candidate=guess+offset*60_000;
  if(same(partsAt(new Date(candidate),timezone),target))matches.push(candidate);
 }
 return [...new Set(matches)].sort((a,b)=>a-b);
}
function localToInstant(target:LocalParts,timezone:string):Date{
 const exact=exactLocalInstants(target,timezone);
 if(exact.length)return new Date(exact[0]); // Fall-back overlap: choose the earlier occurrence.
 // Spring-forward gap: move forward to the first valid wall-clock minute, never backwards.
 const base=Date.UTC(target.year,target.month-1,target.day,target.hour,target.minute,target.second);
 for(let minute=1;minute<=180;minute++){
  const shifted=new Date(base+minute*60_000);
  const candidate={year:shifted.getUTCFullYear(),month:shifted.getUTCMonth()+1,day:shifted.getUTCDate(),hour:shifted.getUTCHours(),minute:shifted.getUTCMinutes(),second:target.second};
  const matches=exactLocalInstants(candidate,timezone);
  if(matches.length)return new Date(matches[0]);
 }
 throw new Error("Could not resolve local schedule time in the selected timezone");
}
function parseTime(value:string){
 const m=/^(\\d{2}):(\\d{2})$/.exec(value);
 if(!m||Number(m[1])>23||Number(m[2])>59)throw new Error("Local time must use HH:MM");
 return {hour:Number(m[1]),minute:Number(m[2])};
}
export function nextScheduleAt(after:Date,schedule:LocalSchedule):Date{
 if(!Number.isFinite(after.getTime()))throw new Error("A valid reference time is required");
 if(!["daily","weekly"].includes(schedule.frequency))throw new Error("Unsupported schedule frequency");
 if(!validTimezone(schedule.timezone))throw new Error("A valid IANA timezone is required");
 const {hour,minute}=parseTime(schedule.localTime);
 const weekdays=[...new Set((schedule.weekdays||[]).filter(x=>Number.isInteger(x)&&x>=1&&x<=7))];
 if(schedule.frequency==="weekly"&&!weekdays.length)throw new Error("Weekly schedules require at least one weekday");
 const localNow=partsAt(after,schedule.timezone);
 const start=Date.UTC(localNow.year,localNow.month-1,localNow.day);
 for(let offset=0;offset<15;offset++){
  const day=new Date(start+offset*86_400_000);
  const isoWeekday=day.getUTCDay()===0?7:day.getUTCDay();
  if(schedule.frequency==="weekly"&&!weekdays.includes(isoWeekday))continue;
  const target={year:day.getUTCFullYear(),month:day.getUTCMonth()+1,day:day.getUTCDate(),hour,minute,second:0};
  const candidate=localToInstant(target,schedule.timezone);
  if(candidate.getTime()>after.getTime())return candidate;
 }
 throw new Error("Could not find the next schedule occurrence within 15 days");
}
