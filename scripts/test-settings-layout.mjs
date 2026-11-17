// Actual SettingsPage and ReviewCentre in Chromium, synthetic clients only.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {build} from 'vite';
import {chromium} from 'playwright-core';
const baseline=process.argv.includes('--baseline');
const dir=process.env.JD_SETTINGS_EVIDENCE_DIR;if(dir)mkdirSync(dir,{recursive:true});
const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH||['/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);assert.ok(executablePath,'Set CHROMIUM_EXECUTABLE_PATH; this test never downloads a browser');
const source=path=>baseline?execFileSync('git',['show',`a5e01ef8dfd2b1985092b5c1aa3fdfff1778e5f6:${path}`],{encoding:'utf8'}):readFileSync(path,'utf8');
let css=source('src/styles/system.css');
const stub=`
export const db={
 async getSettings(){if(window.__loadFailure)return{error:{message:'synthetic read failure'}};return{data:Object.entries(window.__settings).map(([key,value])=>({key,value:window.__readBackMismatch&&window.__writes.length&&key==='inactivity_timeout_minutes'?'UNMATCHED':value}))};},
 async setSettings(pairs){window.__writes.push(pairs);Object.assign(window.__settings,Object.fromEntries(pairs.map(p=>[p.key,p.value])));return{data:pairs};},
 async getNotifConfig(){return{data:null};},async getDigestConfig(){return{data:null};},
 async getSessions(){window.__academicReads++;return{data:[]};},async getTerms(){window.__academicReads++;return{data:[]};}
};
export const supabase={supabaseUrl:'https://abcdefghijklmnopqrst.supabase.co',functions:{invoke:async(_,request)=>{
 const b=request.body;window.__calls.push(b);
 if(b.action==='approvals.list')return{data:{approvals:[structuredClone(window.__approval)]}};
 if(b.action==='approvals.decide'){window.__approval.status=b.decision==='approve'?'approved':'rejected';return{data:{approval:{id:window.__approval.id,status:window.__approval.status},execution:{status:'not_executed'}}};}
 if(b.action==='settings.proposal.execute'){
 window.__approval.execution_status='completed';window.__settings.school_name='Synthetic Logistics Ltd';
 if(window.__loseAck)throw Error('synthetic lost acknowledgement');
 return{data:{approvalId:window.__approval.id,execution_status:'completed',partial:false,results:[{status:'completed',step_index:0,key:'school_name',verified:true}],settings:[{key:'school_name',value:'Synthetic Logistics Ltd'}]}};
 }
 throw Error('Unexpected action '+b.action);
}}};`;
const entry=`import '${resolve('src/styles/app.css')}';import React from 'react';import {createRoot} from 'react-dom/client';import {SettingsPage} from '${resolve('src/pages/settings.jsx')}';import {ReviewCentre} from '${resolve('src/chat/ReviewCentre.jsx')}';import {OrganizationCtx} from '${resolve('src/contexts/organization.jsx')}';
const root=createRoot(document.getElementById('root'));let generation=0;
window.__mount=(mode='business',lose=false)=>{
 window.__settings={workspace_type:'business',education_module_enabled:'true',school_name:'Old synthetic name',inactivity_timeout_minutes:'5',name_order:'FML',name_case:'title',recycle_bin_retention_days:'30',result_ca_max:'40',result_exam_max:'60'};
 window.__loadFailure=mode==='load-failure';window.__readBackMismatch=false;window.__calls=[];window.__writes=[];window.__academicReads=0;window.__notices=[];window.__loseAck=lose;
 window.__approval={id:'00000000-0000-4000-8000-000000000003',status:'pending',action_key:'settings.apply',execution_status:'not_executed',created_at:'2026-11-16T12:00:00Z',title:'Update organisation name',proposal_json:{changes:[{key:'school_name',label:'Organisation name',before:'Old synthetic name',after:'Synthetic Logistics Ltd',status:'proposed',approval_required:true}]}};
 root.render(<OrganizationCtx.Provider value={{refreshLogo:()=>{},refreshWorkspace:()=>{}}}>{mode==='review'?<ReviewCentre key={++generation}/>:<SettingsPage key={++generation} ctx={{notify:(...args)=>window.__notices.push(args),setPage:()=>{}}}/>}</OrganizationCtx.Provider>);
};window.__mount();`;
const result=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'settings-fixture',enforce:'pre',resolveId(id){if(id.endsWith('virtual:settings-fixture'))return '\0settings-fixture.jsx';if(id.endsWith('supabaseClient.js'))return '\0synthetic-settings-client';},load(id){if(id==='\0settings-fixture.jsx')return entry;if(id==='\0synthetic-settings-client')return stub;if(baseline&&id===resolve('src/pages/settings.jsx'))return source('src/pages/settings.jsx');}}],build:{write:false,minify:false,lib:{entry:'virtual:settings-fixture',formats:['es']},rollupOptions:{output:{codeSplitting:false}}}});
const script=(Array.isArray(result)?result[0]:result).output.find(o=>o.type==='chunk').code;
if(!baseline)css=(Array.isArray(result)?result[0]:result).output.filter(o=>o.fileName.endsWith('.css')).map(o=>o.source).join('\n');
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});const results=[];
try{
 for(const width of [360,393,708,1280]){
  const page=await browser.newPage({viewport:{width,height:852}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url()==='https://jd-fixture.test/'?r.fulfill({contentType:'text/html',body:`<html><head><style>body{margin:0}*{box-sizing:border-box}${css}</style></head><body><div id="root"></div></body></html>`}):r.abort());
  await page.goto('https://jd-fixture.test/');await page.addScriptTag({content:script});const layoutTab=baseline?'Portal':'Security',layoutRow=baseline?'Recycle Bin Retention':'Inactivity Timeout';
  await page.getByRole('button',{name:layoutTab,exact:true}).click();
  const retention=page.locator('.jd-setting-row').filter({hasText:layoutRow});
  await retention.scrollIntoViewIfNeeded();
  const measurement=await retention.evaluate(el=>{const label=el.children[0].getBoundingClientRect(),control=el.children[1].getBoundingClientRect();return{rowHeight:el.getBoundingClientRect().height,gap:control.top-label.bottom,labelHeight:label.height,controlTop:control.top-label.top,pageWidth:document.documentElement.scrollWidth};});
  if(dir)await page.screenshot({path:resolve(dir,`${baseline?'baseline':'settings'}-${width}.png`),fullPage:true});
  results.push({width,...measurement,errors});
  if(baseline){console.log(`Baseline ${width}: label height ${measurement.labelHeight}, control offset ${measurement.controlTop}`);if(width<760)assert.ok(measurement.labelHeight>=220,'Legacy 220px flex gap must reproduce');await page.close();continue;}
  assert.equal(errors.length,0,JSON.stringify(errors));assert.ok(measurement.pageWidth<=width);if(width<760){assert.ok(measurement.labelHeight<120);assert.ok(measurement.gap<=9);}
  for(const legacy of ['Academic scores','Academic periods'])assert.equal(await page.getByRole('button',{name:legacy,exact:true}).count(),0);
  for(const legacy of ['Login Access Control','Block Reports for Owing Members','CA Score Maximum','Admin Password','Clear All Payments','Recycle Bin Retention'])assert.equal(await page.getByText(legacy,{exact:true}).count(),0);
  await page.getByRole('button',{name:'About',exact:true}).click();
  assert.equal(await page.getByText('mcdcwdfdpqzrzsixmrcg',{exact:true}).count(),0);assert.equal(await page.getByText('abcdefghijklmnopqrst',{exact:true}).count(),1);assert.equal(await page.evaluate(()=>window.__academicReads),0);
  await page.getByRole('button',{name:'Security',exact:true}).click();await page.getByRole('button',{name:'Save Session Settings',exact:true}).click();await page.waitForFunction(()=>window.__notices.length>0);
  const writes=await page.evaluate(()=>window.__writes);assert.equal(writes.length,1);assert.deepEqual(writes[0].map(r=>r.key),['inactivity_timeout_minutes']);assert.equal(await page.evaluate(()=>window.__settings.education_module_enabled),'true'); // UI never rewrites stored legacy keys
  await page.evaluate(()=>window.__mount('review'));await page.getByRole('button',{name:'Accept',exact:true}).waitFor();assert.equal(await page.getByText('Synthetic Logistics Ltd',{exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'Apply approved settings',exact:true}).count(),0);
  await page.getByRole('button',{name:'Accept',exact:true}).click();await page.getByRole('button',{name:'Apply approved settings',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__calls.some(c=>c.action==='settings.proposal.execute')),false);
  await page.getByRole('button',{name:'Apply approved settings',exact:true}).click();await page.getByRole('button',{name:'Confirm apply settings',exact:true}).evaluate(el=>{el.click();el.click();});
  await page.getByText(/Approved settings applied and read back/).waitFor();assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.action==='settings.proposal.execute').length),1);
  if(dir)await page.screenshot({path:resolve(dir,`review-${width}.png`)});
  await page.evaluate(()=>window.__mount('review',true));await page.getByRole('button',{name:'Accept',exact:true}).click();await page.getByRole('button',{name:'Apply approved settings',exact:true}).click();await page.getByRole('button',{name:'Confirm apply settings',exact:true}).click();await page.getByText(/Response lost/).waitFor();assert.equal(await page.getByRole('button',{name:'Apply approved settings',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Refresh approvals'}).click();await page.getByText(/execution record reports completed/).waitFor();assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.action==='settings.proposal.execute').length),1);assert.equal(errors.length,0,JSON.stringify(errors));
  await page.evaluate(()=>window.__mount('load-failure'));await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('button',{name:'Save Session Settings',exact:true}).count(),0);
  await page.evaluate(()=>window.__mount('business'));await page.getByRole('button',{name:'Security',exact:true}).click();await page.evaluate(()=>{window.__readBackMismatch=true;});await page.getByRole('button',{name:'Save Session Settings',exact:true}).click();await page.waitForFunction(()=>window.__notices.length>0);assert.match(await page.evaluate(()=>window.__notices[0][0]),/not confirmed/);assert.equal(errors.length,0,JSON.stringify(errors));
  console.log(`Settings + review ${width}: PASS`);await page.close();
 }
}finally{if(dir)writeFileSync(resolve(dir,baseline?'baseline-layout.json':'settings-layout.json'),JSON.stringify(results,null,2)+'\n');await browser.close();}
