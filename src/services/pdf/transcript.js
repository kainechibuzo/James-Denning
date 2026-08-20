/**
 * Transcript PDF Builders
 *
 * buildMultiPeriodTranscriptHTML — new default, subjects as rows, periods as column groups
 * buildTranscriptHTML            — legacy flat layout
 * openTranscriptPDF              — opens in window or in-app viewer
 *
 * Extracted from AppDemo.jsx — no React dependency.
 */

import { getGrade, getRemark } from "../../utils/grades.js";
import { pdfName, openHtmlDoc } from "../pdf/capture.js";

export function buildMultiPeriodTranscriptHTML({studentName,studentId,className,sectionName,gender,dob,academicYear,subjects,classPeriods,gradingSchema,settings,today,logoBase64}){
  const schoolName=settings?.school_name||"Your Organization";
  const schoolAddr=settings?.school_address||"";
  const schoolPhone=settings?.school_phone||"";
  const logoUrl=logoBase64||settings?.portal_logo_base64||"";
  const docTitle=pdfName(studentName,"TRANSCRIPT",academicYear);

  const gradeOf=score=>{
    if(score==null||score==="")return"—";
    const n=+score;const schema=gradingSchema||[];
    if(schema.length){const g=schema.find(s=>n>=s.min_score&&n<=s.max_score);return g?.grade||"—";}
    if(n>=70)return"A";if(n>=60)return"B";if(n>=50)return"C";if(n>=45)return"D";if(n>=40)return"E";return"F";
  };
  const remarkOf=score=>{
    if(score==null||score==="")return"—";const n=+score;const schema=gradingSchema||[];
    if(schema.length){const g=schema.find(s=>n>=s.min_score&&n<=s.max_score);return g?.remark||"—";}
    if(n>=70)return"Excellent";if(n>=60)return"Very Good";if(n>=50)return"Good";if(n>=45)return"Pass";if(n>=40)return"Fair";return"Fail";
  };
  const fmt=v=>(v==null||v===""||isNaN(+v))?"—":(+v%1===0?+v:(+v).toFixed(1));

  const periodAvg=p=>{
    const vals=[p.t1,p.t2,p.t3].filter(v=>v!=null&&v!==""&&!isNaN(+v)).map(Number);
    return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
  };

  // Summary stats
  const allAvgs=subjects.flatMap(s=>classPeriods.map((_,pi)=>periodAvg(s.periods[pi]||{}))).filter(v=>v!=null);
  const overallAvg=allAvgs.length?allAvgs.reduce((a,b)=>a+b,0)/allAvgs.length:null;
  const overallGrade=overallAvg!=null?gradeOf(overallAvg):"—";
  const overallRemark=overallAvg!=null?remarkOf(overallAvg):"—";
  const passes=subjects.filter(s=>{
    const avgs=classPeriods.map((_,pi)=>periodAvg(s.periods[pi]||{})).filter(v=>v!=null);
    if(!avgs.length)return false;
    return avgs.reduce((a,b)=>a+b,0)/avgs.length>=40;
  }).length;

  // Chunk periods into groups of max 3
  const CHUNK=3;
  const chunks=[];
  for(let i=0;i<classPeriods.length;i+=CHUNK) chunks.push({periods:classPeriods.slice(i,i+CHUNK),start:i});

  const buildChunkTable=(chunk)=>{
    const cps=chunk.periods;const si=chunk.start;
    // Row 1 — Group name: navy bg, white text, underlined, left border accent between groups
    const classHdrs=cps.map((p,ci)=>`
      <th colspan="5" style="background:#1e3a5f;color:#fff;padding:8px 6px;text-align:center;
        font-size:11px;font-weight:700;border:1px solid #2a4a72;
        ${ci>0?"border-left:3px solid #6b9fd4":""};
        text-decoration:underline;text-underline-offset:4px;letter-spacing:.4px">
        ${p.class_name||"—"}
      </th>`).join("");
    // Row 2 — Performance year: slightly lighter navy, italic
    const yearHdrs=cps.map((p,ci)=>`
      <th colspan="5" style="background:#2c4f7c;color:#c8dff5;padding:6px;text-align:center;
        font-size:10px;font-weight:400;border:1px solid #3a5f8a;font-style:italic;
        ${ci>0?"border-left:3px solid #6b9fd4":""}">
        ${p.academic_year||"—"}
      </th>`).join("");
    // Row 3 — Period headers: medium blue, term cols lighter; avg/grade cols darker with gold text
    const termHdrs=cps.map((_,ci)=>`
      <th style="background:#3b6fa8;color:#e8f2fc;padding:6px 4px;text-align:center;font-size:8.5px;font-weight:700;border:1px solid #4a7dba;min-width:52px;${ci>0?"border-left:3px solid #6b9fd4":""}">1st<br/>Period</th>
      <th style="background:#3b6fa8;color:#e8f2fc;padding:6px 4px;text-align:center;font-size:8.5px;font-weight:700;border:1px solid #4a7dba;min-width:52px">2nd<br/>Period</th>
      <th style="background:#3b6fa8;color:#e8f2fc;padding:6px 4px;text-align:center;font-size:8.5px;font-weight:700;border:1px solid #4a7dba;min-width:52px">3rd<br/>Period</th>
      <th style="background:#1e3a5f;color:#f0c040;padding:6px 4px;text-align:center;font-size:8.5px;font-weight:700;border:1px solid #2a4a72;min-width:46px">AVG</th>
      <th style="background:#1e3a5f;color:#f0c040;padding:6px 4px;text-align:center;font-size:8.5px;font-weight:700;border:1px solid #2a4a72;min-width:38px">GRD</th>`
    ).join("");
    const rows=subjects.map((s,i)=>{
      const bg=i%2===0?"#ffffff":"#f4f7fb";
      const cells=cps.map((_,ci)=>{
        const pi=si+ci;const p=s.periods[pi]||{t1:null,t2:null,t3:null};
        const avg=periodAvg(p);
        const borderL=ci>0?"border-left:3px solid #b8d0ea":"";
        return `
<td style="padding:6px 5px;border:1px solid #d4e2f0;${borderL};text-align:center;font-size:10.5px;color:#333">${fmt(p.t1)}</td>
<td style="padding:6px 5px;border:1px solid #d4e2f0;text-align:center;font-size:10.5px;color:#333">${fmt(p.t2)}</td>
<td style="padding:6px 5px;border:1px solid #d4e2f0;text-align:center;font-size:10.5px;color:#333">${fmt(p.t3)}</td>
<td style="padding:6px 5px;border:1px solid #d4e2f0;background:#e8f0f8;text-align:center;font-size:10.5px;font-weight:700;color:#1e3a5f">${avg!=null?avg.toFixed(1):"—"}</td>
<td style="padding:6px 5px;border:1px solid #d4e2f0;background:#e8f0f8;text-align:center;font-size:10.5px;font-weight:700;color:#1e3a5f">${avg!=null?gradeOf(avg):"—"}</td>`;
      }).join("");
      return `<tr style="background:${bg}">
<td style="padding:6px 10px;border:1px solid #d4e2f0;font-size:10.5px;font-weight:600;color:#111;text-transform:uppercase;letter-spacing:.2px">${s.name||""}</td>
${cells}
</tr>`;
    }).join("");
    return `
<table style="width:100%;border-collapse:collapse;border:2px solid #1e3a5f">
<thead>
<tr>
  <th rowspan="3" style="background:#1e3a5f;color:#fff;padding:8px 10px;text-align:left;min-width:140px;border:1px solid #2a4a72;font-size:9.5px;font-weight:700;vertical-align:bottom;letter-spacing:.5px;text-transform:uppercase">Category</th>
  ${classHdrs}
</tr>
<tr>${yearHdrs}</tr>
<tr>${termHdrs}</tr>
</thead>
<tbody>${rows}</tbody>
</table>`;
  };

  const allTables=chunks.map((chunk,ci)=>`
<div class="chunk" style="margin-bottom:${ci<chunks.length-1?22:0}px">
  ${ci>0?`<div style="margin:8px 0 6px;padding:5px 12px;background:#eef4fb;border-left:3px solid #3b6fa8;font-size:8.5px;color:#3b6fa8;font-weight:700;letter-spacing:.5px;text-transform:uppercase">
    ↓ Continued — Group Periods ${chunk.start+1}–${chunk.start+chunk.periods.length}
  </div>`:""}
  ${buildChunkTable(chunk)}
</div>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${docTitle}</title>
<script>document.title=${JSON.stringify(docTitle)}</script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#dce4ed}
body{font-family:Georgia,"Times New Roman",serif;color:#111;font-size:11px;padding:24px}
.page{background:#fff;max-width:1060px;margin:0 auto;padding:26px 30px 30px;border:1px solid #b0bec5;position:relative;box-shadow:0 2px 12px rgba(0,0,0,.1)}
/* Faint diagonal watermark */
.watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-38deg);font-size:110px;font-weight:900;color:rgba(30,58,95,.04);pointer-events:none;white-space:nowrap;letter-spacing:18px;z-index:0;font-family:Georgia,serif}
/* Header */
.hdr{display:flex;align-items:center;gap:16px;border-bottom:3px solid #1e3a5f;padding-bottom:14px;margin-bottom:14px}
.logo-wrap{width:68px;height:68px;border-radius:50%;border:2px solid #b0bec5;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;background:#f0f4f8}
.logo-wrap img{width:64px;height:64px;object-fit:contain}
.logo-init{font-size:14px;font-weight:900;color:#1e3a5f;text-align:center;line-height:1.1}
.school-info{flex:1;text-align:center}
.school-name{font-size:18px;font-weight:900;letter-spacing:.6px;text-transform:uppercase;color:#1e3a5f}
.school-sub{font-size:9px;color:#6b7e8f;margin:3px 0}
.doc-badge{display:inline-block;margin-top:6px;padding:3px 16px;border:1px solid #1e3a5f;font-size:9.5px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#1e3a5f}
.hdr-date{text-align:right;font-size:9px;color:#6b7e8f;min-width:90px;flex-shrink:0;white-space:nowrap}
/* Member info band */
.student-band{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;border:1px solid #b8ccd8;margin-bottom:16px;background:#f4f8fb}
.si-cell{padding:8px 12px;border-right:1px solid #ccdbe6}
.si-cell:last-child{border-right:none}
.si-lbl{font-size:7.5px;color:#6b7e8f;text-transform:uppercase;font-weight:700;letter-spacing:.6px;margin-bottom:3px}
.si-val{font-size:11.5px;font-weight:700;color:#1e3a5f}
/* Section heading */
.sec-hd{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1e3a5f;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #b8ccd8}
.chunk{page-break-inside:avoid}
/* Summary cards */
.summary{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin:18px 0}
.sc{border:1px solid #b8ccd8;padding:8px 6px;text-align:center;background:#f4f8fb}
.sc.accent{background:#1e3a5f;border-color:#1e3a5f}
.sc-val{font-size:17px;font-weight:900;color:#1e3a5f;line-height:1}
.sc.accent .sc-val{color:#f0c040}
.sc-lbl{font-size:7.5px;color:#6b7e8f;text-transform:uppercase;letter-spacing:.5px;margin-top:4px}
.sc.accent .sc-lbl{color:#9bb8d4}
/* Footer */
.footer{border-top:2px solid #1e3a5f;padding-top:16px;display:grid;grid-template-columns:1fr auto 1fr;gap:20px;align-items:end}
.sig{text-align:center}
.sig-sp{height:34px}
.sig-ln{border-top:1px solid #555;padding-top:5px;font-size:8.5px;color:#555}
.stamp{text-align:center;font-size:8px;color:#9bb8d4;line-height:1.6}
.stamp-c{width:86px;height:86px;border-radius:50%;border:1.5px dashed #b8ccd8;margin:0 auto 6px;display:flex;align-items:center;justify-content:center}
.no-print{position:fixed;top:16px;right:16px;z-index:9999;display:flex;gap:8px;font-family:system-ui,sans-serif}
.hint-bar{position:fixed;bottom:0;left:0;right:0;z-index:9998;background:rgba(30,58,95,.93);color:#D1D5DB;font-size:11.5px;padding:8px 18px;text-align:center;font-family:system-ui,sans-serif}
@media print{
  @page{size:A4 landscape;margin:10mm}
  html,body{background:#fff;padding:0}
  .page{border:none;max-width:100%;padding:0;box-shadow:none}
  .no-print,.hint-bar{display:none!important}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style>
</head>
<body>

<div class="no-print">
  <button onclick="document.querySelectorAll('.no-print,.hint-bar').forEach(function(e){e.style.display='none'});window.print();document.querySelectorAll('.no-print').forEach(function(e){e.style.display='flex'});document.querySelectorAll('.hint-bar').forEach(function(e){e.style.display='block'})"
    style="padding:10px 24px;background:#111827;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2)">
    🖨️ Print / Save PDF
  </button>
  <button onclick="window.close()"
    style="padding:10px 16px;background:#fff;color:#64748b;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;cursor:pointer">
    ✕ Close
  </button>
</div>
<div class="hint-bar">
  💡 Click <b>Print / Save PDF</b> → choose <b>Save as PDF</b>, Orientation: <b>Landscape</b>, Margins: <b>None</b>
</div>

<div class="page">
  <div class="watermark">OFFICIAL</div>

  <!-- Header -->
  <div class="hdr">
    <div class="logo-wrap">
      ${logoUrl
        ?`<img src="${logoUrl}" alt="Logo"/>`
        :`<div class="logo-init">${schoolName.split(" ").map(w=>w[0]).join("").slice(0,3)}</div>`}
    </div>
    <div class="school-info">
      <div class="school-name">${schoolName}</div>
      ${schoolAddr||schoolPhone?`<div class="school-sub">${schoolAddr}${schoolPhone?" &nbsp;|&nbsp; Tel: "+schoolPhone:""}</div>`:""}
      <div class="doc-badge">Official Performance History</div>
    </div>
    <div class="hdr-date">Generated on<br/><strong>${today}</strong></div>
  </div>

  <!-- Member info -->
  <div class="student-band">
    <div class="si-cell">
      <div class="si-lbl">Full Name</div>
      <div class="si-val" style="font-size:12.5px">${studentName}</div>
    </div>
    <div class="si-cell">
      <div class="si-lbl">Member ID / Adm. No.</div>
      <div class="si-val">${studentId||"—"}</div>
    </div>
    <div class="si-cell">
      <div class="si-lbl">Gender &amp; Date of Birth</div>
      <div class="si-val">${gender||"—"}${dob?" · "+dob:""}</div>
    </div>
    <div class="si-cell">
      <div class="si-lbl">Current Group / Section</div>
      <div class="si-val">${className||"—"}${sectionName?" · "+sectionName:""}</div>
    </div>
  </div>

  <!-- Tables -->
  <div class="sec-hd">Performance Record</div>
  ${allTables}

  <!-- Summary -->
  <div class="summary">
    <div class="sc"><div class="sc-val">${subjects.length}</div><div class="sc-lbl">Categories Taken</div></div>
    <div class="sc"><div class="sc-val">${passes}</div><div class="sc-lbl">Passed</div></div>
    <div class="sc"><div class="sc-val">${subjects.length-passes}</div><div class="sc-lbl">Failed</div></div>
    <div class="sc"><div class="sc-val">${classPeriods.length}</div><div class="sc-lbl">Group Periods</div></div>
    <div class="sc accent"><div class="sc-val">${overallAvg!=null?overallAvg.toFixed(1)+"%":"—"}</div><div class="sc-lbl">Overall Average</div></div>
    <div class="sc accent"><div class="sc-val">${overallGrade}</div><div class="sc-lbl">Overall Grade</div></div>
    <div class="sc accent"><div class="sc-val" style="font-size:12px;padding-top:3px">${overallRemark}</div><div class="sc-lbl">Remark</div></div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="sig"><div class="sig-sp"></div><div class="sig-ln">Group Staff — Signature &amp; Date</div></div>
    <div class="stamp">
      <div class="stamp-c"><span style="font-size:7.5px;color:#c0cfda;font-weight:700;letter-spacing:1px;text-transform:uppercase">STAMP</span></div>
      <div>Official document of <strong style="color:#1e3a5f">${schoolName}</strong>.<br/>Any alteration renders it invalid.</div>
    </div>
    <div class="sig"><div class="sig-sp"></div><div class="sig-ln">Principal / Head Staff — Signature &amp; Date</div></div>
  </div>

</div><!-- /page -->
</body></html>`;
}

export function buildTranscriptHTML({studentName,studentId,className,sectionName,gender,dob,academicYear,subjects,gradingSchema,settings,today,columns=null,structureName=null,logoBase64}){
  // subjects: [{name, scores: {[colName]: value}}]
  // columns: string[] | null — if null uses legacy 9-col (T1 CA/Exam/Total × 3)
  const schoolName=settings?.school_name||"Your Organization";
  const schoolAddr=settings?.school_address||"No. 1 Business Avenue, Abuja, FCT";
  const schoolPhone=settings?.school_phone||"";
  const logoUrl=logoBase64||settings?.portal_logo_base64||"";

  const gradeOf=score=>{
    if(score==null||score==="")return"—";
    const n=+score;
    const schema=gradingSchema||[];
    if(schema.length){const g=schema.find(s=>n>=s.min_score&&n<=s.max_score);return g?.grade||"—";}
    if(n>=70)return"A";if(n>=60)return"B";if(n>=50)return"C";if(n>=45)return"D";if(n>=40)return"E";return"F";
  };
  const remarkOf=score=>{
    if(score==null||score==="")return"—";
    const n=+score;
    const schema=gradingSchema||[];
    if(schema.length){const g=schema.find(s=>n>=s.min_score&&n<=s.max_score);return g?.remark||"—";}
    if(n>=70)return"Excellent";if(n>=60)return"Very Good";if(n>=50)return"Good";if(n>=45)return"Pass";if(n>=40)return"Fair";return"Fail";
  };
  const displayScore=v=>(v==null||v===""||isNaN(+v))?"—":Math.round(+v*10)/10;

  // Determine columns and per-subject totals
  const isCustom=!!(columns&&columns.length>0);
  // For custom structure: the last column whose name contains "total" (case-insensitive) is the total col;
  // if none found, use the last column.
  const totalColName=isCustom
    ?(columns.find(c=>/total/i.test(c))||columns[columns.length-1])
    :null;

  const getAnn=(s)=>{
    if(isCustom){
      // Use the value of the total column as the "score" for grading
      const sc=s.scores||{};
      if(totalColName!=null){const v=sc[totalColName];return(v===""||v==null)?null:+v;}
      const vals=Object.values(sc).filter(v=>v!==""&&v!=null).map(Number).filter(n=>!isNaN(n));
      return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
    }
    const sc=s.scores||{};
    const totals=["T1 Total","T2 Total","T3 Total"].map(k=>sc[k]).filter(v=>v!=null&&v!=="").map(Number);
    return totals.length?totals.reduce((a,b)=>a+b,0)/totals.length:null;
  };

  const rows=subjects.map((s,i)=>{
    const ann=getAnn(s);
    const grade=gradeOf(ann);
    const remark=remarkOf(ann);
    const bg=i%2===0?"#f8fafc":"#ffffff";
    const sc=s.scores||{};
    const scoreCells=isCustom
      ?columns.map(col=>`<td style="padding:6px;border:1px solid #e2e8f0;text-align:center;font-size:10px;${col===totalColName?"font-weight:700":"color:#64748b"}">${displayScore(sc[col])}</td>`).join("")
      :[["T1 CA","T1 Exam","T1 Total"],["T2 CA","T2 Exam","T2 Total"],["T3 CA","T3 Exam","T3 Total"]].flatMap((grp,gi)=>
        grp.map((col,fi)=>`<td style="padding:6px;border:1px solid #e2e8f0;text-align:center;font-size:10px;${fi===2?"font-weight:700":"color:#64748b"}">${displayScore(sc[col])}</td>`)
      ).join("");
    return `<tr style="background:${bg}">
      <td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:10px;font-weight:600">${s.name||s.subject_name||""}</td>
      ${scoreCells}
      <td style="padding:6px;border:1px solid #e2e8f0;text-align:center;font-size:10px;font-weight:800;color:#030712">${ann!=null?ann.toFixed(1):"—"}</td>
      <td style="padding:6px;border:1px solid #e2e8f0;text-align:center;font-size:10px;font-weight:800;color:${grade==="A"?"#15803d":grade==="B"?"#1d4ed8":grade==="F"?"#b91c1c":"#92400e"}">${grade}</td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:10px;color:#374151">${remark}</td>
    </tr>`;
  }).join("");

  const allAnns=subjects.map(getAnn).filter(v=>v!=null);
  const overallAvg=allAnns.length?allAnns.reduce((a,b)=>a+b,0)/allAnns.length:null;
  const passes=subjects.filter(s=>{ const a=getAnn(s); return a!=null&&a>=40; }).length;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>${pdfName(studentName,"TRANSCRIPT",academicYear)}</title>
<script>document.title=${JSON.stringify(pdfName(studentName,"TRANSCRIPT",academicYear))}</script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:"Times New Roman",serif;background:#fff;color:#111;padding:28px 32px;font-size:11px}
  @media print{@page{size:A4 landscape;margin:12mm}body{padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  .header{display:flex;align-items:center;gap:16px;border-bottom:3px double #030712;padding-bottom:14px;margin-bottom:14px}
  .logo{width:64px;height:64px;flex-shrink:0;object-fit:contain}
  .logo-placeholder{width:64px;height:64px;border-radius:50%;background:#030712;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:900;text-align:center;flex-shrink:0}
  .school-info{flex:1;text-align:center}
  .school-name{font-size:20px;font-weight:900;color:#030712;letter-spacing:.3px}
  .school-addr{font-size:10px;color:#555;margin:2px 0}
  .doc-title{font-size:13px;font-weight:900;color:#b91c1c;text-transform:uppercase;letter-spacing:2px;margin-top:5px;border-top:1px solid #ddd;padding-top:5px}
  .info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border:1px solid #d1d5db;border-radius:4px;margin-bottom:14px;overflow:hidden;font-size:10.5px}
  .info-cell{padding:6px 10px;border-right:1px solid #d1d5db;border-bottom:1px solid #d1d5db}
  .info-cell:last-child{border-right:none}
  .info-label{font-size:9px;color:#6b7280;text-transform:uppercase;font-weight:700;letter-spacing:.5px;margin-bottom:2px}
  .info-val{font-weight:700;color:#111}
  table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:14px}
  thead tr{background:#030712;color:#fff}
  th{padding:7px 6px;text-align:center;font-size:9px;font-weight:700;letter-spacing:.3px;border:1px solid #1e40af}
  th.subj-col{text-align:left}
  .group-hdr{background:#1e3a8a;color:#D1D5DB;font-size:9px;font-weight:700;padding:4px 6px;text-align:center;letter-spacing:.5px;border:1px solid #1e40af}
  .summary{display:flex;gap:12px;margin-bottom:18px;flex-wrap:wrap}
  .sum-box{border:1px solid #d1d5db;border-radius:6px;padding:8px 14px;text-align:center;min-width:100px}
  .sum-val{font-size:18px;font-weight:900;color:#030712}
  .sum-lbl{font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
  .footer{border-top:2px solid #030712;padding-top:14px;margin-top:8px;display:flex;justify-content:space-between;align-items:flex-end}
  .sig-box{text-align:center;min-width:140px}
  .sig-line{border-top:1px solid #333;margin-top:28px;padding-top:4px;font-size:9px;color:#374151}
  .watermark{font-size:9px;color:#9ca3af;text-align:center;margin-top:8px;font-style:italic}
</style></head><body>
  <div class="header">
    ${logoUrl?`<img src="${logoUrl}" class="logo" alt="Logo"/>`:`<div class="logo-placeholder">${schoolName.split(" ").map(w=>w[0]).join("").slice(0,3)}</div>`}
    <div class="school-info">
      <div class="school-name">${schoolName.toUpperCase()}</div>
      <div class="school-addr">${schoolAddr}${schoolPhone?" · Tel: "+schoolPhone:""}</div>
      <div class="doc-title">Official Performance History</div>
    </div>
    <div style="text-align:right;font-size:9px;color:#6b7280;min-width:90px">Generated:<br/><strong>${today}</strong></div>
  </div>

  <div class="info-grid">
    <div class="info-cell"><div class="info-label">Member Name</div><div class="info-val">${studentName}</div></div>
    <div class="info-cell"><div class="info-label">Member ID / Admission No.</div><div class="info-val">${studentId||"—"}</div></div>
    <div class="info-cell"><div class="info-label">Performance Year</div><div class="info-val">${academicYear}</div></div>
    <div class="info-cell"><div class="info-label">Group</div><div class="info-val">${className||"—"}</div></div>
    <div class="info-cell"><div class="info-label">Section / Department</div><div class="info-val">${sectionName||"—"}</div></div>
    <div class="info-cell" style="border-right:none"><div class="info-label">Gender</div><div class="info-val">${gender||"—"}${dob?` · DOB: ${dob}`:""}</div></div>
  </div>

  <table>
    <thead>
      ${isCustom
        ?`<tr>
          <th class="subj-col" style="min-width:130px">Category${structureName?` <span style="font-weight:400;font-size:8px;opacity:.8">(${structureName})</span>`:"" }</th>
          ${columns.map(col=>`<th style="min-width:52px">${col}</th>`).join("")}
          <th style="min-width:50px">Score</th>
          <th>Grade</th>
          <th style="min-width:70px">Remark</th>
        </tr>`
        :`<tr>
          <th class="subj-col" rowspan="2" style="min-width:130px">Category</th>
          <th class="group-hdr" colspan="3">First Period</th>
          <th class="group-hdr" colspan="3">Second Period</th>
          <th class="group-hdr" colspan="3">Third Period</th>
          <th rowspan="2" style="min-width:50px">Annual Avg</th>
          <th rowspan="2">Grade</th>
          <th rowspan="2" style="min-width:70px">Remark</th>
        </tr>
        <tr>
          <th>CA</th><th>Exam</th><th>Total</th>
          <th>CA</th><th>Exam</th><th>Total</th>
          <th>CA</th><th>Exam</th><th>Total</th>
        </tr>`
      }
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="summary">
    <div class="sum-box"><div class="sum-val">${subjects.length}</div><div class="sum-lbl">Categories Taken</div></div>
    <div class="sum-box"><div class="sum-val">${passes}</div><div class="sum-lbl">Categories Passed</div></div>
    <div class="sum-box"><div class="sum-val">${subjects.length-passes}</div><div class="sum-lbl">Categories Failed</div></div>
    <div class="sum-box"><div class="sum-val" style="color:${overallAvg!=null&&overallAvg>=50?"#15803d":"#b91c1c"}">${overallAvg!=null?overallAvg.toFixed(1)+"%" :"—"}</div><div class="sum-lbl">Overall Average</div></div>
    <div class="sum-box"><div class="sum-val">${overallAvg!=null?gradeOf(overallAvg):"—"}</div><div class="sum-lbl">Overall Grade</div></div>
  </div>

  <div class="footer">
    <div class="sig-box"><div class="sig-line">Group Staff's Signature</div></div>
    <div class="watermark">This is an official document of ${schoolName}.<br/>Any alteration renders it invalid.</div>
    <div class="sig-box"><div class="sig-line">Head Staff / Principal</div></div>
  </div>
</body></html>`;
}

/**
 * buildMultiSessionTranscriptHTML
 * Generates one A4 page per session, each with the full CA / Exam / Total breakdown.
 * sessions: [{academicYear, subjects:[{name, scores:{"T1 CA":…,"T1 Exam":…,"T1 Total":…,…}}]}]
 */
export function buildMultiSessionTranscriptHTML({studentName,studentId,className,sectionName,gender,dob,sessions,gradingSchema,settings,today,logoBase64}){
  const schoolName=settings?.school_name||"Your Organization";
  const schoolAddr=settings?.school_address||"";
  const schoolPhone=settings?.school_phone||"";
  const logoUrl=logoBase64||settings?.portal_logo_base64||"";
  const totalSessions=sessions.length;

  const gradeOf=score=>{
    if(score==null||score==="")return"—";
    const n=+score;const schema=gradingSchema||[];
    if(schema.length){const g=schema.find(s=>n>=s.min_score&&n<=s.max_score);return g?.grade||"—";}
    if(n>=70)return"A";if(n>=60)return"B";if(n>=50)return"C";if(n>=45)return"D";if(n>=40)return"E";return"F";
  };
  const remarkOf=score=>{
    if(score==null||score==="")return"—";const n=+score;const schema=gradingSchema||[];
    if(schema.length){const g=schema.find(s=>n>=s.min_score&&n<=s.max_score);return g?.remark||"—";}
    if(n>=70)return"Excellent";if(n>=60)return"Very Good";if(n>=50)return"Good";if(n>=45)return"Pass";if(n>=40)return"Fair";return"Fail";
  };
  const ds=v=>(v==null||v===""||isNaN(+v))?"—":Math.round(+v*10)/10;

  const logoHtml=logoUrl
    ?`<img src="${logoUrl}" style="width:52px;height:52px;object-fit:contain" alt="Logo"/>`
    :`<div style="width:52px;height:52px;border-radius:50%;background:#030712;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:900;text-align:center;flex-shrink:0">${schoolName.split(" ").map(w=>w[0]).join("").slice(0,3)}</div>`;

  const buildPage=(sess,pageIndex)=>{
    const{academicYear,subjects}=sess;
    // Per-session class/section — a student may sit in a different class each year,
    // so each page shows the class they were actually in that session. Falls back to
    // the top-level value for older callers that don't supply per-session data.
    const pageClassName=sess.className||className;
    const pageSectionName=sess.sectionName||sectionName;
    const getAnn=s=>{
      const sc=s.scores||{};
      const totals=["T1 Total","T2 Total","T3 Total"].map(k=>sc[k]).filter(v=>v!=null&&v!=="").map(Number);
      return totals.length?totals.reduce((a,b)=>a+b,0)/totals.length:null;
    };
    const allAnns=subjects.map(getAnn).filter(v=>v!=null);
    const overallAvg=allAnns.length?allAnns.reduce((a,b)=>a+b,0)/allAnns.length:null;
    const passes=subjects.filter(s=>{const a=getAnn(s);return a!=null&&a>=40;}).length;

    const rows=subjects.map((s,i)=>{
      const ann=getAnn(s);
      const grade=gradeOf(ann);
      const remark=remarkOf(ann);
      const bg=i%2===0?"#f8fafc":"#ffffff";
      const sc=s.scores||{};
      const scoreCells=[["T1 CA","T1 Exam","T1 Total"],["T2 CA","T2 Exam","T2 Total"],["T3 CA","T3 Exam","T3 Total"]]
        .flatMap((grp,gi)=>grp.map((col,fi)=>
          `<td style="padding:3px 4px;border:1px solid #e2e8f0;text-align:center;font-size:8.5px;${fi===2?"font-weight:700;color:#111":"color:#64748b"};${fi===0&&gi>0?"border-left:2px solid #c7d9f0":""}">${ds(sc[col])}</td>`
        )).join("");
      return `<tr style="background:${bg}">
        <td style="padding:3px 6px;border:1px solid #e2e8f0;font-size:8.5px;font-weight:600;color:#111">${s.name||""}</td>
        ${scoreCells}
        <td style="padding:3px 4px;border:1px solid #e2e8f0;text-align:center;font-size:8.5px;font-weight:800;color:#030712">${ann!=null?ann.toFixed(1):"—"}</td>
        <td style="padding:3px 4px;border:1px solid #e2e8f0;text-align:center;font-size:8.5px;font-weight:800;color:${gradeOf(ann)==="A"?"#15803d":gradeOf(ann)==="F"?"#b91c1c":"#1d4ed8"}">${grade}</td>
        <td style="padding:3px 6px;border:1px solid #e2e8f0;font-size:8.5px;color:#374151">${remark}</td>
      </tr>`;
    }).join("");

    const pageBreak=pageIndex>0?`<div style="page-break-before:always"></div>`:"";

    return `${pageBreak}
<div style="padding:14px 22px;font-family:'Times New Roman',serif;color:#111;font-size:9px;box-sizing:border-box">

  ${totalSessions>1?`<div style="background:#030712;color:#fff;font-size:8px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;padding:3px 10px;display:inline-block;border-radius:3px;margin-bottom:6px">Cycle ${pageIndex+1} of ${totalSessions}</div>`:""}

  <!-- Header -->
  <div style="display:flex;align-items:center;gap:12px;border-bottom:2px double #030712;padding-bottom:8px;margin-bottom:8px">
    ${logoHtml}
    <div style="flex:1;text-align:center">
      <div style="font-size:17px;font-weight:900;color:#030712;letter-spacing:.3px">${schoolName.toUpperCase()}</div>
      ${schoolAddr||schoolPhone?`<div style="font-size:8.5px;color:#555;margin:1px 0">${schoolAddr}${schoolPhone?" · Tel: "+schoolPhone:""}</div>`:""}
      <div style="font-size:10px;font-weight:900;color:#b91c1c;text-transform:uppercase;letter-spacing:2px;margin-top:3px;border-top:1px solid #ddd;padding-top:3px">Official Performance History</div>
    </div>
    <div style="text-align:right;font-size:8px;color:#6b7280;min-width:80px">Generated:<br/><strong>${today}</strong></div>
  </div>

  <!-- Member info -->
  <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr;gap:0;border:1px solid #d1d5db;border-radius:3px;margin-bottom:8px;overflow:hidden">
    <div style="padding:4px 8px;border-right:1px solid #d1d5db">
      <div style="font-size:7px;color:#6b7280;text-transform:uppercase;font-weight:700;letter-spacing:.4px">Member Name</div>
      <div style="font-weight:700;color:#111;font-size:10.5px">${studentName}</div>
    </div>
    <div style="padding:4px 8px;border-right:1px solid #d1d5db">
      <div style="font-size:7px;color:#6b7280;text-transform:uppercase;font-weight:700;letter-spacing:.4px">Member ID</div>
      <div style="font-weight:700;color:#111">${studentId||"—"}</div>
    </div>
    <div style="padding:4px 8px;border-right:1px solid #d1d5db;background:#f0f4f8">
      <div style="font-size:7px;color:#6b7280;text-transform:uppercase;font-weight:700;letter-spacing:.4px">Performance Year</div>
      <div style="font-weight:900;color:#030712;font-size:10px">${academicYear}</div>
    </div>
    <div style="padding:4px 8px;border-right:1px solid #d1d5db">
      <div style="font-size:7px;color:#6b7280;text-transform:uppercase;font-weight:700;letter-spacing:.4px">Group</div>
      <div style="font-weight:700;color:#111">${pageClassName||"—"}</div>
    </div>
    <div style="padding:4px 8px;border-right:1px solid #d1d5db">
      <div style="font-size:7px;color:#6b7280;text-transform:uppercase;font-weight:700;letter-spacing:.4px">Section</div>
      <div style="font-weight:700;color:#111">${pageSectionName||"—"}</div>
    </div>
    <div style="padding:4px 8px">
      <div style="font-size:7px;color:#6b7280;text-transform:uppercase;font-weight:700;letter-spacing:.4px">Gender</div>
      <div style="font-weight:700;color:#111">${gender||"—"}</div>
    </div>
  </div>

  <!-- Category table -->
  <table style="width:100%;border-collapse:collapse;font-size:8.5px;margin-bottom:8px">
    <thead>
      <tr style="background:#030712;color:#fff">
        <th style="padding:5px 7px;text-align:left;font-size:8px;font-weight:700;border:1px solid #1e40af;min-width:120px" rowspan="2">Category</th>
        <th style="padding:4px;text-align:center;font-size:8px;font-weight:700;border:1px solid #1e40af" colspan="3">First Period</th>
        <th style="padding:4px;text-align:center;font-size:8px;font-weight:700;border:1px solid #1e40af;border-left:2px solid #6b9fd4" colspan="3">Second Period</th>
        <th style="padding:4px;text-align:center;font-size:8px;font-weight:700;border:1px solid #1e40af;border-left:2px solid #6b9fd4" colspan="3">Third Period</th>
        <th style="padding:5px 4px;text-align:center;font-size:8px;font-weight:700;border:1px solid #1e40af;min-width:44px" rowspan="2">Avg</th>
        <th style="padding:5px 4px;text-align:center;font-size:8px;font-weight:700;border:1px solid #1e40af;min-width:34px" rowspan="2">Grade</th>
        <th style="padding:5px 4px;text-align:center;font-size:8px;font-weight:700;border:1px solid #1e40af;min-width:60px" rowspan="2">Remark</th>
      </tr>
      <tr style="background:#1e3a8a;color:#D1D5DB">
        <th style="padding:3px 4px;text-align:center;font-size:7.5px;border:1px solid #1e40af">CA</th>
        <th style="padding:3px 4px;text-align:center;font-size:7.5px;border:1px solid #1e40af">Exam</th>
        <th style="padding:3px 4px;text-align:center;font-size:7.5px;font-weight:700;border:1px solid #1e40af">Total</th>
        <th style="padding:3px 4px;text-align:center;font-size:7.5px;border:1px solid #1e40af;border-left:2px solid #6b9fd4">CA</th>
        <th style="padding:3px 4px;text-align:center;font-size:7.5px;border:1px solid #1e40af">Exam</th>
        <th style="padding:3px 4px;text-align:center;font-size:7.5px;font-weight:700;border:1px solid #1e40af">Total</th>
        <th style="padding:3px 4px;text-align:center;font-size:7.5px;border:1px solid #1e40af;border-left:2px solid #6b9fd4">CA</th>
        <th style="padding:3px 4px;text-align:center;font-size:7.5px;border:1px solid #1e40af">Exam</th>
        <th style="padding:3px 4px;text-align:center;font-size:7.5px;font-weight:700;border:1px solid #1e40af">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <!-- Summary strip -->
  <div style="display:flex;gap:6px;margin-bottom:10px;align-items:stretch">
    <div style="border:1px solid #d1d5db;border-radius:4px;padding:4px 10px;text-align:center;flex:1">
      <div style="font-size:14px;font-weight:900;color:#030712">${subjects.length}</div>
      <div style="font-size:7px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px">Categories Taken</div>
    </div>
    <div style="border:1px solid #d1d5db;border-radius:4px;padding:4px 10px;text-align:center;flex:1">
      <div style="font-size:14px;font-weight:900;color:#15803d">${passes}</div>
      <div style="font-size:7px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px">Passed</div>
    </div>
    <div style="border:1px solid #d1d5db;border-radius:4px;padding:4px 10px;text-align:center;flex:1">
      <div style="font-size:14px;font-weight:900;color:#b91c1c">${subjects.length-passes}</div>
      <div style="font-size:7px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px">Failed</div>
    </div>
    <div style="border:1px solid #d1d5db;border-radius:4px;padding:4px 10px;text-align:center;flex:1">
      <div style="font-size:14px;font-weight:900;color:${overallAvg!=null&&overallAvg>=50?"#15803d":"#b91c1c"}">${overallAvg!=null?overallAvg.toFixed(1)+"%":"—"}</div>
      <div style="font-size:7px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px">Overall Average</div>
    </div>
    <div style="border:1px solid #d1d5db;border-radius:4px;padding:4px 10px;text-align:center;flex:1">
      <div style="font-size:14px;font-weight:900;color:#030712">${overallAvg!=null?gradeOf(overallAvg):"—"}</div>
      <div style="font-size:7px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px">Grade</div>
    </div>
    <div style="border:1px solid #d1d5db;border-radius:4px;padding:4px 10px;text-align:center;flex:2">
      <div style="font-size:11px;font-weight:900;color:#030712;padding-top:2px">${overallAvg!=null?remarkOf(overallAvg):"—"}</div>
      <div style="font-size:7px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px">Remark</div>
    </div>
  </div>

  <!-- Footer -->
  <div style="border-top:1.5px solid #030712;padding-top:8px;display:flex;justify-content:space-between;align-items:flex-end">
    <div style="text-align:center;min-width:130px">
      <div style="height:22px"></div>
      <div style="border-top:1px solid #333;padding-top:3px;font-size:8px;color:#374151">Group Staff's Signature &amp; Date</div>
    </div>
    <div style="text-align:center;font-size:8px;color:#9ca3af;line-height:1.5">
      <div style="width:60px;height:60px;border-radius:50%;border:1.5px dashed #d1d5db;margin:0 auto 4px;display:flex;align-items:center;justify-content:center">
        <span style="font-size:6.5px;color:#cbd5e1;font-weight:700;letter-spacing:.6px;text-transform:uppercase">STAMP</span>
      </div>
      Official document of <strong style="color:#030712">${schoolName}</strong>. Any alteration renders it invalid.
    </div>
    <div style="text-align:center;min-width:130px">
      <div style="height:22px"></div>
      <div style="border-top:1px solid #333;padding-top:3px;font-size:8px;color:#374151">Principal / Head Staff &amp; Date</div>
    </div>
  </div>

</div>`;
  };

  const allPages=sessions.map((sess,i)=>buildPage(sess,i)).join("\n");
  const docTitle=pdfName(studentName,"TRANSCRIPT",sessions.map(s=>s.academicYear).join("-"));

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"/>
<title>${docTitle}</title>
<script>document.title=${JSON.stringify(docTitle)}</script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{background:#dce4ed;font-family:"Times New Roman",serif}
  @media print{
    @page{size:A4 landscape;margin:10mm}
    html,body{background:#fff;padding:0}
    .no-print,.hint-bar{display:none!important}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  }
  .no-print{position:fixed;top:16px;right:16px;z-index:9999;display:flex;gap:8px;font-family:system-ui,sans-serif}
  .hint-bar{position:fixed;bottom:0;left:0;right:0;z-index:9998;background:rgba(13,45,110,.93);color:#D1D5DB;font-size:11.5px;padding:8px 18px;text-align:center;font-family:system-ui,sans-serif}
  .page-wrap{background:#fff;max-width:1060px;margin:0 auto 24px;box-shadow:0 2px 12px rgba(0,0,0,.1)}
</style>
</head>
<body>

<div class="no-print">
  <button onclick="document.querySelectorAll('.no-print,.hint-bar').forEach(function(e){e.style.display='none'});window.print();document.querySelectorAll('.no-print').forEach(function(e){e.style.display='flex'});document.querySelectorAll('.hint-bar').forEach(function(e){e.style.display='block'})"
    style="padding:10px 24px;background:#111827;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2)">
    🖨️ Print / Save PDF
  </button>
  <button onclick="window.close()"
    style="padding:10px 16px;background:#fff;color:#64748b;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;cursor:pointer">
    ✕ Close
  </button>
</div>
<div class="hint-bar">
  💡 Click <b>Print / Save PDF</b> → choose <b>Save as PDF</b>, Orientation: <b>Landscape</b>, Margins: <b>None</b>
</div>

<div class="page-wrap">
${allPages}
</div>

</body></html>`;
}

export function openTranscriptPDF(html, showPDF=null, studentName="", academicYear=""){
  try{ db.logView('transcript_open','transcript',null,{name:studentName,summary:academicYear}); }catch{}
  openHtmlDoc(html, {title:pdfName(studentName,"TRANSCRIPT",academicYear), showPDF});
}

