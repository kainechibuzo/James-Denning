const fs = require('fs');
let content = fs.readFileSync('src/AppDemo.jsx', 'utf8');

function r(from, to) {
  if (!content.includes(from)) return 0;
  const count = content.split(from).length - 1;
  content = content.split(from).join(to);
  return count;
}

// Members page add buttons (exact text)
r(`color={C.orange}>➕ Add\n          Educator</Btn>`, `color={C.orange}>Add Educator</Btn>`);
// Remaining add buttons in members page
r(`color={C.orange}>➕ Add Student</Btn>`, `color={C.orange}>Add Student</Btn>`);
r(`color={C.orange}>➕ Add Teacher</Btn>`, `color={C.orange}>Add Teacher</Btn>`);
r(`color={C.orange}>➕ Add Class</Btn>`, `color={C.orange}>Add Class</Btn>`);
r(`color={C.blue}>➕ Add `, `color={C.blue}>Add `);
r(`color={C.orange}>➕ Add `, `color={C.orange}>Add `);

// Students page h2
r(`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>👥 Students</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="students" size={20}/>Students</h2>`);

// Teacher/MyProfile alternate h2
r(`<h2 style={{fontSize:20,fontWeight:900,color:C.blue,margin:0}}>👤 My Profile</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,margin:0,display:"flex",alignItems:"center",gap:8}}><AppIcon name="user" size={20}/>My Profile</h2>`);

// Sections page
r(`<div style={{fontWeight:800,color:C.blue,fontSize:13,marginBottom:10}}>🏫 My Form Class`, `<div style={{fontWeight:800,color:C.blue,fontSize:13,marginBottom:10}}>My Form Class`);

// Post-registration banners - remaining (non-Btn variant in Members page)
r(`📧 Send Onboarding Emails ({lastRegistered.entries.filter(e=>e.to).length})`, `Send Onboarding Emails ({lastRegistered.entries.filter(e=>e.to).length})`);
r(`📧 Send Onboarding Emails ({lastRegisteredTeachers.entries.filter(e=>e.to).length})`, `Send Onboarding Emails ({lastRegisteredTeachers.entries.filter(e=>e.to).length})`);
r(`📧 Send Onboarding Emails`, `Send Onboarding Emails`);

// Bulk delete progress modal title
r(`<BulkProgressModal title="🗑️ Deleting Students…"`, `<BulkProgressModal title="Deleting Students…"`);

// Email rate labels (turtle/rocket emojis in JSX)
r(`{r:10,label:"🐢 Safe — 10/min",desc:"Recommended — avoids spam filters"}`, `{r:10,label:"Safe — 10/min",desc:"Recommended — avoids spam filters"}`);
r(`{r:20,label:"🚀 Fast — 20/min`,  `{r:20,label:"Fast — 20/min`);
r(`{rate:10,label:"🐢 Safe — 10/min",desc:"Recommended — avoids spam filters"}`, `{rate:10,label:"Safe — 10/min",desc:"Recommended — avoids spam filters"}`);
r(`{rate:20,label:"🚀 Fast — 20/m`, `{rate:20,label:"Fast — 20/m`);
r(`{rate:10,label:"🐢 Safe — 10/min",desc:"Recommended — avoids spam filters"},{rate:20,label:"🚀 Fast — 20/m`, `{rate:10,label:"Safe — 10/min",desc:"Recommended — avoids spam filters"},{rate:20,label:"Fast — 20/m`);

// Warning messages in JSX (not in notify)
r(`⚠️ You are about to send <strong>{total}</strong> onboarding email{total!==1?"s":""}`, `You are about to send <strong>{total}</strong> onboarding email{total!==1?"s":""}`);
r(`⚠️ Emails will send after you click Start. <strong>Do not close this page until sending is complete.</strong`, `Emails will send after you click Start. <strong>Do not close this page until sending is complete.</strong`);
r(`⚠️ Each email includes a freshly generated PDF. <strong>Do not close this page until sending is complete.</s`, `Each email includes a freshly generated PDF. <strong>Do not close this page until sending is complete.</s`);
r(`{noEmail>0&&<div style={{marginTop:4,color:C.amber}}>⚠️ {noEmail} student{noEmail!==1?"s":""} skipped — no e`, `{noEmail>0&&<div style={{marginTop:4,color:C.amber}}>{noEmail} student{noEmail!==1?"s":""} skipped — no e`);
r(`⚠️ {prog.failed} email{prog.failed!==1?"s":""} failed.`, `{prog.failed} email{prog.failed!==1?"s":""} failed.`);
r(`⚠️ {prog.failed} email{prog.failed!==1?"s":""} failed to send. Check the email addresses and try again`, `{prog.failed} email{prog.failed!==1?"s":""} failed to send. Check the email addresses and try again`);
r(`⚠️ {prog.failed} email{prog.failed!==1?"s":""} failed. Check console for details.`, `{prog.failed} email{prog.failed!==1?"s":""} failed. Check console for details.`);
r(`⚠️ No CAE structure found for this section. Using standard CA / Exam mode.`, `No CAE structure found for this section. Using standard CA / Exam mode.`);
r(`⚠️ Permanently delete {confirmDeleteModal.targets.length} member{confirmDeleteModal.targets.length!==1?"`, `Permanently delete {confirmDeleteModal.targets.length} member{confirmDeleteModal.targets.length!==1?"`);
r(`⚠️ No levels defined for this section yet. Add them in the Sections page.`, `No levels defined for this section yet. Add them in the Sections page.`);

