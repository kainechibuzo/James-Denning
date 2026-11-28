// Supplied-reference UI regression: actual landing, ChatHome and shell header JSX.
// The service and header side effects are synthetic; this is not live acceptance.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { build } from 'vite';
import { chromium } from 'playwright-core';

const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH||['/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);
assert.ok(executablePath,'Set CHROMIUM_EXECUTABLE_PATH; no browser is downloaded by this test.');
const evidence=process.env.JD_LAYOUT_EVIDENCE_DIR;
if(evidence)mkdirSync(evidence,{recursive:true});
const shell=readFileSync('src/AppDemo.jsx','utf8');
// Render the real workspace shell. This suite used to slice the <header> markup
// out of AppDemo.jsx and paste it into a hand-built fixture; when the header
// gained a new control whose state lived in AppInner, the copy broke with
// "pendingApprovalCount is not defined" and took the whole page down. Rendering
// AppDemo itself cannot drift, and a broken shell now fails here by throwing.
assert.ok(shell.includes('<header className="reference-workspace-header jd-topbar"'),'The workspace shell owns its header markup');
assert.ok(shell.includes('function DarkToggle('),'The shell renders its own dark-mode toggle');
const entry=`import '${resolve('src/styles/app.css')}';import React,{Component} from 'react';import {createRoot} from 'react-dom/client';
import {PublicLanding} from '${resolve('src/pages/public-landing.jsx')}';
import AppDemo from '${resolve('src/AppDemo.jsx')}';
// Every click stays inside this page: the service client is the synthetic one
// below. Header actions are captured from the DOM so the real handlers run.
window.__actions=[];
const RECORDED=new Set(['My profile','Help / Product Tour','Notifications','Account settings']);
document.addEventListener('click',event=>{
 const button=event.target.closest?.('button');if(!button)return;
 const label=button.getAttribute('aria-label')||button.getAttribute('title')||'';
 if(RECORDED.has(label)&&!window.__actions.includes(label))window.__actions.push(label);
},true);
// A signed-in tab, exactly what the app's own session bootstrap expects.
localStorage.setItem('jd_session_user',JSON.stringify({id:'synthetic',_authUserId:'synthetic',role:'admin',name:'Kaine Denning',email:'owner@example.test',school_id:'synthetic'}));
sessionStorage.setItem('jd_session_active','1');
localStorage.setItem('jd_tour_done_ui-admin','1');
localStorage.setItem('jd_selected_org',JSON.stringify({id:'synthetic',name:'Reference workspace',plan:'free'}));
class Boundary extends Component{constructor(props){super(props);this.state={error:null};}
 static getDerivedStateFromError(error){return {error};}
 render(){if(this.state.error)return <pre data-shell-crash style={{padding:16,fontSize:12,whiteSpace:'pre-wrap'}}>{String(this.state.error&&this.state.error.stack||this.state.error)}</pre>;return this.props.children;}}
const root=createRoot(document.getElementById('root'));
window.__render=()=>root.render(location.pathname==='/workspace'?<Boundary><AppDemo/></Boundary>:<PublicLanding onGetStarted={()=>window.__actions.push('signup')} onSignIn={()=>window.__actions.push('signin')}/>);
window.__render();`;
const stub=`// Synthetic client for the real AppDemo. Unknown calls fail closed.
const state=()=>{window.__requests=window.__requests||[];return window.__requests;};
export const user={id:'synthetic',_authUserId:'synthetic',role:'owner',name:'Kaine Denning',email:'owner@example.test',school_id:'synthetic'};
export const school={id:'synthetic',name:'Reference workspace',plan:'free'};
const handled=new Set(['getSettings','getSchool','getNotifConfig','getDigestConfig','getRolePermissions','getUserPermissions','getAdminNotifications','getNotifications','setSchool']);
export const db=new Proxy({},{get(_target,name){return async(...args)=>{state();if(!handled.has(name))console.warn('[reference fixture] db.'+String(name));return {data:name==='getSchool'?school:[]};};}});
export const supabase={
 auth:{getSession:async()=>({data:{session:{user}}}),signInWithPassword:async()=>({error:{message:'Synthetic sign-in failure'}}),signOut:async()=>({data:{}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 functions:{invoke:async(_name,{body}={})=>{
  state().push({...body});
  if(body?.action==='history.list')return{data:{conversations:[{id:'fixture',title:'Saved conversation',updated_at:'2026-11-16T12:00:00Z'}]}};
  if(body?.action==='history')return{data:{messages:[{role:'assistant',content:'Saved fixture message. No real records were read.'}]}};
  if(body?.action==='approvals.list')return{data:{approvals:[]}};
  if(body?.action==='usage.summary')return{data:{summary:{total_runs:0,total_amount_minor:0,currency:'USD'}}};
  if(body?.action==='projects.list')return{data:{projects:[]}};
  if(body?.action==='submit')return{data:{conversationId:'fixture',reply:'Synthetic submission received.'}};
  throw Error('Unexpected API action: '+body?.action);
 }},
 from:()=>({select:()=>({eq:()=>({single:async()=>({data:user})})})}),
 rpc:async(name)=>{state();return {data:null,error:{message:'Not implemented by the reference fixture: '+name}};},
 storage:{from:()=>({})},
 supabaseUrl:'https://synthetic.supabase.test',
};`;
const bundle=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'reference-fixture',enforce:'pre',resolveId(id){if(id.endsWith('virtual:reference-fixture'))return '\0reference-fixture.jsx';if(id.endsWith('supabaseClient.js'))return '\0reference-service';},load(id){if(id==='\0reference-fixture.jsx')return entry;if(id==='\0reference-service')return stub;}}],build:{write:false,minify:false,lib:{entry:'virtual:reference-fixture',formats:['es']},rollupOptions:{output:{codeSplitting:false}}}});
const output=(Array.isArray(bundle)?bundle[0]:bundle).output;
const script=output.find(o=>o.type==='chunk').code;
const css=readFileSync('src/styles/system.css','utf8')+'\n'+output.filter(o=>o.type==='asset'&&o.fileName.endsWith('.css')).map(o=>o.source).join('\n');
// Optional local-only preview output. Never part of the production application bundle.
if(process.env.JD_UI_PREVIEW_DIR){
 const dir=resolve(process.env.JD_UI_PREVIEW_DIR);mkdirSync(dir,{recursive:true});
 writeFileSync(resolve(dir,'fixture.js'),script.replace("window.__actions.push(\"signup\")", "location.assign('/workspace')").replace("window.__actions.push(\"signin\")", "alert('Design preview only. Sign-in uses the existing authentication flow in the application.')"));
 writeFileSync(resolve(dir,'fixture.css'),css);
 writeFileSync(resolve(dir,'index.html'),'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>James-Denning — local UI preview (synthetic data)</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');
}
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
console.log(`Browser: ${browser.version()}`);
try{
 for(const [width,height] of [[320,740],[360,800],[393,780],[708,900],[1280,900],[393,460]]){
  for(const screen of ['landing','workspace']){
   const page=await browser.newPage({viewport:{width,height},timezoneId:'UTC'});const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.clock.setFixedTime(new Date('2026-11-16T18:00:00Z'));
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname!=='reference.test')return route.abort();
    if(url.pathname.startsWith('/design/')||url.pathname.startsWith('/fonts/')||url.pathname.startsWith('/connectors/')){
     const file=resolve('public','.'+url.pathname);if(!existsSync(file))throw Error('Missing asset: '+file);
     const types={'.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
     return route.fulfill({body:readFileSync(file),contentType:types[extname(file)]});
    }
    return route.fulfill({body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>',contentType:'text/html'});
   });
   await page.goto('http://reference.test/'+screen);
   await page.addStyleTag({content:css});await page.addScriptTag({content:script,type:'module'});
   try{await page.locator(screen==='landing'?'.reference-features':'.jd-welcome').waitFor({timeout:10000});}catch(error){const state=await page.locator('body').innerText().catch(()=>'<body unavailable>');throw new Error(`Reference ${screen} fixture failed to mount at ${width}x${height}. Browser errors: ${errors.join(' | ')||'none'}. Visible page: ${state.slice(0,1200)}. Original: ${error.message}`);}
   await page.evaluate(async()=>{await Promise.all([document.fonts.load('16px "JD Inter"'),document.fonts.load('32px "JD Script"')]);await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode()));});
   const measure=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,brokenImages:[...document.images].filter(i=>!i.naturalWidth).length,font:document.fonts.check('16px "JD Inter"'),scriptFont:document.fonts.check('32px "JD Script"')}));
   assert.ok(measure.documentWidth<=width,`${screen}: horizontal overflow ${JSON.stringify(measure)}`);assert.equal(measure.brokenImages,0);assert.ok(measure.font&&measure.scriptFont);
   if(evidence)await page.screenshot({path:resolve(evidence,`${screen}-${width}x${height}.png`),fullPage:true});
   if(screen==='landing'){
    assert.equal(await page.locator('.reference-features article').count(),2);
    const design=await page.evaluate(()=>({
      paper:getComputedStyle(document.querySelector('.reference-landing')).backgroundColor,
      font:getComputedStyle(document.querySelector('.reference-hero h1')).fontFamily,
      preview:!!document.querySelector('.landing-workspace-preview'),
      laptop:!!document.querySelector('.reference-laptop img'),
      blueSection:!!document.querySelector('.landing-control'),
      laptopSource:document.querySelector('.reference-laptop img')?.currentSrc,
    }));
    assert.equal(design.paper,'rgb(246, 239, 228)');
    assert.ok(design.font.includes('JD Caslon Text'));
    assert.ok(!design.preview&&design.laptop&&!design.blueSection);
    assert.ok(design.laptopSource.endsWith(width<=760?'dashboard-laptop-front.webp':'dashboard-laptop.webp'));
    await page.getByRole('button',{name:'Operations teams',exact:true}).click();
    await page.getByText('Turn our launch plan into accountable work.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Operations teams',exact:true}).getAttribute('aria-pressed'),'true');
    await page.locator('.landing-faq summary').filter({hasText:'Will JD complete every task automatically?'}).click();
    assert.ok(await page.locator('.landing-faq details').nth(1).getAttribute('open')!==null);

    await page.getByRole('button',{name:'Get started',exact:true}).first().click();
    await page.getByRole('button',{name:'Open navigation menu'}).click();
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>window.__actions),['signup','signin']);
    await page.getByRole('button',{name:'Open navigation menu'}).click();await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button',{name:'Open navigation menu'}).getAttribute('aria-expanded'),'false');
    await page.getByRole('link',{name:'Explore the platform',exact:true}).click();
    assert.equal(new URL(page.url()).hash,'#product');
   }else{
    await page.getByRole('heading',{name:/^(Good morning|Good afternoon|Good evening), Kaine\.$/}).waitFor();
    assert.equal(await page.locator('.jd-welcome .jd-action').count(),0);
    const geometry=await page.evaluate(()=>{const r=s=>{const x=document.querySelector(s).getBoundingClientRect();return{top:x.top,bottom:x.bottom,left:x.left,right:x.right}};return{header:r('.reference-workspace-header'),composer:r('.jd-compose'),scroll:r('.jd-scroll'),welcome:r('.jd-welcome')}});
    assert.ok(geometry.composer.bottom<=height, 'composer must be in viewport');
    assert.ok(geometry.composer.top>=geometry.scroll.bottom-1,'composer must not cover messages');
    const barHeight=await page.evaluate(()=>getComputedStyle(document.querySelector('.reference-workspace-header')).height);
    assert.equal(Math.round(geometry.header.bottom),Math.round(parseFloat(barHeight)),'top bar height matches its stylesheet');
    const input=page.getByRole('textbox',{name:'Message JD'});
    // The drawer is an overlay on small screens and starts open on tablets, so
    // close it explicitly before reaching for header controls behind it.
    // The navigation drawer is an on-demand overlay across both mobile and desktop;
    // the floating Home · Projects · Chats dock serves as primary navigation.
    const navToggle=page.locator('[data-tour="workspace-menu"]');
    if(await navToggle.getAttribute('aria-expanded')==='true')await page.keyboard.press('Escape');
    assert.equal(await navToggle.getAttribute('aria-expanded'),'false','drawer is closed by default');
    await navToggle.click();
    assert.equal(await navToggle.getAttribute('aria-expanded'),'true','drawer opens');
    await page.keyboard.press('Escape');
    assert.equal(await navToggle.getAttribute('aria-expanded'),'false','Escape closes the drawer');
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-tour')==='workspace-menu'),true,'focus returns to the toggle');
    await page.getByRole('button',{name:'Switch to dark mode'}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
    await page.getByRole('button',{name:'Switch to light mode'}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
    // Each header control runs its real handler; the surface it opens is then
    // asserted and dismissed, so header wiring cannot silently break.
    const header=page.locator('.reference-workspace-header');
    await header.getByRole('button',{name:'My profile',exact:true}).click();
    await page.getByRole('button',{name:'My Profile',exact:true}).click();
    await page.getByRole('dialog',{name:'My Profile',exact:true}).waitFor();
    await page.getByRole('dialog',{name:'My Profile',exact:true}).getByRole('button',{name:'Close dialog'}).click();
    await page.getByRole('dialog',{name:'My Profile',exact:true}).waitFor({state:'hidden'});
    await header.getByRole('button',{name:'Help / Product Tour',exact:true}).click();
    await page.locator('.jd-tour-card').waitFor();
    await page.getByRole('button',{name:'Close product tour'}).click();
    await page.locator('.jd-tour-card').waitFor({state:'hidden'});
    await header.getByRole('button',{name:'Notifications',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>window.__actions),['My profile','Help / Product Tour','Notifications'],'header controls reach their real handlers');
    // The global Review Centre is part of the shell, not a per-page affordance.
    assert.equal(await header.getByRole('button',{name:'Open Review Centre',exact:true}).count(),1);
    assert.ok((await page.evaluate(()=>window.__requests.filter(r=>r.action==='approvals.list').length))>=1,'the shell checks pending approvals through the synthetic client');
    // On phones the history trigger sits inside the workspace drawer, matching
    // the real responsive shell rather than a bespoke fixture.
    if(await page.getByRole('button',{name:'Open menu and conversation history'}).count()===0)
      await page.evaluate(()=>window.__appNavigate('Conversation history'));
    await page.getByRole('button',{name:'Open menu and conversation history'}).click();
    await page.getByRole('button',{name:/Saved conversation/}).click();
    await page.getByText('Saved fixture message. No real records were read.').waitFor();
    await input.fill('A synthetic message');await input.press('Shift+Enter');await input.press('X');
    assert.equal((await page.evaluate(()=>window.__requests)).filter(r=>r.action==='submit').length,0);
    await input.press('Enter');await page.getByText('Synthetic submission received.').waitFor();
    const writes=await page.evaluate(()=>window.__requests.filter(r=>r.action==='submit'));
    assert.equal(writes.length,1);assert.equal(writes[0].message,'A synthetic message\nX');
   }
   assert.deepEqual(errors,[]);results.push({screen,width,height,...measure,result:'PASS'});
   console.log(`${screen} ${width}x${height}: PASS`);await page.close();
  }
 }
}finally{if(evidence)writeFileSync(resolve(evidence,'reference-layout-results.json'),JSON.stringify(results,null,2)+'\n');await browser.close();}
