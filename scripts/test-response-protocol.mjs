import test from 'node:test';
import assert from 'node:assert/strict';
import {validateResponse,decodeResponse,streamText,validateAnswer,answerText,contextualWorkspace} from '../supabase/functions/_shared/jd-response.mjs';
export const choice={id:'structure',type:'choice',question:'Which structure?',multiple:false,options:[{label:'Flat',value:'flat'},{label:'Functional',value:'functional',description:'Grouped teams'}]};
export const form={id:'identity',type:'form',title:'Your business',fields:[{id:'name',type:'text',label:'Business name',required:true},{id:'budget',type:'number',label:'Budget',required:false,min:0,max:1000},{id:'date',type:'date',label:'Start date',required:false},{id:'notes',type:'textarea',label:'Notes',required:false},{id:'structure',type:'select',label:'Structure',required:false,options:choice.options}]};
const wrap=(...blocks)=>({version:1,blocks});
test('protocol round trips Markdown and interactions without exposing JSON',()=>{
 const value=wrap({id:'intro',type:'message',content:'# Hello\n\n**Markdown**'},choice,form);
 assert.equal(validateResponse(value),value);
 const decoded=decodeResponse('```jd-response\n'+JSON.stringify(value)+'\n```');assert.deepEqual(decoded.response,value);assert.match(decoded.content,/Which structure/);assert.doesNotMatch(decoded.content,/"blocks"/);
 for(const markdown of ['Hello?','# Heading\n- first\n- second','| A | B |\n|---|---|\n|1|2|','```js\nconst x=1;\n```','$$x^2$$','Long '.repeat(10000)])assert.equal(decodeResponse(markdown).content,markdown);
});
test('reject unknown, duplicate, excessive, invalid and authority-bearing model blocks',()=>{
 for(const value of [null,{},wrap(),wrap({...choice,multiple:'yes'}),wrap({...choice,options:[]}),wrap(choice,choice),wrap({...choice,options:[choice.options[0],choice.options[0]]}),wrap({...form,fields:[{...form.fields[0],type:'password'}]}),wrap({id:'x',type:'script',content:'bad'}),{version:2,blocks:[choice]},wrap({...choice,id:'<script>'})])assert.equal(validateResponse(value),null);
 const approval=wrap({id:'a',type:'approval',actionId:'record',description:'Review'});assert.ok(validateResponse(approval));assert.equal(validateResponse(approval,{allowOperational:false}),null);
 const op=wrap({id:'o',type:'operational_result',title:'Recorded job',source:'verified_tool_result',status:'failed',data:{reason:'Provider refused'}});assert.ok(validateResponse(op));assert.equal(validateResponse(op,{allowOperational:false}),null);
});
test('partial envelopes never render interactive controls or raw JSON',()=>{
 const encoded=JSON.stringify(wrap(choice));
 for(let i=1;i<encoded.length;i++){const raw=encoded.slice(0,i);assert.equal(streamText(raw),'');assert.equal(decodeResponse(raw).response,null);}
 assert.equal(streamText('Thinking about this…'),'Thinking about this…');
 assert.match(decodeResponse('{"version":1,"blocks":[').content,/could not display/);
});
test('single and multiple answers must use exact known unique values',()=>{
 assert.deepEqual(validateAnswer(choice,['flat']),['flat']);
 for(const value of [[],['bad'],['flat','functional'],['flat','flat'],'flat',null])assert.throws(()=>validateAnswer(choice,value));
 assert.deepEqual(validateAnswer({...choice,multiple:true},['flat','functional']),['flat','functional']);
 assert.match(answerText(choice,['flat']),/My selection: Flat/);
 const customChoice={...choice,allowCustom:true,customLabel:'Something else'};
 assert.equal(validateResponse(wrap(customChoice)),wrap(customChoice).blocks?validateResponse(wrap(customChoice)):null);
 assert.deepEqual(validateAnswer(customChoice,['custom:Build a hybrid business']),['custom:Build a hybrid business']);
 assert.match(answerText(customChoice,['custom:Build a hybrid business']),/Other: Build a hybrid business/);
 for(const value of [['custom:'],['custom:'+('x'.repeat(501))],['unknown']])assert.throws(()=>validateAnswer(customChoice,value));
 assert.equal(validateResponse(wrap({...customChoice,allowCustom:'yes'})),null);
});
test('forms enforce required, types, ranges, selections, dates and extra keys',()=>{
 assert.equal(validateAnswer(form,{name:'Acme',budget:'12.5'}).budget,12.5);
 assert.equal(validateAnswer(form,{name:' Acme '}).name,'Acme');
 for(const value of [{},{name:''},{name:' '},{name:'X',budget:-1},{name:'X',budget:'NaN'},{name:'X',date:'2026-02-30'},{name:'X',date:'bad'},{name:'X',structure:'bad'},{name:'X',extra:'Y'},{name:{html:'X'}},JSON.parse('{"name":"X","__proto__":"bad"}')])assert.throws(()=>validateAnswer(form,value));
 assert.match(answerText(form,{name:'Acme',structure:'flat'}),/Business name: Acme\nStructure: Flat/);
});
test('legacy automatic dashboards are not restored but scoped new attachments are',()=>{
 const old={version:1,source:'persisted_workspace_records',blocks:[{type:'checklist'}]};
 assert.equal(contextualWorkspace(old),null);assert.ok(contextualWorkspace({...old,contextual:true}));assert.equal(contextualWorkspace({...old,contextual:true,source:'model'}),null);
});

test('operational cards require a relevant verified persisted result, never a model assertion',async()=>{
 const {recordedResponseResults}=await import('../supabase/functions/_shared/jd-response-results.mjs');
 const step={tool_key:'get_people_intelligence',status:'completed',output_json:{verification:'semantic_tool_result',tool_output:JSON.stringify({ok:true,result:{total_members:8,roles:{manager:2,staff:6},private_payload:'not for the card'}})}};
 assert.equal(recordedResponseResults('Hello',[step]),null);
 assert.equal(recordedResponseResults('Show our workforce',[{...step,status:'failed'}]),null);
 assert.equal(recordedResponseResults('Show our workforce',[{...step,output_json:{...step.output_json,verification:'unverified'}}]),null);
 const response=recordedResponseResults('Show our workforce',[step]);assert.equal(response.blocks[0].data['total members'],'8');assert.equal(response.blocks[0].data['Members · staff'],6);assert.doesNotMatch(JSON.stringify(response),/private_payload/);
});