// Bulk delete confirm button
r(`🗑️ Yes, Delete {confirmDeleteModal.targets.length} Member{confirmDeleteModal.targets.length!==1?"s":""}`, `Yes, Delete {confirmDeleteModal.targets.length} Member{confirmDeleteModal.targets.length!==1?"s":""}`);

// Saving state in change status modal
r(`{saving?"⏳ Savi`, `{saving?"Savi`); // catches "{saving?"⏳ Saving…":"✓ Confirm Change"}" etc

// Actually be specific:
r(`{saving?"⏳ Saving…":"✓ Confirm Change"}`, `{saving?"Saving…":"Confirm Change"}`);
r(`{saving?"⏳ Saving…":\`Upload \${bulkParsed.length} Educator\${bulkParsed.length!==1?"s":""}`, `{saving?"Saving…":\`Upload \${bulkParsed.length} Educator\${bulkParsed.length!==1?"s":""}`);

// Bulk save states
r(`{bulkSaving?"⏳ Uploading…":\`Upload \${bulkParsed.length} Educator\${bulkParsed.length!==1?"s":""}`, `{bulkSaving?"Uploading…":\`Upload \${bulkParsed.length} Educator\${bulkParsed.length!==1?"s":""}`);
r(`{bulkSaving?"⏳ Uploading \${bulkProgress.done}/\${bulkProgress.total}…":\`Upload \${bulkParsed.length}`, `{bulkSaving?"Uploading…":\`Upload \${bulkParsed.length}`);
r(`{bulkSaving?"Uploading \${bulkProgress.done}/\${bulkProgress.total}…":\`Upload \${bulkParsed.length}`, `{bulkSaving?"Uploading…":\`Upload \${bulkParsed.length}`);

// Results teacher h2 variant
r(`<h2 style={{fontSize:20,fontWeight:900,color:C.blue,marginBottom:18}}>📝 Upload Results</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,marginBottom:18,display:"flex",alignItems:"center",gap:8}}><AppIcon name="upload-results" size={20}/>Upload Results</h2>`);

// Results by-subject/by-student tabs
r(`{id:"by-subject",label:"📋 By Subject",desc:"All students · one subject"}`, `{id:"by-subject",label:"By Subject",desc:"All students · one subject"}`);
r(`{id:"by-student",label:"👤 By Student",desc:"All subjects · one student"}`, `{id:"by-student",label:"By Student",desc:"All subjects · one student"}`);

// Save Results button
r(`{saving?"⏳ Saving…":"💾 Save Results"}`, `{saving?"Saving…":"Save Results"}`);

// MyResults StatCard with grade
r(`icon="🎯" color={gradeCol(getGrade(avg,gr`, `icon={<Target size={18}/>} color={gradeCol(getGrade(avg,gr`);

// Classes detail — students/subjects headers
r(`<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>👥 Students ({detailStudents.length`, `<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>Students ({detailStudents.length`);
r(`<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>📚 Subjects ({detailSubjects.length`, `<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>Subjects ({detailSubjects.length`);

// Teacher classes
r(`👥 Students — {selClass.name}`, `Students — {selClass.name}`);

// Subjects page tab labels
r(`{t==="section"?"🏫 Section Subjects":"📚 Global Subjects"}`, `{t==="section"?"Section Subjects":"Global Subjects"}`);

// Assignments page
r(`✅ Select All`, `Select All`);
r(`{allChecked?"✕ Remove All":"✅ Select All"}`, `{allChecked?"Remove All":"Select All"}`);
r(`✅ {existing.length} subject{existing.length>1?"s":""} assigned`, `{existing.length} subject{existing.length>1?"s":""} assigned`);

// Students page filter instructions
r(`<div style={{fontWeight:800,marginBottom:4}}>📋 Instructions</div>`, `<div style={{fontWeight:800,marginBottom:4}}>Instructions</div>`);

