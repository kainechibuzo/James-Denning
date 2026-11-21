import {validateResponse} from './jd-response.mjs';
/** Optional, read-only result cards for explicitly relevant, persisted tool
 * steps. Never consume model-supplied metrics or expose arbitrary tool output. */
export function recordedResponseResults(request, steps) {
  const blocks=[];
  const definitions={
    get_people_intelligence:{intent:/\b(people|employees?|staff|workforce|team)\b/i,title:'Recorded workforce summary',keys:['total_members','sample_truncated'],roles:true},
    get_performance_intelligence:{intent:/\b(performance|scores?|pass rate)\b/i,title:'Recorded performance',keys:['available','reason','session','term','sample_size','average','average_score','pass_rate','truncated']},
    get_operations_intelligence:{intent:/\b(tasks?|operations?|workload|progress)\b/i,title:'Recorded operational progress',keys:['total','total_tasks','sample_truncated','truncated']},
  };
  for(const step of steps||[]){
    const definition=definitions[step?.tool_key];
    if(!definition||!definition.intent.test(request)||step.status!=='completed'||step.output_json?.verification!=='semantic_tool_result')continue;
    let result;try{const parsed=JSON.parse(step.output_json.tool_output);if(parsed.ok!==true)continue;result=parsed.result;}catch{continue;}
    if(!result||typeof result!=='object'||Array.isArray(result))continue;
    const data={};
    for(const key of definition.keys)if(['string','number','boolean'].includes(typeof result[key]))data[key.replaceAll('_',' ')]=String(result[key]).slice(0,1000);
    if(definition.roles&&result.roles&&typeof result.roles==='object')for(const [role,count] of Object.entries(result.roles).slice(0,20))if(Number.isFinite(count))data['Members · '+role.slice(0,100)]=count;
    if(!Object.keys(data).length)continue;
    blocks.push({id:'recorded-result-'+blocks.length,type:'operational_result',title:definition.title,status:result.available===false?'pending':'completed',source:'persisted_records',data});
    if(blocks.length>=4)break;
  }
  return blocks.length?validateResponse({version:1,blocks}):null;
}
