import {tokenConnector} from '../supabase/functions/_shared/jd-connector-token-policy.mjs';
import {oauthProviderId} from '../supabase/functions/_shared/jd-connector-oauth-policy.mjs';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {build} from 'vite';
import {chromium} from 'playwright-core';
import {contrastAudit} from './fixtures/contrast-audit.mjs';
import {CONNECTOR_CATALOGUE} from '../src/connectors/catalogue.mjs';
const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH||['/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);assert.ok(executablePath);
const dir=process.env.JD_TOKEN_EVIDENCE_DIR;if(dir)mkdirSync(dir,{recursive:true});
const result=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'connector-ui-fixture',enforce:'pre',resolveId(id){if(id.endsWith('supabaseClient.js'))return resolve('scripts/fixtures/site-ui-client.mjs');}}],build:{write:false,minify:false,lib:{entry:resolve('scripts/fixtures/site-ui.jsx'),formats:['es']},rollupOptions:{output:{codeSplitting:false}}}});
const output=(Array.isArray(result)?result[0]:result).output,js=output.find(o=>o.type==='chunk').code,css=output.filter(o=>o.fileName.endsWith('.css')).map(o=>o.source).join('\n');
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});const results=[];
try{for(const width of [320,393,1280])for(const theme of ['light','dark']){
 const page=await browser.newPage({viewport:{width,height:860}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='connectors.test')return route.abort();if(u.pathname.startsWith('/design/')||u.pathname.startsWith('/fonts/')||u.pathname.startsWith('/connectors/')){const p=resolve('public','.'+u.pathname);return route.fulfill({body:readFileSync(p),contentType:({'.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'})[extname(p)]});}return route.fulfill({body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>',contentType:'text/html'});});
 await page.goto('http://connectors.test');await page.evaluate(()=>{window.__connectorFixture=true;});await page.addStyleTag({content:css});await page.addScriptTag({content:js,type:'module'});await page.locator('.reference-workspace-header').waitFor();if(theme==='dark')await page.getByRole('button',{name:'Switch to dark mode',exact:true}).click();
 const settle=()=>page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
 const check=async(name,scope)=>{await settle();assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.__siteUnexpected),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' page overflow');const audit=await contrastAudit(page,scope);assert.ok(audit.checked>0);assert.deepEqual(audit.findings,[],name+' contrast');if(name==='plus-menu'||name==='mention-menu'){const box=await page.locator('.jd-tool-picker').boundingBox();assert.ok(box.x>=0&&box.y>=49&&box.x+box.width<=width&&box.y+box.height<=860,JSON.stringify(box));}results.push({name,width,theme,...audit});if(dir&&width===393)await page.screenshot({path:resolve(dir,`${name}-${theme}-${width}.png`)});};

 await page.evaluate(()=>window.__mountConnectorRole('manager'));await page.getByRole('button',{name:'Connect GitHub',exact:true}).click();
 const modal=page.getByRole('dialog'),field=modal.getByLabel('Personal access token',{exact:true}),submit=modal.getByRole('button',{name:'Connect securely'});
 await field.waitFor();await field.isEnabled();assert.equal(await field.getAttribute('type'),'password');assert.equal(await submit.isDisabled(),true);
 assert.equal(await modal.getByRole('link',{name:/Get GitHub token/}).getAttribute('href'),'https://github.com/settings/personal-access-tokens/new');
 assert.equal(await page.evaluate(()=>window.__siteCalls.filter(c=>c.args?.action==='servers.token_connect').length),0);
 const last=modal.getByRole('link',{name:'Provider connection guide'});await last.focus();await page.keyboard.press('Tab');assert.equal(await modal.getByRole('button',{name:'Close token setup'}).evaluate(e=>e===document.activeElement),true);
 await field.fill('SYNTHETIC_BROWSER_TOKEN');await modal.getByRole('checkbox').check();await check('token-ready','.jd-token-dialog');
 await page.evaluate(()=>{window.__holdTokenRequest=true;});await submit.click();await page.getByRole('button',{name:'Checking connection…'}).waitFor();assert.equal(await field.inputValue(),'');await page.keyboard.press('Escape');assert.equal(await modal.count(),1,'cannot close while saving');
 await page.evaluate(()=>{window.__releaseTokenRequest();window.__holdTokenRequest=false;});await modal.getByRole('alert').waitFor();assert.doesNotMatch(await modal.innerText(),/SYNTHETIC_BROWSER_TOKEN|Untrusted reflection/);assert.equal(await field.inputValue(),'');await check('token-failure','.jd-token-dialog');
 await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:'Connect GitHub',exact:true}).evaluate(e=>e===document.activeElement),true);
 await page.getByRole('button',{name:'Connect GitHub',exact:true}).click();assert.equal(await field.inputValue(),'');
 await page.evaluate(()=>{window.__tokenSuccess=true;});await field.fill('SYNTHETIC_BROWSER_TOKEN');await modal.getByRole('checkbox').check();await submit.click();await modal.waitFor({state:'hidden'});await page.getByRole('button',{name:'Replace token'}).waitFor();await check('token-connected','.jd-connectors');
 assert.equal(await page.getByLabel('JD access for GitHub').count(),0,'no broad grant control');
 await page.getByRole('button',{name:'Replace token'}).click();await field.waitFor();assert.equal(await field.inputValue(),'');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:/^Explore/}).click();await page.evaluate(()=>{window.__tokenSetupFailure=true;});await page.getByRole('button',{name:'Connect GitHub',exact:true}).click();await modal.getByRole('alert').waitFor();assert.equal(await field.isDisabled(),true);await check('token-backend-unavailable','.jd-token-dialog');
 await page.evaluate(()=>{window.__tokenSetupFailure=false;});await modal.getByRole('button',{name:'Retry setup check'}).click();await field.fill('SYNTHETIC_BROWSER_TOKEN');await modal.getByRole('button',{name:'Cancel',exact:true}).click();
 // No real provider request ever leaves this fixture. Every offered token
 // route has a working popup; unsupported services do not collect secrets.
 for(const id of ['linear','airtable','resend','apify','context7']){
  const entry=CONNECTOR_CATALOGUE.find(e=>e.id===id);await page.getByLabel('Connector setup',{exact:true}).selectOption('all');await page.getByRole('searchbox',{name:'Search connectors'}).fill(entry.name);await page.getByRole('button',{name:`Connect ${entry.name}`,exact:true}).click();await modal.waitFor();assert.match(await modal.innerText(),/paste it here/);await modal.getByRole('button',{name:'Cancel',exact:true}).click();
 }
 assert.equal(await page.evaluate(()=>Object.values(localStorage).concat(Object.values(sessionStorage)).some(v=>v.includes('SYNTHETIC_BROWSER_TOKEN'))),false);
 assert.equal(await page.evaluate(()=>window.__siteCalls.some(c=>['tools.call','grants.set','servers.register'].includes(c.args?.action))),false);
 await page.evaluate(()=>{window.__siteCalls=[];window.__mountConnectorRole('viewer');});assert.equal(await page.getByRole('button',{name:'Connect GitHub',exact:true}).count(),0);assert.equal(await page.getByRole('dialog').count(),0);
 await page.close();
}}finally{if(dir)writeFileSync(resolve(dir,'browser-results.json'),JSON.stringify(results,null,2)+'\n');await browser.close();}
console.log(`${results.length} token popup states passed across mobile/desktop and both themes, plus focus, consent, failure, replacement and role checks.`);
