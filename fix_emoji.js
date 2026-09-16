const fs = require('fs');
let content = fs.readFileSync('src/AppDemo.jsx', 'utf8');

function r(from, to) {
  if (!content.includes(from)) return 0;
  const count = content.split(from).length - 1;
  content = content.split(from).join(to);
  return count;
}

// ════════════════════════════════════════════════════════
// BLOCK 1: Page h2 headers — replace emoji with AppIcon
// ════════════════════════════════════════════════════════
const h2Replacements = [
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>👥 Members</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="members" size={20}/>Members</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>🧑\u200D🏫 Teachers</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="teachers" size={20}/>Teachers</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>🏫 Classes</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="classes" size={20}/>Classes</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>📚 Subjects</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="subjects" size={20}/>Subjects</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>🏫 Sections</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="sections" size={20}/>Sections</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>🔗 Assignments</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="assignments" size={20}/>Assignments</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>📝 Result Management</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="results" size={20}/>Result Management</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>📊 My Report Card</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="my-results" size={20}/>My Report Card</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>🏫 My Assigned Classes</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="my-classes" size={20}/>My Assigned Classes</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>🔢 Grading & CAE Schema</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="grading" size={20}/>Grading & CAE Schema</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>🔐 Permissions</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="shield" size={20}/>Permissions</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>💰 Fee Structures</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="fee-items" size={20}/>Fee Structures</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>💳 Payment Records</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="fee-tracker" size={20}/>Payment Records</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>💳 My Payments</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="my-payments" size={20}/>My Payments</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>\uD83C\uDFF7\uFE0F Fee Items</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="fee-items" size={20}/>Fee Items</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>📋 Fee Templates</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="fee-templates" size={20}/>Fee Templates</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>⚡ Generate Bills</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="fee-generate" size={20}/>Generate Bills</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>📊 Payment Tracker</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="fee-tracker" size={20}/>Payment Tracker</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>📈 Fee Statistics</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="fee-stats" size={20}/>Fee Statistics</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>\uD83E\uDDF3 My Fee Bill</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="receipt" size={20}/>My Fee Bill</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>📢 Announcements</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="announce" size={20}/>Announcements</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>📄 Transcript System</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="transcript" size={20}/>Transcript System</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>⚙️ Settings</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="settings" size={20}/>Settings</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>📋 Report Cards</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="report-cards" size={20}/>Report Cards</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>\uD83D\uDD0F Result Approvals</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="result-approvals" size={20}/>Result Approvals</h2>`],
  [`<h2 style={{fontSize:22,fontWeight:900,color:C.blue,margin:0}}>⚙️ Report Card Settings</h2>`, `<h2 style={{fontSize:22,fontWeight:900,color:C.blue,margin:0,display:"flex",alignItems:"center",gap:8}}><AppIcon name="report-settings" size={20}/>Report Card Settings</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>📑 Report Templates</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="report-cards" size={20}/>Report Templates</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>📋 Student Attendance</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="attendance" size={20}/>Student Attendance</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>✉️ Send Email</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="mail" size={20}/>Send Email</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>🕐 Audit Trail</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="audit-log" size={20}/>Audit Trail</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>🎓 Bulk Student Promotion</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="bulk-promote" size={20}/>Bulk Student Promotion</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>📨 Email Logs</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="mail-logs" size={20}/>Email Logs</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>✅ Student Approvals</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="approvals" size={20}/>Student Approvals</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>📝 Upload Results</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="upload-results" size={20}/>Upload Results</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>➕ Add Students</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="add-students" size={20}/>Add Students</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>📅 Sessions & Terms</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="calendar" size={20}/>Sessions & Terms</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>👤 My Profile</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="user" size={20}/>My Profile</h2>`],
  [`<h2 style={{fontSize:20,fontWeight:900,color:C.blue}}>✍️ Signatures</h2>`, `<h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="pencil" size={20}/>Signatures</h2>`],
];
h2Replacements.forEach(([f,t]) => r(f,t));

// ════════════════════════════════════════════════════════
// BLOCK 2: Modal titles
// ════════════════════════════════════════════════════════
const modalTitles = [
  [`<Modal title="🔄 Change Member Status"`, `<Modal title="Change Member Status"`],
  [`<Modal title="🗑️ Confirm Bulk Delete"`, `<Modal title="Confirm Bulk Delete"`],
  [`<Modal title={\`🔄 Change Status for \${selectedIds.size} Member(s)\`}`, `<Modal title={\`Change Status for \${selectedIds.size} Member(s)\`}`],
  [`<Modal title={editTarget?"✏️ Edit Student":"➕ Add Student"}`, `<Modal title={editTarget?"Edit Student":"Add Student"}`],
  [`<Modal title={editTarget?"✏️ Edit Educator":"➕ Add Educator"}`, `<Modal title={editTarget?"Edit Educator":"Add Educator"}`],
  [`<Modal title="📤 Bulk Student Upload"`, `<Modal title="Bulk Student Upload"`],
  [`<Modal title="📤 Bulk Educator Upload"`, `<Modal title="Bulk Educator Upload"`],
  [`<Modal title={editId?"✏️ Edit Student":"➕ New Student"}`, `<Modal title={editId?"Edit Student":"New Student"}`],
  [`<Modal title={editId?"✏️ Edit Teacher":"➕ New Teacher"}`, `<Modal title={editId?"Edit Teacher":"New Teacher"}`],
  [`<Modal title="📤 Bulk Teacher Upload"`, `<Modal title="Bulk Teacher Upload"`],
  [`<Modal title={editId?"✏️ Edit Class":"➕ New Class"}`, `<Modal title={editId?"Edit Class":"New Class"}`],
  [`<Modal title={editId?"✏️ Edit Section":"➕ New Section"}`, `<Modal title={editId?"Edit Section":"New Section"}`],
  [`<Modal title={\`📋 Levels — \${levelsModal.name}\`}`, `<Modal title={\`Levels — \${levelsModal.name}\`}`],
  [`<Modal title={editId?"✏️ Edit Subject":"➕ New Subject"}`, `<Modal title={editId?"Edit Subject":"New Subject"}`],
  [`<Modal title={editSessId?"✏️ Edit Session":"➕ New Session"}`, `<Modal title={editSessId?"Edit Session":"New Session"}`],
  [`<Modal title={editTermId?"✏️ Edit Term":"➕ New Term"}`, `<Modal title={editTermId?"Edit Term":"New Term"}`],
  [`<Modal title={editGId?"✏️ Edit Grade Band":"➕ New Grade Band"}`, `<Modal title={editGId?"Edit Grade Band":"New Grade Band"}`],
  [`<Modal title={editId?"✏️ Edit Grade Band":"➕ New Grade Band"}`, `<Modal title={editId?"Edit Grade Band":"New Grade Band"}`],
  [`<Modal title={editTId?"✏️ Edit Trait":"➕ New Assessment Trait"}`, `<Modal title={editTId?"Edit Trait":"New Assessment Trait"}`],
  [`<Modal title={editRId?"✏️ Edit Rating":"➕ New Rating"}`, `<Modal title={editRId?"Edit Rating":"New Rating"}`],
  [`<Modal title={editId?"✏️ Edit Fee":"➕ Add Fee Structure"}`, `<Modal title={editId?"Edit Fee":"Add Fee Structure"}`],
  [`<Modal title="➕ Record Payment"`, `<Modal title="Record Payment"`],
  [`<Modal title={editId?"✏️ Edit Fee Item":"➕ New Fee Item"}`, `<Modal title={editId?"Edit Fee Item":"New Fee Item"}`],
  [`<Modal title={editId?"✏️ Edit Template":"➕ New Fee Template"}`, `<Modal title={editId?"Edit Template":"New Fee Template"}`],
  [`<Modal title={\`📋 \${detailModal.name}\`}`, `<Modal title={detailModal.name}`],
  [`<Modal title="💳 Pay Fee Bill"`, `<Modal title="Pay Fee Bill"`],
  [`<Modal title="💳 Record Payment"`, `<Modal title="Record Payment"`],
  [`<Modal title="📋 Audit Log"`, `<Modal title="Audit Log"`],
  [`<Modal title="🏷️ Apply Discount"`, `<Modal title="Apply Discount"`],
  [`<Modal title="🧾 Bill Details"`, `<Modal title="Bill Details"`],
  [`<Modal title={noteModal.action==="approve"?"✅ Approve Student":"❌ Reject Request"}`, `<Modal title={noteModal.action==="approve"?"Approve Student":"Reject Request"}`],
  [`<Modal title={editId?"✏️ Edit Signature":"➕ Add Signature"}`, `<Modal title={editId?"Edit Signature":"Add Signature"}`],
  [`<Modal title={editId?"✏️ Edit Announcement":"📢 New Announcement"}`, `<Modal title={editId?"Edit Announcement":"New Announcement"}`],
  [`<Modal title={manualModal==="new"?"📝 Create Manual Transcript":"✏️ Edit Manual Transcript"}`, `<Modal title={manualModal==="new"?"Create Manual Transcript":"Edit Manual Transcript"}`],
  [`<Modal title={editId?"✏️ Edit Template":"➕ New Report Template"}`, `<Modal title={editId?"Edit Template":"New Report Template"}`],
  [`<Modal title="✏️ Customise Report Card"`, `<Modal title="Customise Report Card"`],
  [`<Modal title="📢 Publish Report Cards"`, `<Modal title="Publish Report Cards"`],
  [`<Modal title="🗑️ Purge Old Logs"`, `<Modal title="Purge Old Logs"`],
  [`<Modal title={started?"📧 Sending Onboarding Emails…":"📧 Send Onboarding Emails"}`, `<Modal title={started?"Sending Onboarding Emails…":"Send Onboarding Emails"}`],
  [`<Modal title="📧 Sending Emails…"`, `<Modal title="Sending Emails…"`],
  [`<Modal title="📧 Email Report Cards — Bulk Send"`, `<Modal title="Email Report Cards — Bulk Send"`],
  [`<Modal title="📤 Bulk Upload Results"`, `<Modal title="Bulk Upload Results"`],
  [`<Modal title="📤 Bulk Student Upload (Pending Approval)"`, `<Modal title="Bulk Student Upload (Pending Approval)"`],
  [`<Modal title="➕ Submit Student for Approval"`, `<Modal title="Submit Student for Approval"`],
  [`<Modal title={dupWarning.type==="exact"?"❌ Exact Duplicate Student":"⚠️ Possible Duplicate Student"}`, `<Modal title={dupWarning.type==="exact"?"Exact Duplicate Student":"Possible Duplicate Student"}`],
  [`<Modal title={dupType==="exact"?"❌ Exact Duplicate":"⚠️ Possible Duplicate"}`, `<Modal title={dupType==="exact"?"Exact Duplicate":"Possible Duplicate"}`],
  [`<Modal title="👤 My Profile"`, `<Modal title="My Profile"`],
];
modalTitles.forEach(([f,t]) => r(f,t));