// Remaining submit states - use regex
content = content.replace(/\u23f3 Submitting\u2026":"\uD83D\uDCE8 Submit/g, 'Submitting\u2026":"Submit');
content = content.replace(/"\uD83D\uDCE8 Submit/g, '"Submit');

// Approval text in JSX
r(`✅ A Student ID will be auto-generated and the student will be added to the system.`, `A Student ID will be auto-generated and the student will be added to the system.`);

// Submission text
r(`📋 My Submissions`, `My Submissions`);

// Teachers page add
r(`color={C.orange}>➕ Add Teacher</Btn>`, `color={C.orange}>Add Teacher</Btn>`);

// Sessions/terms h2 (there may be a second instance for standalone sessions page)
r(`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>📅 Sessions & Terms</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="calendar" size={20}/>Sessions & Terms</h2>`);

// Dark mode button
r(`<span>{dark?"☀️":"🌙"}</span> {dark?"Light":"Dark"}`, `{dark?"Light":"Dark"}`);
r(`<span style={{fontSize:14}}>{dark?"☀️":"🌙"}</span>`, ``);

// Login page warning
r(`<span style={{fontSize:16,flexShrink:0}}>⚠️</span>`, ``);

// Dashboard activity recent
r(`{a.action==="status_change"?"🔄":a.action==="delete"?"🗑️":a.action==="edit"?"✏️":"📋"}`, `{a.action==="status_change"?"↻":a.action==="delete"?"✕":a.action==="edit"?"✎":"•"}`);

// Settings sidebar items
r(`                Settings\n                 `, `                Settings\n                 `); // already done
r(`>Settings\n`, `>Settings\n`); // already done

// Fee stats show-more button
r(`⬇ {label}`, `{label}`);
r(`<span style={{fontSize:12}}>⬇</span> {label}`, `{label}`);

// Report templates checkmark display
r(`{tmpl[key]!==false?"✓":"✗"} {label}`, `{tmpl[key]!==false?"✓":"✗"} {label}`); // keep ✓/✗ as these are text chars not emoji

// BulkProgressModal title variants
r(`<BulkProgressModal title="🗑️ Deleting`, `<BulkProgressModal title="Deleting`);

// Score structure label
r(`<div style={{fontWeight:800,color:C.blue,fontSize:15}}>\${selectedSec?.name||"Section"} Score Structu`, `<div style={{fontWeight:800,color:C.blue,fontSize:15}}>\${selectedSec?.name||"Section"} Score Structu`); // already no emoji

// Sections toggle button
r(`>{s.is_active?"⏸":"▶"}</Btn>`, `>{s.is_active?"Pause":"Resume"}</Btn>`);

// Signature toggle button
r(`{sig.is_active?"⏸ Deactivate":"▶ Activate"}`, `{sig.is_active?"Deactivate":"Activate"}`);

// Approval info box
r(`✅ Published `, `Published `); // cover remaining published ✅

// Report card customize link/attach buttons
r(`🔗</button>`, `Link</button>`);
r(`📎</button>`, `PDF</button>`);

// Misc inline
r(`📥 {recipients.length} recipient`, `{recipients.length} recipient`);

// Saving state for applyBulkStatus
r(`{saving?"⏳ Saving…":"✓ Confirm Change"}`, `{saving?"Saving…":"Confirm Change"}`);

// Email progress start sending button (remaining)
r(`>🚀 Start Sending {total} Email{total!==1?"s":""}`, `>Start Sending {total} Email{total!==1?"s":""}`);

// Setting tabs icons in header
r(`1998:                 ⚙️ Settings`, ``);

// My bill printout buttons
r(`🖨️ Print Invoice\n`, `Print Invoice\n`);
r(`🧾 Print Receipt\n`, `Print Receipt\n`);

// Fee tracker bulk action bar
r(`>📥 Export CSV</Btn>`, `>Export CSV</Btn>`);

// Assignments ✕ Remove All
r(`✕ Remove All`, `Remove All`);

// Report card settings section
r(`<span style={{color:on?C.green:C.light,fontWeight:700,fontSize:14}}>{on?"Yes":"No"}</span>`, `<span style={{color:on?C.green:C.light,fontWeight:700,fontSize:14}}>{on?"Yes":"No"}</span>`);

// Fee generate error/success
r(`{results.errors?"⚠️":"✅"} Generation Complete`, `Generation Complete`);

// CAE add row
r(`>Add Row</Btn>`, `>Add Row</Btn>`); // already done

// Share message icon in PDF viewer
r(`<span style={{fontSize:14,flexShrink:0}}>{shareMsg.ok ? "📄" : "⚠️"}</span>`, `<span style={{flexShrink:0}}>{shareMsg.ok ? <CheckCircle size={14} color="#14532d"/> : <AlertTriangle size={14} color="#7f1d1d"/>}</span>`);

// Remaining promoting button state
r(`{promoting?\`Promoting \${preview.length} students…\`:\`🎓 Promote \${preview.length} Student(s): \${fromClass}`, `{promoting?\`Promoting \${preview.length} students…\`:\`Promote \${preview.length} Student(s): \${fromClass}`);

// Fee stats download button
r(`⬇ PDF\n`, `PDF\n`);

// Unused icon fields in fee stats
r(`icon="🎯" color=`, `icon={<Target size={18}/>} color=`);

// Remaining ⚠️ in JSX (not in notify or template literals)
// Handle remaining inline warnings
r(`<span style={{fontSize:16,flexShrink:0}}>⚠️</span>`, ``);
r(`<span style={{fontSize:11}}>⚠️</span>`, ``);

// Teacher page post-reg
r(`📧 Send Onboarding Emails\n`, `Send Onboarding Emails\n`);

// Trailing cleanup
fs.writeFileSync('src/AppDemo.jsx', content, 'utf8');
console.log('Pass 2 done!');
