import {assertEquals,assertThrows} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {nextScheduleAt} from "./jd-scheduler.ts";
Deno.test("daily schedule follows the selected timezone across UTC offsets",()=>{
 const next=nextScheduleAt(new Date("2026-11-11T12:00:00.000Z"),{frequency:"daily",localTime:"09:00",timezone:"Africa/Lagos"});
 assertEquals(next.toISOString(),"2026-11-12T08:00:00.000Z");
});
Deno.test("weekly schedule selects only configured ISO weekdays",()=>{
 const next=nextScheduleAt(new Date("2026-11-11T10:00:00.000Z"),{frequency:"weekly",localTime:"10:00",timezone:"Africa/Lagos",weekdays:[1,3,5]});
 assertEquals(next.toISOString(),"2026-11-13T09:00:00.000Z");
});
Deno.test("spring-forward gap moves to the first valid local minute",()=>{
 const next=nextScheduleAt(new Date("2026-03-07T12:00:00.000Z"),{frequency:"daily",localTime:"02:30",timezone:"America/New_York"});
 assertEquals(next.toISOString(),"2026-03-08T07:00:00.000Z");
});
Deno.test("fall-back overlap chooses the earlier matching instant",()=>{
 const next=nextScheduleAt(new Date("2026-10-31T12:00:00.000Z"),{frequency:"daily",localTime:"01:30",timezone:"America/New_York"});
 assertEquals(next.toISOString(),"2026-11-01T05:30:00.000Z");
});
Deno.test("rejects invalid timezones and empty weekly weekdays",()=>{
 assertThrows(()=>nextScheduleAt(new Date(),{frequency:"daily",localTime:"09:00",timezone:"Mars/Olympus"}));
 assertThrows(()=>nextScheduleAt(new Date(),{frequency:"weekly",localTime:"09:00",timezone:"UTC",weekdays:[]}));
});