// ════════════════════════════════════════════════════════
// BLOCK 3: Button text — remove emoji
// ════════════════════════════════════════════════════════
const btnReplacements = [
  [`color={C.orange}>➕ Add Section</Btn>`, `color={C.orange}>Add Section</Btn>`],
  [`color={C.orange}>➕ Add Subject</Btn>`, `color={C.orange}>Add Subject</Btn>`],
  [`color={C.orange}>➕ Add Fee</Btn>`, `color={C.orange}>Add Fee</Btn>`],
  [`>➕ Add Row</Btn>`, `>Add Row</Btn>`],
  [`>➕ Add</Btn>`, `>Add</Btn>`],
  [`>➕ New Template</Btn>`, `>New Template</Btn>`],
  [`>➕ Create Template</Btn>`, `>Create Template</Btn>`],
  [`>➕ Create First Template</Btn>`, `>Create First Template</Btn>`],
  [`>➕ New Announcement</Btn>`, `>New Announcement</Btn>`],
  [`>➕ Create Manual Transcript</Btn>`, `>Create Manual Transcript</Btn>`],
  [`>➕ Create First Transcript</Btn>`, `>Create First Transcript</Btn>`],
  [`>➕ Add First Signature</Btn>`, `>Add First Signature</Btn>`],
  [`>➕ Add Signature</Btn>`, `>Add Signature</Btn>`],
  [`>➕ Add Subject Row</Btn>`, `>Add Subject Row</Btn>`],
  [`>➕ Record Payment</Btn>`, `>Record Payment</Btn>`],
  [`color={C.red} outline>🗑️</Btn>`, `color={C.red} outline><Trash2 size={13}/></Btn>`],
  [`>🗑️ Delete Selected</Btn>`, `>Delete Selected</Btn>`],
  [`>🗑️ Clear All</Btn>`, `>Clear All</Btn>`],
  [`>🗑️ Remove logo`, `>Remove logo`],
  [`color={C.blue} outline>✏️</Btn>`, `color={C.blue} outline><Pencil size={13}/></Btn>`],
  [`color={C.blue} outline>✏️ Edit</Btn>`, `color={C.blue} outline>Edit</Btn>`],
  [`color={C.blue} outline>👁️ View</Btn>`, `color={C.blue} outline>View</Btn>`],
  [`>💾 Save School Info</Btn>`, `>Save School Info</Btn>`],
  [`>💾 Save Profile</Btn>`, `>Save Profile</Btn>`],
  [`>💾 Save Template</Btn>`, `>Save Template</Btn>`],
  [`>💾 Save Item</Btn>`, `>Save Item</Btn>`],
  [`>💾 Save Levels</Btn>`, `>Save Levels</Btn>`],
  [`>💾 Save Settings</Btn>`, `>Save Settings</Btn>`],
  [`>💾 Save Academic Settings</Btn>`, `>Save Academic Settings</Btn>`],
  [`>💾 Save Signature</Btn>`, `>Save Signature</Btn>`],
  [`>💾 Save Assignment</Btn>`, `>Save Assignment</Btn>`],
  [`>💾 Save</Btn>`, `>Save</Btn>`],
  [`>⬇️ Download Excel Template (.xlsx)</Btn>`, `>Download Excel Template (.xlsx)</Btn>`],
  [`>⬇ Download Template (.xls`, `>Download Template (.xls`],
  [`>📧 Send Onboarding Emails ({lastRegistered.entries.filter(e=>e.to).length})</Btn>`, `>Send Onboarding Emails ({lastRegistered.entries.filter(e=>e.to).length})</Btn>`],
  [`>📧 Send Onboarding Emails ({lastRegisteredTeachers.entries.filter(e=>e.to).length})</Btn>`, `>Send Onboarding Emails ({lastRegisteredTeachers.entries.filter(e=>e.to).length})</Btn>`],
  [`>📧 Send Onboarding Emails</Btn>`, `>Send Onboarding Emails</Btn>`],
  [`>📧 Send Reminders</Btn>`, `>Send Reminders</Btn>`],
  [`>🧾 Send Receipts</Btn>`, `>Send Receipts</Btn>`],
  [`>📥 Export CSV</Btn>`, `>Export CSV</Btn>`],
  [`>📥 Load Records</Btn>`, `>Load Records</Btn>`],
  [`>🖨️ Receipt</Btn>`, `>Receipt PDF</Btn>`],
  [`>📄 PDF</Btn>`, `>PDF</Btn>`],
  [`>✅ Approve All ({pending.length})</Btn>`, `>Approve All ({pending.length})</Btn>`],
  [`>✅ Approve</Btn>`, `>Approve</Btn>`],
  [`>❌ Reject</Btn>`, `>Reject</Btn>`],
  [`>🔗 Manage Assignments</Btn>`, `>Manage Assignments</Btn>`],
  [`>📄 Export All PDFs</Btn>`, `>Export All PDFs</Btn>`],
  [`>⭐ Set Default</Btn>`, `>Set Default</Btn>`],
  [`>📋 Levels</Btn>`, `>Levels</Btn>`],
  [`>🔄 Change Status</Btn>`, `>Change Status</Btn>`],
  [`>🔄 Load Records</Btn>`, `>Load Records</Btn>`],
  [`>📤 Post</Btn>`, `>Post</Btn>`],
  [`>💾 Save Template</Btn>`, `>Save Template</Btn>`],
  [`>🚀 Start Sending</Btn>`, `>Start Sending</Btn>`],
  [`>📥 Load Results`, `>Load Results`],
];
btnReplacements.forEach(([f,t]) => r(f,t));

// ════════════════════════════════════════════════════════
// BLOCK 4: Saving state labels
// ════════════════════════════════════════════════════════
const savingStates = [
  [`{saving?"⏳ Saving…":"💾 Save Profile"}`, `{saving?"Saving…":"Save Profile"}`],
  [`{saving?"⏳ Saving…":"💾 Save School Info"}`, `{saving?"Saving…":"Save School Info"}`],
  [`{saving?"⏳ Saving…":"💾 Save Settings"}`, `{saving?"Saving…":"Save Settings"}`],
  [`{saving?"⏳ Saving…":"💾 Save Academic Settings"}`, `{saving?"Saving…":"Save Academic Settings"}`],
  [`{saving?"⏳ Saving…":"💾 Save Signature"}`, `{saving?"Saving…":"Save Signature"}`],
  [`{saving?"⏳ Saving…":"💾 Save Template"}`, `{saving?"Saving…":"Save Template"}`],
  [`{saving?"⏳ Saving…":"💾 Save Item"}`, `{saving?"Saving…":"Save Item"}`],
  [`{saving?"⏳ Saving…":"💾 Save Levels"}`, `{saving?"Saving…":"Save Levels"}`],
  [`{saving?"⏳ Saving…":"💾 Save Changes"}`, `{saving?"Saving…":"Save Changes"}`],
  [`{saving?"⏳ Saving…":"💾 Save"}`, `{saving?"Saving…":"Save"}`],
  [`{publishing?"⏳ Saving…":"💾 Save Settings"}`, `{publishing?"Saving…":"Save Settings"}`],
  [`{publishing?"⏳ Publishing…":"📢 Confirm & Publish"}`, `{publishing?"Publishing…":"Confirm & Publish"}`],
  [`{saving?"⏳ Saving...":"💾 Save"}`, `{saving?"Saving...":"Save"}`],
  [`{saving?"⏳ Saving...":"💾 Record Payment"}`, `{saving?"Saving...":"Record Payment"}`],
  [`{saving?"⏳ Saving...":"✅ Apply Discount"}`, `{saving?"Saving...":"Apply Discount"}`],
  [`{saving?"⏳ Saving…":"💾 Save All Subjects"}`, `{saving?"Saving…":"Save All Subjects"}`],
  [`{promoting?`, `{promoting?`],
  [`{processing?"⏳ Processing…":noteModal.action==="approve"?"✅ Confirm Approval":"❌ Confirm Rejection"}`, `{processing?"Processing…":noteModal.action==="approve"?"Confirm Approval":"Confirm Rejection"}`],
  [`{purging?"⏳ Purging…":"🗑️ Purge Now"}`, `{purging?"Purging…":"Purge Now"}`],
  [`{ftSaving?"Saving…":"💾 Save Assignment"}`, `{ftSaving?"Saving…":"Save Assignment"}`],
  [`{generating?"⏳ Loading…":"📄 Export All PDFs"}`, `{generating?"Loading…":"Export All PDFs"}`],
  [`{generating?"⏳…":"📧 Email Section"}`, `{generating?"…":"Email Section"}`],
  [`{publishing?"⏳…":"📢 Publish Cards"}`, `{publishing?"…":"Publish Cards"}`],
  [`{publishing?"⏳…":"👁️ Unpublish"}`, `{publishing?"…":"Unpublish"}`],
  [`{downloading?"⏳ Generating…":"📄 Download Report Card"}`, `{downloading?"Generating…":"Download Report Card"}`],
  [`{generating?"⏳ Generating...":"⚡ Generate Bills"}`, `{generating?"Generating...":"Generate Bills"}`],
  [`{approvingEA?"⏳…":isEAApproved?"↩ Revoke EA":"✅ Give Educator Approval (EA)"}`, `{approvingEA?"Revoking…":isEAApproved?"Revoke EA":"Give Educator Approval (EA)"}`],
  [`{approvingMA?"⏳…":approval?.ma_status==="approved"?"↩ Revoke MA":"🔏 Give Manager Approval (MA)"}`, `{approvingMA?"Revoking…":approval?.ma_status==="approved"?"Revoke MA":"Give Manager Approval (MA)"}`],
  [`{bulkResProgress.isDone?"✅ Done!":"⏳ Saving…"}`, `{bulkResProgress.isDone?"Done!":"Saving…"}`],
  [`{saving?"⏳ Saving…":isLocked?"🔒 Locked":isTeacherLocked&&ctx.role==="teacher"?"🔐 EA Approved":"💾 Save A`, `{saving?"Saving…":isLocked?"Locked":isTeacherLocked&&ctx.role==="teacher"?"EA Approved":"Save A`],
];
savingStates.forEach(([f,t]) => r(f,t));

