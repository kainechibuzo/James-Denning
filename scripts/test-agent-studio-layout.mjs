// Real Studio UI + JSON download in Chromium, synthetic service only. No live acceptance.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {build} from 'vite';
import {chromium} from 'playwright-core';
const dir=process.env.JD_AGENT_EVIDENCE_DIR;if(dir)mkdirSync(dir,{recursive:true});
const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH||['/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);assert.ok(executablePath,'Set CHROMIUM_EXECUTABLE_PATH; this test does not download a browser');
const entry=`import '${resolve('src/styles/app.css')}';import React from 'react';import {createRoot} from 'react-dom/client';import {SaaSAgentStudio} from '${resolve('src/software-factory/SaaSAgentStudio.jsx')}';import {buildSaasAgentTeam} from '${resolve('supabase/functions/_shared/jd-agent-architect.mjs')}';
const root=createRoot(document.getElementById('root'));window.__calls=[];window.__fail=false;
const client={functions:{invoke:async(_,r)=>{window.__calls.push(r.body);if(window.__fail)return{error:{message:'PRIVATE_DIAGNOSTIC'}};return{data:{design:buildSaasAgentTeam(r.body.project)}};}}};
window.__mount=(role='owner',scopeKey='synthetic-tenant:actor')=>root.render(<SaaSAgentStudio client={client} role={role} scopeKey={scopeKey}/>);window.__mount();`;
const result=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'agent-fixture',resolveId(id){if(id.endsWith('virtual:agent-fixture'))return '\0agent-fixture.jsx';},load(id){if(id==='\0agent-fixture.jsx')return entry;}}],build:{write:false,minify:false,lib:{entry:'virtual:agent-fixture',formats:['es']},rollupOptions:{output:{codeSplitting:false}}}});
const outputs=(Array.isArray(result)?result[0]:result).output;const script=outputs.find(o=>o.type==='chunk').code;const css=outputs.filter(o=>o.fileName.endsWith('.css')).map(o=>o.source).join('\n');
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});const results=[];
try{for(const width of [360,393,708,1280]){
 const page=await browser.newPage({viewport:{width,height:852},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url()==='https://jd-fixture.test/'?r.fulfill({contentType:'text/html',body:`<html><head><style>body{margin:0;padding:16px;background:#f9fafb}${css}</style></head><body><div id="root"></div></body></html>`}):r.abort());
 await page.goto('https://jd-fixture.test/');await page.addScriptTag({content:script});
 await page.getByLabel('Project name',{exact:true}).fill('Shopkeeper SaaS');await page.getByLabel('Product brief',{exact:true}).fill('Inventory and order tracking for independent retailers, with separate customer organisations.');await page.getByLabel('Payments',{exact:true}).check();
 await page.getByRole('button',{name:'Generate team preview'}).click();await page.getByRole('button',{name:'Export design JSON'}).waitFor();
 assert.equal(await page.locator('.jd-agent-card-head').count(),8);assert.equal(await page.evaluate(()=>window.__calls.length),1);
 await page.getByLabel('Project-specific brief for Frontend Developer',{exact:true}).fill('Prioritise accessible mobile inventory entry.');
 await page.getByText('Instructions, requested tools and evaluation criteria',{exact:true}).nth(2).click();assert.equal(await page.locator('details[open]').count(),1);
 const downloadWait=page.waitForEvent('download');await page.getByRole('button',{name:'Export design JSON'}).click();const download=await downloadWait;assert.equal(download.suggestedFilename(),'jd-saas-agent-team.design.json');const d=JSON.parse(readFileSync(await download.path(),'utf8'));
 assert.equal(d.persisted,false);assert.equal(d.agentsCreated,false);assert.equal(d.execution.performed,false);assert.equal(d.agents.find(a=>a.id==='frontend').projectSpecificBrief,'Prioritise accessible mobile inventory entry.');assert.ok(d.connectorRequirements.some(c=>c.capability==='payment-provider'));assert.equal(await page.evaluate(()=>window.__calls.length),1);
 const pageWidth=await page.evaluate(()=>document.documentElement.scrollWidth);assert.ok(pageWidth<=width,`${width}: horizontal overflow ${pageWidth}`);
 if(dir){await page.screenshot({path:resolve(dir,`studio-${width}.png`),fullPage:true});if(width===393)writeFileSync(resolve(dir,'synthetic-team.design.json'),JSON.stringify(d,null,2)+'\n');}
 await page.getByLabel('Project name',{exact:true}).fill('Changed requirements');assert.equal(await page.getByRole('button',{name:'Export design JSON'}).count(),0);
 await page.evaluate(()=>{window.__fail=true;});await page.getByRole('button',{name:'Generate team preview'}).click();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/backend may need a reviewed update/);assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE_DIAGNOSTIC/);assert.equal(await page.getByRole('button',{name:'Export design JSON'}).count(),0);
 await page.evaluate(()=>window.__mount('owner','other-tenant:actor'));await page.waitForFunction(()=>document.querySelector('input').value==='');assert.equal(await page.locator('article').count(),0);
 await page.evaluate(()=>window.__mount('manager'));await page.getByRole('status').waitFor();assert.equal(await page.locator('form').count(),0);assert.equal(errors.length,0,JSON.stringify(errors));results.push({width,pageWidth,flows:['preview','edit','download','invalidate','backend-failure','scope-reset','role-denial'],errors});console.log(`Agent Studio ${width}: PASS`);await page.close();
}}finally{if(dir)writeFileSync(resolve(dir,'browser-results.json'),JSON.stringify(results,null,2)+'\n');await browser.close();}
