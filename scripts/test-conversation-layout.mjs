// Regression for supplied mobile screenshots: real shell + populated history,
// synthetic read-only records. No production services or execution claims.
import assert from 'node:assert/strict';
import {existsSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {build} from 'vite';
import {chromium} from 'playwright-core';
const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH||['/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath,'Set CHROMIUM_EXECUTABLE_PATH.');
const dir=process.env.JD_CONVERSATION_EVIDENCE_DIR;if(dir)mkdirSync(dir,{recursive:true});
const result=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'read-only-ui',enforce:'pre',resolveId(id){if(id.endsWith('supabaseClient.js'))return resolve('scripts/fixtures/site-ui-client.mjs');}}],build:{write:false,minify:false,lib:{entry:resolve('scripts/fixtures/site-ui.jsx'),formats:['es']},rollupOptions:{output:{codeSplitting:false}}}});
const output=(Array.isArray(result)?result[0]:result).output;
const js=output.find(o=>o.type==='chunk').code,css=output.filter(o=>o.fileName.endsWith('.css')).map(o=>o.source).join('\n');
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
try{for(const width of [320,393,708,1280]){
 const page=await browser.newPage({viewport:{width,height:860}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.hostname!=='ui.test')return route.abort();
  if(u.pathname.startsWith('/design/')||u.pathname.startsWith('/fonts/')){const path=resolve('public','.'+u.pathname);return route.fulfill({body:readFileSync(path),contentType:({'.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(path)]});}
  return route.fulfill({body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>',contentType:'text/html'});
 });
 await page.goto('http://ui.test/');await page.evaluate(()=>{window.__conversationFixture=true;});await page.addStyleTag({content:css});await page.addScriptTag({content:js,type:'module'});
 await page.locator('.reference-workspace-header').waitFor();
 const settle=()=>page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
 const navigate=async(label)=>{const toggle=page.locator('[data-tour="workspace-menu"]');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();await page.getByRole('searchbox',{name:'Search workspace navigation'}).fill(label);await page.locator('#workspace-navigation').getByRole('button',{name:label,exact:true}).click();await settle();};
 const save=async(name)=>{await settle();assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.__siteUnexpected),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow');if(dir&&[393,1280].includes(width))await page.screenshot({path:resolve(dir,`${name}-${width}.png`),fullPage:true});results.push({name,width,result:'PASS'});};
 const mainToggle=page.locator('[data-tour="workspace-menu"]');if(await mainToggle.getAttribute('aria-expanded')==='false')await mainToggle.click();
 assert.equal(await page.locator('.jd-assistant-navigation button svg').count(),7);
 await save('sidebar-restored');
 // Every restored shortcut uses the actual main sidebar; none invents a route.
 for(const [label,selector] of [['Review Centre','.jd-review'],['Departments','.jd-departments'],['AI usage','.jd-usage'],['Automation runs','.jd-runs']]){
  await navigate(label);await page.locator(selector).waitFor();await save('menu-'+label.toLowerCase().replaceAll(' ','-'));await page.locator(selector).getByRole('button',{name:/^Back/}).click();
 }
 await navigate('Conversation history');await page.getByRole('button',{name:'Saved operations conversation'}).click();
 await page.locator('.jd-task-disclosure summary').getByText('19/30 records complete').waitFor();
 const details=page.locator('.jd-task-disclosure');
 for(const theme of ['light','dark']){
  if(theme==='dark')await page.getByRole('button',{name:'Switch to dark mode',exact:true}).click();
  assert.equal(await details.getAttribute('open'),null);
  assert.equal(await page.getByRole('button',{name:'Refresh task records',exact:true}).isVisible(),false);
  // Check actual rendered foreground/background contrast, including placeholder.
  const contrast=await page.evaluate(()=>{
   const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);
   const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
   const ratio=(a,b)=>{const x=lum(rgb(a)),y=lum(rgb(b));return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
   const canvas=getComputedStyle(document.querySelector('.jd-command')).backgroundColor;
   const selectors=['.jd-markdown','.jd-markdown h2','.jd-markdown strong','.jd-markdown a','.jd-message-head','.jd-disclaimer'];
   const measures=selectors.map(selector=>{const el=document.querySelector(selector);if(!el)throw Error('Missing contrast target '+selector);return{selector,ratio:ratio(getComputedStyle(el).color,canvas)};});
   const input=document.querySelector('.jd-compose textarea'),composer=getComputedStyle(document.querySelector('.jd-compose'));
   measures.push({selector:'placeholder',ratio:ratio(getComputedStyle(input,'::placeholder').color,composer.backgroundColor)});
   measures.push({selector:'input',ratio:ratio(getComputedStyle(input).color,composer.backgroundColor)});
   return{measures,inputBackground:getComputedStyle(input).backgroundColor,inputFont:parseFloat(getComputedStyle(input).fontSize)};
  });
  for(const item of contrast.measures)assert.ok(item.ratio>=4.5,`${theme} ${width} ${item.selector} contrast ${item.ratio}`);
  assert.equal(contrast.inputBackground,'rgba(0, 0, 0, 0)');assert.ok(contrast.inputFont>=16);
  await page.locator('.jd-scroll').evaluate(e=>e.scrollTop=0);await save('response-'+theme);
  await details.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await details.getAttribute('open'),'');
  assert.equal(await page.getByRole('button',{name:'Refresh task records',exact:true}).isVisible(),true);
  await save('checklist-'+theme);
  await details.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await details.getAttribute('open'),null);
  const geometry=await page.evaluate(()=>({composer:document.querySelector('.jd-compose').getBoundingClientRect().toJSON(),scroll:document.querySelector('.jd-scroll').getBoundingClientRect().toJSON(),height:innerHeight}));
  assert.ok(geometry.composer.top>=geometry.scroll.bottom-1);assert.ok(geometry.composer.bottom<=geometry.height);
 }
 // Simulated server progress updates the pill on the read-only 30s poll.
 await page.clock.install();
 // Remount the hook after clock installation so its interval uses the virtual clock.
 await navigate('New conversation');await navigate('Conversation history');await page.getByRole('button',{name:'Saved operations conversation'}).click();
 await page.locator('.jd-task-disclosure summary').getByText('19/30 records complete').waitFor();
 await page.evaluate(()=>{window.__fixtureTaskCompleted=true;});await page.clock.fastForward(31000);
 await page.locator('.jd-task-disclosure summary').getByText('20/30 records complete').waitFor();
 assert.equal(await page.locator('.jd-task-disclosure').getAttribute('open'),null);
 const calls=await page.evaluate(()=>window.__siteCalls.filter(c=>c.kind==='edge').map(c=>c.args.action));
 assert.ok(calls.filter(a=>a==='operations.task.list').length>=3);
 assert.equal(calls.some(a=>/transition|submit|execute|approve|decide/.test(a)),false,'monitoring is read-only');
 results.push({name:'read-only-status-poll',width,result:'PASS'});
 await page.clock.resume();
 await page.evaluate(()=>{window.__allowTaskRequest=true;});
 await page.locator('.jd-task-disclosure summary').click();
 await page.getByRole('button',{name:'Ask JD to work on this',exact:true}).first().click();
 await page.getByText('Synthetic work request received. No real job was executed.',{exact:true}).waitFor();
 const submissions=await page.evaluate(()=>window.__siteCalls.filter(c=>c.kind==='edge'&&c.args.action==='submit'));
 assert.equal(submissions.length,1);assert.match(submissions[0].args.message,/Do not treat changing a checklist status as executing/);
 assert.equal((await page.evaluate(()=>window.__siteCalls)).some(c=>c.args?.action==='operations.task.transition'),false);
 results.push({name:'explicit-task-work-request',width,result:'PASS'});
 await page.evaluate(()=>{document.documentElement.dataset.theme='light';document.body.dataset.theme='light';window.__mountSite('landing');});await page.locator('.landing-use-cases').waitFor();
 await page.getByRole('button',{name:'Operations teams',exact:true}).click();await page.getByText('Turn our launch plan into accountable work.',{exact:true}).waitFor();
 await page.locator('#questions summary').filter({hasText:'Will JD complete every task automatically?'}).click();
 assert.equal(await page.getByText('No. A checklist is a set of records, not a promise of autonomous completion.',{exact:false}).isVisible(),true);
 await save('landing');
 await page.getByRole('button',{name:'Start your workspace',exact:true}).click();await page.locator('.jd-auth-card').waitFor();
 assert.deepEqual(errors,[]);await page.close();
}}finally{if(dir)writeFileSync(resolve(dir,'conversation-results.json'),JSON.stringify(results,null,2)+'\n');await browser.close();}
console.log(`${results.length} populated conversation / sidebar / landing checks passed.`);