// bulk upload states
r(`{bulkSaving?"⏳ Uploading…":\`🚀 Upload \${bulkParsed.length} Educator`, `{bulkSaving?"Uploading…":\`Upload \${bulkParsed.length} Educator`);
r(`{bulkSaving?\`⏳ Uploading \${bulkProgress.done}/\${bulkProgress.total}…\`:\`🚀 Upload \${bulkParsed.length}`, `{bulkSaving?\`Uploading \${bulkProgress.done}/\${bulkProgress.total}…\`:\`Upload \${bulkParsed.length}`);
r(`{bulkSaving?"⏳ Uploading…":\`🚀 Upload \${bulkParsed.length} Teacher`, `{bulkSaving?"Uploading…":\`Upload \${bulkParsed.length} Teacher`);
r(`{bulkSaving?\`⏳ Uploading…\`:\`🚀 Upload \${bulkParsed.length} Students\`}`, `{bulkSaving?"Uploading…":\`Upload \${bulkParsed.length} Students\`}`);
r(`{bulkSaving?"⏳ Submitting…":\`📨 Submit \${bulkParsed.length} Students for Approval\`}`, `{bulkSaving?"Submitting…":\`Submit \${bulkParsed.length} Students for Approval\`}`);
r(`{saving?"⏳ Submitting…":"📨 Submit"}`, `{saving?"Submitting…":"Submit"}`);
r(`{saving?"⏳ Saving…":"🔐 Change `, `{saving?"Saving…":"Change `);
r(`\`⏳ Sending to \${recipients.length}…\``, `\`Sending to \${recipients.length}…\``);
r(`\`📤 Send to \${recipients.length} Recipient\${recipients.length!==1?"s":""}`, `\`Send to \${recipients.length} Recipient\${recipients.length!==1?"s":""}`);
r(`{sending?\`⏳ Sending to \${recipients.length}…\`:\`📤 Send to \${recipients.length}`, `{sending?\`Sending to \${recipients.length}…\`:\`Send to \${recipients.length}`);

// ════════════════════════════════════════════════════════
// BLOCK 5: Tab labels and array strings
// ════════════════════════════════════════════════════════
const tabLabels = [
  [`{id:"class-subjects",label:"📚 Subjects per Class"}`, `{id:"class-subjects",label:"Subjects per Class"}`],
  [`{id:"form-teachers", label:"🏫 Form Teachers"}`, `{id:"form-teachers", label:"Form Teachers"}`],
  [`{id:"subject-teachers",label:"🧑\u200D🏫 Subject Teachers"}`, `{id:"subject-teachers",label:"Subject Teachers"}`],
  [`{id:"grades",label:"📊 Grade Bands"}`, `{id:"grades",label:"Grade Bands"}`],
  [`{id:"cae",label:"🎯 CAE Traits"}`, `{id:"cae",label:"CAE Traits"}`],
  [`[["overview","📈 Overview"],["items","📦 Items"]]`, `[["overview","Overview"],["items","Items"]]`],
  [`{id:"compose",label:"✉️ Compose"}`, `{id:"compose",label:"Compose"}`],
  [`{id:"templates",label:"📄 Templates"}`, `{id:"templates",label:"Templates"}`],
  [`{id:"individual",label:"👤 Individual"}`, `{id:"individual",label:"Individual"}`],
  [`{id:"manual",label:"✏️ Manual Email"}`, `{id:"manual",label:"Manual Email"}`],
  [`{id:"class",label:"🏫 Class"}`, `{id:"class",label:"Class"}`],
  [`{id:"all-students",label:"👥 All Students"}`, `{id:"all-students",label:"All Students"}`],
  [`{id:"all-teachers",label:"🧑\u200D🏫 All Teachers"}`, `{id:"all-teachers",label:"All Teachers"}`],
  [`{id:"all",label:"📢 Everyone"}`, `{id:"all",label:"Everyone"}`],
  [`{id:"roles",label:"👥 Role Permissions"}`, `{id:"roles",label:"Role Permissions"}`],
  [`{id:"users",label:"👤 User Overrides"}`, `{id:"users",label:"User Overrides"}`],
  [`{id:"school",      label:"🏫 School Info"}`, `{id:"school",      label:"School Info"}`],
  [`{id:"sessions",    label:"📅 Sessions & Terms"}`, `{id:"sessions",    label:"Sessions & Terms"}`],
  [`{id:"academic",    label:"📐 Academic"}`, `{id:"academic",    label:"Academic"}`],
  [`{id:"security",    label:"🔒 Security"}`, `{id:"security",    label:"Security"}`],
  [`{id:"portal",      label:"🖥️ Portal"}`, `{id:"portal",      label:"Portal"}`],
  [`{id:"permissions", label:"👥 Permissions"}`, `{id:"permissions", label:"Permissions"}`],
  [`{id:"portal",label:"📋 From Portal Records"}`, `{id:"portal",label:"From Portal Records"}`],
  [`{id:"manual",label:"📝 Manual Transcripts"}`, `{id:"manual",label:"Manual Transcripts"}`],
  [`{id:"invoices",label:"🧾 Invoices",desc:"Bills & PDF invoices"}`, `{id:"invoices",label:"Invoices",desc:"Bills & PDF invoices"}`],
  [`{id:"receipts",label:"💳 Receipts",desc:"Payments & refunds"}`, `{id:"receipts",label:"Receipts",desc:"Payments & refunds"}`],
  [`{id:"daily",label:"📅 Daily Entry"}`, `{id:"daily",label:"Daily Entry"}`],
  [`{id:"summary",label:"📊 Summary"}`, `{id:"summary",label:"Summary"}`],
];
tabLabels.forEach(([f,t]) => r(f,t));

// ════════════════════════════════════════════════════════
// BLOCK 6: Dashboard quick action icons
// ════════════════════════════════════════════════════════
r(`{l:"Members",          i:"👥",p:"members"}`, `{l:"Members",          i:"members",p:"members"}`);
r(`{l:"Enter Results",    i:"📝",p:"results-admin"}`, `{l:"Enter Results",    i:"results",p:"results-admin"}`);
r(`{l:"Payment Tracker",  i:"💳",p:"fee-tracker"}`, `{l:"Payment Tracker",  i:"fee-tracker",p:"fee-tracker"}`);
r(`{l:"Bulk Promote",     i:"🎓",p:"bulk-promote"}`, `{l:"Bulk Promote",     i:"bulk-promote",p:"bulk-promote"}`);
r(`{l:"Announcements",    i:"📢",p:"announce"}`, `{l:"Announcements",    i:"announce",p:"announce"}`);
r(`{l:"Transcript",       i:"📄",p:"transcript"}`, `{l:"Transcript",       i:"transcript",p:"transcript"}`);
r(`{l:"My Report Card",i:"📊",p:"my-results",c:C.blue}`, `{l:"My Report Card",i:"my-results",p:"my-results",c:C.blue}`);
r(`{l:"Fee Payments",  i:"💳",p:"my-payments",c:C.green}`, `{l:"Fee Payments",  i:"my-payments",p:"my-payments",c:C.green}`);
r(`{l:"Transcript",    i:"📄",p:"transcript", c:C.orange}`, `{l:"Transcript",    i:"transcript",p:"transcript", c:C.orange}`);
r(`{l:"My Classes",    i:"🏫",p:"my-classes",    c:C.blue}`, `{l:"My Classes",    i:"my-classes",p:"my-classes",    c:C.blue}`);
r(`{l:"Upload Results",i:"📝",p:"results-teach", c:C.green}`, `{l:"Upload Results",i:"upload-results",p:"results-teach", c:C.green}`);
r(`{l:"Attendance",i:"📋",p:"attendance", c:C.purple}`, `{l:"Attendance",i:"attendance",p:"attendance", c:C.purple}`);
r(`{l:"Add Students",  i:"➕",p:"add-students",  c:C.orange}`, `{l:"Add Students",  i:"add-students",p:"add-students",  c:C.orange}`);
r(`{l:"My Profile",    i:"👤",p:"my-profile",    c:C.purple}`, `{l:"My Profile",    i:"user",p:"my-profile",    c:C.purple}`);

