/**
 * Broadsheet PDF Builder
 * Generates a class-wide grade summary HTML document.
 */
import { getGrade } from "../../utils/grades.js";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

export function buildBroadsheetHTML({rows,subjects,cls,session,term,mode,gradeSchema,schoolName}){
  const ordinal=n=>{if(n===1)return'1st';if(n===2)return'2nd';if(n===3)return'3rd';return`${n}th`;};
  const gradeFor=score=>{
    if(score==null||isNaN(score))return'—';
    const g=[...gradeSchema].sort((a,b)=>b.min_score-a.min_score).find(g=>score>=g.min_score);
    return g?g.grade:'F';
  };

  // ── Category header columns ─────────────────────────────────────────────────
  const subHdr=subjects.map(s=>
    mode==='detailed'
      ?`<th colspan="3" style="background:#111827;color:#fff;padding:6px 3px;border:1px solid #c4d4ee;font-size:9px;text-align:center;white-space:nowrap;">${escapeHtml(s.name)}</th>`
      :`<th style="background:#111827;color:#fff;padding:6px 3px;border:1px solid #c4d4ee;font-size:9px;text-align:center;white-space:nowrap;">${escapeHtml(s.name)}</th>`
  ).join('');

  const subHdr2=mode==='detailed'?subjects.map(()=>
    `<th style="background:#2563eb;color:#fff;padding:3px 2px;font-size:7px;text-align:center;border:1px solid #c4d4ee;">CA</th>`+
    `<th style="background:#2563eb;color:#fff;padding:3px 2px;font-size:7px;text-align:center;border:1px solid #c4d4ee;">Exam</th>`+
    `<th style="background:#1e4fa0;color:#fff;padding:3px 2px;font-size:8px;text-align:center;border:1px solid #c4d4ee;font-weight:800;">Tot</th>`
  ).join(''):'';

  // ── Body rows ──────────────────────────────────────────────────────────────
  const bodyRows=rows.map((row,i)=>{
    const bg=i%2===0?'#fff':'#f8fafc';
    const posCl=row.position<=3?'color:#D97706;font-weight:900;':'color:#0F172A;font-weight:700;';
    const subCells=row.subjectScores.map(ss=>{
      if(mode==='detailed'){
        const tot=ss.total!=null?`<td style="text-align:center;padding:4px 2px;border:1px solid #e2e8f0;font-size:9px;font-weight:700;${ss.total!=null?(ss.total>=50?'color:#15803D;':'color:#DC2626;'):'color:#94A3B8;'}">${escapeHtml(ss.total??'—')}</td>`:'';
        return `<td style="text-align:center;padding:4px 2px;border:1px solid #e2e8f0;font-size:8px;">${escapeHtml(ss.ca??'—')}</td>`+
               `<td style="text-align:center;padding:4px 2px;border:1px solid #e2e8f0;font-size:8px;">${escapeHtml(ss.exam??'—')}</td>`+
               `<td style="text-align:center;padding:4px 2px;border:1px solid #e2e8f0;font-size:9px;font-weight:700;${ss.total!=null?(ss.total>=50?'color:#15803D;':'color:#DC2626;'):''}">${escapeHtml(ss.total??'—')}</td>`;
      }
      return `<td style="text-align:center;padding:4px 3px;border:1px solid #e2e8f0;font-size:10px;font-weight:700;${ss.total!=null?(ss.total>=50?'color:#15803D;':'color:#DC2626;'):'color:#94A3B8;'}">${escapeHtml(ss.total??'—')}</td>`;
    }).join('');

    return `<tr style="background:${bg};">
      <td style="text-align:center;padding:5px 2px;border:1px solid #e2e8f0;font-size:10px;color:#64748B;">${i+1}</td>
      <td style="padding:5px 6px;border:1px solid #e2e8f0;font-size:10px;font-weight:600;white-space:nowrap;">${escapeHtml((row.student.last_name||'')+' '+(row.student.first_name||''))}</td>
      <td style="text-align:center;padding:5px 3px;border:1px solid #e2e8f0;font-size:9px;color:#64748B;">${escapeHtml(row.student.admission_number||'—')}</td>
      ${subCells}
      <td style="text-align:center;padding:5px 3px;border:1px solid #e2e8f0;font-size:11px;font-weight:800;background:#F3F4F6;color:#111827;">${row.grandTotal.toFixed(1)}</td>
      <td style="text-align:center;padding:5px 3px;border:1px solid #e2e8f0;font-size:10px;font-weight:700;background:#F3F4F6;color:#111827;">${row.average.toFixed(1)}</td>
      <td style="text-align:center;padding:5px 3px;border:1px solid #e2e8f0;font-size:10px;${posCl}">${ordinal(row.position)}</td>
      <td style="text-align:center;padding:5px 3px;border:1px solid #e2e8f0;font-size:11px;font-weight:900;">${escapeHtml(gradeFor(row.average))}</td>
    </tr>`;
  }).join('');

  // ── Per-subject class averages (tfoot) ─────────────────────────────────────
  const avgCells=subjects.map(sub=>{
    const scores=rows.map(r=>r.subjectScores.find(ss=>ss.subjectId===sub.id)?.total).filter(v=>v!=null);
    const avg=scores.length?(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1):'—';
    if(mode==='detailed'){
      return `<td colspan="2" style="border:1px solid #e2e8f0;background:#E5E7EB;"></td>`+
             `<td style="text-align:center;padding:4px 2px;border:1px solid #e2e8f0;font-size:9px;font-weight:800;background:#E5E7EB;color:#111827;">${avg}</td>`;
    }
    return `<td style="text-align:center;padding:4px 3px;border:1px solid #e2e8f0;font-size:10px;font-weight:800;background:#E5E7EB;color:#111827;">${avg}</td>`;
  }).join('');

  const classGrandAvg=rows.length?(rows.reduce((s,r)=>s+r.grandTotal,0)/rows.length).toFixed(1):'—';
  const classAvgAvg=rows.length?(rows.reduce((s,r)=>s+r.average,0)/rows.length).toFixed(1):'—';
  const genDate=new Date().toLocaleDateString('en-NG',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});

  return`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>${escapeHtml(cls?.name||'Group')} Broadsheet</title>
<style>
  *{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#fff;}
  @page{size:A3 landscape;margin:8mm 10mm;}
  table{border-collapse:collapse;width:100%;}
  .print-btn{position:fixed;top:10px;right:10px;padding:9px 20px;background:#111827;color:#fff;
    border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;
    box-shadow:0 2px 8px rgba(0,0,0,.3);z-index:99;}
  @media print{.no-print{display:none!important}}
</style></head><body>
<button class="no-print print-btn" onclick="window.print()">🖨 Print / Save PDF</button>
<div style="padding:10px 14px;">
  <div style="text-align:center;margin-bottom:14px;padding-bottom:10px;border-bottom:3px double #111827;">
    <div style="font-size:9px;color:#64748B;letter-spacing:2px;text-transform:uppercase;margin-bottom:2px;">${escapeHtml(schoolName||'Organization Management Portal')}</div>
    <div style="font-size:22px;font-weight:900;color:#030712;letter-spacing:.03em;">GROUP BROADSHEET</div>
    <div style="font-size:15px;font-weight:700;color:#111827;margin-top:3px;">${escapeHtml(cls?.name||'Group')}</div>
    <div style="font-size:11px;color:#64748B;margin-top:2px;">${escapeHtml(term?.name||'')} &bull; ${escapeHtml(session?.name||'')}</div>
  </div>
  <div style="overflow-x:auto;">
  <table>
    <thead>
      <tr>
        <th rowspan="2" style="background:#030712;color:#fff;padding:6px 3px;border:1px solid #c4d4ee;font-size:10px;width:26px;">#</th>
        <th rowspan="2" style="background:#030712;color:#fff;padding:6px 6px;border:1px solid #c4d4ee;font-size:10px;min-width:100px;text-align:left;">Member Name</th>
        <th rowspan="2" style="background:#030712;color:#fff;padding:6px 3px;border:1px solid #c4d4ee;font-size:9px;white-space:nowrap;">Adm. No.</th>
        ${subHdr}
        <th rowspan="2" style="background:#030712;color:#fff;padding:6px 3px;border:1px solid #c4d4ee;font-size:10px;white-space:nowrap;">Grand<br>Total</th>
        <th rowspan="2" style="background:#030712;color:#fff;padding:6px 3px;border:1px solid #c4d4ee;font-size:10px;">Avg</th>
        <th rowspan="2" style="background:#030712;color:#fff;padding:6px 3px;border:1px solid #c4d4ee;font-size:10px;">Pos</th>
        <th rowspan="2" style="background:#030712;color:#fff;padding:6px 3px;border:1px solid #c4d4ee;font-size:10px;">Grade</th>
      </tr>
      <tr>${subHdr2}</tr>
    </thead>
    <tbody>${bodyRows}</tbody>
    <tfoot>
      <tr style="background:#F3F4F6;">
        <td colspan="3" style="padding:6px 8px;font-weight:800;font-size:10px;border:1px solid #e2e8f0;color:#030712;white-space:nowrap;">GROUP AVERAGE</td>
        ${avgCells}
        <td style="text-align:center;padding:5px 3px;border:1px solid #e2e8f0;font-size:10px;font-weight:800;background:#E5E7EB;color:#111827;">${classGrandAvg}</td>
        <td style="text-align:center;padding:5px 3px;border:1px solid #e2e8f0;font-size:10px;font-weight:800;background:#E5E7EB;color:#111827;">${classAvgAvg}</td>
        <td colspan="2" style="border:1px solid #e2e8f0;background:#E5E7EB;"></td>
      </tr>
    </tfoot>
  </table>
  </div>
  <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:flex-end;">
    <div style="font-size:9px;color:#94A3B8;">Generated: ${genDate}</div>
    <div style="border-top:1px solid #030712;min-width:160px;text-align:center;padding-top:4px;font-size:9px;color:#030712;">Principal's Signature</div>
  </div>
</div>
</body></html>`;
}

