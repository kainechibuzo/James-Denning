const fs = require('fs');
let content = fs.readFileSync('src/AppDemo.jsx', 'utf8');

function r(from, to) {
  if (!content.includes(from)) { console.log('NOT FOUND:', JSON.stringify(from.slice(0,80))); return 0; }
  const count = content.split(from).length - 1;
  content = content.split(from).join(to);
  return count;
}

// Hidden lock span in login page (was already removed once, check)
r(`<span style={{display:"none"}}>🔒</span>`, ``);

// Student ID auto-generate info box
r(`🪪 <strong>Student ID</strong>`, `<strong>Student ID</strong>`);

// Session/Term add buttons (Sessions & Terms page — two occurrences: main page + settings page)
r(`color={C.green} outline>➕ Term</Btn>`, `color={C.green} outline>+ Term</Btn>`);
r(`color={C.orange}>➕ Session</Btn>`, `color={C.orange}>+ Session</Btn>`);

// Edit Student modal title
r(`<Modal title={\`✏️ Edit Student — \${editStu.id}\`}`, `<Modal title={\`Edit Student — \${editStu.id}\`}`);

// Edit Student warning text
r(`⚠️ You can edit name, email, DOB and phone. To change class or admission details, contact the admin.`, `You can edit name, email, DOB and phone. To change class or admission details, contact the admin.`);

// Fee status filter options
r(`{value:"paid",label:"✅ Paid"},{value:"partial",label:"⏳ Partial"},{value:"unpaid",label:"❌ Unpaid"}`, `{value:"paid",label:"Paid"},{value:"partial",label:"Partial"},{value:"unpaid",label:"Unpaid"}`);

// StatCard — Total Refunded (fee payments page)
r(`icon="↩️" color={C.amber}/>`, `icon={<RotateCcw size={18} color={C.amber}/>} color={C.amber}/>`);

// StatCard — Refunded (fee tracker)
r(`icon="↩️" color={C.purple}/>`, `icon={<RotateCcw size={18} color={C.purple}/>} color={C.purple}/>`);

// Discounts header in Bill Detail
r(`>🏷️ Discounts Applied</div>`, `>Discounts Applied</div>`);

// Action menu item with ↩️ icon
r(`{label:"Process Refund",  icon:"↩️", onClick:()=>setRefundModal(bill),   color:C.amber}`, `{label:"Process Refund",  onClick:()=>setRefundModal(bill),   color:C.amber}`);

// Refund button in expanded bill row
r(`>↩️ Refund</Btn>`, `>Refund</Btn>`);

// Refunded badge in payment table
r(`<Badge color={C.red}>↩️ Refunded</Badge>`, `<Badge color={C.red}>Refunded</Badge>`);

// Clear refunded record button
r(`>🗑️ Clear</Btn>`, `>Clear</Btn>`);

// Process Refund modal title
r(`<Modal title="↩️ Process Refund"`, `<Modal title="Process Refund"`);

// Refund modal warning text
r(`⚠️ This will reduce the student's recorded payment amount and update their bill status accordingly.`, `This will reduce the student's recorded payment amount and update their bill status accordingly.`);

// Refund confirm button state
r(`{saving?"⏳ Processing...":"↩️ Process Refund"}`, `{saving?"Processing...":"Process Refund"}`);

// Apply Discount button state
r(`{saving?"⏳ Applying...":"✅ Apply Discount"}`, `{saving?"Applying...":"Apply Discount"}`);

// Fee stats inline partial indicator
r(`<span style={{color:C.amber}}>⏳{partial}</span>`, `<span style={{color:C.amber}}>{partial} partial</span>`);

// Fee stats section — partial stat bar icon
r(`{label:"Partial",val:iPartial,color:C.amber,icon:"⏳"}`, `{label:"Partial",val:iPartial,color:C.amber}`);

// ClickStat partial
r(`<ClickStat label="Partial" value={partialBills.length} icon="⏳"`, `<ClickStat label="Partial" value={partialBills.length} icon={<Clock size={18} color={C.amber}/>}`);

// Progress bar partial label in section summary
r(`<span style={{color:C.amber}}>⏳ {clsPartial} partial</span>`, `<span style={{color:C.amber}}>{clsPartial} partial</span>`);

// Customise button
r(`>✏️ Customise</Btn>`, `>Customise</Btn>`);

// Published status badge in report cards
r(`  ✅ Published\n                </span>`, `  Published\n                </span>`);

// Teacher edit student modal title (if teacher pages have same pattern)
r(`<Modal title={`+"`"+`✏️ Edit Student — \${editStu.id}`+"`"+`}`, `<Modal title={`+"`"+`Edit Student — \${editStu.id}`+"`"+`}`);

// Approval page — Educator Approval info text (if not already in notify)
// Line 5821 / 5863 / 5908 — check these
r(`<span style={{fontSize:18}}>ℹ️</span>`, ``);
r(`ℹ️ This student will be reviewed by the admin before being added to the system.`, `This student will be reviewed by the admin before being added to the system.`);
r(`<div style={{fontWeight:800,marginBottom:4}}>ℹ️ All bulk-uploaded students will be submitted for admin approval before g`, `<div style={{fontWeight:800,marginBottom:4}}>All bulk-uploaded students will be submitted for admin approval before g`);

// Inline info boxes in Members page
r(`ℹ️ Download the template, fill in student data, then upload the file. Student IDs and passwords are auto-generated.`, `Download the template, fill in student data, then upload the file. Student IDs and passwords are auto-generated.`);
r(`ℹ️ Teachers log in using their <strong>email address</strong> as both username and password. Ask them to change their pa`, `Teachers log in using their <strong>email address</strong> as both username and password. Ask them to change their pa`);
r(`ℹ️ Teacher logs in using their email address. Staff ID is set automatically.`, `Teacher logs in using their email address. Staff ID is set automatically.`);
r(`ℹ️ Teachers log in using their email address as both username and password. Ask them to change their password after firs`, `Teachers log in using their email address as both username and password. Ask them to change their password after firs`);

// Approval info box (line 8945 variant — teacher edit modal)
r(`ℹ️ Download the template, fill in student data, then upload the file. Student IDs and passwords are auto-generated.`, `Download the template, fill in student data, then upload the file. Student IDs and passwords are auto-generated.`);

// showBanner calls — these are notification strings, keep them
// Lines 1151, 1157, 1165, 1170 — KEEP

// notify calls — KEEP

// Dashboard greeting messages (template literals) — KEEP

// HTML template content (10351-10386, 12792-12957, 17538-17542, 18237-18240) — KEEP

fs.writeFileSync('src/AppDemo.jsx', content, 'utf8');
console.log('Pass 4 done!');