// Members tabs
r(`{id:"all",label:\`All (\${stuTotal+teachers.length})\`,icon:"👥"}`, `{id:"all",label:\`All (\${stuTotal+teachers.length})\`,icon:"members"}`);
r(`{id:"students",label:\`Students (\${stuTotal})\`,icon:"🎒"}`, `{id:"students",label:\`Students (\${stuTotal})\`,icon:"students"}`);
r(`{id:"educators",label:\`Educators (\${teachers.length})\`,icon:"🧑\u200D🏫"}`, `{id:"educators",label:\`Educators (\${teachers.length})\`,icon:"teachers"}`);

// ════════════════════════════════════════════════════════
// BLOCK 7: Section headers in content areas
// ════════════════════════════════════════════════════════
r(`<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>🏦 Fee Collection Overview</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12,display:"flex",alignItems:"center",gap:6}}><AppIcon name="fee-tracker" size={14}/>Fee Collection Overview</div>`);
r(`<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:13}}>⚡ Quick Actions</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:13}}>Quick Actions</div>`);
r(`<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:10}}>📢 Announcements</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:10}}>Announcements</div>`);
r(`<div style={{fontWeight:800,color:C.blue,fontSize:14}}>🕐 Recent Admin Activity</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:14}}>Recent Admin Activity</div>`);
r(`<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:10}}>📢 School Announcements</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:10}}>School Announcements</div>`);
r(`📚 My Subject Assignments`, `My Subject Assignments`);
r(`<div style={{fontWeight:800,color:C.blue,fontSize:13,marginBottom:10}}>📢 Announcements</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:13,marginBottom:10}}>Announcements</div>`);
r(`<div style={{fontWeight:900,color:C.blue,fontSize:15,marginBottom:4}}>🏫 School Information</div>`, `<div style={{fontWeight:900,color:C.blue,fontSize:15,marginBottom:4}}>School Information</div>`);
r(`<div style={{fontWeight:900,color:C.blue,fontSize:15}}>📅 Sessions & Terms</div>`, `<div style={{fontWeight:900,color:C.blue,fontSize:15}}>Sessions & Terms</div>`);
r(`<div style={{fontWeight:900,color:C.blue,fontSize:15,marginBottom:4}}>📐 Academic Settings</div>`, `<div style={{fontWeight:900,color:C.blue,fontSize:15,marginBottom:4}}>Academic Settings</div>`);
r(`<div style={{fontWeight:900,color:C.blue,fontSize:15,marginBottom:4}}>🔐 Admin Password</div>`, `<div style={{fontWeight:900,color:C.blue,fontSize:15,marginBottom:4}}>Admin Password</div>`);
r(`<div style={{fontWeight:900,color:C.red,fontSize:14,marginBottom:8}}>⚠️ Danger Zone</div>`, `<div style={{fontWeight:900,color:C.red,fontSize:14,marginBottom:8}}>Danger Zone</div>`);
r(`<div style={{fontWeight:900,color:C.blue,fontSize:15,marginBottom:4}}>🖥️ Portal Preferences</div>`, `<div style={{fontWeight:900,color:C.blue,fontSize:15,marginBottom:4}}>Portal Preferences</div>`);
r(`<div style={{fontWeight:800,fontSize:15,color:C.blue,marginBottom:4}}>👁️ Section Visibility</div>`, `<div style={{fontWeight:800,fontSize:15,color:C.blue,marginBottom:4}}>Section Visibility</div>`);
r(`<div style={{fontWeight:800,fontSize:15,color:C.blue,marginBottom:4}}>📐 Section Spacing</div>`, `<div style={{fontWeight:800,fontSize:15,color:C.blue,marginBottom:4}}>Section Spacing</div>`);
r(`<div style={{fontWeight:800,fontSize:15,color:C.blue,marginBottom:4}}>💬 Default Comments</div>`, `<div style={{fontWeight:800,fontSize:15,color:C.blue,marginBottom:4}}>Default Comments</div>`);
r(`<div style={{fontWeight:800,color:C.blue,fontSize:14}}>🧠 Assessment Traits</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:14}}>Assessment Traits</div>`);
r(`<div style={{fontWeight:800,color:C.blue,fontSize:14}}>⭐ Rating Scale</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:14}}>Rating Scale</div>`);
r(`<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>🎯 Character Assessment</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>Character Assessment</div>`);
r(`<div style={{fontWeight:800,color:C.blue,fontSize:14}}>📊 Daily Payment Inflow (Last 30 Days)</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:14}}>Daily Payment Inflow (Last 30 Days)</div>`);
r(`<div style={{fontWeight:800,color:C.blue,fontSize:14}}>💳 Payment Method Split</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:14}}>Payment Method Split</div>`);
r(`<div style={{fontWeight:800,color:C.red,fontSize:14}}>⚠️ Top Defaulters</div>`, `<div style={{fontWeight:800,color:C.red,fontSize:14}}>Top Defaulters</div>`);
r(`<div style={{fontWeight:800,color:C.green,fontSize:14}}>✅ Recent Payments</div>`, `<div style={{fontWeight:800,color:C.green,fontSize:14}}>Recent Payments</div>`);
r(`<div style={{fontWeight:800,color:C.blue,fontSize:14}}>📦 Payment by Fee Item</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:14}}>Payment by Fee Item</div>`);
r(`<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>📝 Fee Line Items</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>Fee Line Items</div>`);
r(`<div style={{fontWeight:800,color:C.blue,marginBottom:12,fontSize:14}}>📬 Recipients</div>`, `<div style={{fontWeight:800,color:C.blue,marginBottom:12,fontSize:14}}>Recipients</div>`);
r(`<div style={{fontWeight:800,color:C.blue,marginBottom:12,fontSize:14}}>📝 Message</div>`, `<div style={{fontWeight:800,color:C.blue,marginBottom:12,fontSize:14}}>Message</div>`);
r(`<div style={{fontWeight:800,color:C.blue,marginBottom:10,fontSize:13}}>💡 Placeholders</div>`, `<div style={{fontWeight:800,color:C.blue,marginBottom:10,fontSize:13}}>Placeholders</div>`);
r(`<div style={{fontWeight:800,color:C.blue,marginBottom:10,fontSize:13}}>⚡ Quick Fill</div>`, `<div style={{fontWeight:800,color:C.blue,marginBottom:10,fontSize:13}}>Quick Fill</div>`);
r(`<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:14}}>📊 Generation Summary</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:14}}>Generation Summary</div>`);
r(`<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>📜 Transaction History</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>Transaction History</div>`);
r(`<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:3}}>📧 Send receipt to parent?</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:3}}>Send receipt to parent?</div>`);
r(`<div style={{fontWeight:800,color:C.blue,fontSize:12,marginBottom:8}}>📂 Sections</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:12,marginBottom:8}}>Sections</div>`);
r(`<div style={{fontWeight:800,color:C.blue,fontSize:11,marginBottom:8}}>📊 Preview</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:11,marginBottom:8}}>Preview</div>`);
r(`<div style={{fontWeight:800,color:C.blue,fontSize:14}}>⚙️ Components</div>`, `<div style={{fontWeight:800,color:C.blue,fontSize:14}}>Components</div>`);
r(`<div style={{fontWeight:700,color:C.muted,fontSize:12,marginBottom:10}}>💡 How bill generation works</div>`, `<div style={{fontWeight:700,color:C.muted,fontSize:12,marginBottom:10}}>How bill generation works</div>`);
r(`<span style={{fontSize:16}}>⚙️</span>`, ``);
r(`✍️ Signatures\n`, `Signatures\n`);

// ════════════════════════════════════════════════════════
// BLOCK 8: Search placeholders
// ════════════════════════════════════════════════════════
r(`placeholder="🔍 Search by name, ID, or email…"`, `placeholder="Search by name, ID, or email…"`);
r(`placeholder="🔍 Search name or student ID…"`, `placeholder="Search name or student ID…"`);
r(`placeholder="🔍 Search by name or ID…"`, `placeholder="Search by name or ID…"`);
r(`placeholder="🔍 Search subject or body…"`, `placeholder="Search subject or body…"`);
r(`placeholder="🔍 Search students…"`, `placeholder="Search students…"`);
r(`placeholder="🔍 Search student`, `placeholder="Search student`);
r(`placeholder="🔍 Search`, `placeholder="Search`);

