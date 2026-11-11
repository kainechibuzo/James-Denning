import {assertEquals} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {summariseScores,summariseTaskStatuses} from "./jd-business-intelligence.ts";
Deno.test("performance summary calculates average, pass rate and grades",()=>assertEquals(summariseScores([80,60,39,21]),{count:4,average:50,passRate:50,highest:80,lowest:21,gradeDistribution:{A:1,B:1,C:0,D:0,F:2}}));
Deno.test("performance summary excludes invalid and out-of-range scores",()=>assertEquals(summariseScores([70,"bad",-1,101]).count,1));
Deno.test("operations summary groups statuses and excludes terminal tasks from open count",()=>assertEquals(summariseTaskStatuses([{status:"queued"},{status:"completed"},{status:"blocked",priority:"urgent"}]),{total:3,byStatus:{queued:1,completed:1,blocked:1},byPriority:{normal:2,urgent:1},open:2}));
