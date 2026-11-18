export const ANNOUNCEMENT_INTELLIGENCE_COLUMNS = "title,audience,created_at,expires_at";
export type ScoreSummary={count:number;average:number;passRate:number;highest:number|null;lowest:number|null;gradeDistribution:Record<string,number>;};
export function summariseScores(values:unknown[]):ScoreSummary{
 const scores=values.map(Number).filter(v=>Number.isFinite(v)&&v>=0&&v<=100);
 const grades:Record<string,number>={A:0,B:0,C:0,D:0,F:0};
 for(const score of scores){if(score>=70)grades.A++;else if(score>=60)grades.B++;else if(score>=50)grades.C++;else if(score>=40)grades.D++;else grades.F++;}
 return {count:scores.length,average:scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*10)/10:0,passRate:scores.length?Math.round(scores.filter(x=>x>=40).length/scores.length*100):0,highest:scores.length?Math.max(...scores):null,lowest:scores.length?Math.min(...scores):null,gradeDistribution:grades};
}
export function summariseTaskStatuses(rows:Array<{status?:string;priority?:string}>){
 const byStatus:Record<string,number>={},byPriority:Record<string,number>={};
 for(const row of rows){const s=String(row.status||"unknown"),p=String(row.priority||"normal");byStatus[s]=(byStatus[s]||0)+1;byPriority[p]=(byPriority[p]||0)+1;}
 return {total:rows.length,byStatus,byPriority,open:rows.filter(r=>!["completed","cancelled"].includes(String(r.status))).length};
}