// ════════════════════════════════════════════════════════
// BLOCK 9: Misc UI elements
// ════════════════════════════════════════════════════════
r(`<span>📂</span> Section`, `<Folder size={11} style={{flexShrink:0}}/>Section`);
r(`{icon:"📊",text:"Manage students, teachers & classes"}`, `{icon:<LayoutDashboard size={16}/>,text:"Manage students, teachers & classes"}`);
r(`{icon:"📝",text:"Results, report cards & transcripts"}`, `{icon:<FileText size={16}/>,text:"Results, report cards & transcripts"}`);
r(`{icon:"🏦",text:"Fee billing, tracking & analytics"}`, `{icon:<DollarSign size={16}/>,text:"Fee billing, tracking & analytics"}`);
r(`<span style={{fontSize:14}}>🚪</span>{sideOpen&&<span>Sign Out</span>}`, `<LogOut size={14}/>{sideOpen&&<span>Sign Out</span>}`);
r(`⚙️ Settings\n                 `, `Settings\n                 `);
r(`>⚙️\n`, `>Settings\n`);
r(`<span style={{color:"#fff",fontWeight:900,fontSize:16}}>⚙️ Settings</span>`, `<span style={{color:"#fff",fontWeight:900,fontSize:16}}>Settings</span>`);
r(`<div style={{fontSize:52,marginBottom:14}}>🛡️</div>`, `<div style={{marginBottom:14}}><Shield size={52} color={C.blue}/></div>`);
r(`🔄 Reload Portal`, `Reload Portal`);
r(`<option value="">{selectedIds.size>0?\`⚙ \${selectedIds.size} selected\`:"⚙ Bulk Actions"}</option>`, `<option value="">{selectedIds.size>0?\`\${selectedIds.size} selected\`:"Bulk Actions"}</option>`);
r(`<option value="bulk-status">🔄 Change Status (selected)</option>`, `<option value="bulk-status">Change Status (selected)</option>`);
r(`<option value="bulk-send-login">📧 Send Login Details (selected)</option>`, `<option value="bulk-send-login">Send Login Details (selected)</option>`);
r(`<option value="bulk-delete">🗑️ Delete Selected</option>`, `<option value="bulk-delete">Delete Selected</option>`);
r(`<option value="csv">⬇ Export CSV (all filtered)</option>`, `<option value="csv">Export CSV (all filtered)</option>`);
r(`{m._type==="student"?"🎒 Student":"🧑\u200D🏫 Educator"}`, `{m._type==="student"?"Student":"Educator"}`);
r(`{id.includes("@")?"🧑\u200D🏫":id.toLowerCase()==="admin"?"🔐":id.startsWith("PAR")?"👪":"🎓"}`, `null`);
r(`<span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",fontSize:15,zIndex:1}}>`, `<span style={{display:"none"}}>`);
r(`{showPass?"🙈":"👁"}`, `{showPass?"Hide":"Show"}`);
r(`{showPass?"🙈":"👁️"}`, `{showPass?"Hide":"Show"}`);
r(`const statusIcon={pending:"⏳",approved:"✅",rejected:"❌"};`, `const statusIcon={pending:"…",approved:"✓",rejected:"✗"};`);
r(`{filter==="pending"?"⏳ Pending":filter==="approved"?"✅`, `{filter==="pending"?"Pending":filter==="approved"?"Approved"?`);

// ════════════════════════════════════════════════════════
// BLOCK 10: Action menu items
// ════════════════════════════════════════════════════════
r(`{label:"✏️ Edit",onClick:()=>openEdit(m)}`, `{label:"Edit",onClick:()=>openEdit(m)}`);
r(`{label:"🔄 Change Status",onClick:()=>`, `{label:"Change Status",onClick:()=>`);
r(`{label:"📧 Send Login Details",onClick:()=>sendLoginDetails(m),disabled:!m.email}`, `{label:"Send Login Details",onClick:()=>sendLoginDetails(m),disabled:!m.email}`);
r(`{label:"🗑️ Delete",onClick:()=>deleteMember(m),danger:true}`, `{label:"Delete",onClick:()=>deleteMember(m),danger:true}`);
r(`{label:"Edit",icon:"✏️",onClick:()=>`, `{label:"Edit",onClick:()=>`);
r(`{label:item.is_active?"Deactivate":"Activate",icon:item.is_active?"🚫":"✅",onClick:()=>toggle(item`, `{label:item.is_active?"Deactivate":"Activate",onClick:()=>toggle(item`);
r(`{label:"Delete",icon:"🗑️",onClick:()=>del(item.id),danger:true}`, `{label:"Delete",onClick:()=>del(item.id),danger:true}`);
r(`{label:"View Details",    icon:"👁️", onClick:()=>setBillDetailModal(bill)}`, `{label:"View Details",    onClick:()=>setBillDetailModal(bill)}`);
r(`{label:"Audit Log",       icon:"📋", onClick:()=>openAuditLog(bill),     color:C.muted}`, `{label:"Audit Log",       onClick:()=>openAuditLog(bill),     color:C.muted}`);
r(`{label:"Record Payment",  icon:"💳", onClick:()=>setPayItemModal(bill)`, `{label:"Record Payment",  onClick:()=>setPayItemModal(bill)`);
r(`{label:"Apply Discount",  icon:"🏷️", onClick:()=>setDiscountModal(bill), color:C.purple}`, `{label:"Apply Discount",  onClick:()=>setDiscountModal(bill), color:C.purple}`);
r(`{label:"Print Invoice",   icon:"🖨️", onClick:()=>openInvoicePDF(bill)}`, `{label:"Print Invoice",   onClick:()=>openInvoicePDF(bill)}`);
r(`{label:"Print Receipt", icon:"🧾", onClick:()=>openReceiptP`, `{label:"Print Receipt", onClick:()=>openReceiptP`);
r(`{label:"Send Reminder",   icon:"📧", onClick:()=>sendReminder(bill),  disabled:!studentMap[b`, `{label:"Send Reminder",   onClick:()=>sendReminder(bill),  disabled:!studentMap[b`);
r(`{label:"Send Receipt",    icon:"🧾", onClick:()=>sendReceipt(bill),   disabled:!studentMap[b`, `{label:"Send Receipt",    onClick:()=>sendReceipt(bill),   disabled:!studentMap[b`);
r(`{label:"Send Invoice",    icon:"📄", onClick:()=>sendInvoiceEmail(bill), disabled:!studentMa`, `{label:"Send Invoice",    onClick:()=>sendInvoiceEmail(bill), disabled:!studentMa`);
r(`{label:"Delete Bill",     icon:"🗑️", onClick:()=>deleteBill(bill),       danger:true}`, `{label:"Delete Bill",     onClick:()=>deleteBill(bill),       danger:true}`);

// ════════════════════════════════════════════════════════
// BLOCK 11: Payment method labels in JSX
// ════════════════════════════════════════════════════════
r(`{p.payment_method==="paystack"?"💳 Paystack":"🏦 Bank Transfer`, `{p.payment_method==="paystack"?"Paystack":"Bank Transfer`);
r(`e.payment_method==="paystack"?"💳 Paystack":"🏦 Bank Transfer`, `e.payment_method==="paystack"?"Paystack":"Bank Transfer`);
r(`r.lastPayMethod==="paystack"?"💳 Paystack":r`, `r.lastPayMethod==="paystack"?"Paystack":r`);
r(`{label:"🏦 Bank Transfer",total:bankTotal,color:C.blue,method:"bank_transfer"}`, `{label:"Bank Transfer",total:bankTotal,color:C.blue,method:"bank_transfer"}`);
r(`{label:"💳 Paystack",total:paystackTotal,color:C.green,method:"paystack"}`, `{label:"Paystack",total:paystackTotal,color:C.green,method:"paystack"}`);

// ════════════════════════════════════════════════════════
// BLOCK 12: Select options
// ════════════════════════════════════════════════════════
r(`<option value="paid">✅ Paid</option>`, `<option value="paid">Paid</option>`);
r(`<option value="partial">⏳ Partial</option>`, `<option value="partial">Partial</option>`);
r(`<option value="literal">📏 Literal</option>`, `<option value="literal">Literal</option>`);
r(`<option value="formula">🔢 Formula</option>`, `<option value="formula">Formula</option>`);
r(`<option value="global">🌐 Global grades</option>`, `<option value="global">Global grades</option>`);
r(`<option value="">🌐 Global (all sections)</option>`, `<option value="">Global (all sections)</option>`);
r(`{value:"",label:"🌐 Global (all sections)"}`, `{value:"",label:"Global (all sections)"}`);
r(`{value:"",label:"🌐 Global"}`, `{value:"",label:"Global"}`);
r(`options={[{value:"teacher",label:"🧑\u200D🏫 Teacher"},{value:"student",label:"🎓 Student"}]}`, `options={[{value:"teacher",label:"Teacher"},{value:"student",label:"Student"}]}`);
r(`<option value="sent">✅ Sent</option>`, `<option value="sent">Sent</option>`);
r(`<option value="failed">❌ Failed</option>`, `<option value="failed">Failed</option>`);
r(`<option value="partial">⚠️ Partial</option>`, `<option value="partial">Partial</option>`);

// ════════════════════════════════════════════════════════
// BLOCK 13: Permissions section labels
// ════════════════════════════════════════════════════════
r(`🧑\u200D🏫 Teacher Permissions\n`, `Teacher Permissions\n`);
r(`🎓 Student Permissions\n`, `Student Permissions\n`);
r(`⚡ Teacher Action Controls\n`, `Teacher Action Controls\n`);
r(`🏫 Teacher Portal Restrictions\n`, `Teacher Portal Restrictions\n`);
r(`               icon:"📋",`, `               icon:"clipboard",`);
r(`               icon:"➕",`, `               icon:"add",`);

