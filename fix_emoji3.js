const fs = require('fs');
let content = fs.readFileSync('src/AppDemo.jsx', 'utf8');

function r(from, to) {
  if (!content.includes(from)) { console.log('NOT FOUND:', JSON.stringify(from.slice(0,60))); return 0; }
  const count = content.split(from).length - 1;
  content = content.split(from).join(to);
  return count;
}

// Members bulk action bar — delete button
r(`>🗑️ Delete</Btn>`, `>Delete</Btn>`);

// DOB/Age toggle buttons (two occurrences — both identical text)
r(`>📅 Date of Birth</button>`, `>Date of Birth</button>`);
r(`>🔢 Age</button>`, `>Age</button>`);

// Bulk approval submit button (template literal — use regex)
content = content.replace(/`\u23f3 Submitting\u2026`:`\uD83D\uDCE8 Submit \${/g, '`Submitting\u2026`:`Submit ${');

// Save Results button
r(`{saving?"Saving…":"💾 Save Results"}`, `{saving?"Saving…":"Save Results"}`);

// Score Structure tab label
r(`{id:"score-structure",label:"🧮 Score Structure"}`, `{id:"score-structure",label:"Score Structure"}`);

// Score Structure section header
r(`<div style={{fontWeight:800,color:C.blue,fontSize:15}}>🧮 {selectedSec?.name||"Section"} Score Structure</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:15}}>{selectedSec?.name||"Section"} Score Structure</div>`);

// CAE structure delete button
r(`{structure&&<Btn onClick={del} color={C.red} outline sm disabled={saving}>🗑️</Btn>}`, `{structure&&<Btn onClick={del} color={C.red} outline sm disabled={saving}><Trash2 size={13}/></Btn>}`);

// Select User header
r(`<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>👤 Select User</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>Select User</div>`);

// Fee tracker StatCards — ✅ Successful and ⏳ Pending
r(`icon="✅" color={C.blue}/>`, `icon={<CircleCheck size={18} color={C.blue}/>} color={C.blue}/>`);
r(`icon="⏳" color={C.amber}/>`, `icon={<Clock size={18} color={C.amber}/>} color={C.amber}/>`);
r(`icon="👥" color={C.purple}/>`, `icon={<Users size={18} color={C.purple}/>} color={C.purple}/>`);

// Fee Line Items section header
r(`<div style={{fontSize:13,fontWeight:700,color:C.blue,marginBottom:10}}>📝 Fee Line Items</div>`, `<div style={{fontSize:13,fontWeight:700,color:C.blue,marginBottom:10}}>Fee Line Items</div>`);

// Generation Summary section header
r(`<div style={{fontWeight:800,color:C.orange,fontSize:14,marginBottom:14}}>📊 Generation Summary</div>`, `<div style={{fontWeight:800,color:C.orange,fontSize:14,marginBottom:14}}>Generation Summary</div>`);

// Compulsory fee item lock icon
r(`<span style={{fontSize:14,color:C.muted}}>🔒</span>`, `<Lock size={14} color={C.muted} style={{flexShrink:0}}/>`);

// Payment method options (in Sel)
r(`{value:"bank_transfer",label:"🏦 Bank Transfer (UBA)"}`, `{value:"bank_transfer",label:"Bank Transfer (UBA)"}`);
r(`{value:"paystack",label:"💳 Paystack Online"}`, `{value:"paystack",label:"Paystack Online"}`);

// Audit log action labels
r(`bill_generated:"🧾 Bill Generated"`, `bill_generated:"Bill Generated"`);
r(`payment_recorded:"💳 Payment Recorded"`, `payment_recorded:"Payment Recorded"`);
r(`refund_processed:"\u21a9\uFE0F Refund Processed"`, `refund_processed:"Refund Processed"`);
r(`discount_applied:"🏷️ Discount Applied"`, `discount_applied:"Discount Applied"`);
r(`bill_deleted:"🗑️ Bill Deleted"`, `bill_deleted:"Bill Deleted"`);

// Audit log delete entry button
r(`<Btn xs onClick={()=>deleteAuditEntry(entry)} color={C.red} outline title="Remove this entry">🗑️</Btn>`, `<Btn xs onClick={()=>deleteAuditEntry(entry)} color={C.red} outline title="Remove this entry"><Trash2 size={13}/></Btn>`);

// Bill detail modal buttons
r(`>🖨️ Invoice PDF</Btn>`, `>Invoice PDF</Btn>`);
r(`>🧾 Receipt PDF</Btn>`, `>Receipt PDF</Btn>`);

// Full Report PDF button
r(`📄 Full Report PDF`, `Full Report PDF`);

// No outstanding balances empty state
r(`<div style={{textAlign:"center",padding:24,color:C.light}}>🎉 No outstanding balances!</div>`, `<div style={{textAlign:"center",padding:24,color:C.light}}>No outstanding balances!</div>`);

// Recent payments method label
r(`{p.payment_method==="paystack"?"💳 Paystack":"🏦 Bank"}`, `{p.payment_method==="paystack"?"Paystack":"Bank"}`);

// Item panel header
r(`<div style={{fontWeight:800,fontSize:14,color:C.orange}}>📦 {itemPanel.itemName}</div>`, `<div style={{fontWeight:800,fontSize:14,color:C.orange}}>{itemPanel.itemName}</div>`);

// My Fee Bill h2
r(`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>🧾 My Fee Bill</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="receipt" size={20}/>My Fee Bill</h2>`);

// Transcript page — Load Results button
r(`{loadingPortal?"⏳ Loading…":"📥 Load Results"}`, `{loadingPortal?"Loading…":"Load Results"}`);

// Transcript page — Generate PDF button
r(`>🖨️ Generate Transcript PDF</Btn>`, `>Generate Transcript PDF</Btn>`);

// Transcript card — PDF button
r(`>🖨️ PDF</Btn>`, `>PDF</Btn>`);

// Transcript manual modal — Edit button (keep ✏️ already changed? check)
r(`>✏️ Edit</Btn>`, `>Edit</Btn>`);

// Transcript Save button
r(`{saving?"Saving…":"💾 Save Transcript"}`, `{saving?"Saving…":"Save Transcript"}`);

// School logo placeholder
r(`:<span style={{fontSize:32}}>🏫</span>}`, `:<Building2 size={32} color={C.muted}/>}`);

// Upload Logo label
r(`📷 Upload Logo (JPG/PNG)`, `Upload Logo (JPG/PNG)`);

// Remove logo button
r(`🗑️ Remove logo`, `Remove logo`);

// Score Preview section header
r(`<div style={{fontWeight:700,fontSize:13,color:C.muted,marginBottom:8}}>📊 Score Preview</div>`, `<div style={{fontWeight:700,fontSize:13,color:C.muted,marginBottom:8}}>Score Preview</div>`);

// DangerBtn icon prop
r(`<DangerBtn label="Clear All Results" icon="🗑️"`, `<DangerBtn label="Clear All Results" icon={<Trash2 size={14}/>}`);
r(`<DangerBtn label="Clear All Payments" icon="🗑️"`, `<DangerBtn label="Clear All Payments" icon={<Trash2 size={14}/>}`);

// Draft status text
r(`"📝 Draft — not yet published"`, `"Draft — not yet published"`);

// Email report card button
r(`>📧 Email</Btn>`, `>Email</Btn>`);

// Character Assessment header
r(`<div style={{fontWeight:800,color:C.blue,fontSize:13,marginBottom:8}}>🎯 Character Assessment</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:13,marginBottom:8}}>Character Assessment</div>`);

// No classes found empty state icon
r(`<div style={{fontSize:40,marginBottom:10}}>🔏</div>`, `<div style={{marginBottom:10}}><Lock size={40} color={C.muted}/></div>`);

// Spacing presets icons — replace with text-based icons (squares are fine but also emojis, let's just strip them)
r(`{key:"compact",label:"Compact",icon:"⬜",desc:"Minimal spacing — fits most content on one page"}`, `{key:"compact",label:"Compact",icon:"□",desc:"Minimal spacing — fits most content on one page"}`);
r(`{key:"normal", label:"Normal", icon:"🔲",desc:"Balanced spacing — recommended"}`, `{key:"normal", label:"Normal", icon:"▣",desc:"Balanced spacing — recommended"}`);
r(`{key:"spacious",label:"Spacious",icon:"⬛",desc:"Extra breathing room between sections"}`, `{key:"spacious",label:"Spacious",icon:"■",desc:"Extra breathing room between sections"}`);

// Recipients label
r(`📬 {recipients.length} recipient`, `{recipients.length} recipient`);

// Promote button state
r(`{promoting?\`⏳ Promoting \${preview.length} students…\`:\`🎓 Promote \${preview.length} Student(s): \${fromClassName} → \${toClassName}\`}`, `{promoting?\`Promoting \${preview.length} students…\`:\`Promote \${preview.length} Student(s): \${fromClassName} → \${toClassName}\`}`);

// Mail logs access denied empty state
r(`<div style={{fontSize:40,marginBottom:10}}>🚫</div>`, `<div style={{marginBottom:10}}><Lock size={40} color={C.muted}/></div>`);

// Purge Old Logs button
r(`>🗑️ Purge Old Logs</Btn>`, `>Purge Old Logs</Btn>`);

// Mail logs empty/search state
r(`{logs.length===0?"📭":"🔍"}`, `{logs.length===0?"—":"?"}`);

// Mail log row delete button
r(`                            🗑️\n                          </button>`, `                            <Trash2 size={14}/>\n                          </button>`);

fs.writeFileSync('src/AppDemo.jsx', content, 'utf8');
console.log('Pass 3 done!');
