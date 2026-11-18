// Screenshot regressions: actual shell/tour/components, synthetic reads only.
import assert from 'node:assert/strict';
import {existsSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {build} from 'vite';
import {chromium} from 'playwright-core';
const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH||['/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);assert.ok(executablePath);
const dir=process.env.JD_POLISH_EVIDENCE_DIR;if(dir)mkdirSync(dir,{recursive:true});
const result=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'polish-fixture',enforce:'pre',resolveId(id){if(id.endsWith('supabaseClient.js'))return resolve('scripts/fixtures/site-ui-client.mjs');}}],build:{write:false,minify:false,lib:{entry:resolve('scripts/fixtures/site-ui.jsx'),formats:['es']},rollupOptions:{output:{codeSplitting:false}}}});
const output=(Array.isArray(result)?result[0]:result).output,js=output.find(o=>o.type==='chunk').code,css=output.filter(o=>o.fileName.endsWith('.css')).map(o=>o.source).join('\n');
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});const results=[];
try{for(const [width,height] of [[320,740],[393,860],[708,900],[1280,900],[393,460]])for(const theme of ['light','dark']){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='polish.test')return route.abort();if(/^\/(design|fonts|connectors)\//.test(u.pathname)){const p=resolve('public','.'+u.pathname);return route.fulfill({body:readFileSync(p),contentType:({'.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'})[extname(p)]});}return route.fulfill({body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>',contentType:'text/html'});});
 await page.goto('http://polish.test');await page.evaluate(()=>{window.__conversationFixture=true;window.__mobilePolishFixture=true;});await page.addStyleTag({content:css});await page.addScriptTag({content:js,type:'module'});await page.locator('.reference-workspace-header').waitFor();if(theme==='dark')await page.getByRole('button',{name:'Switch to dark mode',exact:true}).click();
 const settle=()=>page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
 const save=async name=>{await settle();assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.__siteUnexpected),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' document overflow');results.push({name,width,height,theme,result:'PASS'});if(dir&&width===393&&height===860)await page.screenshot({path:resolve(dir,`${name}-${theme}.png`)});};
 await page.locator('.jd-welcome').waitFor();assert.equal(await page.locator('.jd-welcome img,.jd-welcome svg,.jd-welcome-divider,.jd-spark').count(),0);assert.equal(await page.locator('.jd-command').evaluate(e=>getComputedStyle(e).backgroundImage),'none');await save('minimal-greeting');
 // Keyboard focus stays visible despite dark decorative border removal.
 await page.keyboard.press('Tab');await page.getByRole('button',{name:'Add tools and connectors'}).focus();assert.ok(await page.locator(':focus').evaluate(e=>parseFloat(getComputedStyle(e).outlineWidth)>0));
 if(theme==='dark')for(const selector of ['.reference-workspace-header','.jd-compose','.jd-utility-status'])assert.equal(await page.locator(selector).evaluate(e=>getComputedStyle(e).borderBottomColor),'rgba(0, 0, 0, 0)',selector);
 const help=page.getByRole('button',{name:'Help / Product Tour',exact:true});await help.click();
 for(let step=0;step<7;step++){
  const card=page.getByRole('dialog');await card.waitFor();await settle();
  const box=await card.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1,`tour ${step}: ${JSON.stringify(box)}`);
  const next=card.getByRole('button',{name:step===6?'Finish':'Next',exact:true});await next.scrollIntoViewIfNeeded();const n=await next.boundingBox();assert.ok(n.x>=0&&n.x+n.width<=width&&n.y>=0&&n.y+n.height<=height,`tour action ${step}`);
  if(step===0){assert.equal(await card.getAttribute('aria-modal'),'true');await save('tour-welcome');const last=card.getByRole('button',{name:'Next',exact:true});await last.focus();await page.keyboard.press('Tab');assert.equal(await card.getByRole('button',{name:'Close product tour'}).evaluate(e=>e===document.activeElement),true);}
  await next.click();
  if(step<6)await page.getByRole('dialog').getByRole('button',{name:`Go to tour step ${step+2}`,exact:true}).and(page.locator('[aria-current="step"]')).waitFor();
 }
 await page.getByRole('dialog').waitFor({state:'hidden'});await save('tour-finished');
 await help.click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.getAttribute('title')==='Help / Product Tour');assert.equal(await help.evaluate(e=>document.activeElement===e),true);
 const navigate=async label=>{const toggle=page.locator('[data-tour="workspace-menu"]');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();await page.getByRole('searchbox',{name:'Search workspace navigation'}).fill(label);await page.locator('#workspace-navigation').getByRole('button',{name:label,exact:true}).click();};
 await navigate('Conversation history');await page.getByRole('button',{name:'Saved operations conversation'}).click();await page.locator('.jd-viz-departments').waitFor();
 const sizes=await page.locator('.jd-viz-departments').evaluate(e=>({columns:getComputedStyle(e).gridTemplateColumns.split(' ').length,widths:[...e.children].map(e=>e.getBoundingClientRect().width)}));if(width<=580)assert.equal(sizes.columns,1);assert.ok(sizes.widths.every(w=>w>=220),JSON.stringify(sizes));await page.locator('.jd-viz-departments').evaluate(e=>e.parentElement.scrollIntoView({block:'start'}));await save('department-cards');await page.getByText('No activity details were included in this snapshot.').waitFor();
 await navigate('Connectors');await page.locator('.jd-connectors-grid').waitFor();await save('connector-directory');
 const setup=page.getByLabel('Connector setup');if(width<=580)assert.ok((await setup.boundingBox()).width>=(width-60)/2);
 await page.evaluate(()=>{window.__oauthBackendError=true;});await page.getByRole('button',{name:'Connect Notion',exact:true}).click();await page.getByText('Sign-in unavailable',{exact:true}).waitFor();await page.getByText(/JD could not reach its sign-in service/).waitFor();assert.equal(await page.getByRole('button',{name:'Continue with Notion'}).count(),0);await save('oauth-unavailable');
 await page.evaluate(()=>{window.__oauthBackendError=false;});await page.getByRole('button',{name:'Retry setup check'}).click();await page.getByText('Operator setup required.',{exact:true}).waitFor();assert.equal(await page.getByText('Sign-in unavailable',{exact:true}).count(),0);
 assert.equal(await page.evaluate(()=>window.__siteCalls.filter(c=>c.name==='jd-connect-oauth'&&c.args.action==='start').length),0,'retry only checks setup, never starts consent');
 await page.close();
}}finally{await browser.close();if(dir)writeFileSync(resolve(dir,'mobile-polish-results.json'),JSON.stringify(results,null,2)+'\n');}
console.log(`${results.length} mobile polish states passed, including seven-step tours, keyboard focus, backend recovery and no writes.`);