// ════════════════════════════════════════════════════════
// BLOCK 14: Status indicators and counters
// ════════════════════════════════════════════════════════
r(`✅ {allMembers.filter(m=>m.status==="active").length} active ·`, `{allMembers.filter(m=>m.status==="active").length} active ·`);
r(`🚫 {allMembers.filter(m=>m.status!=="active").length} inactive`, `{allMembers.filter(m=>m.status!=="active").length} inactive`);
r(`✅ {lastRegistered.count} student{lastRegistered.count!==1?"s":""} registered successfully.`, `{lastRegistered.count} student{lastRegistered.count!==1?"s":""} registered successfully.`);
r(`✅ {lastRegisteredTeachers.count} teacher{lastRegisteredTeachers.count!==1?"s":""} registered successfully.`, `{lastRegisteredTeachers.count} teacher{lastRegisteredTeachers.count!==1?"s":""} registered successfully.`);
r(`<span style={{fontSize:12,color:C.green,fontWeight:700}}>✅ {nNew} new</span>`, `<span style={{fontSize:12,color:C.green,fontWeight:700}}>{nNew} new</span>`);
r(`{nPoss>0&&<span style={{fontSize:12,color:C.amber,fontWeight:700}}>⚠ {nPoss} possible duplicate{nPoss!`, `{nPoss>0&&<span style={{fontSize:12,color:C.amber,fontWeight:700}}>{nPoss} possible duplicate{nPoss!`);
r(`{nExact>0&&<span style={{fontSize:12,color:C.red,fontWeight:700}}>❌ {nExact} exact duplicate{nExact!==`, `{nExact>0&&<span style={{fontSize:12,color:C.red,fontWeight:700}}>{nExact} exact duplicate{nExact!==`);
r(`const badgeLabel=dupType==="exact"?"❌ Duplicate":dupType==="possible"?"⚠ Possible Dup":"✅ New";`, `const badgeLabel=dupType==="exact"?"Duplicate":dupType==="possible"?"Possible Dup":"New";`);
r(`{bulkErrors.map((e,i)=><div key={i} style={{fontSize:12,color:"#DC2626",marginBottom:3}}>⚠️ {e}</div>)}`, `{bulkErrors.map((e,i)=><div key={i} style={{fontSize:12,color:"#DC2626",marginBottom:3}}>{e}</div>)}`);
r(`{bulkErrors.map((e,i)=><div key={i} style={{fontSize:12,color:C.red,marginBottom:2}}>⚠️ {e}</div>)}`, `{bulkErrors.map((e,i)=><div key={i} style={{fontSize:12,color:C.red,marginBottom:2}}>{e}</div>)}`);
r(`<div style={{fontWeight:700,color:C.green,fontSize:13,marginBottom:8}}>✅ {bulkParsed.length} rows parsed —`, `<div style={{fontWeight:700,color:C.green,fontSize:13,marginBottom:8}}>{bulkParsed.length} rows parsed —`);
r(`<div style={{fontWeight:700,color:C.red,fontSize:12,marginBottom:5}}>⚠️ Issues:</div>`, `<div style={{fontWeight:700,color:C.red,fontSize:12,marginBottom:5}}>Issues:</div>`);

// ════════════════════════════════════════════════════════
// BLOCK 15: Classes page decorations and stats
// ════════════════════════════════════════════════════════
r(`<div style={{position:"absolute",right:-10,top:-10,opacity:.1,fontSize:120}}>🏫</div>`, ``);
r(`<div style={{fontSize:26,marginBottom:7}}>{reportReady?"✅":"⏳"}</div>`, `<div style={{marginBottom:7}}>{reportReady?<CheckCircle size={26} color={C.green}/>:<Loader2 size={26} color={C.muted}/>}</div>`);
r(`👥 {stuCount} students`, `{stuCount} students`);

// ════════════════════════════════════════════════════════
// BLOCK 16: Results page states and approvals
// ════════════════════════════════════════════════════════
r(`EA: {isEAApproved?"✅ Approved":"⏳ Pending"}`, `EA: {isEAApproved?"Approved":"Pending"}`);
r(`MA: {isMAApproved?"✅ Approved":"⏳ Pending"}`, `MA: {isMAApproved?"Approved":"Pending"}`);
r(`{isMAApproved&&<span style={{fontSize:11,color:C.red,fontWeight:700}}>🔒 Fully Locked</span>}`, `{isMAApproved&&<span style={{fontSize:11,color:C.red,fontWeight:700,display:"flex",alignItems:"center",gap:3}}><Lock size={11}/>Fully Locked</span>}`);
r(`{isEAApproved&&!isMAApproved&&<span style={{fontSize:11,color:C.orange,fontWeight:700}}>🔐 Awaiting Manager `, `{isEAApproved&&!isMAApproved&&<span style={{fontSize:11,color:C.orange,fontWeight:700,display:"flex",alignItems:"center",gap:3}}><Lock size={11}/>Awaiting Manager `);
r(`?<Badge color={C.green}>✏️ Entered</Badge>`, `?<Badge color={C.green}>Entered</Badge>`);
r(`{saved&&<span style={{fontSize:12,color:C.green,fontWeight:700}}>✅ Saved to Supabase</span>}`, `{saved&&<span style={{fontSize:12,color:C.green,fontWeight:700}}>Saved</span>}`);
r(`📊 Preview — {bulkResParsed.reduce((a,s)=>a+s.rows.length,0)} record(s) across {bulkResParsed.length} cl`, `Preview — {bulkResParsed.reduce((a,s)=>a+s.rows.length,0)} record(s) across {bulkResParsed.length} cl`);
r(`🚀 Save {bulkResParsed.reduce((a,s)=>a+s.rows.length,0)} Result Record(s)`, `Save {bulkResParsed.reduce((a,s)=>a+s.rows.length,0)} Result Record(s)`);

// ════════════════════════════════════════════════════════
// BLOCK 17: Report cards page
// ════════════════════════════════════════════════════════
r(`EA: {approval?.ea_status==="approved"?"✅ Approved":"⏳ Pending"}`, `EA: {approval?.ea_status==="approved"?"Approved":"Pending"}`);
r(`MA: {approval?.ma_status==="approved"?"✅ Approved":"⏳ Pending"}`, `MA: {approval?.ma_status==="approved"?"Approved":"Pending"}`);
r(`{completeness.noSetup?"— No subjects assigned":completeness.complete?"✅ Results Complete":"⚠️ Incomplete`, `{completeness.noSetup?"— No subjects assigned":completeness.complete?"Results Complete":"Incomplete`);
r(`<div style={{fontWeight:700,color:C.red,marginBottom:6}}>⚠️ Incomplete Results Detected</div>`, `<div style={{fontWeight:700,color:C.red,marginBottom:6}}>Incomplete Results Detected</div>`);
r(`{publishInfo.is_published?\`✅ Published \${new Date(publishInfo.published_at).toLocaleDateString("en-NG")}\``, `{publishInfo.is_published?\`Published \${new Date(publishInfo.published_at).toLocaleDateString("en-NG")}\``);
r(`title="Send as 7-day link">🔗</button>`, `title="Send as 7-day link">Link</button>`);
r(`title="Attach PDF to email">📎</button>`, `title="Attach PDF to email">PDF</button>`);
r(`>🔗 Link</button>`, `>Link</button>`);
r(`>📎 Attach</button>`, `>Attach</button>`);
r(`<span style={{color:on?C.green:C.light,fontWeight:700,fontSize:14}}>{on?"✓":"✗"}</span>`, `<span style={{color:on?C.green:C.light,fontWeight:700,fontSize:14}}>{on?"Yes":"No"}</span>`);
r('{publishInfo.is_published?`\u2705 Published', '{publishInfo.is_published?`Published');
r('\u2705 Published ${', 'Published ${');

// ════════════════════════════════════════════════════════
// BLOCK 18: Result approvals page
// ════════════════════════════════════════════════════════
r(`{type}: {ok?"✅ Approved":"⏳ Pending"}`, `{type}: {ok?"Approved":"Pending"}`);
r(`{cmp.noSetup?"— Not set up":cmp.complete?"✅ Complete":cmp.studentsWithMissing>0?\`⚠️ \${cmp.students`, `{cmp.noSetup?"— Not set up":cmp.complete?"Complete":cmp.studentsWithMissing>0?\`\${cmp.students`);
r(`{isExpanded?"▲ Less":"▼ Details"}`, `{isExpanded?"Less":"Details"}`);
r(`{acting===\`ea-\${cls.id}\`?"⏳":eaOk?"↩ Revoke EA":"✅ Approve EA"}`, `{acting===\`ea-\${cls.id}\`?"…":eaOk?"Revoke EA":"Approve EA"}`);
r(`{acting===\`ma-\${cls.id}\`?"⏳":maOk?"↩ Revoke MA":"🔏 Approve MA"}`, `{acting===\`ma-\${cls.id}\`?"…":maOk?"Revoke MA":"Approve MA"}`);
r(`<div style={{fontWeight:700,color:C.red,marginBottom:8}}>⚠️ Missing Results (`, `<div style={{fontWeight:700,color:C.red,marginBottom:8}}>Missing Results (`);
r(`✅ All {cmp.total} students have results for all {cmp.expected} subjects.`, `All {cmp.total} students have results for all {cmp.expected} subjects.`);

