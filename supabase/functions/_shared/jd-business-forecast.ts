export type MonthlyObservation={month:string;actual:number;};
export type ForecastEvaluation={trainingPeriods:number;holdoutPeriods:number;mae:number|null;mape:number|null;predictions:Array<{month:string;actual:number;predicted:number}>;method:"expanding_trailing_mean";};
export function evaluateTrailingMean(series:MonthlyObservation[],minimumTraining=3){
 const ordered=[...series].sort((a,b)=>a.month.localeCompare(b.month));
 if(ordered.length<minimumTraining+1)return {trainingPeriods:ordered.length,holdoutPeriods:0,mae:null,mape:null,predictions:[],method:"expanding_trailing_mean" as const};
 const predictions=[];
 for(let i=minimumTraining;i<ordered.length;i++){
  const train=ordered.slice(0,i).map(x=>Number(x.actual));
  if(train.some(x=>!Number.isFinite(x)))continue;
  const predicted=train.reduce((a,b)=>a+b,0)/train.length;
  predictions.push({month:ordered[i].month,actual:Number(ordered[i].actual),predicted});
 }
 if(!predictions.length)return {trainingPeriods:minimumTraining,holdoutPeriods:0,mae:null,mape:null,predictions,method:"expanding_trailing_mean" as const};
 const mae=predictions.reduce((n,x)=>n+Math.abs(x.actual-x.predicted),0)/predictions.length;
 const nonZero=predictions.filter(x=>x.actual!==0);
 const mape=nonZero.length?nonZero.reduce((n,x)=>n+Math.abs((x.actual-x.predicted)/x.actual),0)/nonZero.length*100:null;
 return {trainingPeriods:ordered.length-predictions.length,holdoutPeriods:predictions.length,mae:Number(mae.toFixed(4)),mape:mape===null?null:Number(mape.toFixed(4)),predictions,method:"expanding_trailing_mean" as const};
}
