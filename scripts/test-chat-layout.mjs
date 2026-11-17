// Real Chromium layout of the actual ChatHome component, with a synthetic
// history API. No credentials, external network or production records.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {build} from 'vite';
import {chromium} from 'playwright-core';

const evidence=process.env.JD_LAYOUT_EVIDENCE_DIR;
if(evidence)mkdirSync(evidence,{recursive:true});
const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH||['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
assert.ok(executablePath,'Set CHROMIUM_EXECUTABLE_PATH to a local Chromium binary. This test never downloads a browser.');
const headers=['Capability','What it does','Verification','Limits'];
const row=['Operations intelligence','Reads saved task records','Not verified','No independent end-to-end verification evidence has been supplied. This does not mean the tool is disabled.'];
const content=['## Capability information',`| ${headers.join(' | ')} |`,'| --- | --- | --- | --- |',...Array.from({length:20},()=>`| ${row.join(' | ')} |`),'','## Approval and completion','Approval is not execution. Record status is not proof of a business outcome.','', '```text','long_unbroken_diagnostic_reference_'.repeat(25),'```','', 'Read the final explanation.'].join('\n');
const stub=`export const supabase={functions:{invoke:async(_name,{body})=>{
 window.__requests.push(body.action);
 if(body.action==='history.list')return{data:{conversations:[{id:'synthetic',title:'Synthetic capability report',updated_at:'2026-11-16T12:00:00Z'}]}};
 if(body.action==='history')return{data:{messages:[{role:'assistant',content:${JSON.stringify(content)}}]}};
 if(body.action==='approvals.list')return{data:{approvals:[]}};
 throw Error('Unexpected API action: '+body.action);
}}};`;
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {ChatHome} from '${resolve('src/chat/ChatHome.jsx')}';window.__requests=[];createRoot(document.getElementById('root')).render(<ChatHome user={{id:'synthetic-owner',school_id:'synthetic-workspace',role:'owner',name:'Test owner'}}/>);`;
const bundle=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'synthetic-chat',enforce:'pre',resolveId(id){if(id.endsWith('virtual:chat-fixture'))return '\0chat-fixture.jsx';if(id.endsWith('supabaseClient.js'))return '\0synthetic-client';},load(id){if(id==='\0chat-fixture.jsx')return entry;if(id==='\0synthetic-client')return stub;}}],build:{write:false,minify:false,lib:{entry:'virtual:chat-fixture',formats:['es']},rollupOptions:{output:{codeSplitting:false}}}});
const script=(Array.isArray(bundle)?bundle[0]:bundle).output.find(o=>o.type==='chunk').code;
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
console.log(`Browser: ${browser.version()}`);
try{
 for(const [width,height] of [[320,740],[360,800],[393,852],[708,900],[1280,900],[393,460]]){
  const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.route('**/*',route=>route.abort());
  await page.setContent('<!doctype html><html><head><style>*{box-sizing:border-box}body{margin:0}#shell-header{height:57px}#root{min-width:0}</style></head><body><header id="shell-header">Synthetic workspace shell · JD Assistant</header><main id="root"></main></body></html>');
  await page.addScriptTag({content:script,type:'module'});
  await page.getByRole('button',{name:'Open chat history and JD tools'}).click();
  await page.getByRole('button',{name:/Synthetic capability report/}).click();
  await page.locator('.jd-table').waitFor();
  const measure=()=>page.evaluate(()=>{
   const rect=sel=>{const e=document.querySelector(sel),r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,client:e.clientWidth,scroll:e.scrollWidth};};
   return{viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,thread:rect('.jd-thread'),table:rect('.jd-table-wrap'),scroll:rect('.jd-scroll'),utility:rect('.jd-utility'),composer:rect('.jd-compose-wrap'),requests:window.__requests};
  });
  const initial=await measure();
  if(evidence)await page.screenshot({path:resolve(evidence,`chat-${width}x${height}-initial.png`)});
  await page.locator('.jd-scroll').evaluate(el=>{el.scrollTop=350;});
  const scrolled=await measure();
  if(evidence)await page.screenshot({path:resolve(evidence,`chat-${width}x${height}-table.png`)});
  await page.locator('.jd-table-wrap').evaluate(el=>{el.scrollLeft=el.scrollWidth;});
  const tableScroll=await page.locator('.jd-table-wrap').evaluate(el=>({left:el.scrollLeft,max:el.scrollWidth-el.clientWidth}));
  await page.locator('.jd-scroll').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  const finalText=await page.getByText('Read the final explanation.').boundingBox();
  const item={width,height,initial,scrolled,tableScroll,finalText,errors};results.push(item);
  if(evidence)await page.screenshot({path:resolve(evidence,`chat-${width}x${height}.png`)});
  if(!process.env.JD_LAYOUT_OBSERVE_ONLY){
   assert.equal(errors.length,0,JSON.stringify(errors));
   assert.ok(initial.documentWidth<=width,`page overflow at ${width}`);
   assert.ok(initial.thread.left>=0&&initial.thread.right<=width+1,`thread clipped at ${width}`);
   assert.ok(initial.table.left>=0&&initial.table.right<=width+1,`table wrapper clipped at ${width}`);
   assert.ok(scrolled.utility.bottom<=scrolled.scroll.top+1,`utility overlays scrolled messages at ${width}`);
   assert.ok(scrolled.composer.top>=scrolled.scroll.bottom-1,`composer covers scroll area at ${width}`);
   assert.ok(finalText.y+finalText.height<=scrolled.composer.top+1,`last message hidden by composer at ${width}`);
   assert.ok(tableScroll.max===0||tableScroll.left>0,`table cannot be scrolled at ${width}`);
   const region=page.getByRole('region',{name:'Message table — scroll horizontally for more columns'});
   await region.focus();assert.equal(await region.evaluate(el=>el===document.activeElement),true);
   if(tableScroll.max>0){
    await region.evaluate(el=>{el.scrollLeft=0;});await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>document.querySelector('.jd-table-wrap').scrollLeft>0);
   }
   assert.ok(initial.requests.every(a=>['history.list','history','approvals.list'].includes(a)), 'reading messages must not execute writes');
  }
  console.log(`Layout ${width}x${height}: ${process.env.JD_LAYOUT_OBSERVE_ONLY?'observed':'PASS'}`);await page.close();
 }
}finally{
 if(evidence)writeFileSync(resolve(evidence,'layout-results.json'),JSON.stringify(results,null,2)+'\n');
 await browser.close();
}