// ════════════════════════════════════════════════════════
// BLOCK 19: Empty state icons (large decorative)
// ════════════════════════════════════════════════════════
const emptyIcons = [
  [`<div style={{fontSize:44,marginBottom:10}}>📝</div>`, `<div style={{marginBottom:10}}><FileText size={44} color={C.muted}/></div>`],
  [`<div style={{fontSize:44,marginBottom:10}}>📋</div>`, `<div style={{marginBottom:10}}><ClipboardList size={44} color={C.muted}/></div>`],
  [`<div style={{fontSize:44,marginBottom:10}}>🔏</div>`, `<div style={{marginBottom:10}}><ShieldCheck size={44} color={C.muted}/></div>`],
  [`<div style={{fontSize:44,marginBottom:10}}>📄</div>`, `<div style={{marginBottom:10}}><FileText size={44} color={C.muted}/></div>`],
  [`<div style={{fontSize:44,marginBottom:10}}>📑</div>`, `<div style={{marginBottom:10}}><FileStack size={44} color={C.muted}/></div>`],
  [`<div style={{fontSize:44,marginBottom:10}}>✍️</div>`, `<div style={{marginBottom:10}}><Pencil size={44} color={C.muted}/></div>`],
  [`<div style={{fontSize:44,marginBottom:10}}>👈</div>`, `<div style={{marginBottom:10}}><ChevronRight size={44} color={C.muted}/></div>`],
  [`<div style={{fontSize:40,marginBottom:10}}>📋</div>`, `<div style={{marginBottom:10}}><ClipboardList size={40} color={C.muted}/></div>`],
  [`<div style={{fontSize:40,marginBottom:10}}>📝</div>`, `<div style={{marginBottom:10}}><FileText size={40} color={C.muted}/></div>`],
  [`<div style={{fontSize:40,marginBottom:10}}>🔍</div>`, `<div style={{marginBottom:10}}><Search size={40} color={C.muted}/></div>`],
  [`<div style={{fontSize:40,marginBottom:10}}>🏫</div>`, `<div style={{marginBottom:10}}><School size={40} color={C.muted}/></div>`],
  [`<div style={{fontSize:40,marginBottom:8}}>📋</div>`, `<div style={{marginBottom:8}}><ClipboardList size={40} color={C.muted}/></div>`],
  [`<div style={{fontSize:40,marginBottom:8}}>📊</div>`, `<div style={{marginBottom:8}}><BarChart3 size={40} color={C.muted}/></div>`],
  [`<div style={{fontSize:40,marginBottom:8}}>🏫</div>`, `<div style={{marginBottom:8}}><School size={40} color={C.muted}/></div>`],
  [`<div style={{fontSize:40,marginBottom:8}}>📄</div>`, `<div style={{marginBottom:8}}><FileText size={40} color={C.muted}/></div>`],
  [`<div style={{fontSize:40,marginBottom:12}}>📋</div>`, `<div style={{marginBottom:12}}><ClipboardList size={40} color={C.muted}/></div>`],
  [`<div style={{fontSize:40,marginBottom:12}}>🧾</div>`, `<div style={{marginBottom:12}}><ReceiptText size={40} color={C.muted}/></div>`],
  [`<div style={{fontSize:36,marginBottom:8}}>🔍</div>`, `<div style={{marginBottom:8}}><Search size={36} color={C.muted}/></div>`],
  [`<div style={{fontSize:36,marginBottom:8}}>📭</div>`, `<div style={{marginBottom:8}}><Inbox size={36} color={C.muted}/></div>`],
  [`<div style={{fontSize:36,marginBottom:10}}>💳</div>`, `<div style={{marginBottom:10}}><CreditCard size={36} color={C.muted}/></div>`],
  [`<div style={{fontSize:40,marginBottom:10}}>💳</div>`, `<div style={{marginBottom:10}}><CreditCard size={40} color={C.muted}/></div>`],
  [`<div style={{fontSize:32,marginBottom:8}}>📅</div>`, `<div style={{marginBottom:8}}><Calendar size={32} color={C.muted}/></div>`],
  [`<div style={{fontSize:28,marginBottom:8}}>📋</div>`, `<div style={{marginBottom:8}}><ClipboardList size={28} color={C.muted}/></div>`],
  [`<div style={{fontSize:38}}>🎒</div>`, `<div><GraduationCap size={38} color={C.muted}/></div>`],
  [`<div style={{fontSize:48,marginBottom:10}}>📋</div>`, `<div style={{marginBottom:10}}><ClipboardList size={48} color={C.blue}/></div>`],
  [`<div style={{fontSize:40,marginBottom:10}}>📋</div>`, `<div style={{marginBottom:10}}><ClipboardList size={40} color={C.muted}/></div>`],
  [`<div style={{fontSize:44,marginBottom:10}}>📝</div>`, `<div style={{marginBottom:10}}><FileText size={44} color={C.muted}/></div>`],
];
emptyIcons.forEach(([f,t]) => r(f,t));

// Locked states
r(`}}>🔒</div>`, `}}><Lock size={34} color={C.orange}/></div>`);
r(`}}>🚪</div>`, `}}><LogOut size={30} color={C.red}/></div>`);
r(`fontSize:34,margin:"0 auto 22px"}}>🔒</div>`, `fontSize:34,margin:"0 auto 22px"}}><Lock size={34}/></div>`);

// ════════════════════════════════════════════════════════
// BLOCK 20: Bulk progress modals
// ════════════════════════════════════════════════════════
r(`<span>✅ <strong style={{color:C.green}}>{current}</strong> done</span>`, `<span><strong style={{color:C.green}}>{current}</strong> done</span>`);
r(`<span>❌ <strong style={{color:C.red}}>{failed}</strong> failed</span>`, `<span><strong style={{color:C.red}}>{failed}</strong> failed</span>`);
r(`<div style={{fontSize:22,marginBottom:6}}>✅</div>`, `<div style={{marginBottom:6}}><CheckCircle size={22} color={C.green}/></div>`);
r(`<span>✅ <strong style={{color:C.green}}>{prog.sent}</strong> sent</span>`, `<span><strong style={{color:C.green}}>{prog.sent}</strong> sent</span>`);
r(`<span>❌ <strong style={{color:C.red}}>{prog.failed}</strong> failed</span>`, `<span><strong style={{color:C.red}}>{prog.failed}</strong> failed</span>`);
r(`⚠️ {failed} item{failed!==1?"s":""} failed.`, `{failed} item{failed!==1?"s":""} failed.`);

// ════════════════════════════════════════════════════════
// BLOCK 21: Fee pages misc
// ════════════════════════════════════════════════════════
r(`{results.errors?"⚠️":"✅"} Generation Complete`, `Generation Complete`);
r(`{paying?"⏳ Processing…":"💳 Pay Online"}`, `{paying?"Processing…":"Pay Online"}`);
r(`🖨️ Print Invoice`, `Print Invoice`);
r(`🧾 Print Receipt`, `Print Receipt`);
r(`<span>📋</span> Transaction History`, `Transaction History`);
r(`const methodIcon=isRefund?"↩️":entry.payment_method==="paystack"?"💳":"🏦";`, `const methodIcon=isRefund?"↩":entry.payment_method==="paystack"?"card":"bank";`);
r(`<strong style={{color:C.text,fontSize:12}}>🏦 Banking Information</strong>`, `<strong style={{color:C.text,fontSize:12}}>Banking Information</strong>`);
r(`<span style={{color:"rgba(255,255,255,.85)",fontSize:12}}>✅ {clsPaid} paid</span>`, `<span style={{color:"rgba(255,255,255,.85)",fontSize:12}}>{clsPaid} paid</span>`);
r(`<span style={{color:"rgba(255,255,255,.85)",fontSize:12}}>❌ {clsUnpaid} unpaid</span>`, `<span style={{color:"rgba(255,255,255,.85)",fontSize:12}}>{clsUnpaid} unpaid</span>`);
r(`<span style={{color:C.green}}>✅{paid}</span>`, `<span style={{color:C.green}}>{paid}</span>`);
r(`<span style={{color:C.red}}>❌{unpaid}</span>`, `<span style={{color:C.red}}>{unpaid}</span>`);
r(`📬 {log.recipient_count||1}`, `{log.recipient_count||1}`);
r(`{log.status==="sent"?"✅ Sent":log.status==="failed"?"❌ Failed":"⚠️ Partial"}`, `{log.status==="sent"?"Sent":log.status==="failed"?"Failed":"Partial"}`);
r(`>🗑️\n                             `, `>Delete\n                             `);
r(`📊 Full Item Analysis →`, `Full Item Analysis →`);

// ════════════════════════════════════════════════════════
// BLOCK 22: CAE score structure
// ════════════════════════════════════════════════════════
r(`{totalOk?"✅ Valid":totalOver?"❌ Exceeds max":"⚠️ Unaccounted marks"}`, `{totalOk?"Valid":totalOver?"Exceeds max":"Unaccounted marks"}`);

// ════════════════════════════════════════════════════════
// BLOCK 23: Audit log
// ════════════════════════════════════════════════════════
r(`const actionIcon=(a)=>({status_change:"🔄",delete:"🗑️",edit:"✏️",create:"➕"}[a]||"📋");`, `const actionIcon=(a)=>({status_change:"↻",delete:"✕",edit:"✎",create:"+"}[a]||"•");`);

// ════════════════════════════════════════════════════════
// BLOCK 24: Misc text in JSX
// ════════════════════════════════════════════════════════
r(`No submissions yet — click ➕ Add Student or 📤 Bulk`, `No submissions yet — click Add Student or Bulk`);
r(`{label:"Admin",    icon:"🔐", i:"admin",`, `{label:"Admin",    i:"admin",`);
r(`{label:"Teacher",  icon:"🧑\u200D🏫", i:"nnago`, `{label:"Teacher",  i:"nnago`);
r(`{label:"Student",  icon:"🎓", i:"RGS/01",`, `{label:"Student",  i:"RGS/01",`);
r(`☝️ Download the template, fill it in, then choose the file to upload`, `Download the template, fill it in, then choose the file to upload`);
r(`📁 Choose File`, `Choose File`);
r(`🚫 You don't have permission to send emails.`, `You don't have permission to send emails.`);
r(`✉️ Send {total} Email{total!==1?"s":""}`, `Send {total} Email{total!==1?"s":""}`);
r(`>🚀 Start Sending \${total} Email\${total!==1?"s":""}`, `>Start Sending \${total} Email\${total!==1?"s":""}`);
r(`⚠️ No reference entered`, `No reference entered`);
r(`🗑️ Clear Results`, `Clear Results`);
r(`📥 Class Template`, `Class Template`);
r(`📥 Section Template`, `Section Template`);
r(`📤 Bulk Upload`, `Bulk Upload`);

// PDF viewer
r(`🖨️ Print\n`, `Print\n`);
r(`<><span style={{fontSize:15}}>📤</span>{isNative()?"Share":"Download"}</>`, `<>{isNative()?"Share":"Download"}</>`);
r(`<span style={{fontSize:14,flexShrink:0}}>💡</span>`, ``);

// ════════════════════════════════════════════════════════
// BLOCK 25: Confirm dialog cleanup
// ════════════════════════════════════════════════════════
r(`const {title, message, confirmLabel="Confirm", danger=false, typeToConfirm=null, icon="❓"} = config;`, `const {title, message, confirmLabel="Confirm", danger=false, typeToConfirm=null, icon=null} = config;`);
r(`title:\`⚠️ \${label}\`,`, `title:\`\${label}\`,`);
r(`icon:"⚠️",`, `icon:null,`);
r(`icon:"📋",confirmLabel:"Copy Bands"`, `confirmLabel:"Copy Bands"`);

