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
const header=shell.slice(shell.indexOf('<header className={page==='),shell.indexOf('</header>',shell.indexOf('<header className={page==='))+9);
assert.ok(header.includes('<ReferenceBrand/>'),'Exercise the real workspace header markup');
const darkToggle=shell.slice(shell.indexOf('function DarkToggle('),shell.indexOf('\n}',shell.indexOf('function DarkToggle('))+2);
const stub=`export const supabase={functions:{invoke:async(_name,{body})=>{
 window.__requests.push(body);
 if(body.action==='history.list')return{data:{conversations:[{id:'fixture',title:'Saved conversation',updated_at:'2026-11-16T12:00:00Z'}]}};
 if(body.action==='history')return{data:{messages:[{role:'assistant',content:'Saved fixture message. No real records were read.'}]}};
 if(body.action==='approvals.list')return{data:{approvals:[]}};
 if(body.action==='submit')return{data:{conversationId:'fixture',reply:'Synthetic submission received.'}};
 throw Error('Unexpected API action: '+body.action);
}}};`;
const entry=`import React,{useRef,useState} from 'react';import {createRoot} from 'react-dom/client';
import {Menu,HelpCircle,Bell,Moon,Sun} from 'lucide-react';
import {PublicLanding} from '${resolve('src/pages/public-landing.jsx')}';
import {ReferenceBrand} from '${resolve('src/components/reference-brand.jsx')}';
import {ChatHome} from '${resolve('src/chat/ChatHome.jsx')}';
import {LIGHT,DARK} from '${resolve('src/config/theme.js')}';
window.__requests=[];window.__actions=[];
let C=LIGHT;const useDark=()=>({dark:document.documentElement.dataset.theme==='dark',toggle:()=>{const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';C=dark?DARK:LIGHT;window.__render();}});
${darkToggle}
const AppIcon=({size,color})=><Menu size={size} color={color}/>;
const NotificationBell=()=> <div><button aria-label="Notifications" onClick={()=>window.__actions.push('notifications')}><Bell/></button></div>;
const LiveClock=()=>null;
function WorkspaceFixture(){const page='jd-chat',isMobile=innerWidth<768,user={id:'synthetic',school_id:'synthetic',role:'owner',name:'Kaine Denning'},ctx={},NAV=[];
const navigationToggleRef=useRef(null);const [sideOpen,setSide]=useState(false);const setShowTour=()=>window.__actions.push('help'),setShowProfile=()=>window.__actions.push('profile'),setShowLogout=()=>{};
return <>${header}<ChatHome user={user}/></>;}
const root=createRoot(document.getElementById('root'));window.__render=()=>root.render(location.pathname==='/workspace'?<WorkspaceFixture/>:<PublicLanding onGetStarted={()=>window.__actions.push('signup')} onSignIn={()=>window.__actions.push('signin')}/>);window.__render();`;
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
    if(url.pathname.startsWith('/design/')||url.pathname.startsWith('/fonts/')){
     const file=resolve('public','.'+url.pathname);if(!existsSync(file))throw Error('Missing asset: '+file);
     const types={'.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
     return route.fulfill({body:readFileSync(file),contentType:types[extname(file)]});
    }
    return route.fulfill({body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>',contentType:'text/html'});
   });
   await page.goto('http://reference.test/'+screen);
   await page.addStyleTag({content:css});await page.addScriptTag({content:script,type:'module'});
   await page.locator(screen==='landing'?'.reference-features':'.jd-welcome').waitFor();
   await page.evaluate(async()=>{await Promise.all([document.fonts.load('16px "JD Inter"'),document.fonts.load('32px "JD Script"')]);await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode()));});
   const measure=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,brokenImages:[...document.images].filter(i=>!i.naturalWidth).length,font:document.fonts.check('16px "JD Inter"'),scriptFont:document.fonts.check('32px "JD Script"')}));
   assert.ok(measure.documentWidth<=width,`${screen}: horizontal overflow ${JSON.stringify(measure)}`);assert.equal(measure.brokenImages,0);assert.ok(measure.font&&measure.scriptFont);
   if(evidence)await page.screenshot({path:resolve(evidence,`${screen}-${width}x${height}.png`),fullPage:true});
   if(screen==='landing'){
    assert.equal(await page.locator('.reference-features article').count(),2);
    await page.getByRole('button',{name:'Get started',exact:true}).first().click();
    await page.getByRole('button',{name:'Open navigation menu'}).click();
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>window.__actions),['signup','signin']);
    await page.getByRole('button',{name:'Open navigation menu'}).click();await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button',{name:'Open navigation menu'}).getAttribute('aria-expanded'),'false');
    await page.getByRole('link',{name:'Explore the platform',exact:true}).click();
    assert.equal(new URL(page.url()).hash,'#product');
   }else{
    await page.getByRole('heading',{name:'Good evening, Kaine.'}).waitFor();
    assert.equal(await page.locator('.jd-welcome .jd-action').count(),0);
    const geometry=await page.evaluate(()=>{const r=s=>{const x=document.querySelector(s).getBoundingClientRect();return{top:x.top,bottom:x.bottom,left:x.left,right:x.right}};return{header:r('.reference-workspace-header'),composer:r('.jd-compose'),scroll:r('.jd-scroll'),welcome:r('.jd-welcome')}});
    assert.ok(geometry.composer.bottom<=height, 'composer must be in viewport');
    assert.ok(geometry.composer.top>=geometry.scroll.bottom-1,'composer must not cover messages');
    assert.equal(geometry.header.bottom,49);
    const input=page.getByRole('textbox',{name:'Message JD'});
    await page.getByRole('button',{name:'Switch to dark mode'}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
    await page.getByRole('button',{name:'Switch to light mode'}).click();
    await page.getByRole('button',{name:'Open navigation',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Close or collapse navigation'}).getAttribute('aria-expanded'),'true');
    await page.getByRole('button',{name:'Close or collapse navigation'}).click();
    await page.getByRole('button',{name:'My profile'}).click();await page.getByRole('button',{name:'Help / Product Tour'}).click();
    await page.getByRole('button',{name:'Notifications',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>window.__actions),['profile','help','notifications']);
    await page.getByRole('button',{name:'Open chat history and JD tools'}).click();
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
