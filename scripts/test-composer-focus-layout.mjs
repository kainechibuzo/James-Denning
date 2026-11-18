// Deterministic regression for the composer caret race. Real React component,
// synthetic state, no services. Hold animation frames to reproduce an input
// replacement arriving between selection and a delayed caret callback.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {build} from 'vite';
import {chromium} from 'playwright-core';

const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH||['/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath,'Set CHROMIUM_EXECUTABLE_PATH.');
const entry=`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ComposerTools} from '${resolve('src/chat/ComposerTools.jsx')}';
window.__sends=0;window.__navigation=0;window.__calls=0;
function Harness(){
 const [draft,setDraft]=useState('');
 return <><input aria-label="Other field"/><div style={{marginTop:500}}><ComposerTools
 role="viewer" draft={draft} setDraft={setDraft}
 actions={[{label:'Billing',prompt:'Review billing.'},{label:'People',prompt:'Review people.'}]}
 onSend={()=>window.__sends++} onNavigate={()=>window.__navigation++}/></div></>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
`;
const result=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':'"production"'},plugins:[{
 name:'composer-focus-fixture',enforce:'pre',
 resolveId(id){if(id.endsWith('virtual:composer-focus'))return '\0composer-focus.jsx';if(id.endsWith('supabaseClient.js'))return '\0no-services';},
 load(id){if(id==='\0composer-focus.jsx')return entry;if(id==='\0no-services')return 'export const supabase={functions:{invoke:async()=>{window.__calls++;throw Error("Unexpected service access");}}};';},
}],build:{write:false,minify:false,lib:{entry:'virtual:composer-focus',formats:['es']},rollupOptions:{output:{codeSplitting:false}}}});
const output=(Array.isArray(result)?result[0]:result).output;
const script=output.find(o=>o.type==='chunk').code;
const css=output.filter(o=>o.fileName.endsWith('.css')).map(o=>o.source).join('\n');
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[];
async function holdFrames(page){
 await page.evaluate(()=>{
  const original=requestAnimationFrame,callbacks=[];
  window.requestAnimationFrame=callback=>callbacks.push(callback);
  window.__flushFrames=()=>{
   window.requestAnimationFrame=original;
   for(const callback of callbacks.splice(0))callback(performance.now());
  };
 });
}
try{
 for(const selection of ['menu-enter','menu-click','mention-enter','mention-tab']){
  const page=await browser.newPage({viewport:{width:800,height:900}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.abort());
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({content:css});await page.addScriptTag({content:script,type:'module'});
  const input=page.getByLabel('Message JD',{exact:true});await input.waitFor();
  if(selection.startsWith('menu'))await page.getByRole('button',{name:'Add tools and connectors'}).click();
  else await input.fill('@Bill');
  await page.getByRole('option',{name:/Billing/}).waitFor();
  await holdFrames(page);
  if(selection==='menu-click')await page.getByRole('option',{name:/Billing/}).click();
  else await (selection.startsWith('menu')?page.getByRole('combobox',{name:'Search JD tools'}):input).press(selection==='mention-tab'?'Tab':'Enter');
  assert.equal(await input.inputValue(),'Review billing. ',selection+' inserts the chosen prompt');
  // Model the select-all / insertText boundary of Playwright.fill (and user
  // replacement): an old animation callback must not collapse this selection.
  await input.evaluate(el=>{el.focus();el.select();window.__flushFrames();});
  await page.keyboard.insertText('Please @People');
  assert.equal(await input.inputValue(),'Please @People',selection+' must not retain the previous prompt');
  await input.press('Enter');
  assert.equal(await input.inputValue(),'Please Review people. ');
  assert.deepEqual(await input.evaluate(el=>({focused:document.activeElement===el,start:el.selectionStart,end:el.selectionEnd})),{focused:true,start:22,end:22},'caret is restored in the committed draft');
  // Escape and the close button must return focus before a later user action,
  // never steal it back on the next animation frame.
  for(const dismiss of ['escape','close-button']){
   await page.getByRole('button',{name:'Add tools and connectors'}).click();
   await holdFrames(page);
   if(dismiss==='escape')await page.getByRole('combobox',{name:'Search JD tools'}).press('Escape');
   else await page.getByRole('button',{name:'Close tools menu'}).click();
   assert.equal(await input.evaluate(el=>document.activeElement===el),true,dismiss+' returns focus immediately');
   const other=page.getByLabel('Other field');
   await other.evaluate(el=>{el.focus();window.__flushFrames();});
   assert.equal(await other.evaluate(el=>document.activeElement===el),true,dismiss+' must not steal later focus');
  }
  assert.deepEqual(await page.evaluate(()=>[window.__sends,window.__navigation,window.__calls]),[0,0,0]);
  assert.deepEqual(errors,[]);console.log(`${selection}: replacement, caret, dismissal and no-execution checks PASS`);
  await page.close();
 }
}finally{await browser.close();}
