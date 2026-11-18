import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {build} from 'vite';
import {chromium} from 'playwright-core';
import {contrastAudit} from './fixtures/contrast-audit.mjs';
import {CONNECTOR_CATALOGUE,supportsHostedAuth} from '../src/connectors/catalogue.mjs';
const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH||['/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);assert.ok(executablePath);
const dir=process.env.JD_CONNECTOR_EVIDENCE_DIR;if(dir)mkdirSync(dir,{recursive:true});
const result=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'connector-ui-fixture',enforce:'pre',resolveId(id){if(id.endsWith('supabaseClient.js'))return resolve('scripts/fixtures/site-ui-client.mjs');}}],build:{write:false,minify:false,lib:{entry:resolve('scripts/fixtures/site-ui.jsx'),formats:['es']},rollupOptions:{output:{codeSplitting:false}}}});
const output=(Array.isArray(result)?result[0]:result).output,js=output.find(o=>o.type==='chunk').code,css=output.filter(o=>o.fileName.endsWith('.css')).map(o=>o.source).join('\n');
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});const results=[];
try{for(const width of [320,393,1280])for(const theme of ['light','dark']){
 const page=await browser.newPage({viewport:{width,height:860}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='connectors.test')return route.abort();if(u.pathname.startsWith('/design/')||u.pathname.startsWith('/fonts/')){const p=resolve('public','.'+u.pathname);return route.fulfill({body:readFileSync(p),contentType:({'.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'})[extname(p)]});}return route.fulfill({body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>',contentType:'text/html'});});
 await page.goto('http://connectors.test');await page.evaluate(()=>{window.__connectorFixture=true;});await page.addStyleTag({content:css});await page.addScriptTag({content:js,type:'module'});await page.locator('.reference-workspace-header').waitFor();if(theme==='dark')await page.getByRole('button',{name:'Switch to dark mode',exact:true}).click();
 const settle=()=>page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
 const check=async(name,scope)=>{await settle();assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.__siteUnexpected),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' page overflow');const audit=await contrastAudit(page,scope);assert.ok(audit.checked>0);assert.deepEqual(audit.findings,[],name+' contrast');if(name==='plus-menu'||name==='mention-menu'){const box=await page.locator('.jd-tool-picker').boundingBox();assert.ok(box.x>=0&&box.y>=49&&box.x+box.width<=width&&box.y+box.height<=860,JSON.stringify(box));}results.push({name,width,theme,...audit});if(dir&&width===393)await page.screenshot({path:resolve(dir,`${name}-${theme}-${width}.png`)});};
 const input=page.getByLabel('Message JD',{exact:true});
 await page.getByRole('button',{name:'Add tools and connectors'}).click();await page.getByRole('option',{name:/lookup_customer/}).waitFor();await check('plus-menu','.jd-tool-picker');
 assert.equal(await page.getByRole('option',{name:/disabled_tool/}).count(),0);
 const toolSearch=page.getByRole('combobox',{name:'Search JD tools'});
 await toolSearch.press('ArrowDown');assert.match(await page.locator('[role="option"][aria-selected="true"]').innerText(),/People/);
 await toolSearch.press('ArrowUp');assert.match(await page.locator('[role="option"][aria-selected="true"]').innerText(),/Performance/);
 await page.mouse.click(2,100);assert.equal(await page.locator('.jd-tool-picker').count(),0);
 await page.getByRole('button',{name:'Add tools and connectors'}).click();await page.getByRole('option',{name:/lookup_customer/}).waitFor();
 await page.getByRole('combobox',{name:'Search JD tools'}).fill('Billing');await page.getByRole('combobox',{name:'Search JD tools'}).press('Enter');assert.match(await input.inputValue(),/billing/i);assert.equal(await page.evaluate(()=>window.__siteCalls.filter(c=>c.args?.action==='submit').length),0);
 await input.fill('Please @People');await check('mention-menu','.jd-tool-picker');await input.press('Enter');assert.match(await input.inputValue(),/^Please Give me an overview of people/);
 await input.fill('contact@example.com');assert.equal(await page.locator('.jd-tool-picker').count(),0);
 await input.fill('@lookup');await page.getByRole('option',{name:/lookup_customer/}).waitFor();await input.press('Tab');assert.match(await input.inputValue(),/tool reference sample-tool/);assert.equal(await page.evaluate(()=>window.__siteCalls.filter(c=>c.args?.action==='tools.call').length),0);
 await input.fill('@');await input.press('Escape');assert.equal(await page.locator('.jd-tool-picker').count(),0);
 await page.evaluate(()=>{window.__connectorFailure=true;});await page.getByRole('button',{name:'Add tools and connectors'}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('option',{name:/lookup_customer/}).count(),0);await check('tool-load-error','.jd-tool-picker');await page.evaluate(()=>{window.__connectorFailure=false;});await page.getByRole('button',{name:'Retry',exact:true}).click();await page.getByRole('option',{name:/lookup_customer/}).waitFor();
 await page.getByRole('button',{name:/Connectors Explore apps/}).click();await page.getByRole('heading',{name:'Your business, connected.'}).waitFor();assert.equal(await page.locator('.jd-connectors-grid article').count(),22);await check('directory','.jd-connectors');
 await page.getByRole('searchbox',{name:'Search connectors'}).fill('Supabase');assert.equal(await page.locator('.jd-connectors-grid article').count(),1);await page.getByLabel('Connector category',{exact:true}).selectOption('Finance & accounting');assert.equal(await page.locator('.jd-connectors-grid article').count(),0);await page.getByRole('button',{name:'Clear filters'}).click();await page.getByLabel('Sort connectors',{exact:true}).selectOption('category');
 await page.getByRole('searchbox',{name:'Search connectors'}).fill('GitHub');await page.getByRole('button',{name:'View setup for GitHub',exact:true}).click();await check('setup-details','.jd-connector-setup');
 assert.equal(await page.evaluate(()=>window.__siteCalls.filter(c=>c.args?.action==='servers.register').length),0);
 await page.getByRole('button',{name:'Use hosted URL'}).click();await page.getByLabel('MCP server display name').waitFor();assert.equal(await page.getByLabel('MCP server display name').inputValue(),'GitHub');assert.equal(await page.getByLabel('HTTPS MCP endpoint').inputValue(),'https://api.githubcopilot.com/mcp/');await check('server-form','.jd-connectors');
 await page.getByLabel('HTTPS MCP endpoint').fill('http://localhost/mcp');await page.getByRole('button',{name:'Connect and discover tools'}).click();await page.getByText('Use an HTTPS endpoint without embedded credentials.',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>window.__siteCalls.filter(c=>c.args?.action==='servers.register').length),0);
 await page.getByLabel('HTTPS MCP endpoint').fill('https://mcp.example.test/mcp');await page.getByLabel('MCP bearer token').fill('synthetic-test-credential');await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Add server',exact:true}).click();assert.equal(await page.getByLabel('MCP bearer token').inputValue(),'');
 await page.evaluate(()=>{window.__allowConnectorRegister=true;});await page.getByRole('button',{name:'Connect and discover tools'}).click();await page.getByText('Synthetic server connected. No external service contacted.').waitFor();assert.equal(await page.evaluate(()=>window.__siteCalls.filter(c=>c.args?.action==='servers.register').length),1);assert.equal(await page.evaluate(()=>window.__siteCalls.filter(c=>c.args?.action==='grants.set'||c.args?.action==='tools.call'||c.args?.action==='submit').length),0);
 await page.getByRole('button',{name:'Back to JD',exact:true}).click();assert.match(await input.inputValue(),/^@/);
 // The actual new sidebar destination, not only the composer link.
 const toggle=page.locator('[data-tour="workspace-menu"]');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();await page.locator('#workspace-navigation').getByRole('button',{name:'Connectors',exact:true}).click();await page.locator('.jd-connectors-grid').waitFor();
 // Published presets never auto-register; credentials remain provider-specific.
 await page.getByLabel('Connector setup',{exact:true}).selectOption('hosted');assert.equal(await page.locator('.jd-connectors-grid article').count(),24);
 await page.getByLabel('Connector setup',{exact:true}).selectOption('custom');assert.equal(await page.locator('.jd-connectors-grid article').count(),43);
 await page.getByLabel('Connector setup',{exact:true}).selectOption('all');
 await page.getByRole('searchbox',{name:'Search connectors'}).fill('Cloudflare');await page.getByRole('button',{name:'Connect Cloudflare',exact:true}).click();
 await page.getByLabel('HTTPS MCP endpoint').waitFor();assert.equal(await page.getByLabel('HTTPS MCP endpoint').inputValue(),'https://mcp.cloudflare.com/mcp');
 const connect=page.getByRole('button',{name:'Connect and discover tools'}),credential=page.getByLabel('MCP bearer token');
 assert.equal(await connect.isDisabled(),true);await check('cloudflare-prefilled','.jd-connectors');
 assert.equal(await page.evaluate(()=>window.__siteCalls.filter(c=>c.args?.action==='servers.register').length),1);
 await credential.fill('synthetic-cloudflare-token');assert.equal(await connect.isEnabled(),true);
 await page.getByLabel('HTTPS MCP endpoint').fill('https://mcp.example.test/other');assert.equal(await credential.inputValue(),'');
 await page.getByLabel('HTTPS MCP endpoint').fill('https://mcp.cloudflare.com/mcp');await credential.fill('synthetic-cloudflare-token');
 await page.evaluate(()=>{window.__connectorRegisterFailure=true;});await connect.click();await page.getByRole('alert').filter({hasText:'Synthetic registration rejected'}).waitFor();
 assert.equal(await page.getByText('Synthetic server connected. No external service contacted.').count(),0);
 assert.equal(await page.getByLabel('HTTPS MCP endpoint').inputValue(),'https://mcp.cloudflare.com/mcp');
 await page.evaluate(()=>{window.__connectorRegisterFailure=false;});
 await page.getByRole('button',{name:/^Explore/}).click();await page.getByRole('searchbox',{name:'Search connectors'}).fill('Notion');
 await page.getByRole('button',{name:'View setup for Notion',exact:true}).click();await page.getByRole('button',{name:'Use hosted URL'}).click();
 await page.getByLabel('HTTPS MCP endpoint').waitFor();assert.equal(await page.getByLabel('HTTPS MCP endpoint').inputValue(),'https://mcp.notion.com/mcp');
 assert.equal(await credential.isDisabled(),true);assert.equal(await connect.isDisabled(),true);await check('oauth-gated','.jd-connectors');
 await page.getByLabel('HTTPS MCP endpoint').fill('https://mcp.notion.com/mcp/?option=value');assert.equal(await connect.isDisabled(),true);
 await page.getByRole('button',{name:/^Explore/}).click();await page.getByLabel('Connector setup',{exact:true}).selectOption('all');await page.getByRole('searchbox',{name:'Search connectors'}).fill('PostgreSQL');
 await page.getByRole('button',{name:'View setup for PostgreSQL',exact:true}).click();await page.getByRole('button',{name:'I have an endpoint'}).click();
 await page.getByLabel('HTTPS MCP endpoint').waitFor();assert.equal(await page.getByLabel('HTTPS MCP endpoint').inputValue(),'');await check('custom-endpoint','.jd-connectors');
 await page.getByRole('button',{name:'Work apps',exact:true}).click();await page.getByRole('checkbox',{name:/Gmail/}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Continue with Google'}).isDisabled(),true);await check('workspace-setup-required','.jd-workspace-apps');
 await page.evaluate(()=>{window.__workspaceFailure=true;});await page.getByRole('button',{name:'Close app setup'}).click();await page.getByRole('button',{name:'Work apps',exact:true}).click();await page.getByRole('alert').waitFor();await check('workspace-backend-error','.jd-workspace-apps');
 await page.evaluate(()=>{window.__workspaceFailure=false;window.__workspaceConfigured=true;});await page.getByRole('button',{name:'Retry app setup'}).click();await page.getByRole('checkbox',{name:/Gmail/}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Continue with Google'}).isDisabled(),true);
 await page.getByRole('checkbox',{name:/Gmail/}).check();await check('workspace-app-selection','.jd-workspace-apps');
 await page.getByRole('button',{name:'Continue with Google'}).click();await page.getByText('Synthetic OAuth setup failure; no provider contacted',{exact:true}).waitFor();
 const oauth=await page.evaluate(()=>window.__siteCalls.filter(c=>c.args?.action==='oauth.start'));assert.deepEqual(oauth.at(-1).args,{action:'oauth.start',providerId:'google-workspace',services:['gmail']});
 assert.equal(await page.evaluate(()=>window.__siteCalls.filter(c=>c.args?.action==='workspace.read').length),0);
 await page.getByRole('button',{name:'Close app setup'}).click();

 // Every published preset is copied exactly and its auth gate is enforced.
 if(width===393&&theme==='light')for(const entry of CONNECTOR_CATALOGUE.filter(e=>e.endpoint)){
  await page.getByRole('button',{name:/^Explore/}).click();await page.getByRole('searchbox',{name:'Search connectors'}).fill(entry.name);
  await page.getByRole('button',{name:`View setup for ${entry.name}`,exact:true}).click();await page.getByRole('button',{name:'Use hosted URL'}).click();
  await page.getByLabel('HTTPS MCP endpoint').waitFor();assert.equal(await page.getByLabel('HTTPS MCP endpoint').inputValue(),entry.endpoint);
  assert.equal(await credential.inputValue(),'');assert.equal(await credential.isDisabled(),!supportsHostedAuth(entry));
  assert.equal(await connect.isDisabled(),entry.connection.auth!=='optional_bearer');
 }
 assert.equal(await page.evaluate(()=>window.__siteCalls.filter(c=>c.args?.action==='servers.register').length),2);
 assert.equal(await page.evaluate(()=>window.__siteCalls.filter(c=>c.args?.action==='grants.set'||c.args?.action==='tools.call'||c.args?.action==='submit').length),0);
 // Standalone role fixtures use real components with the same fail-closed API.
 await page.evaluate(()=>{window.__mountConnectorRole('manager');});await page.getByRole('button',{name:'My connections',exact:true}).click();await page.getByLabel('JD access for GitHub').waitFor();assert.equal(await page.getByLabel('JD access for GitHub').isDisabled(),true);
 await page.evaluate(()=>{window.__mountConnectorRole('owner');});await page.getByRole('button',{name:'My connections',exact:true}).click();await page.getByLabel('JD access for GitHub').waitFor();assert.equal(await page.getByLabel('JD access for GitHub').isDisabled(),false);
 await page.evaluate(()=>{window.__siteCalls=[];window.__mountConnectorRole('viewer');});await page.getByRole('button',{name:'My connections',exact:true}).click();await page.getByText('Managed by your workspace',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Custom MCP server'}).count(),0);assert.equal(await page.evaluate(()=>window.__siteCalls.length),0);
 await page.evaluate(()=>{window.__mountComposerRole('viewer');});await page.getByRole('button',{name:'Add tools and connectors'}).click();await page.getByText('Connected tools require a workspace owner, admin or manager.').waitFor();assert.equal(await page.evaluate(()=>window.__siteCalls.length),0);
 await page.close();
}}finally{if(dir)writeFileSync(resolve(dir,'browser-results.json'),JSON.stringify(results,null,2)+'\n');await browser.close();}
console.log(`${results.length} composer/connector theme states passed, plus navigation, no-write and role checks.`);
