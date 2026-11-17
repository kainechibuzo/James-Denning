// Whole-site presentation regression in real Chromium. Production components,
// synthetic read-only service, no credentials or external network access.
import assert from 'node:assert/strict';
import {existsSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {build} from 'vite';
import {chromium} from 'playwright-core';
const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH||['/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath,'Set CHROMIUM_EXECUTABLE_PATH; no browser download occurs.');
const dir=process.env.JD_SITE_EVIDENCE_DIR;if(dir)mkdirSync(dir,{recursive:true});
const buildResult=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'site-ui-fixture',enforce:'pre',resolveId(id){if(id.endsWith('supabaseClient.js'))return resolve('scripts/fixtures/site-ui-client.mjs');}}],build:{write:false,minify:false,lib:{entry:resolve('scripts/fixtures/site-ui.jsx'),formats:['es']},rollupOptions:{output:{codeSplitting:false}}}});
const outputs=(Array.isArray(buildResult)?buildResult[0]:buildResult).output;
const js=outputs.find(o=>o.type==='chunk').code,css=outputs.filter(o=>o.fileName.endsWith('.css')).map(o=>o.source).join('\n');
if(process.env.JD_SITE_PREVIEW_DIR){const dest=resolve(process.env.JD_SITE_PREVIEW_DIR);mkdirSync(dest,{recursive:true});writeFileSync(resolve(dest,'fixture.js'),js);writeFileSync(resolve(dest,'fixture.css'),css);writeFileSync(resolve(dest,'index.html'),'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>James-Denning · synthetic UI preview</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js" type="module"></script></body></html>');}
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
try{for(const width of [320,393,1280]){
 const page=await browser.newPage({viewport:{width,height:860},timezoneId:'UTC'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',msg=>{if(msg.type()==='error')console.error('Browser console:',msg.text());});
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.hostname!=='site.test')return route.abort();
  if(u.pathname.startsWith('/design/')||u.pathname.startsWith('/fonts/')||u.pathname==='/offline.html'){
   const path=resolve('public','.'+u.pathname);assert.ok(existsSync(path),path);
   return route.fulfill({body:readFileSync(path),contentType:({'.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.html':'text/html'})[extname(path)]});
  }
  return route.fulfill({body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>',contentType:'text/html'});
 });
 await page.goto('http://site.test/');await page.addStyleTag({content:css});await page.addScriptTag({content:js,type:'module'});
 await page.locator('.reference-workspace-header').waitFor();
 const settle=()=>page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
 const check=async(name,screenshot=false)=>{
  await page.locator('[data-fixture-loading]').waitFor({state:'hidden'});
  await settle();
  assert.equal(await page.getByText('Something went wrong',{exact:true}).count(),0,`${name}: application error boundary`);
  const measurement=await page.evaluate(()=>{
   const main=document.querySelector('.jd-workspace-page');
   const bad=[];
   for(const e of document.querySelectorAll('button,input,select,textarea,h1,h2,h3,section,article')){
    if(!e.getClientRects().length)continue;
    const s=getComputedStyle(e),r=e.getBoundingClientRect();if(s.visibility==='hidden'||r.width===0||r.height===0)continue;
    for(const prop of ['color','backgroundColor']){const c=s[prop].match(/^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/);if(c&&Number(c[4]??1)>0&&Math.max(...c.slice(1,4).map(Number))-Math.min(...c.slice(1,4).map(Number))>14)bad.push({tag:e.tagName,text:e.textContent.slice(0,35),prop,value:s[prop]});}
   }
   return{documentWidth:document.documentElement.scrollWidth,mainWidth:main?.clientWidth,mainScroll:main?.scrollWidth,paletteViolations:bad};
  });
  assert.deepEqual(errors,[],`${name}: page errors`);
  assert.deepEqual(await page.evaluate(()=>window.__siteUnexpected||[]),[],`${name}: missing fixture reads or unexpected writes`);
  assert.ok(measurement.documentWidth<=width,`${name}: page overflow ${JSON.stringify(measurement)}`);
  assert.ok(!measurement.mainWidth||measurement.mainScroll<=measurement.mainWidth+1,`${name}: clipped workspace ${JSON.stringify(measurement)}`);
  assert.deepEqual(measurement.paletteViolations,[],`${name}: legacy colour`);
  if(dir&&screenshot&&[393,1280].includes(width))await page.screenshot({path:resolve(dir,`${name}-${width}.png`),fullPage:true});
  results.push({name,width,...measurement,result:'PASS'});console.log(`${width} ${name}: PASS`);
 };
 const navigate=async(label)=>{
  const toggle=page.locator('[data-tour="workspace-menu"]');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
  await page.getByRole('searchbox',{name:'Search workspace navigation'}).fill(label);
  await page.locator('#workspace-navigation').getByRole('button',{name:label,exact:true}).click();await settle();
 };
 await check('chat',true);
 // Same header and actual role-filtered sidebar for every main route.
 for(const label of ['Recruitment','Email Logs','Notifications','Permissions','Organisation Settings','Admin Tools','Register organisation']){
  await navigate(label);await check(label.toLowerCase().replaceAll(' ','-'),true);
 }
 await navigate('Organisation Settings');
 for(const tab of ['Workspace','Organization Info','Security','JD Connect','About']){await page.locator('.jd-workspace-page').getByRole('button',{name:tab,exact:true}).click();await check('settings-'+tab.toLowerCase().replaceAll(' ','-'),tab==='JD Connect');}
 await navigate('Tasks & Operations');await check('operations-overview',true);
 const operationTabs=['SaaS Agents','Business Builder','Workflow Studio','Recurring & Assignment','Collaboration','Business Platform','Organisation','Operations','Hiring','Capabilities','JD Runs','Intelligence'];
 for(const tab of operationTabs){
  await page.locator('.jd-workspace-page>div>nav').getByRole('button',{name:tab,exact:true}).click();
  await check('operations-'+tab.toLowerCase().replaceAll(/[^a-z0-9]+/g,'-'),['SaaS Agents','Workflow Studio'].includes(tab));
  if(tab==='Business Platform'){
   for(const sub of ['CRM','Sales','Expenses','Contracts','Support','SLA policies','Documents','Integrations','Cash flow','Revenue intelligence','Expense budgets','KPI trends','Predictive analysis','Executive reports','Business health']){
    await page.locator('.jd-workspace-page').getByRole('button',{name:sub,exact:true}).click();await check('business-'+sub.toLowerCase().replaceAll(' ','-'),false);
   }
  }
 }
 await page.locator('.reference-workspace-header').getByRole('button',{name:'My profile',exact:true}).click();await check('profile-dialog',true);await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 await page.locator('.reference-workspace-header').getByRole('button',{name:'Switch to dark mode'}).click();await check('dark-operations',true);
 await navigate('Organisation Settings');await check('dark-settings',true);
 await page.locator('.reference-workspace-header').getByRole('button',{name:'Switch to light mode'}).click();
 const toggle=page.locator('[data-tour="workspace-menu"]');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
 await page.locator('#workspace-navigation').getByRole('button',{name:'Switch organisation',exact:true}).click();await check('workspace-switch-dialog',true);await page.getByRole('button',{name:'Stay here'}).click();
 for(const mode of ['signin','signup','reset','update','invite-sent']){await page.evaluate(mode=>window.__mountSite(mode),mode);await check('auth-'+mode,['signin','signup'].includes(mode));}
 await page.evaluate(()=>{history.replaceState({},'','/oauth/consent?authorization_id=synthetic');window.__mountSite('oauth');});await check('oauth-consent',true);
 await page.evaluate(()=>{history.replaceState({},'','/apply/sample-role');window.__mountSite('workspace');});await check('public-application',true);
 await page.goto('http://site.test/offline.html');await check('offline',true);
 await page.close();
}}finally{if(dir)writeFileSync(resolve(dir,'site-layout-results.json'),JSON.stringify(results,null,2)+'\n');await browser.close();}
