export {saveFoundationDesign} from './foundation-client.mjs';
import {buildSaasAgentTeam,validateAgentProject} from '../../supabase/functions/_shared/jd-agent-architect.mjs';
export const canDesignAgents=role=>['owner','admin'].includes(role);
export async function previewAgentTeam(client,role,project){
 if(!canDesignAgents(role))throw Error('Only workspace owners and administrators can design agent teams.');
 const input=validateAgentProject(project),expected=buildSaasAgentTeam(input);
 let response;try{response=await client.functions.invoke('jd-automation',{body:{action:'software.agents.preview',project:input}});}catch{throw Error('Agent design service could not be reached. No execution was requested.');}
 if(response?.error||response?.data?.error||JSON.stringify(response?.data?.design)!==JSON.stringify(expected))throw Error('Agent preview was not confirmed. The backend may need a reviewed update; no team was saved or activated.');
 return response.data.design;
}
export function editAgentBrief(design,agentId,note){
 if(!design?.agents?.some(a=>a.id===agentId))throw Error('Unknown agent');
 return buildSaasAgentTeam({...design.project,agentNotes:{...design.project.agentNotes,[agentId]:note}});
}
export function exportAgentDesign(design){
 const canonical=buildSaasAgentTeam(design?.project);
 if(JSON.stringify(canonical)!==JSON.stringify(design))throw Error('Design no longer matches its safety contract; regenerate the preview.');
 return JSON.stringify(canonical,null,2)+'\n';
}
