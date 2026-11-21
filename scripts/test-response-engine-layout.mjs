import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {build} from 'vite';
import {chromium} from 'playwright-core';
const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH||['/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);
assert.ok(executablePath,'Set CHROMIUM_EXECUTABLE_PATH to an installed Chromium.');
const bundle=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'response-service-fixture',enforce:'pre',resolveId(id){if(id.endsWith('supabaseClient.js'))return resolve('scripts/fixtures/conversation-engine-client.mjs');}}],build:{write:false,minify:false,lib:{entry:resolve('scripts/fixtures/conversation-engine.jsx'),formats:['es']},rollupOptions:{output:{codeSplitting:false}}}});
const output=(Array.isArray(bundle)?bundle[0]:bundle).output;
const js=output.find(o=>o.type==='chunk').code,css=output.filter(o=>o.fileName.endsWith('.css')).map(o=>o.source).join('\n');
const assets=new Map(output.filter(o=>o.type==='asset').map(o=>['/'+o.fileName,o.source]));
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
try{for(const width of [320,708,1280]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.hostname!=='engine.test'){external.push(u.href);return route.abort();}
  if(u.pathname==='/fixture.js')return route.fulfill({body:js,contentType:'text/javascript'});
  if(u.pathname==='/fixture.css')return route.fulfill({body:css,contentType:'text/css'});
  const file=resolve('public','.'+u.pathname),asset=assets.get(u.pathname);
  if(asset||u.pathname.startsWith('/fonts/')||u.pathname.startsWith('/design/'))return route.fulfill({body:asset||readFileSync(file),contentType:({'.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'})[extname(u.pathname)]||'application/octet-stream'});
  return route.fulfill({body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>',contentType:'text/html'});
 });
 const open=async name=>{await page.getByRole('button',{name:'History',exact:true}).click();await page.locator('.jd-history-page-list button').filter({hasText:name}).click();};
 const count=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('engine-db')).requests.filter(r=>r.action==='submit').length);
 await page.goto('http://engine.test');await open('Ordinary conversation');
 assert.equal(await page.locator('.jd-visual-workspace').count(),0);assert.equal(await page.locator('.jd-response-interaction').count(),0);
 await open('Setup conversation');
 await page.locator('.katex').first().waitFor();assert.ok(await page.locator('.hljs-keyword').count()>0);assert.equal(await page.locator('.jd-table tbody tr').count(),1);
 assert.equal(await page.locator('.jd-visual-workspace').count(),0);
 const single=page.getByRole('form',{name:'Which structure?',exact:true});
 assert.ok(await single.getByText('A.',{exact:true}).count()||await single.getByText('A. Flat',{exact:false}).count(),'choice options have letter labels');
 await single.getByLabel('Flat',{exact:false}).check();
 await page.reload();await single.waitFor();assert.ok(await single.getByLabel('Flat',{exact:false}).isChecked(),'selection survives reload');
 await open('Ordinary conversation');assert.equal(await page.locator('.jd-response-interaction').count(),0);await open('Setup conversation');assert.ok(await single.getByLabel('Flat',{exact:false}).isChecked());
 await single.getByRole('button',{name:'Submit',exact:true}).evaluate(b=>{b.click();b.click();});
 await single.getByText('Answer recorded.',{exact:false}).waitFor();assert.equal(await count(),1);
 // First status update is incomplete structured JSON: no malformed controls.
 assert.equal(await page.getByText('{"version":1,"blocks":[',{exact:false}).count(),0);
 await page.getByRole('form',{name:'Continue to the plan?',exact:true}).waitFor({timeout:15000});
 await page.reload();await single.getByText('Answer recorded.',{exact:false}).waitFor();assert.ok(await single.getByLabel('Flat',{exact:false}).isDisabled());
 const multi=page.getByRole('form',{name:'Which channels?',exact:true});await multi.getByRole('checkbox',{name:/Email/}).last().check();await multi.getByRole('checkbox',{name:/Phone/}).last().check();await multi.getByRole('button',{name:'Submit',exact:true}).last().click();await multi.getByText('Answer recorded.',{exact:false}).waitFor();
 const dropdown=page.getByRole('form',{name:'Choose your region',exact:true});await dropdown.getByRole('combobox').last().selectOption('lagos');await dropdown.getByRole('button',{name:'Submit',exact:true}).last().click();await dropdown.getByText('Answer recorded.',{exact:false}).waitFor();
 const form=page.getByRole('form',{name:'Name your business',exact:true});const before=await count();await form.getByRole('button',{name:'Submit',exact:true}).click();assert.equal(await count(),before,'invalid form makes no request');
 await form.getByLabel('Business name',{exact:false}).fill('Acme');await form.getByLabel('Budget',{exact:false}).fill('12.5');await form.getByLabel('Launch date',{exact:false}).fill('2026-12-01');await form.getByLabel('Preferred structure',{exact:false}).selectOption('flat');await form.getByLabel('Notes',{exact:false}).fill('Asset-light');
 await page.evaluate(()=>{window.__failAnswer=true;});await form.getByRole('button',{name:'Submit',exact:true}).click();await form.getByRole('alert').waitFor();await form.getByRole('button',{name:'Submit',exact:true}).click();await form.getByText('Answer recorded.',{exact:false}).waitFor();
 const requests=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('engine-db')).requests.filter(r=>r.action==='submit'));
 assert.deepEqual(requests[0].interaction.values,['flat']);assert.deepEqual(requests[1].interaction.values,['email','phone']);assert.deepEqual(requests[2].interaction.values,['lagos']);assert.equal(requests.at(-1).interaction.values.budget,12.5);assert.equal(requests.at(-1).idempotencyKey,requests.at(-2).idempotencyKey,'uncertain transport retries reuse request id');
 assert.ok(requests.every(r=>r.conversationId==='a'&&r.interaction.messageId==='00000000-0000-4000-8000-000000000001'));
 await open('Ordinary conversation');await page.waitForTimeout(3000);assert.equal(await page.locator('.jd-response-interaction').count(),0,'late polling cannot leak into another conversation');assert.equal(await page.locator('.jd-visual-workspace').count(),0);
 await open('Requested operations');await page.getByText('Department workload',{exact:true}).waitFor();
 await page.getByRole('heading',{name:'Recorded workforce',exact:true}).waitFor();
 await page.getByRole('button',{name:'Review recorded approval',exact:true}).click();await page.locator('.jd-review').waitFor();await page.getByRole('button',{name:'Back to JD',exact:true}).click();
 assert.equal((await page.evaluate(()=>JSON.parse(sessionStorage.getItem('engine-db')).requests)).some(r=>r.action==='approvals.decide'),false,'viewing an approval cannot execute or approve it');
 await open('Setup conversation');await page.evaluate(()=>document.fonts.ready);
 const geometry=await page.evaluate(()=>({width:innerWidth,doc:document.documentElement.scrollWidth,composer:document.querySelector('.jd-compose').getBoundingClientRect().toJSON(),scroll:document.querySelector('.jd-scroll').getBoundingClientRect().toJSON(),height:innerHeight}));
 assert.ok(geometry.doc<=width,JSON.stringify(geometry));assert.ok(geometry.composer.top>=geometry.scroll.bottom-1);assert.ok(geometry.composer.bottom<=geometry.height);
 if(width===320){
  await page.clock.install();
  await page.evaluate(()=>{window.__pollFailure=true;});
  const follow=page.getByRole('form',{name:'Continue to the plan?',exact:true}).last();
  await follow.getByLabel('Review plan',{exact:true}).check();await follow.getByRole('button',{name:'Submit',exact:true}).click();
  await page.clock.fastForward(500);await follow.getByText('Answer recorded.',{exact:false}).waitFor();
  for(let n=0;n<7;n++){await page.clock.fastForward(16000);await page.waitForTimeout(1);}
  await page.getByText('Live status could not be refreshed.',{exact:false}).first().waitFor();
  assert.ok(await page.getByRole('button',{name:'Refresh conversation',exact:true}).count()>0);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[],'math and highlighting work with no external CDN');
 console.log(`Structured conversation ${width}px: PASS (Markdown, math, code, forms, choices, stream, refresh, isolation, retry, contextual operations)`);await page.close();
}}finally{await browser.close();}
