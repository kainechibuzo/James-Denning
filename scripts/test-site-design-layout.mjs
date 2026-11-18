import {contrastAudit} from "./fixtures/contrast-audit.mjs";
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
const results=[];const themeAudit=process.env.JD_THEME_AUDIT==='1';const contrastResults=[];
try{for(const width of [320,393,1280]){
 const page=await browser.newPage({viewport:{width,height:860},timezoneId:'UTC'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',msg=>{if(msg.type()==='error')console.error('Browser console:',msg.text());});
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.hostname!=='site.test')return route.abort();
  if(u.pathname.startsWith('/design/')||u.pathname.startsWith('/fonts/')||u.pathname.startsWith('/connectors/')||u.pathname==='/offline.html'){
   const path=resolve('public','.'+u.pathname);assert.ok(existsSync(path),path);
   return route.fulfill({body:readFileSync(path),contentType:({'.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.html':'text/html'})[extname(path)]});
  }
  return route.fulfill({body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>',contentType:'text/html'});
 });
 await page.goto('http://site.test/');if(themeAudit)await page.evaluate(()=>{window.__populatedThemeFixture=true;window.__conversationFixture=true;});await page.addStyleTag({content:css});await page.addScriptTag({content:js,type:'module'});
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
  if(themeAudit){
   const original=await page.evaluate(()=>document.documentElement.dataset.theme||'light');
   for(const theme of ['light','dark']){
    const toggle=page.locator('.reference-workspace-header').getByRole('button',{name:theme==='dark'?'Switch to dark mode':'Switch to light mode',exact:true});
    if(await toggle.count())await toggle.evaluate(el=>el.click());
    else await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.body.dataset.theme=theme;},theme);
    await settle();const audit=await contrastAudit(page);contrastResults.push({name,width,theme,...audit});
    if(theme==='dark'&&name!=='offline'){
     const frames=await page.evaluate(()=>[...document.querySelectorAll('header,aside,section,article,div,button,summary,details,input:not([type="checkbox"]):not([type="radio"]),select,textarea')].filter(e=>e.getClientRects().length&&!e.closest('.reference-landing')).flatMap(e=>{
      const s=getComputedStyle(e);return ['Top','Right','Bottom','Left'].filter(side=>parseFloat(s['border'+side+'Width'])>0&&s['border'+side+'Style']!=='none'&&!['transparent','rgba(0, 0, 0, 0)'].includes(s['border'+side+'Color'])).map(side=>({tag:e.tagName,class:e.className,side,color:s['border'+side+'Color']}));
     }));assert.deepEqual(frames,[],`${name}: dark decorative frames`);
    }
    if(audit.findings.length)console.log('CONTRAST',name,width,theme,JSON.stringify(audit.findings));
    if(dir&&width===393&&['sidebar-pills','populated-departments','conversation-history','history-error','populated-ai-usage','populated-review-centre','populated-automation-runs'].includes(name))await page.screenshot({path:resolve(dir,`${name}-${theme}-${width}.png`),fullPage:true});
   }
   const toggle=page.locator('.reference-workspace-header').getByRole('button',{name:original==='dark'?'Switch to dark mode':'Switch to light mode',exact:true});
   if(await toggle.count())await toggle.evaluate(el=>el.click());else await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.body.dataset.theme=theme;},original);
  }

 };
 const navigate=async(label)=>{
  const toggle=page.locator('[data-tour="workspace-menu"]');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
  await page.getByRole('searchbox',{name:'Search workspace navigation'}).fill(label);
  await page.locator('#workspace-navigation').getByRole('button',{name:label,exact:true}).click();await settle();
 };
 if(themeAudit){const toggle=page.locator('[data-tour="workspace-menu"]');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();await check('sidebar-pills');if(width<768)await page.getByRole('button',{name:'Close navigation',exact:true}).click();}
 await check('chat',true);
 if(themeAudit){
  for(const [label,selector] of [['Departments','.jd-departments'],['AI usage','.jd-usage'],['Review Centre','.jd-review'],['Automation runs','.jd-runs']]){
   if(label==='Review Centre')await page.evaluate(()=>{window.__pendingReview=true;});
   await navigate(label);await page.locator(selector).waitFor();
   if(label==='Automation runs')await page.locator('.jd-runs-card-head').first().click();
   await check('populated-'+label.toLowerCase().replaceAll(' ','-'),false);
   await page.locator(selector).getByRole('button',{name:/^Back/}).click();
   if(label==='Review Centre')await page.evaluate(()=>{window.__pendingReview=false;});
  }
  await navigate('Conversation history');await page.locator('.jd-history-page-list button').waitFor();await check('conversation-history');
  assert.equal(await page.locator('.jd-compose').count(),0,'history is a page, not a second rail');
  await page.getByRole('searchbox',{name:'Search conversations'}).fill('not found');await check('history-empty-search');
  await page.getByRole('searchbox',{name:'Search conversations'}).fill('');
  await page.evaluate(()=>{window.__historyFailure=true;});await page.getByRole('button',{name:'Refresh conversations'}).click();await page.getByRole('alert').waitFor();await check('history-error');
  await page.evaluate(()=>{window.__historyFailure=false;});await page.getByRole('button',{name:'Refresh conversations'}).click();
  await page.locator('.jd-history-page-list button').waitFor();
  await page.evaluate(()=>{window.__historyFailure=true;});await page.getByRole('button',{name:'Saved operations conversation'}).click();await page.getByText('This conversation could not be opened. Please try again.').waitFor();
  assert.equal(await page.locator('.jd-compose').count(),0);
  await page.evaluate(()=>{window.__historyFailure=false;window.__holdHistory=true;});await page.getByRole('button',{name:'Saved operations conversation'}).click();
  await page.waitForFunction(()=>typeof window.__releaseHistory==='function');await page.getByRole('button',{name:'Back to JD',exact:true}).click();
  await page.evaluate(()=>{window.__holdHistory=false;window.__releaseHistory();});await settle();assert.equal(await page.locator('.jd-markdown').count(),0,'late history cannot replace the current JD conversation');
  await navigate('Conversation history');
  await page.getByRole('button',{name:'Saved operations conversation'}).click();await page.locator('.jd-markdown').first().waitFor();await check('populated-chat');
  await navigate('Conversation history');await page.getByRole('button',{name:'Back to JD',exact:true}).click();await page.locator('.jd-compose').waitFor();
  await navigate('Conversation history');await navigate('JD Assistant');await page.locator('.jd-compose').waitFor();
  await navigate('Conversation history');await page.locator('.jd-history-create').click();await page.locator('.jd-compose').waitFor();assert.equal(await page.locator('.jd-markdown').count(),0);
  await page.locator('.reference-workspace-header').getByRole('button',{name:'Help / Product Tour',exact:true}).click();await check('product-tour');await page.getByRole('button',{name:'Skip',exact:true}).click();
  await page.locator('.reference-workspace-header').getByRole('button',{name:'Open settings'}).click();await page.getByText('Workspace Profile',{exact:true}).waitFor();await check('header-settings');
 }

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
}}finally{if(dir&&themeAudit)writeFileSync(resolve(dir,'contrast-results.json'),JSON.stringify(contrastResults,null,2)+'\n');if(dir)writeFileSync(resolve(dir,'site-layout-results.json'),JSON.stringify(results,null,2)+'\n');await browser.close();}

if(themeAudit)assert.deepEqual(contrastResults.filter(r=>r.findings.length),[], 'Populated and route text contrast must meet WCAG AA thresholds');
