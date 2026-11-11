export type TaskStatus="queued"|"in_progress"|"blocked"|"completed"|"cancelled";
export type TaskTransition={from:TaskStatus;to:TaskStatus;allowed:boolean};
const transitions:Record<TaskStatus,TaskStatus[]>={queued:["in_progress","cancelled"],in_progress:["blocked","completed","cancelled"],blocked:["queued","in_progress","cancelled"],completed:[],cancelled:[]};
export function canTransitionTask(from:TaskStatus,to:TaskStatus):boolean{return transitions[from]?.includes(to)??false;}
export function transitionTask(from:TaskStatus,to:TaskStatus):TaskTransition{return {from,to,allowed:canTransitionTask(from,to)};}
export function makeIdempotencyKey(scope:string,operation:string,stableId:string):string {
 const clean=(v:string)=>v.trim().replace(/[^a-zA-Z0-9._:-]/g,"-").slice(0,80);
 if(!scope.trim()||!operation.trim()||!stableId.trim()) throw new Error("Idempotency key parts are required");
 return [clean(scope),clean(operation),clean(stableId)].join(":").slice(0,160);
}
export function normaliseTaskInput(x:Record<string,unknown>) {
 const title=typeof x.title==="string"?x.title.trim().slice(0,180):"";
 const description=typeof x.description==="string"?x.description.trim().slice(0,5000):"";
 const department=typeof x.department==="string"?x.department.trim().slice(0,120):"";
 const dueAt=typeof x.dueAt==="string"&&x.dueAt.trim()?new Date(x.dueAt).toISOString():null;
 const priority=["low","normal","high","urgent"].includes(String(x.priority))?String(x.priority):"normal";
 if(!title) throw new Error("Task title is required");
 return {title,description,department,priority,due_at:dueAt};
}
