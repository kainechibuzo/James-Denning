// Computed text contrast against composited ancestor surfaces. This is not a
// pixel-level audit of artwork, nor a substitute for visual/assistive review.
export async function contrastAudit(page,scope='body'){
 return page.evaluate(scope=>{
  const parse=value=>{const n=value.match(/-?[\d.]+/g)?.map(Number);if(!n||n.length<3)return[0,0,0,0];const scale=value.startsWith('color(srgb ')?255:1;return[...n.slice(0,3).map(v=>v*scale),n[3]??1];};
  const over=(fg,bg)=>fg.slice(0,3).map((v,i)=>v*fg[3]+bg[i]*(1-fg[3]));
  const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  const background=el=>{const chain=[];for(let p=el;p;p=p.parentElement)chain.unshift(p);let bg=[255,255,255];for(const p of chain)bg=over(parse(getComputedStyle(p).backgroundColor),bg);return bg;};
  const visible=el=>{if(!el.getClientRects().length||el.closest('[disabled],[aria-disabled="true"],[inert]'))return false;for(let p=el;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)<.99)return false;if(p.tagName==='DETAILS'&&!p.open&&!p.querySelector('summary')?.contains(el))return false;}return true;};
  const findings=[],seen=new Set();let checked=0;
  const check=(el,text,pseudo)=>{
   if(!visible(el))return;const s=getComputedStyle(el,pseudo);let bg=background(el);const color=parse(s.color);const min=(parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&Number(s.fontWeight)>=700))?3:4.5;
   let actual=ratio(over(color,bg),bg);
   // Include gradient stops where controls use a gradient rather than a flat fill.
   if(s.backgroundImage.includes('gradient')){actual=Infinity;for(const c of s.backgroundImage.match(/(?:rgba?|color)\([^)]*\)/g)||[]){const stop=over(parse(c),bg);actual=Math.min(actual,ratio(over(color,stop),stop));}}
   checked++;if(actual+.01<min){const key=[el.tagName,el.className,s.color,s.backgroundColor,pseudo].join('|');if(seen.has(key))return;seen.add(key);findings.push({tag:el.tagName,class:String(el.className),text:text.slice(0,90),color:s.color,background:bg.map(Math.round),ratio:Number(actual.toFixed(2)),required:min,pseudo});}
  };
  const root=document.querySelector(scope);if(!root)return{checked:0,findings:[]};
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
  while(node=walker.nextNode()){const text=node.textContent.trim(),el=node.parentElement;if(text&&el&&!el.closest('style,script,svg,option'))check(el,text,null);}
  for(const el of root.querySelectorAll('input,textarea,select')){if(['checkbox','radio','hidden'].includes(el.type))continue;check(el,el.value||el.getAttribute('aria-label')||'input',null);if(el.placeholder)check(el,el.placeholder,'::placeholder');}
  return{checked,findings};
 },scope);
}