// All confirm icon fields
const confirmIcons = [
  `icon:"🏷️",`, `icon:"📚",`, `icon:"🏫",`, `icon:"🧑\u200D🏫",`, `icon:"💰",`,
  `icon:"📢",`, `icon:"📑",`, `icon:"📊",`, `icon:"🧠",`, `icon:"⭐",`,
  `icon:"📅",`, `icon:"🗓️",`, `icon:"✅",`, `icon:"👤",`, `icon:"🗑️",`,
  `icon:"✍️",`, `icon:"👁️",`, `icon:"⚠️",`, `icon:"🧮",`, `icon:"⚡",`,
];
confirmIcons.forEach(ic => r(ic, ``));

// Clean up double commas from confirm icon removal
content = content.replace(/,\s*,/g, ',');
content = content.replace(/\(\s*,/g, '(');

// ════════════════════════════════════════════════════════
// BLOCK 26: Approvals status badges
// ════════════════════════════════════════════════════════
r(`{label:"Approved",count:approved.length,color:C.green,icon:"✅",val:"approved"}`, `{label:"Approved",count:approved.length,color:C.green,val:"approved"}`);
r(`{label:"Rejected",count:rejected.length,color:C.red,icon:"❌",val:"rejected"}`, `{label:"Rejected",count:rejected.length,color:C.red,val:"rejected"}`);
r(`{filter==="pending"?"⏳ Pending":filter==="approved"?"✅`, `{filter==="pending"?"Pending":filter==="approved"?"Approved"?`);

// Fix a broken ternary from the above
content = content.replace(
  `{filter==="pending"?"Pending":filter==="approved"?"Approved"?`,
  `{filter==="pending"?"Pending":filter==="approved"?"Approved":`
);

// ════════════════════════════════════════════════════════
// BLOCK 27: Dashboard StatCard icons (special handling)
// ════════════════════════════════════════════════════════
r(`icon="👥" color={C.blue}/>`, `icon={<Users size={18} color={C.blue}/>} color={C.blue}/>`);
r(`icon="🧑\u200D🏫" color={C.green}/>`, `icon={<BookUser size={18} color={C.green}/>} color={C.green}/>`);
r(`icon="🏫" color={C.orange}/>`, `icon={<School size={18} color={C.orange}/>} color={C.orange}/>`);
r(`icon="📝" color={C.purple}/>`, `icon={<FileText size={18} color={C.purple}/>} color={C.purple}/>`);
r(`icon="🏆" color={C.orange}/>`, `icon={<Award size={18} color={C.orange}/>} color={C.orange}/>`);
r(`icon="📊" color={C.green}/>`, `icon={<BarChart3 size={18} color={C.green}/>} color={C.green}/>`);
r(`icon="✅" color={C.green}/>`, `icon={<CheckCircle size={18} color={C.green}/>} color={C.green}/>`);
r(`icon="📋" color={C.blue}/>`, `icon={<ClipboardList size={18} color={C.blue}/>} color={C.blue}/>`);
r(`icon="💰" color={C.green}/>`, `icon={<DollarSign size={18} color={C.green}/>} color={C.green}/>`);
r(`icon="💰" color={C.blue}/>`, `icon={<DollarSign size={18} color={C.blue}/>} color={C.blue}/>`);
r(`icon="❌" color={C.red}/>`, `icon={<XCircle size={18} color={C.red}/>} color={C.red}/>`);
r(`icon="⚠️" color={C.red}/>`, `icon={<AlertTriangle size={18} color={C.red}/>} color={C.red}/>`);
r(`icon="🏷️" color={C.blue}/>`, `icon={<Tag size={18} color={C.blue}/>} color={C.blue}/>`);
r(`icon="📚" color={C.blue}/>`, `icon={<BookOpen size={18} color={C.blue}/>} color={C.blue}/>`);
r(`icon="📚" color={C.purple}/>`, `icon={<BookOpen size={18} color={C.purple}/>} color={C.purple}/>`);
r(`icon="🧾" color={C.blue}/>`, `icon={<ReceiptText size={18} color={C.blue}/>} color={C.blue}/>`);

// Handle remaining generic icon= with emoji
r(`icon="📊"`, `icon={<BarChart3 size={18}/>}`);
r(`icon="📌" color={C.orange`, `icon={<MapPin size={18} color={C.orange}`);
r(`icon="🔘" color={C.purp`, `icon={<Circle size={18} color={C.purp`);

// ClickStat icon props in fee stats
r(`icon="💰" color={C.blue}`, `icon={<DollarSign size={18} color={C.blue}/>} color={C.blue}`);
r(`icon="✅" color={C.green}`, `icon={<CheckCircle size={18} color={C.green}/>} color={C.green}`);
r(`icon="⚠️" color={C.red}`, `icon={<AlertTriangle size={18} color={C.red}/>} color={C.red}`);
r(`icon="❌" color={C.red}`, `icon={<XCircle size={18} color={C.red}/>} color={C.red}`);

// Fee stats item drill-down icons
r(`{label:"Students Billed",val:iTotal,color:C.blue,icon:"👥"}`, `{label:"Students Billed",val:iTotal,color:C.blue}`);
r(`{label:"Fully Paid",val:iPaid,color:C.green,icon:"✅"}`, `{label:"Fully Paid",val:iPaid,color:C.green}`);
r(`{label:"Unpaid",val:iUnpaid,color:C.red,icon:"❌"}`, `{label:"Unpaid",val:iUnpaid,color:C.red}`);
r(`{label:"Expected",val:fmt(iExpected),color:C.blue,icon:"💰"}`, `{label:"Expected",val:fmt(iExpected),color:C.blue}`);
r(`{label:"Collection Rate",val:\`\${iRate}%\`,color:iRate>=75?C.green:iRate>=50?C.amber:C.red,icon:"📊"}`, `{label:"Collection Rate",val:\`\${iRate}%\`,color:iRate>=75?C.green:iRate>=50?C.amber:C.red}`);

// ════════════════════════════════════════════════════════
// BLOCK 28: Remaining misc emoji in JSX
// ════════════════════════════════════════════════════════
// Fee tracker invoice tab bulk send
r(`>📥 Export CSV</Btn>`, `>Export CSV</Btn>`);
r(`🗑️ Delete Selected`, `Delete Selected`);
r(`✕ Clear`, `Clear`);
r(`🔄 Change Status`, `Change Status`);

// My bill misc
r(`🏷️ {d.label}`, ``); // in JSX, not template literal

// CAE empty state
r(`<div style={{fontSize:28,marginBottom:6}}>🧩</div>No components yet.`, `<div style={{marginBottom:6}}><Boxes size={28} color={C.muted}/></div>No components yet.`);

// Score structure
r(`<Btn onClick={save} color={C.orange} disabled={saving} sm>{saving?"⏳ Saving…":"💾 Save"}</Btn>`, `<Btn onClick={save} color={C.orange} disabled={saving} sm>{saving?"Saving…":"Save"}</Btn>`);

// Grading page copy from
r(`<span style={{fontSize:11,fontWeight:700,color:C.blue}}>📋 Copy from:</span>`, `<span style={{fontSize:11,fontWeight:700,color:C.blue}}>Copy from:</span>`);

// Classes detail stats StatCard
r(`<StatCard label="Students Enrolled" value={detailStudents.length} icon="👥" color={C.blue}/>`, `<StatCard label="Students Enrolled" value={detailStudents.length} icon={<Users size={18} color={C.blue}/>} color={C.blue}/>`);
r(`<StatCard label="Subjects Assigned" value={detailSubjects.length} icon="📚" color={C.purple}/>`, `<StatCard label="Subjects Assigned" value={detailSubjects.length} icon={<BookOpen size={18} color={C.purple}/>} color={C.purple}/>`);
r(`<StatCard label="Result Entries" value={totalResults} icon="📝" color={C.orange}/>`, `<StatCard label="Result Entries" value={totalResults} icon={<FileText size={18} color={C.orange}/>} color={C.orange}/>`);

// My results statcards
r(`<StatCard label="Subjects"     value={results.length}     icon="📚" color={C.blue}/>`, `<StatCard label="Subjects"     value={results.length}     icon={<BookOpen size={18} color={C.blue}/>} color={C.blue}/>`);
r(`<StatCard label="Total Score"  value={total.toFixed(0)}   icon="🏆" color={C.orange}/>`, `<StatCard label="Total Score"  value={total.toFixed(0)}   icon={<Award size={18} color={C.orange}/>} color={C.orange}/>`);
r(`<StatCard label="Average"      value={avg.toFixed(1)}     icon="📊" color={C.green}/>`, `<StatCard label="Average"      value={avg.toFixed(1)}     icon={<BarChart3 size={18} color={C.green}/>} color={C.green}/>`);

// Login page icons (feature list)
r(`icon="📊",text:`, `icon=<LayoutDashboard size={16}/>,text:`);
r(`icon="📝",text:`, `icon=<FileText size={16}/>,text:`);
r(`icon="🏦",text:`, `icon=<DollarSign size={16}/>,text:`);

// Promote button
r(`{promoting?\`⏳ Promoting \${preview.length} students…\`:\`🎓 Promote \${preview.length} Student(s): \${fromClass}`, `{promoting?\`Promoting \${preview.length} students…\`:\`Promote \${preview.length} Student(s): \${fromClass}`);

// ════════════════════════════════════════════════════════
// FINAL: Write output
// ════════════════════════════════════════════════════════
fs.writeFileSync('src/AppDemo.jsx', content, 'utf8');
console.log('Done! File written.');
