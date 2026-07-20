/**
 * Report Card PDF Generator
 *
 * Builds the full HTML string for T1-T11 report card templates and opens
 * a print window (or in-app viewer on mobile).
 *
 * Extracted from AppDemo.jsx — no React dependencies.
 * All imports are pure service functions.
 */

import { db } from "../../supabaseClient.js";
import { getGrade, getRemark, fullName } from "../../utils/grades.js";
import { pdfName, openHtmlDoc } from "../pdf/capture.js";

export function openReportCardPrintWindow(students,allData,cls,term,session,
  gradingSchema,caeTraits,caeRatings,publishInfo,settings,logoSrc,
  classTeacherComment,principalComment,nextTermBegins,pubOptions,teacherSig,principalSig,
  showPDF=null,htmlOnly=false,forStorage=false){

  // Audit: log who viewed/downloaded which report card(s)
  try{
    const action = forStorage ? 'report_card_generate' : (htmlOnly ? 'report_card_view' : 'report_card_print');
    if(students?.length===1){
      const s=students[0];
      db.logView(action,'report_card',s.id,{
        name:`${s.first_name||''} ${s.last_name||''}`.trim()||String(s.id),
        summary:`${cls?.name||''} · ${term?.name||''} ${session?.name||''}`.trim(),
        data:{class_id:cls?.id,term_id:term?.id,session_id:session?.id},
      });
    }else if(students?.length>1){
      db.logView(action+'_bulk','report_card',cls?.id,{
        name:cls?.name||'(class)',
        summary:`${students.length} students · ${term?.name||''} ${session?.name||''}`.trim(),
        data:{class_id:cls?.id,term_id:term?.id,session_id:session?.id,count:students.length},
      });
    }
  }catch{}

  const opts=pubOptions||{show_cae:true,show_teacher_comment:true,show_principal_comment:true,show_parent_ack:false,show_position:false,show_next_term:true,card_design:"classic"};
  const design=opts.card_design||"classic";
  // Hoisted here so _sp is in scope for both cardHtml templates AND fullHtml CSS injection.
  // (Previously declared inside the T11 block scope — invisible to T1-T10 and to fullHtml.)
  const _sp=opts.card_spacing||"normal";
  const _spMult=_sp==="compact"?0.55:_sp==="spacious"?1.8:1.0;

  // ── Template dispatch (Phase 1, v32.44) ─────────────────────────────────────
  // Resolve selected template_id in priority order:
  //   1. publishInfo.template_id  (per-class override)
  //   2. settings.report_card_template_id  (school-wide default from Report Card Settings page)
  //   3. 11  (Classic — current renderer)
  // Phase 2-4 will switch to dedicated renderers for T1–T10. For now all
  // templates render through the classic renderer below; we just log the
  // selection for traceability.
  const _tplId=(()=>{
    const a=publishInfo?.template_id;
    const b=parseInt(settings?.report_card_template_id||"",10);
    if(a!=null&&!isNaN(+a))return +a;
    if(Number.isFinite(b)&&b>=1&&b<=11)return b;
    return 11;
  })();
  if(_tplId!==11){
    try{ console.info(`[report-card] Template T${_tplId} selected — renderer pending (Phase 2-4). Falling back to Classic.`); }catch{}
  }

  // Hardcoded grade colours — independent of React theme (C.*) so they
  // always render correctly inside the plain HTML string.
  const gCol=g=>{
    const u=(g||"").toUpperCase();
    if(u==="A"||u==="A+"||u==="A1")return"#15803D";
    if(u==="B"||u==="B+"||u==="B2"||u==="B3")return"#1A4FA0";
    if(u==="C"||u==="C+"||u==="C4"||u==="C5"||u==="C6")return"#D97706";
    if(u==="D"||u==="D7")return"#EA580C";
    if(u==="E"||u==="E8")return"#DC2626";
    if(u==="F"||u==="F9")return"#991B1B";
    // Numeric grades
    const n=+u;
    if(!isNaN(n)){
      if(n>=70)return"#15803D";
      if(n>=60)return"#1A4FA0";
      if(n>=50)return"#D97706";
      if(n>=40)return"#EA580C";
      return"#991B1B";
    }
    return"#475569";// fallback: visible dark slate
  };

  const schoolName=settings.school_name||"Your School";
  const schoolAddress=settings.school_address||"No. 1 Renaissance Avenue, Abuja, FCT";
  const schoolMotto=settings.school_motto||"Excellence in Learning";
  const classTeacherTitle=settings.report_class_teacher_title||"Group Staff";
  const principalTitle=settings.report_principal_title||"School Principal";
  const footerText=settings.report_footer_text||"This report card is computer-generated.";
  const today=new Date().toLocaleDateString("en-NG",{day:"numeric",month:"long",year:"numeric"});
  const fmtDate=v=>{ try{ return v?new Date(v).toLocaleDateString("en-NG",{day:"numeric",month:"long",year:"numeric"}):"—"; }catch{return"—";} };
  const termClosingDate=fmtDate(settings.term_closing_date);
  const termOpeningDate=fmtDate(settings.term_opening_date);
  // Principal signature: per-publication override → global template (principalSig) → settings base64
  const principalSigUrl=principalSig?.image_url||settings.principal_signature_base64||null;
  const principalStampUrl=settings.principal_stamp_base64||null;
  // Font settings (default: 5% bigger than original, Times New Roman)
  const rcFontScale=(+(settings.report_card_font_size||105)/100).toFixed(3); // e.g. 1.050
  const rcFontFamily=settings.report_card_font_family||"'Times New Roman',Georgia,serif";

  const logoHtml=logoSrc
    ?`<img src="${logoSrc}" style="width:44px;height:44px;object-fit:contain;border-radius:4px;" alt="logo"/>`
    :`<div style="width:44px;height:44px;border-radius:50%;background:#E8560A;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:2px solid #fff;">
        <div style="width:34px;height:34px;border-radius:50%;background:#1A4FA0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:900;font-family:Georgia,serif;">RGS</div>
      </div>`;

  // ── Pre-compute class positions ─────────────────────────────────────────────
  // Rank by total score descending; ties share the same position (dense rank).
  // Uses ALL students in allData (not just `students` to render) so callers can
  // load full-class results for ranking even when printing a single student.
  // _classSize: total students in the class (denominator for "X / N").
  const _classRankIds=Object.keys(allData||{});
  const _classSize=_classRankIds.length||students.length||0;
  const _positionMap=(()=>{
    const scored=_classRankIds.map(id=>{
      const sd=allData[id]||{results:[]};
      let res=sd.results||[];
      if(cls&&cls.id!=null) res=res.filter(r=>r.class_id==null||+r.class_id===+cls.id);
      const total=res.reduce((a,b)=>a+(+b.total_score||0),0);
      return{id,total};
    });
    scored.sort((a,b)=>b.total-a.total);
    const map={};
    let rank=1;
    scored.forEach((s,i)=>{
      if(i>0&&s.total<scored[i-1].total) rank=i+1;
      map[s.id]=rank;
    });
    return map;
  })();

  const cardHtml=students.map(stu=>{
    const stuData=allData[stu.id]||{results:[],caeResults:[]};
    let {results,caeResults}=stuData;
    // Safety net: drop any result row whose class_id doesn't match this student's
    // current class (stale history from pre-transfer uploads). Then dedupe by
    // subject_id keeping the highest total — prevents phantom duplicate subject
    // rows on the card (caused the "18th subject" / duplicate 0/F bug historically).
    if(cls&&cls.id!=null){
      results=(results||[]).filter(r=>r.class_id==null||+r.class_id===+cls.id);
    }
    {
      const bySubj={};
      (results||[]).forEach(r=>{
        const k=r.subject_id;if(k==null)return;
        const prev=bySubj[k];
        if(!prev||(+r.total_score||0)>(+prev.total_score||0)) bySubj[k]=r;
      });
      results=Object.values(bySubj);
    }
    const totalScore=results.reduce((a,b)=>a+(+b.total_score||0),0);
    const avg=results.length?totalScore/results.length:0;
    const overallG=getGrade(avg,gradingSchema);
    const overallR=getRemark(avg,gradingSchema);
    const gc=gCol(overallG);
    const stuName=fullName(stu);
    const ntbStr=nextTermBegins?new Date(nextTermBegins).toLocaleDateString("en-NG",{day:"numeric",month:"long",year:"numeric"}):"—";
    const caMax=+(settings.result_ca_max||40);
    const exMax=+(settings.result_exam_max||60);
    const _cc=settings._caeComps||[];const _hasCC=_cc.length>=2;const _scCols=_hasCC?_cc.length:2;
    const _scoreBanner=_hasCC?_cc.map(c=>c.component_name+'('+c.value_or_formula+')').join(' + ')+' = '+(caMax+exMax):'CA ('+caMax+') + Exam ('+exMax+') = Total ('+(caMax+exMax)+')';
    const _parseCS=(r)=>{try{return r.component_scores?JSON.parse(r.component_scores):{};}catch{return{};}};
    const _scoreHdr=(sty)=>_hasCC?_cc.map(c=>'<th style="'+sty+'">'+c.component_name+'</th>').join(''):'<th style="'+sty+'">CA</th><th style="'+sty+'">Exam</th>';
    const _scoreCells=(r,sty)=>{const cs=_parseCS(r);return _hasCC?_cc.map(c=>'<td style="'+sty+'">'+(cs[c.component_name]!=null?cs[c.component_name]:'—')+'</td>').join(''):'<td style="'+sty+'">'+(r.ca_score!=null?r.ca_score:'—')+'</td><td style="'+sty+'">'+(r.exam_score!=null?r.exam_score:'—')+'</td>';};

    // Shared CAE builder
    const buildCae=(labelBg,labelColor,divider)=>caeTraits.map(trait=>{
      const caeR=caeResults.find(c=>c.trait_id===trait.id);
      const rating=caeR?caeRatings.find(r=>r.id===caeR.rating_id):null;
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:1px 6px;border-bottom:1px solid ${divider};font-size:8px;">
        <span style="font-weight:600;color:#1a202c;">${trait.category}</span>
        <span style="font-weight:700;color:${rating?labelColor:"#94a3b8"};">${rating?`${rating.symbol||""} ${rating.label}`:"—"}</span>
      </div>`;
    }).join("");

    const ratingLegend=caeRatings.map(r=>`<span style="margin-right:8px;"><b>${r.symbol||r.label[0]}</b>=${r.label}</span>`).join("");
    const _gradeSchemaForKey=gradingSchema.length?gradingSchema:GRADES;
    // Deduplicate by grade letter (DB may return both section-specific + null-section rows)
    const _uniqueGS=Object.values(_gradeSchemaForKey.reduce((m,g)=>{const k=g.grade;if(!m[k])m[k]=g;return m;},{})).sort((a,b)=>(b.min_score??b.min??0)-(a.min_score??a.min??0));
    const gradeKey=_uniqueGS.map(g=>`<span style="margin-right:8px;"><b style="color:${gCol(g.grade)};">${g.grade}</b>=${g.remark}(${g.min_score??g.min}–${g.max_score??g.max})</span>`).join("");

    // ── PHASE 2 — TEMPLATE DISPATCH (T1 / T2 / T3) ─────────────────────────
    // T1 Classic Navy, T2 Modern Minimal, T3 Emerald Prestige render here.
    // T4–T10 still fall through to the classic renderer (Phase 3-4 will land them).
    // T11 (and any unknown) → classic renderer below.
    if(_tplId>=1&&_tplId<=10){
      const teacherSigUrl=teacherSig?.image_url||null;
      const stuId=stu.student_id||stu.id||"—";
      const className=cls?.name||"—";
      const sessName=session?.name||"";
      const termName=term?.name||"";
      const perSubjMax=caMax+exMax;
      const maxScore=results.length*perSubjMax;
      const positionTxt=_positionMap[stu.id]?String(_positionMap[stu.id]):"—";

      // Shared row builders — close over per-student vars
      // Dynamic component column header for T1-T10 (uses section's component structure)
      const _scoreHdrModern=(sty)=>_hasCC
        ?_cc.map(c=>`<th style="${sty}">${(c.component_name||"").replace(/</g,"&lt;")}<br><span style="font-size:7px;opacity:.8;font-weight:400;">(${c.value_or_formula||""})</span></th>`).join("")
        :`<th style="${sty}">CA (${caMax})</th><th style="${sty}">Exam (${exMax})</th>`;
      const _scoreColCount=_hasCC?_cc.length:2;

      const _rowsT1T3=(opt)=>results.map((r,i)=>{
        const gL=getGrade(r.total_score,gradingSchema);
        const rem=getRemark(r.total_score,gradingSchema);
        const rc=gCol(gL);
        const cs=_parseCS(r);
        const subjBg=opt?.zebra?(i%2===0?"#fff":opt.zebra):"#fff";
        const tdSty=`padding:6px 8px;border-bottom:1px solid ${opt?.brd||"#e2e8f0"};font-size:10px;color:${opt?.txt||"#1e293b"};`;
        const scoreCells=_hasCC
          ?_cc.map(c=>`<td style="${tdSty}text-align:center;color:${opt?.sft||"#475569"};">${cs[c.component_name]!=null?cs[c.component_name]:"—"}</td>`).join("")
          :`<td style="${tdSty}text-align:center;color:${opt?.sft||"#475569"};">${r.ca_score??"—"}</td><td style="${tdSty}text-align:center;color:${opt?.sft||"#475569"};">${r.exam_score??"—"}</td>`;
        return `<tr style="background:${subjBg};">
          <td style="${tdSty}text-align:center;color:${opt?.mut||"#94a3b8"};font-size:9.5px;">${i+1}</td>
          <td style="${tdSty}font-weight:600;">${(r.section_subjects?.name||"—").toString().replace(/</g,"&lt;")}</td>
          ${scoreCells}
          <td style="${tdSty}text-align:center;font-weight:900;font-size:12px;color:${rc};">${r.total_score??"—"}</td>
          <td style="${tdSty}text-align:center;">${opt?.gradePillFn?opt.gradePillFn(gL,rc):`<span style="background:${rc};color:#fff;border-radius:4px;padding:1px 8px;font-weight:700;font-size:10px;">${gL}</span>`}</td>
          <td style="${tdSty}text-align:center;color:${opt?.sft||"#475569"};font-size:9.5px;">${rem}</td>
        </tr>`;
      }).join("");

      const _summaryRow=(opt)=>`<tr style="background:${opt.bg};">
        <td colspan="${2+_scoreColCount}" style="padding:8px;text-align:right;color:${opt.mut};font-size:9.5px;font-style:italic;">Grand Total · Average · ${opts.show_position!==false?"Group Position":"Score"}</td>
        <td style="padding:8px;text-align:center;font-weight:900;font-size:13px;color:${opt.acc};">${totalScore}</td>
        <td style="padding:8px;text-align:center;font-weight:900;font-size:12px;color:${opt.acc};">${avg.toFixed(1)}%</td>
        <td style="padding:8px;text-align:center;font-weight:700;font-size:11px;color:${opt.acc};">${opts.show_position!==false?(positionTxt+" / "+(students.length||"—")):(totalScore+"/"+maxScore)}</td>
      </tr>`;

      // Map a rating to a 1–5 score (used for stars/bars visual)
      const _ratingScore=(rating)=>{
        if(!rating)return 0;
        const v=+(rating.numeric_value??rating.value??0);
        if(v>0&&v<=5)return v;
        const L=(rating.label||"").toLowerCase();
        if(L.includes("excellent"))return 5;
        if(L.includes("very good"))return 4;
        if(L.includes("good"))return 3;
        if(L.includes("fair")||L.includes("pass"))return 2;
        if(L.includes("poor")||L.includes("weak"))return 1;
        return 3;
      };

      const _caeStars=(starColor)=>{
        if(!opts.show_cae||!caeTraits.length)return"";
        const cells=caeTraits.map(trait=>{
          const caeR=caeResults.find(c=>c.trait_id===trait.id);
          const rating=caeR?caeRatings.find(r=>r.id===caeR.rating_id):null;
          const n=Math.round(_ratingScore(rating));
          const stars=[1,2,3,4,5].map(i=>`<span style="color:${i<=n?starColor:"#d1d5db"};font-size:11px;">★</span>`).join("");
          const lab=rating?((rating.symbol?rating.symbol+" ":"")+(rating.label||"")):"—";
          return `<div style="text-align:center;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:6px 4px;">
            <div style="font-size:8.5px;color:#475569;margin-bottom:2px;font-weight:600;">${trait.category}</div>
            <div style="margin:1px 0;">${stars}</div>
            <div style="font-size:8px;color:${starColor};font-weight:700;">${lab}</div>
          </div>`;
        }).join("");
        const legend=ratingLegend?`<div style="margin-top:6px;padding-top:5px;border-top:1px solid #e2e8f0;font-size:8px;color:#64748b;"><b>Scale:</b> ${ratingLegend}</div>`:"";
        return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;">${cells}</div>${legend}`;
      };

      const _caeBars=(barColor,barBg)=>{
        if(!opts.show_cae||!caeTraits.length)return"";
        const rows=caeTraits.map(trait=>{
          const caeR=caeResults.find(c=>c.trait_id===trait.id);
          const rating=caeR?caeRatings.find(r=>r.id===caeR.rating_id):null;
          const n=_ratingScore(rating);
          const pct=Math.round((n/5)*100);
          const lab=rating?((rating.symbol?rating.symbol+" ":"")+(rating.label||"")):"—";
          return `<div style="margin-bottom:5px;display:flex;align-items:center;gap:8px;">
            <div style="width:110px;font-size:9.5px;color:#475569;font-weight:600;">${trait.category}</div>
            <div style="flex:1;height:6px;background:${barBg};border-radius:3px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:${barColor};"></div></div>
            <div style="font-size:9px;font-weight:700;color:${barColor};min-width:78px;text-align:right;">${lab}</div>
          </div>`;
        }).join("");
        const legend=ratingLegend?`<div style="margin-top:5px;padding-top:5px;border-top:1px solid ${barBg};font-size:8px;color:#64748b;"><b>Scale:</b> ${ratingLegend}</div>`:"";
        return rows+legend;
      };

      const _gradeKeyChips=(brd,bg)=>`<div style="background:${bg};border:1px solid ${brd};border-radius:8px;padding:8px 12px;">
        <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#475569;margin-bottom:5px;">Grading Scale</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">${_uniqueGS.map(g=>`<div style="font-size:9.5px;color:#475569;"><b style="color:${gCol(g.grade)};">${g.grade}</b>: ${g.min_score??g.min}–${g.max_score??g.max} (${g.remark})</div>`).join("")}</div>
      </div>`;

      const _nextTermNote=(brd,bg,txt)=>{
        if(!opts.show_next_term)return"";
        const ntb=ntbStr!=="—"?ntbStr:termOpeningDate;
        return `<div style="background:${bg};border:1px solid ${brd};border-radius:8px;padding:8px 14px;display:flex;align-items:center;gap:10px;white-space:nowrap;">
          <div style="font-size:18px;">📅</div>
          <div><div style="font-size:8.5px;color:#475569;text-transform:uppercase;letter-spacing:.5px;">Next Term Begins</div>
          <div style="font-size:12px;font-weight:800;color:${txt};">${ntb}</div></div>
        </div>`;
      };

      // _commentBox(label, text, brd, bg, txtCol, labelCol, sigUrl?, stampUrl?)
      // sigUrl: signature image embedded above the signature line.
      // stampUrl: optional overlay (used for principal — overlays a stamp on top of signature).
      const _commentBox=(label,text,brd,bg,txtCol,labelCol,sigUrl,stampUrl)=>{
        const sigBlock=sigUrl?`<div style="position:relative;display:inline-block;height:42px;min-width:120px;">
          <img src="${sigUrl}" style="height:42px;max-width:160px;object-fit:contain;display:block;"/>
          ${stampUrl?`<img src="${stampUrl}" style="position:absolute;top:-6px;left:60px;height:54px;width:54px;object-fit:contain;opacity:.85;"/>`:""}
        </div>`:`<div style="height:24px;border-bottom:1px solid ${brd};min-width:120px;"></div>`;
        return `<div style="background:${bg};border:1px solid ${brd};border-radius:8px;padding:11px 13px;display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${labelCol};">${label}</div>
          <div style="font-size:10px;color:${txtCol};line-height:1.6;flex:1;">${text||"<i style='color:#94a3b8;'>No comment provided</i>"}</div>
          <div style="border-top:1px solid ${brd};padding-top:6px;display:flex;align-items:flex-end;gap:14px;font-size:8.5px;color:#64748b;">
            ${sigBlock}
            <div style="font-size:8px;color:#94a3b8;flex:1;text-align:right;letter-spacing:.4px;text-transform:uppercase;">Signature</div>
          </div>
        </div>`;
      };

      const _parentAck=(brd,bg,labelCol,sftCol,mutCol)=>{
        if(!opts.show_parent_ack)return"";
        return `<div style="background:${bg};border:1.5px dashed ${brd};border-radius:8px;padding:10px 14px;">
          <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${labelCol};margin-bottom:5px;">Parent / Guardian Acknowledgement</div>
          <div style="font-size:9.5px;color:${sftCol};line-height:1.5;margin-bottom:6px;">I confirm that I have received, read and understood my ward's academic report card for the ${termName}, ${sessName} session.</div>
          <div style="display:flex;gap:22px;font-size:8.5px;color:${mutCol};flex-wrap:wrap;">
            <span>Parent's Name: ______________________</span><span>Signature: ______________________</span><span>Date: ________________</span>
          </div>
        </div>`;
      };

      // ─── T1 Classic Navy ───────────────────────────────────────────────
      if(_tplId===1){
        const navy="#1e3a5f", gold="#c9a227", lt="#f8fafc", brd="#cbd5e1", txt="#1e293b", sft="#475569", mut="#94a3b8";
        const headThSty=`padding:7px 8px;text-align:center;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:rgba(255,255,255,.85);background:${navy};`;
        const tableHdr=`<tr style="background:${navy};">
          <th style="${headThSty}text-align:center;">S/N</th>
          <th style="${headThSty}text-align:left;">Subject</th>
          ${_scoreHdrModern(headThSty)}
          <th style="${headThSty}">Total (${perSubjMax})</th>
          <th style="${headThSty}">Grade</th>
          <th style="${headThSty}text-align:left;">Remark</th>
        </tr>`;
        const rows=_rowsT1T3({brd,txt,sft,mut,zebra:lt});
        const summary=_summaryRow({bg:navy,acc:gold,mut:"rgba(255,255,255,.6)"});
        return `<div class="report-card" style="font-family:'Georgia',serif;color:${txt};background:#fff;">
          <div style="background:${navy};padding:18px 30px 14px;display:flex;align-items:center;gap:14px;">
            ${logoHtml}
            <div style="flex:1;text-align:center;">
              <div style="color:${gold};font-size:18px;font-weight:bold;letter-spacing:.6px;text-transform:uppercase;">${schoolName}</div>
              <div style="color:rgba(255,255,255,.55);font-size:9px;margin-top:2px;">${schoolAddress}</div>
              <div style="color:${gold};font-size:9px;font-style:italic;margin-top:3px;">"${schoolMotto}"</div>
            </div>
            ${logoHtml}
          </div>
          <div style="background:${gold};padding:5px 30px;text-align:center;color:${navy};font-weight:bold;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;">Member Academic Report — ${termName} · ${sessName}</div>
          <div style="padding:10px 30px;background:${lt};border-bottom:2px solid ${gold};display:grid;grid-template-columns:repeat(4,1fr);gap:5px 14px;">
            ${[["Member Name",stuName,2],["Admission No.",stuId],["Group",className],["Gender",stu.gender||"—"],["Date of Birth",stu.dob?fmtDate(stu.dob):"—"],["Group Position",opts.show_position!==false?(positionTxt+" of "+(students.length||"—")):"—"],["Session · Term",sessName+" · "+termName]].map(([l,v,sp])=>`<div style="grid-column:${sp?'span '+sp:'auto'};"><div style="font-size:8px;text-transform:uppercase;letter-spacing:.5px;color:${mut};font-family:system-ui,sans-serif;">${l}</div><div style="font-size:11px;font-weight:700;color:${txt};">${v}</div></div>`).join("")}
          </div>
          <div style="padding:14px 30px 10px;">
            <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:${navy};border-bottom:2px solid ${navy};padding-bottom:3px;margin-bottom:8px;">Academic Performance Record</div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;"><thead>${tableHdr}</thead><tbody>${rows}${summary}</tbody></table>
          </div>
          ${opts.show_cae&&caeTraits.length?`<div style="padding:0 30px 10px;">
            <div style="background:${lt};border:1px solid ${brd};border-radius:6px;padding:10px 14px;">
              <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${navy};margin-bottom:7px;">Character &amp; Affective Evaluation</div>
              ${_caeStars(gold)}
            </div>
          </div>`:""}
          ${opts.show_teacher_comment||opts.show_principal_comment?`<div style="padding:0 30px 10px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            ${opts.show_teacher_comment?_commentBox("Form Staff's Comment",classTeacherComment,brd,lt,txt,navy,teacherSigUrl):""}
            ${opts.show_principal_comment?_commentBox("Principal's Remark",principalComment,brd,lt,txt,navy,principalSigUrl,principalStampUrl):""}
          </div>`:""}
          ${opts.show_parent_ack?`<div style="padding:0 30px 10px;">${_parentAck(brd,lt,navy,sft,mut)}</div>`:""}
          <div style="padding:0 30px 12px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;">
            ${_gradeKeyChips(brd,lt)}
            ${_nextTermNote(brd,lt,txt)}
          </div>
          <div style="background:${navy};padding:8px 30px;display:flex;justify-content:space-between;align-items:center;">
            <div style="color:rgba(255,255,255,.45);font-size:8.5px;">${settings.school_email||""}</div>
            <div style="color:${gold};font-size:8.5px;font-style:italic;">${footerText}</div>
            <div style="color:rgba(255,255,255,.45);font-size:8.5px;">${settings.school_phone||""}</div>
          </div>
        </div>`;
      }

      // ─── T2 Modern Minimal ─────────────────────────────────────────────
      if(_tplId===2){
        const blue="#1A4FA0", orange="#E8560A", lt="#f8fafc", brd="#e2e8f0", txt="#0f172a", sft="#475569", mut="#94a3b8";
        const headThSty=`padding:7px 8px;text-align:center;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:rgba(255,255,255,.85);background:${blue};`;
        const tableHdr=`<tr style="background:${blue};">
          <th style="${headThSty}text-align:center;">S/N</th>
          <th style="${headThSty}text-align:left;">Subject</th>
          ${_scoreHdrModern(headThSty)}
          <th style="${headThSty}">Total (${perSubjMax})</th>
          <th style="${headThSty}">Grade</th>
          <th style="${headThSty}text-align:left;">Remark</th>
        </tr>`;
        const gradePillFn=(g,rc)=>`<span style="display:inline-flex;width:24px;height:24px;border-radius:12px;background:${rc};color:#fff;font-size:10px;font-weight:800;align-items:center;justify-content:center;">${g}</span>`;
        const rows=_rowsT1T3({brd,txt,sft,mut,zebra:lt,gradePillFn});
        const summary=_summaryRow({bg:blue,acc:"#fff",mut:"rgba(255,255,255,.55)"});
        return `<div class="report-card" style="font-family:system-ui,-apple-system,sans-serif;color:${txt};background:#fff;">
          <div style="height:5px;background:linear-gradient(90deg,${blue},${orange});"></div>
          <div style="padding:16px 32px 10px;display:flex;justify-content:space-between;align-items:flex-start;">
            <div style="display:flex;align-items:center;gap:10px;">
              ${logoHtml}
              <div>
                <div style="font-size:14px;font-weight:900;color:${blue};letter-spacing:-.4px;">${schoolName}</div>
                <div style="font-size:9px;color:${mut};margin-top:1px;font-style:italic;">"${schoolMotto}"</div>
                <div style="font-size:8.5px;color:${mut};">${schoolAddress}</div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:22px;font-weight:900;color:#e2e8f0;letter-spacing:-1px;line-height:1;">REPORT</div>
              <div style="font-size:22px;font-weight:900;color:${blue};letter-spacing:-1px;line-height:1;">CARD</div>
              <div style="font-size:9px;color:${mut};margin-top:2px;">${termName} · ${sessName}</div>
            </div>
          </div>
          <div style="background:${blue};margin:0 32px 12px;border-radius:12px;padding:11px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
            <div>
              <div style="font-size:9px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.5px;">Member</div>
              <div style="font-size:14px;font-weight:900;color:#fff;letter-spacing:-.3px;">${stuName}</div>
              <div style="font-size:9.5px;color:rgba(255,255,255,.55);margin-top:2px;">${stuId} · ${className} · ${stu.gender||"—"}</div>
            </div>
            <div style="display:flex;gap:18px;">
              ${[...(opts.show_position!==false?[["Position",positionTxt+"/"+(_classSize||students.length||"—")]]:[]),["Average",avg.toFixed(1)+"%"],["Score",String(totalScore)]].map(([l,v])=>`<div style="text-align:center;"><div style="font-size:18px;font-weight:900;color:#fff;">${v}</div><div style="font-size:8.5px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.5px;">${l}</div></div>`).join("")}
            </div>
          </div>
          <div style="padding:0 32px 10px;">
            <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:${blue};border-bottom:2px solid ${blue};padding-bottom:3px;margin-bottom:8px;">Academic Results</div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;"><thead>${tableHdr}</thead><tbody>${rows}${summary}</tbody></table>
          </div>
          ${opts.show_cae&&caeTraits.length?`<div style="padding:0 32px 10px;">
            <div style="background:${lt};border:1px solid ${brd};border-radius:10px;padding:10px 14px;">
              <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${blue};margin-bottom:7px;">Character &amp; Affective Evaluation</div>
              ${_caeBars(blue,brd)}
            </div>
          </div>`:""}
          ${opts.show_teacher_comment||opts.show_principal_comment?`<div style="padding:0 32px 10px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            ${opts.show_teacher_comment?_commentBox("Group Staff's Comment",classTeacherComment,brd,lt,txt,blue,teacherSigUrl):""}
            ${opts.show_principal_comment?_commentBox("Principal's Remark",principalComment,brd,lt,txt,blue,principalSigUrl,principalStampUrl):""}
          </div>`:""}
          ${opts.show_parent_ack?`<div style="padding:0 32px 10px;">${_parentAck(brd,lt,blue,sft,mut)}</div>`:""}
          <div style="padding:0 32px 12px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;">
            ${_gradeKeyChips(brd,lt)}
            ${_nextTermNote(brd,lt,txt)}
          </div>
          <div style="height:5px;background:linear-gradient(90deg,${orange},${blue});"></div>
        </div>`;
      }

      // ─── T3 Emerald Prestige ───────────────────────────────────────────
      if(_tplId===3){
        const grn="#064e3b", gold="#d4af37", lt="#ecfdf5", brd="#a7f3d0", txt="#052e16", sft="#065f46", mut="#6ee7b7";
        const headThSty=`padding:7px 8px;text-align:center;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:${gold};font-style:italic;background:${grn};`;
        const tableHdr=`<tr style="background:${grn};">
          <th style="${headThSty}text-align:center;">S/N</th>
          <th style="${headThSty}text-align:left;">Subject</th>
          ${_scoreHdrModern(headThSty)}
          <th style="${headThSty}">Total (${perSubjMax})</th>
          <th style="${headThSty}">Grade</th>
          <th style="${headThSty}text-align:left;">Remark</th>
        </tr>`;
        const rows=_rowsT1T3({brd,txt:"#052e16",sft:"#065f46",mut:"#94a3b8",zebra:"#fff"});
        const summary=_summaryRow({bg:grn,acc:gold,mut:"rgba(255,255,255,.6)"});
        return `<div class="report-card" style="font-family:'Georgia',serif;color:${txt};background:#fff;position:relative;overflow:hidden;">
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:200px;font-weight:bold;color:rgba(6,78,59,.04);font-family:Georgia,serif;user-select:none;z-index:0;white-space:nowrap;pointer-events:none;">RGS</div>
          <div style="background:linear-gradient(135deg,${grn},#065f46);padding:20px 32px 16px;position:relative;z-index:1;">
            <div style="border:1px solid ${gold}80;border-radius:9px;padding:11px 16px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;">
                ${logoHtml}
                <div style="flex:1;text-align:center;padding:0 10px;">
                  <div style="color:${gold};font-size:18px;font-weight:bold;letter-spacing:.4px;">${schoolName}</div>
                  <div style="color:rgba(255,255,255,.5);font-size:9px;margin-top:2px;">${schoolAddress}</div>
                  <div style="color:rgba(255,255,255,.6);font-size:9px;font-style:italic;margin-top:3px;">"${schoolMotto}"</div>
                </div>
                ${logoHtml}
              </div>
              <div style="display:flex;align-items:center;gap:8px;margin-top:9px;">
                <div style="flex:1;height:.5px;background:${gold};"></div>
                <div style="color:rgba(255,255,255,.5);font-size:8.5px;letter-spacing:1.5px;text-transform:uppercase;">✦ Academic Report of Excellence ✦</div>
                <div style="flex:1;height:.5px;background:${gold};"></div>
              </div>
            </div>
          </div>
          <div style="background:${lt};border-bottom:2px solid ${gold};padding:10px 32px;position:relative;z-index:1;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
              <div>
                <div style="font-size:8.5px;font-family:system-ui,sans-serif;text-transform:uppercase;color:${grn};letter-spacing:.8px;">Member's Full Name</div>
                <div style="font-size:16px;font-weight:bold;color:${grn};letter-spacing:.3px;">${stuName}</div>
                <div style="font-size:9.5px;color:${sft};margin-top:2px;">${stuId} · ${className} · ${stu.gender||"—"} · ${sessName} · ${termName}</div>
              </div>
              <div style="display:flex;gap:10px;">
                ${[["Position",opts.show_position!==false?positionTxt:"—",opts.show_position!==false?("of "+(students.length||"—")):""],["Average",avg.toFixed(1)+"%",""],["Total",String(totalScore),"/ "+maxScore]].map(([l,v,sub])=>`<div style="text-align:center;background:#fff;border:1px solid ${gold};border-radius:7px;padding:6px 12px;"><div style="font-size:18px;font-weight:bold;color:${grn};font-family:system-ui,sans-serif;">${v}</div>${sub?`<div style="font-size:8.5px;color:${sft};">${sub}</div>`:""}<div style="font-size:8px;color:${sft};text-transform:uppercase;letter-spacing:.5px;margin-top:1px;">${l}</div></div>`).join("")}
              </div>
            </div>
          </div>
          <div style="padding:14px 32px 10px;position:relative;z-index:1;">
            <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:${grn};border-bottom:2px solid ${grn};padding-bottom:3px;margin-bottom:8px;">✦ Performance Record ✦</div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;"><thead>${tableHdr}</thead><tbody>${rows}${summary}</tbody></table>
          </div>
          ${opts.show_cae&&caeTraits.length?`<div style="padding:0 32px 10px;position:relative;z-index:1;">
            <div style="background:${lt};border:1px solid ${brd};border-radius:8px;padding:10px 14px;">
              <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${grn};margin-bottom:7px;">✦ Character &amp; Affective Evaluation ✦</div>
              ${_caeStars(gold)}
            </div>
          </div>`:""}
          ${opts.show_teacher_comment||opts.show_principal_comment?`<div style="padding:0 32px 10px;display:grid;grid-template-columns:1fr 1fr;gap:10px;position:relative;z-index:1;">
            ${opts.show_teacher_comment?_commentBox("✦ Form Staff's Comment",classTeacherComment,brd,lt,txt,grn,teacherSigUrl):""}
            ${opts.show_principal_comment?_commentBox("✦ Principal's Remark",principalComment,brd,lt,txt,grn,principalSigUrl,principalStampUrl):""}
          </div>`:""}
          ${opts.show_parent_ack?`<div style="padding:0 32px 10px;position:relative;z-index:1;">${_parentAck(brd,lt,grn,sft,"#94a3b8")}</div>`:""}
          <div style="padding:0 32px 12px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;position:relative;z-index:1;">
            ${_gradeKeyChips(brd,lt)}
            ${_nextTermNote(brd,lt,txt)}
          </div>
          <div style="background:${grn};padding:8px 32px;display:flex;justify-content:space-between;position:relative;z-index:1;">
            <div style="color:rgba(255,255,255,.4);font-size:8.5px;">${settings.school_email||""}</div>
            <div style="color:${gold};font-size:8.5px;font-style:italic;">${footerText} · Official stamp validates authenticity</div>
            <div style="color:rgba(255,255,255,.4);font-size:8.5px;">${settings.school_phone||""}</div>
          </div>
        </div>`;
      }

      // ─── T4 Bold Blue ──────────────────────────────────────────────────
      if(_tplId===4){
        const blue="#1d4ed8", blueDk="#1e3a8a", lt="#eff6ff", brd="#bfdbfe", txt="#0f172a", sft="#475569", mut="#94a3b8";
        const headThSty=`padding:8px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#fff;background:${blue};`;
        const tableHdr=`<tr>
          <th style="${headThSty}">S/N</th>
          <th style="${headThSty}text-align:left;">Subject</th>
          ${_scoreHdrModern(headThSty)}
          <th style="${headThSty}">Total (${perSubjMax})</th>
          <th style="${headThSty}">Grade</th>
          <th style="${headThSty}text-align:left;">Remark</th>
        </tr>`;
        const rows=_rowsT1T3({brd,txt,sft,mut,zebra:lt});
        const summary=_summaryRow({bg:blueDk,acc:"#fff",mut:"rgba(255,255,255,.6)"});
        return `<div class="report-card" style="font-family:'Helvetica Neue',Arial,sans-serif;color:${txt};background:#fff;border:3px solid ${blue};">
          <div style="background:${blue};padding:18px 32px;display:flex;justify-content:space-between;align-items:center;color:#fff;">
            <div style="display:flex;align-items:center;gap:12px;">
              ${logoHtml}
              <div>
                <div style="font-size:18px;font-weight:900;letter-spacing:-.3px;">${schoolName}</div>
                <div style="font-size:9.5px;opacity:.85;">${schoolAddress}</div>
              </div>
            </div>
            <div style="text-align:right;background:${blueDk};padding:6px 14px;border-radius:6px;">
              <div style="font-size:9px;opacity:.7;text-transform:uppercase;letter-spacing:1px;">Report Card</div>
              <div style="font-size:13px;font-weight:800;">${termName} · ${sessName}</div>
            </div>
          </div>
          <div style="background:${lt};padding:14px 32px;border-bottom:3px solid ${blue};display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;">
            <div>
              <div style="font-size:8.5px;color:${mut};text-transform:uppercase;letter-spacing:.6px;">Member</div>
              <div style="font-size:16px;font-weight:900;color:${blueDk};">${stuName}</div>
              <div style="font-size:9.5px;color:${sft};">${stuId} · ${className} · ${stu.gender||"—"}</div>
            </div>
            <div style="display:flex;gap:10px;">
              ${[...(opts.show_position!==false?[["Position",positionTxt+"/"+(_classSize||students.length||"—")]]:[]),["Average",avg.toFixed(1)+"%"],["Total",String(totalScore)]].map(([l,v])=>`<div style="background:#fff;border:2px solid ${blue};padding:6px 12px;border-radius:6px;text-align:center;min-width:70px;"><div style="font-size:14px;font-weight:900;color:${blueDk};">${v}</div><div style="font-size:8px;color:${mut};text-transform:uppercase;letter-spacing:.5px;">${l}</div></div>`).join("")}
            </div>
          </div>
          <div style="padding:12px 32px 8px;">
            <div style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:1.4px;color:${blue};margin-bottom:6px;">▌Academic Results</div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;border:2px solid ${blue};"><thead>${tableHdr}</thead><tbody>${rows}${summary}</tbody></table>
          </div>
          ${opts.show_cae&&caeTraits.length?`<div style="padding:0 32px 10px;">
            <div style="background:${lt};border-left:4px solid ${blue};padding:10px 14px;border-radius:0 6px 6px 0;">
              <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:${blueDk};margin-bottom:7px;">Character &amp; Affective Evaluation</div>
              ${_caeBars(blue,"#dbeafe")}
            </div>
          </div>`:""}
          ${opts.show_teacher_comment||opts.show_principal_comment?`<div style="padding:0 32px 10px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            ${opts.show_teacher_comment?_commentBox("Group Staff's Comment",classTeacherComment,brd,lt,txt,blueDk,teacherSigUrl):""}
            ${opts.show_principal_comment?_commentBox("Principal's Remark",principalComment,brd,lt,txt,blueDk,principalSigUrl,principalStampUrl):""}
          </div>`:""}
          ${opts.show_parent_ack?`<div style="padding:0 32px 10px;">${_parentAck(blue,lt,blueDk,sft,mut)}</div>`:""}
          <div style="padding:0 32px 12px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;">
            ${_gradeKeyChips(brd,lt)}
            ${_nextTermNote(brd,lt,txt)}
          </div>
          <div style="background:${blueDk};color:#fff;padding:8px 32px;font-size:8.5px;display:flex;justify-content:space-between;">
            <span>${settings.school_email||""}</span><span style="opacity:.7;">${footerText}</span><span>${settings.school_phone||""}</span>
          </div>
        </div>`;
      }

      // ─── T5 Sunrise ────────────────────────────────────────────────────
      if(_tplId===5){
        const orange="#ea580c", amber="#f59e0b", lt="#fff7ed", brd="#fed7aa", txt="#1c1917", sft="#57534e", mut="#a8a29e";
        const headThSty=`padding:7px 8px;text-align:center;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#fff;background:${orange};`;
        const tableHdr=`<tr>
          <th style="${headThSty}">S/N</th>
          <th style="${headThSty}text-align:left;">Subject</th>
          ${_scoreHdrModern(headThSty)}
          <th style="${headThSty}">Total (${perSubjMax})</th>
          <th style="${headThSty}">Grade</th>
          <th style="${headThSty}text-align:left;">Remark</th>
        </tr>`;
        const rows=_rowsT1T3({brd,txt,sft,mut,zebra:lt});
        const summary=_summaryRow({bg:lt,acc:orange,mut:mut});
        return `<div class="report-card" style="font-family:'Segoe UI',system-ui,sans-serif;color:${txt};background:#fff;">
          <div style="background:linear-gradient(135deg,${amber} 0%,${orange} 100%);padding:18px 32px;color:#fff;display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;align-items:center;gap:12px;">
              ${logoHtml}
              <div>
                <div style="font-size:17px;font-weight:900;letter-spacing:-.3px;">${schoolName}</div>
                <div style="font-size:9px;opacity:.9;font-style:italic;">"${schoolMotto}"</div>
                <div style="font-size:8.5px;opacity:.85;">${schoolAddress}</div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:24px;font-weight:900;letter-spacing:-1px;line-height:1;">REPORT</div>
              <div style="font-size:10px;opacity:.9;margin-top:3px;">${termName} · ${sessName}</div>
            </div>
          </div>
          <div style="height:4px;background:linear-gradient(90deg,${orange},${amber},${orange});"></div>
          <div style="padding:14px 32px 8px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;align-items:flex-end;">
            <div>
              <div style="font-size:8.5px;color:${mut};text-transform:uppercase;letter-spacing:.6px;">Member</div>
              <div style="font-size:16px;font-weight:900;color:${orange};">${stuName}</div>
              <div style="font-size:9.5px;color:${sft};">${stuId} · ${className} · ${stu.gender||"—"}</div>
            </div>
            <div style="display:flex;gap:8px;">
              ${[...(opts.show_position!==false?[["Position",positionTxt+"/"+(_classSize||students.length||"—")]]:[]),["Average",avg.toFixed(1)+"%"],["Total",String(totalScore)]].map(([l,v])=>`<div style="background:${lt};border:1.5px solid ${amber};padding:6px 11px;border-radius:20px;text-align:center;min-width:64px;"><div style="font-size:13px;font-weight:900;color:${orange};">${v}</div><div style="font-size:8px;color:${sft};text-transform:uppercase;letter-spacing:.4px;">${l}</div></div>`).join("")}
            </div>
          </div>
          <div style="padding:0 32px 10px;">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:${orange};border-bottom:2px solid ${amber};padding-bottom:3px;margin-bottom:7px;">☀ Academic Results</div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;"><thead>${tableHdr}</thead><tbody>${rows}${summary}</tbody></table>
          </div>
          ${opts.show_cae&&caeTraits.length?`<div style="padding:0 32px 10px;">
            <div style="background:${lt};border-radius:10px;padding:10px 14px;">
              <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${orange};margin-bottom:7px;">Character &amp; Affective Evaluation</div>
              ${_caeStars(amber)}
            </div>
          </div>`:""}
          ${opts.show_teacher_comment||opts.show_principal_comment?`<div style="padding:0 32px 10px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            ${opts.show_teacher_comment?_commentBox("Group Staff's Comment",classTeacherComment,brd,lt,txt,orange,teacherSigUrl):""}
            ${opts.show_principal_comment?_commentBox("Principal's Remark",principalComment,brd,lt,txt,orange,principalSigUrl,principalStampUrl):""}
          </div>`:""}
          ${opts.show_parent_ack?`<div style="padding:0 32px 10px;">${_parentAck(amber,lt,orange,sft,mut)}</div>`:""}
          <div style="padding:0 32px 12px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;">
            ${_gradeKeyChips(brd,lt)}
            ${_nextTermNote(brd,lt,txt)}
          </div>
          <div style="height:4px;background:linear-gradient(90deg,${amber},${orange});"></div>
        </div>`;
      }

      // ─── T6 Royal Crimson ──────────────────────────────────────────────
      if(_tplId===6){
        const crim="#9f1239", crimDk="#7f1d1d", gold="#d4af37", lt="#fef2f2", brd="#fecdd3", txt="#1f2937", sft="#4b5563", mut="#9ca3af";
        const headThSty=`padding:8px;text-align:center;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${gold};background:${crimDk};font-family:Georgia,serif;`;
        const tableHdr=`<tr>
          <th style="${headThSty}">S/N</th>
          <th style="${headThSty}text-align:left;">Subject</th>
          ${_scoreHdrModern(headThSty)}
          <th style="${headThSty}">Total (${perSubjMax})</th>
          <th style="${headThSty}">Grade</th>
          <th style="${headThSty}text-align:left;">Remark</th>
        </tr>`;
        const rows=_rowsT1T3({brd,txt,sft,mut,zebra:lt});
        const summary=_summaryRow({bg:crim,acc:gold,mut:"rgba(255,255,255,.6)"});
        return `<div class="report-card" style="font-family:Georgia,'Times New Roman',serif;color:${txt};background:#fff;border:2px solid ${gold};">
          <div style="background:${crim};padding:16px 32px;display:flex;justify-content:space-between;align-items:center;border-bottom:3px double ${gold};">
            <div style="display:flex;align-items:center;gap:12px;color:#fff;">
              ${logoHtml}
              <div>
                <div style="font-size:17px;font-weight:900;letter-spacing:.3px;color:${gold};">${schoolName}</div>
                <div style="font-size:9px;font-style:italic;opacity:.9;">"${schoolMotto}"</div>
                <div style="font-size:8.5px;opacity:.8;">${schoolAddress}</div>
              </div>
            </div>
            <div style="text-align:right;color:${gold};">
              <div style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">Royal</div>
              <div style="font-size:18px;font-weight:900;letter-spacing:1px;">REPORT CARD</div>
              <div style="font-size:9.5px;color:#fff;opacity:.85;font-style:italic;">${termName} · ${sessName}</div>
            </div>
          </div>
          <div style="background:${lt};padding:12px 32px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;">
            <div>
              <div style="font-size:8.5px;color:${mut};text-transform:uppercase;letter-spacing:.6px;">Member</div>
              <div style="font-size:16px;font-weight:900;color:${crim};">${stuName}</div>
              <div style="font-size:9.5px;color:${sft};">${stuId} · ${className} · ${stu.gender||"—"}</div>
            </div>
            <div style="display:flex;gap:10px;">
              ${[...(opts.show_position!==false?[["Position",positionTxt+"/"+(_classSize||students.length||"—")]]:[]),["Average",avg.toFixed(1)+"%"],["Total",String(totalScore)]].map(([l,v])=>`<div style="background:#fff;border:1.5px solid ${gold};padding:6px 12px;text-align:center;min-width:68px;"><div style="font-size:14px;font-weight:900;color:${crim};">${v}</div><div style="font-size:8px;color:${sft};text-transform:uppercase;letter-spacing:.4px;">${l}</div></div>`).join("")}
            </div>
          </div>
          <div style="padding:12px 32px 8px;">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;color:${crim};border-bottom:2px solid ${gold};padding-bottom:3px;margin-bottom:7px;">✦ Academic Results ✦</div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;"><thead>${tableHdr}</thead><tbody>${rows}${summary}</tbody></table>
          </div>
          ${opts.show_cae&&caeTraits.length?`<div style="padding:0 32px 10px;">
            <div style="background:${lt};border:1px solid ${gold};border-radius:6px;padding:10px 14px;">
              <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${crim};margin-bottom:7px;">Character &amp; Affective Evaluation</div>
              ${_caeStars(gold)}
            </div>
          </div>`:""}
          ${opts.show_teacher_comment||opts.show_principal_comment?`<div style="padding:0 32px 10px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            ${opts.show_teacher_comment?_commentBox("Group Staff's Comment",classTeacherComment,gold,lt,txt,crim,teacherSigUrl):""}
            ${opts.show_principal_comment?_commentBox("Principal's Remark",principalComment,gold,lt,txt,crim,principalSigUrl,principalStampUrl):""}
          </div>`:""}
          ${opts.show_parent_ack?`<div style="padding:0 32px 10px;">${_parentAck(gold,lt,crim,sft,mut)}</div>`:""}
          <div style="padding:0 32px 12px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;">
            ${_gradeKeyChips(gold,lt)}
            ${_nextTermNote(gold,lt,txt)}
          </div>
          <div style="background:${crim};color:${gold};padding:8px 32px;font-size:8.5px;display:flex;justify-content:space-between;font-style:italic;">
            <span>${settings.school_email||""}</span><span>${footerText}</span><span>${settings.school_phone||""}</span>
          </div>
        </div>`;
      }

      // ─── T7 Split Layout ───────────────────────────────────────────────
      if(_tplId===7){
        const cyan="#0891b2", cyanDk="#155e75", lt="#ecfeff", brd="#a5f3fc", txt="#0f172a", sft="#475569", mut="#94a3b8";
        const headThSty=`padding:7px 8px;text-align:center;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#fff;background:${cyan};`;
        const tableHdr=`<tr>
          <th style="${headThSty}">S/N</th>
          <th style="${headThSty}text-align:left;">Subject</th>
          ${_scoreHdrModern(headThSty)}
          <th style="${headThSty}">Total</th>
          <th style="${headThSty}">Grade</th>
          <th style="${headThSty}text-align:left;">Remark</th>
        </tr>`;
        const rows=_rowsT1T3({brd,txt,sft,mut,zebra:lt});
        const summary=_summaryRow({bg:lt,acc:cyanDk,mut:mut});
        return `<div class="report-card" style="font-family:system-ui,-apple-system,sans-serif;color:${txt};background:#fff;display:grid;grid-template-columns:200px 1fr;min-height:1000px;">
          <aside style="background:${cyanDk};color:#fff;padding:20px 16px;display:flex;flex-direction:column;gap:14px;">
            <div style="text-align:center;">
              ${logoHtml}
              <div style="font-size:13px;font-weight:900;margin-top:8px;line-height:1.2;">${schoolName}</div>
              <div style="font-size:8.5px;opacity:.75;margin-top:4px;font-style:italic;">"${schoolMotto}"</div>
            </div>
            <div style="border-top:1px solid rgba(255,255,255,.2);padding-top:12px;">
              <div style="font-size:8.5px;opacity:.7;text-transform:uppercase;letter-spacing:.6px;">Member</div>
              <div style="font-size:13px;font-weight:800;line-height:1.3;margin-top:2px;">${stuName}</div>
              <div style="font-size:9px;opacity:.8;margin-top:3px;">${stuId}</div>
              <div style="font-size:9px;opacity:.8;">${className}</div>
              <div style="font-size:9px;opacity:.8;">${stu.gender||"—"}</div>
            </div>
            <div style="border-top:1px solid rgba(255,255,255,.2);padding-top:12px;">
              <div style="font-size:8.5px;opacity:.7;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">Performance</div>
              ${[...(opts.show_position!==false?[["Position",positionTxt+"/"+(_classSize||students.length||"—")]]:[]),["Average",avg.toFixed(1)+"%"],["Total",String(totalScore)+"/"+maxScore]].map(([l,v])=>`<div style="margin-bottom:8px;"><div style="font-size:8px;opacity:.6;text-transform:uppercase;letter-spacing:.5px;">${l}</div><div style="font-size:14px;font-weight:900;">${v}</div></div>`).join("")}
            </div>
            <div style="border-top:1px solid rgba(255,255,255,.2);padding-top:12px;">
              <div style="font-size:8.5px;opacity:.7;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;">Term</div>
              <div style="font-size:11px;font-weight:700;">${termName}</div>
              <div style="font-size:9px;opacity:.8;">${sessName}</div>
            </div>
            ${opts.show_next_term?`<div style="border-top:1px solid rgba(255,255,255,.2);padding-top:12px;">
              <div style="font-size:8.5px;opacity:.7;text-transform:uppercase;letter-spacing:.6px;">Next Term</div>
              <div style="font-size:10px;font-weight:700;margin-top:3px;">${ntbStr!=="—"?ntbStr:termOpeningDate}</div>
            </div>`:""}
          </aside>
          <main style="padding:18px 24px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:2px solid ${cyan};padding-bottom:8px;">
              <div style="font-size:18px;font-weight:900;color:${cyanDk};letter-spacing:-.3px;">Academic Report</div>
              <div style="font-size:9px;color:${mut};">${schoolAddress}</div>
            </div>
            <div style="margin-bottom:10px;">
              <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${cyan};margin-bottom:5px;">Results</div>
              <table style="width:100%;border-collapse:collapse;font-size:11px;"><thead>${tableHdr}</thead><tbody>${rows}${summary}</tbody></table>
            </div>
            ${opts.show_cae&&caeTraits.length?`<div style="margin-bottom:10px;">
              <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${cyan};margin-bottom:5px;">Character &amp; Affective</div>
              <div style="background:${lt};border-radius:6px;padding:10px 12px;">${_caeBars(cyan,brd)}</div>
            </div>`:""}
            ${opts.show_teacher_comment||opts.show_principal_comment?`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
              ${opts.show_teacher_comment?_commentBox("Staff's Comment",classTeacherComment,brd,lt,txt,cyanDk,teacherSigUrl):""}
              ${opts.show_principal_comment?_commentBox("Principal's Remark",principalComment,brd,lt,txt,cyanDk,principalSigUrl,principalStampUrl):""}
            </div>`:""}
            ${opts.show_parent_ack?`<div style="margin-bottom:10px;">${_parentAck(cyan,lt,cyanDk,sft,mut)}</div>`:""}
            <div>${_gradeKeyChips(brd,lt)}</div>
          </main>
        </div>`;
      }

      // ─── T8 Dark Premium ───────────────────────────────────────────────
      if(_tplId===8){
        const dark="#0f172a", darkLt="#1f2937", gold="#fbbf24", lt="#1e293b", brd="#334155", txt="#e2e8f0", sft="#94a3b8", mut="#64748b";
        const headThSty=`padding:8px;text-align:center;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${gold};background:${dark};border-bottom:1px solid ${brd};`;
        // Custom row builder for dark theme
        const _rowsDark=results.map((r,i)=>{
          const gL=getGrade(r.total_score,gradingSchema);
          const rem=getRemark(r.total_score,gradingSchema);
          const rc=gCol(gL);
          const cs=_parseCS(r);
          const subjBg=i%2===0?darkLt:lt;
          const tdSty=`padding:6px 8px;border-bottom:1px solid ${brd};font-size:10px;color:${txt};`;
          const scoreCells=_hasCC
            ?_cc.map(c=>`<td style="${tdSty}text-align:center;color:${sft};">${cs[c.component_name]!=null?cs[c.component_name]:"—"}</td>`).join("")
            :`<td style="${tdSty}text-align:center;color:${sft};">${r.ca_score??"—"}</td><td style="${tdSty}text-align:center;color:${sft};">${r.exam_score??"—"}</td>`;
          return `<tr style="background:${subjBg};">
            <td style="${tdSty}text-align:center;color:${mut};font-size:9.5px;">${i+1}</td>
            <td style="${tdSty}font-weight:600;">${(r.section_subjects?.name||"—").toString().replace(/</g,"&lt;")}</td>
            ${scoreCells}
            <td style="${tdSty}text-align:center;font-weight:900;font-size:12px;color:${gold};">${r.total_score??"—"}</td>
            <td style="${tdSty}text-align:center;"><span style="background:${rc};color:#fff;border-radius:4px;padding:1px 8px;font-weight:700;font-size:10px;">${gL}</span></td>
            <td style="${tdSty}text-align:center;color:${sft};font-size:9.5px;">${rem}</td>
          </tr>`;
        }).join("");
        const summaryDark=`<tr style="background:${dark};border-top:2px solid ${gold};">
          <td colspan="${2+_scoreColCount}" style="padding:8px;text-align:right;color:${mut};font-size:9.5px;font-style:italic;">Grand Total · Average · ${opts.show_position!==false?"Group Position":"Score"}</td>
          <td style="padding:8px;text-align:center;font-weight:900;font-size:13px;color:${gold};">${totalScore}</td>
          <td style="padding:8px;text-align:center;font-weight:900;font-size:12px;color:${gold};">${avg.toFixed(1)}%</td>
          <td style="padding:8px;text-align:center;font-weight:700;font-size:11px;color:${gold};">${opts.show_position!==false?(positionTxt+" / "+(students.length||"—")):(totalScore+"/"+maxScore)}</td>
        </tr>`;
        const tableHdr=`<tr>
          <th style="${headThSty}">S/N</th>
          <th style="${headThSty}text-align:left;">Subject</th>
          ${_scoreHdrModern(headThSty)}
          <th style="${headThSty}">Total (${perSubjMax})</th>
          <th style="${headThSty}">Grade</th>
          <th style="${headThSty}text-align:left;">Remark</th>
        </tr>`;
        // Dark grade key
        const _darkGradeKey=`<div style="background:${darkLt};border:1px solid ${brd};border-radius:8px;padding:8px 12px;">
          <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${gold};margin-bottom:5px;">Grading Scale</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">${_uniqueGS.map(g=>`<div style="font-size:9.5px;color:${sft};"><b style="color:${gCol(g.grade)};">${g.grade}</b>: ${g.min_score??g.min}–${g.max_score??g.max} (${g.remark})</div>`).join("")}</div>
        </div>`;
        const _darkNextTerm=opts.show_next_term?`<div style="background:${darkLt};border:1px solid ${brd};border-radius:8px;padding:8px 14px;display:flex;align-items:center;gap:10px;white-space:nowrap;">
          <div style="font-size:18px;">📅</div>
          <div><div style="font-size:8.5px;color:${mut};text-transform:uppercase;letter-spacing:.5px;">Next Term Begins</div>
          <div style="font-size:12px;font-weight:800;color:${gold};">${ntbStr!=="—"?ntbStr:termOpeningDate}</div></div>
        </div>`:"";
        const _darkComment=(label,text,sigUrl,stampUrl)=>{
          const sigBlock=sigUrl?`<div style="position:relative;display:inline-block;height:42px;min-width:120px;">
            <img src="${sigUrl}" style="height:42px;max-width:160px;object-fit:contain;display:block;filter:invert(1) brightness(2);"/>
            ${stampUrl?`<img src="${stampUrl}" style="position:absolute;top:-6px;left:60px;height:54px;width:54px;object-fit:contain;opacity:.8;"/>`:""}
          </div>`:`<div style="height:24px;border-bottom:1px solid ${brd};min-width:120px;"></div>`;
          return `<div style="background:${darkLt};border:1px solid ${brd};border-radius:8px;padding:11px 13px;display:flex;flex-direction:column;gap:6px;">
            <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${gold};">${label}</div>
            <div style="font-size:10px;color:${txt};line-height:1.6;flex:1;">${text||"<i style='color:"+mut+";'>No comment provided</i>"}</div>
            <div style="border-top:1px solid ${brd};padding-top:6px;display:flex;align-items:flex-end;gap:14px;font-size:8.5px;color:${mut};">
              ${sigBlock}
              <div style="font-size:8px;color:${mut};flex:1;text-align:right;letter-spacing:.4px;text-transform:uppercase;">Signature</div>
            </div>
          </div>`;
        };
        const _darkAck=opts.show_parent_ack?`<div style="background:${darkLt};border:1.5px dashed ${gold};border-radius:8px;padding:10px 14px;">
          <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${gold};margin-bottom:5px;">Parent / Guardian Acknowledgement</div>
          <div style="font-size:9.5px;color:${sft};line-height:1.5;margin-bottom:6px;">I confirm that I have received, read and understood my ward's academic report card for the ${termName}, ${sessName} session.</div>
          <div style="display:flex;gap:22px;font-size:8.5px;color:${mut};flex-wrap:wrap;">
            <span>Parent's Name: ______________________</span><span>Signature: ______________________</span><span>Date: ________________</span>
          </div>
        </div>`:"";
        return `<div class="report-card" style="font-family:system-ui,-apple-system,sans-serif;color:${txt};background:${dark};">
          <div style="background:linear-gradient(135deg,${dark},${darkLt});padding:18px 32px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ${gold};">
            <div style="display:flex;align-items:center;gap:12px;">
              ${logoHtml}
              <div>
                <div style="font-size:17px;font-weight:900;color:${gold};letter-spacing:-.3px;">${schoolName}</div>
                <div style="font-size:9px;color:${sft};font-style:italic;">"${schoolMotto}"</div>
                <div style="font-size:8.5px;color:${mut};">${schoolAddress}</div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:10px;color:${mut};text-transform:uppercase;letter-spacing:2px;">Premium</div>
              <div style="font-size:20px;font-weight:900;color:${gold};letter-spacing:-.5px;">REPORT CARD</div>
              <div style="font-size:9px;color:${sft};margin-top:2px;">${termName} · ${sessName}</div>
            </div>
          </div>
          <div style="background:${darkLt};margin:14px 32px;border-radius:10px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;border:1px solid ${brd};">
            <div>
              <div style="font-size:8.5px;color:${mut};text-transform:uppercase;letter-spacing:.5px;">Member</div>
              <div style="font-size:15px;font-weight:900;color:${gold};">${stuName}</div>
              <div style="font-size:9.5px;color:${sft};">${stuId} · ${className} · ${stu.gender||"—"}</div>
            </div>
            <div style="display:flex;gap:14px;">
              ${[...(opts.show_position!==false?[["Position",positionTxt+"/"+(_classSize||students.length||"—")]]:[]),["Average",avg.toFixed(1)+"%"],["Total",String(totalScore)]].map(([l,v])=>`<div style="text-align:center;"><div style="font-size:18px;font-weight:900;color:${gold};">${v}</div><div style="font-size:8.5px;color:${mut};text-transform:uppercase;letter-spacing:.5px;">${l}</div></div>`).join("")}
            </div>
          </div>
          <div style="padding:0 32px 10px;">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;color:${gold};margin-bottom:7px;">▎Academic Results</div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid ${brd};"><thead>${tableHdr}</thead><tbody>${_rowsDark}${summaryDark}</tbody></table>
          </div>
          ${opts.show_cae&&caeTraits.length?`<div style="padding:0 32px 10px;">
            <div style="background:${darkLt};border:1px solid ${brd};border-radius:10px;padding:10px 14px;">
              <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${gold};margin-bottom:7px;">Character &amp; Affective Evaluation</div>
              ${caeTraits.map(trait=>{
                const caeR=caeResults.find(c=>c.trait_id===trait.id);
                const rating=caeR?caeRatings.find(r=>r.id===caeR.rating_id):null;
                let n=0;
                if(rating){const v=+(rating.numeric_value??rating.value??0);if(v>0&&v<=5)n=v;else if(rating.label){const L=rating.label.toLowerCase();if(L.includes("excellent"))n=5;else if(L.includes("very good"))n=4;else if(L.includes("good"))n=3;else if(L.includes("fair")||L.includes("pass"))n=2;else if(L.includes("poor")||L.includes("weak"))n=1;else n=3;}}
                const pct=Math.round((n/5)*100);
                return `<div style="margin-bottom:5px;display:flex;align-items:center;gap:8px;">
                  <div style="width:90px;font-size:9.5px;color:${sft};">${trait.category}</div>
                  <div style="flex:1;height:5px;background:${brd};border-radius:3px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:${gold};"></div></div>
                  <div style="font-size:9.5px;font-weight:700;color:${gold};width:24px;text-align:right;">${n}/5</div>
                </div>`;
              }).join("")}
            </div>
          </div>`:""}
          ${opts.show_teacher_comment||opts.show_principal_comment?`<div style="padding:0 32px 10px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            ${opts.show_teacher_comment?_darkComment("Group Staff's Comment",classTeacherComment,teacherSigUrl):""}
            ${opts.show_principal_comment?_darkComment("Principal's Remark",principalComment,principalSigUrl,principalStampUrl):""}
          </div>`:""}
          ${opts.show_parent_ack?`<div style="padding:0 32px 10px;">${_darkAck}</div>`:""}
          <div style="padding:0 32px 14px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;">
            ${_darkGradeKey}
            ${_darkNextTerm}
          </div>
          <div style="background:${dark};border-top:1px solid ${gold};padding:8px 32px;font-size:8.5px;display:flex;justify-content:space-between;color:${mut};">
            <span>${settings.school_email||""}</span><span style="color:${gold};">${footerText}</span><span>${settings.school_phone||""}</span>
          </div>
        </div>`;
      }

      // ─── T9 Nigerian Heritage ──────────────────────────────────────────
      if(_tplId===9){
        const grn="#166534", grnDk="#14532d", wht="#fafaf9", lt="#f0fdf4", brd="#bbf7d0", txt="#1c1917", sft="#44403c", mut="#a8a29e";
        const headThSty=`padding:8px;text-align:center;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#fff;background:${grn};`;
        const tableHdr=`<tr>
          <th style="${headThSty}">S/N</th>
          <th style="${headThSty}text-align:left;">Subject</th>
          ${_scoreHdrModern(headThSty)}
          <th style="${headThSty}">Total (${perSubjMax})</th>
          <th style="${headThSty}">Grade</th>
          <th style="${headThSty}text-align:left;">Remark</th>
        </tr>`;
        const rows=_rowsT1T3({brd,txt,sft,mut,zebra:lt});
        const summary=_summaryRow({bg:grnDk,acc:"#fff",mut:"rgba(255,255,255,.6)"});
        // Tri-stripe header (green-white-green) — Nigerian flag motif
        return `<div class="report-card" style="font-family:Georgia,'Times New Roman',serif;color:${txt};background:#fff;">
          <div style="display:grid;grid-template-columns:1fr 2fr 1fr;height:8px;">
            <div style="background:${grn};"></div><div style="background:${wht};"></div><div style="background:${grn};"></div>
          </div>
          <div style="background:${grn};color:#fff;padding:18px 32px;display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;align-items:center;gap:12px;">
              ${logoHtml}
              <div>
                <div style="font-size:17px;font-weight:900;letter-spacing:-.3px;">${schoolName}</div>
                <div style="font-size:9px;font-style:italic;opacity:.9;">"${schoolMotto}"</div>
                <div style="font-size:8.5px;opacity:.85;">${schoolAddress}</div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:10px;opacity:.85;text-transform:uppercase;letter-spacing:2.5px;">Federal Republic of Nigeria</div>
              <div style="font-size:18px;font-weight:900;letter-spacing:.5px;">ACADEMIC REPORT</div>
              <div style="font-size:9.5px;opacity:.85;font-style:italic;">${termName} · ${sessName}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 2fr 1fr;height:4px;">
            <div style="background:${grn};"></div><div style="background:${wht};"></div><div style="background:${grn};"></div>
          </div>
          <div style="background:${lt};padding:12px 32px;border-bottom:2px solid ${grn};display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;">
            <div>
              <div style="font-size:8.5px;color:${mut};text-transform:uppercase;letter-spacing:.6px;">Member</div>
              <div style="font-size:16px;font-weight:900;color:${grnDk};">${stuName}</div>
              <div style="font-size:9.5px;color:${sft};">${stuId} · ${className} · ${stu.gender||"—"}</div>
            </div>
            <div style="display:flex;gap:10px;">
              ${[...(opts.show_position!==false?[["Position",positionTxt+"/"+(_classSize||students.length||"—")]]:[]),["Average",avg.toFixed(1)+"%"],["Total",String(totalScore)]].map(([l,v])=>`<div style="background:#fff;border:1.5px solid ${grn};padding:6px 12px;text-align:center;min-width:68px;border-radius:4px;"><div style="font-size:14px;font-weight:900;color:${grnDk};">${v}</div><div style="font-size:8px;color:${sft};text-transform:uppercase;letter-spacing:.4px;">${l}</div></div>`).join("")}
            </div>
          </div>
          <div style="padding:12px 32px 8px;">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;color:${grn};border-bottom:2px solid ${grn};padding-bottom:3px;margin-bottom:7px;">★ Academic Results ★</div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;"><thead>${tableHdr}</thead><tbody>${rows}${summary}</tbody></table>
          </div>
          ${opts.show_cae&&caeTraits.length?`<div style="padding:0 32px 10px;">
            <div style="background:${lt};border:1px solid ${brd};border-radius:6px;padding:10px 14px;">
              <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${grnDk};margin-bottom:7px;">Character &amp; Affective Evaluation</div>
              ${_caeStars(grn)}
            </div>
          </div>`:""}
          ${opts.show_teacher_comment||opts.show_principal_comment?`<div style="padding:0 32px 10px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            ${opts.show_teacher_comment?_commentBox("Group Staff's Comment",classTeacherComment,brd,lt,txt,grnDk,teacherSigUrl):""}
            ${opts.show_principal_comment?_commentBox("Principal's Remark",principalComment,brd,lt,txt,grnDk,principalSigUrl,principalStampUrl):""}
          </div>`:""}
          ${opts.show_parent_ack?`<div style="padding:0 32px 10px;">${_parentAck(grn,lt,grnDk,sft,mut)}</div>`:""}
          <div style="padding:0 32px 12px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;">
            ${_gradeKeyChips(brd,lt)}
            ${_nextTermNote(brd,lt,txt)}
          </div>
          <div style="display:grid;grid-template-columns:1fr 2fr 1fr;height:6px;">
            <div style="background:${grn};"></div><div style="background:${wht};"></div><div style="background:${grn};"></div>
          </div>
        </div>`;
      }

      // ─── T10 Geometric Modern ──────────────────────────────────────────
      if(_tplId===10){
        const purp="#7c3aed", purpDk="#5b21b6", pink="#ec4899", lt="#faf5ff", brd="#e9d5ff", txt="#1e1b4b", sft="#475569", mut="#94a3b8";
        const headThSty=`padding:8px;text-align:center;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#fff;background:${purpDk};`;
        const tableHdr=`<tr>
          <th style="${headThSty}">S/N</th>
          <th style="${headThSty}text-align:left;">Subject</th>
          ${_scoreHdrModern(headThSty)}
          <th style="${headThSty}">Total (${perSubjMax})</th>
          <th style="${headThSty}">Grade</th>
          <th style="${headThSty}text-align:left;">Remark</th>
        </tr>`;
        const gradePillFn=(g,rc)=>`<span style="display:inline-flex;width:26px;height:26px;border-radius:6px;transform:rotate(45deg);background:${rc};color:#fff;font-size:10px;font-weight:800;align-items:center;justify-content:center;"><span style="transform:rotate(-45deg);">${g}</span></span>`;
        const rows=_rowsT1T3({brd,txt,sft,mut,zebra:lt,gradePillFn});
        const summary=_summaryRow({bg:lt,acc:purp,mut:mut});
        return `<div class="report-card" style="font-family:system-ui,-apple-system,sans-serif;color:${txt};background:#fff;position:relative;overflow:hidden;">
          <div style="position:absolute;top:-40px;right:-40px;width:160px;height:160px;background:linear-gradient(135deg,${purp},${pink});transform:rotate(45deg);opacity:.15;z-index:0;"></div>
          <div style="position:absolute;bottom:-30px;left:-30px;width:120px;height:120px;background:${purp};transform:rotate(45deg);opacity:.08;z-index:0;"></div>
          <div style="padding:18px 32px 10px;display:flex;justify-content:space-between;align-items:flex-start;position:relative;z-index:1;">
            <div style="display:flex;align-items:center;gap:12px;">
              ${logoHtml}
              <div>
                <div style="font-size:16px;font-weight:900;color:${purpDk};letter-spacing:-.3px;">${schoolName}</div>
                <div style="font-size:9px;color:${mut};font-style:italic;">"${schoolMotto}"</div>
                <div style="font-size:8.5px;color:${mut};">${schoolAddress}</div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="display:inline-block;background:linear-gradient(135deg,${purp},${pink});color:#fff;padding:6px 14px;border-radius:0 12px 0 12px;">
                <div style="font-size:9px;opacity:.85;text-transform:uppercase;letter-spacing:1px;">Report Card</div>
                <div style="font-size:13px;font-weight:800;">${termName}</div>
              </div>
              <div style="font-size:9px;color:${mut};margin-top:3px;">${sessName}</div>
            </div>
          </div>
          <div style="margin:0 32px 12px;background:linear-gradient(135deg,${purp},${pink});border-radius:14px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;color:#fff;position:relative;z-index:1;">
            <div>
              <div style="font-size:8.5px;opacity:.7;text-transform:uppercase;letter-spacing:.6px;">Member</div>
              <div style="font-size:15px;font-weight:900;letter-spacing:-.3px;">${stuName}</div>
              <div style="font-size:9.5px;opacity:.85;">${stuId} · ${className} · ${stu.gender||"—"}</div>
            </div>
            <div style="display:flex;gap:10px;">
              ${[...(opts.show_position!==false?[["Position",positionTxt+"/"+(_classSize||students.length||"—")]]:[]),["Average",avg.toFixed(1)+"%"],["Total",String(totalScore)]].map(([l,v])=>`<div style="background:rgba(255,255,255,.18);border-radius:8px;padding:6px 12px;text-align:center;min-width:64px;backdrop-filter:blur(4px);"><div style="font-size:14px;font-weight:900;">${v}</div><div style="font-size:8px;opacity:.75;text-transform:uppercase;letter-spacing:.5px;">${l}</div></div>`).join("")}
            </div>
          </div>
          <div style="padding:0 32px 10px;position:relative;z-index:1;">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;color:${purp};margin-bottom:6px;">◆ Academic Results</div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;"><thead>${tableHdr}</thead><tbody>${rows}${summary}</tbody></table>
          </div>
          ${opts.show_cae&&caeTraits.length?`<div style="padding:0 32px 10px;position:relative;z-index:1;">
            <div style="background:${lt};border-radius:12px;padding:10px 14px;border:1px solid ${brd};">
              <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${purpDk};margin-bottom:7px;">Character &amp; Affective Evaluation</div>
              ${_caeBars(purp,brd)}
            </div>
          </div>`:""}
          ${opts.show_teacher_comment||opts.show_principal_comment?`<div style="padding:0 32px 10px;display:grid;grid-template-columns:1fr 1fr;gap:10px;position:relative;z-index:1;">
            ${opts.show_teacher_comment?_commentBox("Group Staff's Comment",classTeacherComment,brd,lt,txt,purpDk,teacherSigUrl):""}
            ${opts.show_principal_comment?_commentBox("Principal's Remark",principalComment,brd,lt,txt,purpDk,principalSigUrl,principalStampUrl):""}
          </div>`:""}
          ${opts.show_parent_ack?`<div style="padding:0 32px 10px;position:relative;z-index:1;">${_parentAck(purp,lt,purpDk,sft,mut)}</div>`:""}
          <div style="padding:0 32px 14px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;position:relative;z-index:1;">
            ${_gradeKeyChips(brd,lt)}
            ${_nextTermNote(brd,lt,txt)}
          </div>
          <div style="height:6px;background:linear-gradient(90deg,${purp},${pink},${purp});position:relative;z-index:1;"></div>
        </div>`;
      }
    }

    // ── REPORT CARD TEMPLATE ────────────────────────────────────────────────
    {
      const bdr="#c7d2de";
      // ── Spacing preset (_sp/_spMult hoisted to outer scope above) ───────────
      const sm=`${Math.round(5*_spMult)}px`;    // section gap (3/5/9px)
      const sm2=`${Math.round(3*_spMult)}px`;   // small gap  (2/3/5px)
      const rp=`${Math.round(3*_spMult)}px 4px`; // row cell pad (2/3/5px 4px)
      const sp6=`${Math.round(3*_spMult)}px 6px`; // subj cell pad
      const scSty=`padding:${rp};border:1px solid ${bdr};text-align:center;font-size:8.5px;color:#334155;`;
      const subjSty=`padding:${sp6};border:1px solid ${bdr};font-weight:600;font-size:8px;word-wrap:break-word;overflow-wrap:break-word;line-height:1.3;`;
      const rows=results.map((r,i)=>{const g=getGrade(r.total_score,gradingSchema);const rem=getRemark(r.total_score,gradingSchema);const rc=gCol(g);const cs=_parseCS(r);const scoreTds=_hasCC?_cc.map(c=>`<td style="${scSty}">${cs[c.component_name]!=null?cs[c.component_name]:"—"}</td>`).join(""):`<td style="${scSty}">${r.ca_score!=null?r.ca_score:"—"}</td><td style="${scSty}">${r.exam_score!=null?r.exam_score:"—"}</td>`;return`<tr style="background:${i%2===0?"#fff":"#f1f6fc"};"><td style="${subjSty}">${r.section_subjects?.name||"—"}</td>${scoreTds}<td style="padding:3px 4px;border:1px solid ${bdr};text-align:center;font-weight:800;font-size:9px;">${r.total_score??"—"}</td><td style="padding:3px 4px;border:1px solid ${bdr};text-align:center;font-weight:700;font-size:9px;color:${rc};">${g}</td><td style="padding:3px 5px;border:1px solid ${bdr};font-size:8px;color:${rc};font-weight:600;">${rem}</td></tr>`;}).join("");
      const perSubjMax=caMax+exMax;const maxScore=results.length*perSubjMax;
      const hSty=`text-align:center;padding:3px 2px;font-size:6.5px;font-weight:700;color:#fff;background:#1A4FA0;border:1px solid ${bdr};text-transform:uppercase;vertical-align:bottom;line-height:1.25;word-wrap:break-word;overflow-wrap:break-word;`;
      const _brk=(s)=>s.replace(/\s+/g,"<br>");
      const vScoreHdr=_hasCC?_cc.map(c=>`<th style="${hSty}">${_brk(c.component_name)}<br><span style="font-size:6px;opacity:.85;">(${c.value_or_formula})</span></th>`).join(""):`<th style="${hSty}">CA<br><span style="font-size:6px;opacity:.85;">(${caMax})</span></th><th style="${hSty}">EXAM<br><span style="font-size:6px;opacity:.85;">(${exMax})</span></th>`;
      const scoreColCount=_hasCC?_cc.length:2;
      // Use percentage widths so the Subject column (auto remainder) can never
      // collapse to 0 when the table parent is narrower than expected (e.g.
      // when print CSS forces width:100% and the popup window is narrow). The
      // score columns proportionally shrink instead of starving Subject.
      const _scorePct = scoreColCount<=2 ? 11 : scoreColCount===3 ? 9 : 8;
      const _subjPct  = 100 - (_scorePct*scoreColCount + 9 + 7 + 13); // total/grade/remark
      const colgroup=`<colgroup><col style="width:${_subjPct}%;"/>${`<col style="width:${_scorePct}%;"/>`.repeat(scoreColCount)}<col style="width:9%;"/><col style="width:7%;"/><col style="width:13%;"/></colgroup>`;
      const watermark=logoSrc?`<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.04;pointer-events:none;z-index:0;"><img src="${logoSrc}" style="width:220px;height:220px;object-fit:contain;"/></div>`:`<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.04;pointer-events:none;z-index:0;font-size:110px;font-weight:900;color:#1A4FA0;font-family:Georgia,serif;">RGS</div>`;
      return `<div class="report-card" style="font-family:${rcFontFamily};color:#1a202c;background:#fff;overflow:hidden;">
        <div style="height:5px;background:linear-gradient(90deg,#1A4FA0 30%,#1A8C3C 50%,#E8560A 70%);"></div>
        <div style="background:linear-gradient(135deg,#0d2d6e,#1A4FA0);color:#fff;padding:10px 16px;display:flex;align-items:center;gap:12px;">
          ${logoHtml}
          <div style="flex:1;text-align:center;">
            <div style="font-size:17px;font-weight:900;letter-spacing:1px;text-transform:uppercase;">${schoolName}</div>
            <div style="font-size:9px;color:#b3d4ff;font-style:italic;margin-top:2px;">${schoolAddress}</div>
            <div style="margin-top:5px;display:inline-block;background:rgba(232,86,10,.85);color:#fff;padding:3px 14px;border-radius:12px;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${cls?.sections?.name||"Member Report Card"}</div>
          </div>
          <div style="text-align:center;min-width:64px;flex-shrink:0;background:rgba(255,255,255,.1);border-radius:8px;padding:6px 8px;">
            <div style="font-size:26px;font-weight:900;color:#fff;line-height:1;">${overallG}</div>
            <div style="font-size:11px;font-weight:700;color:#b3d4ff;margin-top:2px;">${avg.toFixed(1)}%</div>
            <div style="font-size:8px;color:#fde68a;font-style:italic;margin-top:1px;">${overallR}</div>
          </div>
        </div>
        <div style="background:#1A8C3C;color:#fff;padding:3px 16px;text-align:center;font-size:9.5px;font-weight:700;letter-spacing:.5px;">${session?.name||""} ${(term?.name||"").toUpperCase()} FINAL REPORT</div>
        <div style="margin:${sm} 10px;border:1px solid ${bdr};font-size:8.5px;display:flex;background:#fafcff;">
          <div style="flex:1;border-right:1px solid ${bdr};">
            <div style="padding:3px 8px;border-bottom:1px solid #e8edf3;display:flex;justify-content:space-between;"><span style="color:#7a8ba3;">Id</span><b style="color:#1A4FA0;">${stu.student_id||stu.id||"—"}</b></div>
            <div style="padding:3px 8px;border-bottom:1px solid #e8edf3;display:flex;justify-content:space-between;"><span style="color:#7a8ba3;">Full Name</span><b style="font-size:9.5px;">${stuName}</b></div>
            <div style="padding:3px 8px;display:flex;justify-content:space-between;"><span style="color:#7a8ba3;">Sex</span><span>${stu.gender||"—"}</span></div>
          </div>
          <div style="flex:1;border-right:1px solid ${bdr};">
            <div style="padding:3px 8px;border-bottom:1px solid #e8edf3;display:flex;justify-content:space-between;"><span style="color:#7a8ba3;">Session / Term</span><b>${session?.name||""} / ${term?.name||""}</b></div>
            <div style="padding:3px 8px;border-bottom:1px solid #e8edf3;display:flex;justify-content:space-between;"><span style="color:#7a8ba3;">Group</span><b>${cls?.name||"—"}</b></div>
            <div style="padding:3px 8px;display:flex;justify-content:space-between;"><span style="color:#7a8ba3;">Issued</span><span>${today}</span></div>
          </div>
          <div style="flex:1;">
            <div style="padding:3px 8px;border-bottom:1px solid #e8edf3;display:flex;justify-content:space-between;"><span style="color:#7a8ba3;">Average</span><b style="font-size:11px;color:${gc};">${avg.toFixed(1)}</b></div>
            <div style="padding:3px 8px;border-bottom:1px solid #e8edf3;display:flex;justify-content:space-between;"><span style="color:#7a8ba3;">Grade</span><b style="color:${gc};font-size:11px;">${overallG}</b></div>
            ${opts.show_position!==false?`<div style="padding:3px 8px;display:flex;justify-content:space-between;"><span style="color:#7a8ba3;">Position</span><b style="color:#1A4FA0;">${_positionMap[stu.id]||"—"} / ${students.length||"—"}</b></div>`
            :`<div style="padding:3px 8px;display:flex;justify-content:space-between;"><span style="color:#7a8ba3;">Remark</span><b style="color:${gc};">${overallR}</b></div>`}
          </div>
        </div>
        <div style="display:flex;gap:6px;margin:0 10px;">
          <div style="flex:1;min-width:0;position:relative;">
            <div style="background:#1A4FA0;color:#fff;text-align:center;padding:3px;font-weight:700;font-size:9px;letter-spacing:.5px;border:1px solid ${bdr};border-bottom:none;">Cognitive Domain</div>
            <div style="position:relative;">
              ${watermark}
              <table style="width:100%;border-collapse:collapse;table-layout:fixed;position:relative;z-index:1;">
                ${colgroup}
                <thead><tr><th style="padding:2px 5px;border:1px solid ${bdr};text-align:left;font-size:8px;color:#fff;background:#1A4FA0;font-weight:700;vertical-align:bottom;">Subject</th>${vScoreHdr}<th style="${hSty}">TOTAL<br><span style="font-size:6px;opacity:.85;">(${perSubjMax})</span></th><th style="padding:2px 2px;border:1px solid ${bdr};text-align:center;font-size:8px;color:#fff;background:#1A4FA0;font-weight:700;width:28px;vertical-align:bottom;">Grade</th><th style="padding:2px 4px;border:1px solid ${bdr};text-align:left;font-size:8px;color:#fff;background:#1A4FA0;font-weight:700;vertical-align:bottom;">Remark</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
          <div style="width:105px;flex-shrink:0;border:1px solid ${bdr};text-align:center;display:flex;flex-direction:column;justify-content:center;padding:10px 5px;background:linear-gradient(180deg,#f0f6ff,#fff);">
            <div style="font-size:8px;color:#7a8ba3;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Total Score</div>
            <div style="font-size:20px;font-weight:900;color:#1A4FA0;margin-top:3px;">${totalScore}<span style="font-size:11px;color:#94a3b8;"> / ${maxScore}</span></div>
            <div style="border-top:2px solid #1A8C3C;margin:8px 12px;"></div>
            <div style="font-size:15px;font-weight:900;color:${gc};">${avg.toFixed(1)}%</div>
            <div style="font-size:11px;font-weight:800;color:${gc};margin-top:2px;">${overallG}</div>
            <div style="font-size:9px;color:#64748b;font-weight:600;margin-top:1px;">${overallR}</div>
          </div>
        </div>
        <div style="margin:${sm} 10px;border:1px solid ${bdr};background:#fafcff;">
          <div style="text-align:center;padding:3px;font-weight:700;font-size:8.5px;color:#fff;background:#1A4FA0;letter-spacing:.5px;">Cognitive Grade Keys</div>
          <div style="padding:3px 8px;font-size:8px;color:#475569;">${gradeKey}</div>
        </div>
        ${opts.show_cae&&caeTraits.length?`<div style="margin:0 10px ${sm};border:1px solid ${bdr};"><div style="text-align:center;padding:3px;font-weight:700;font-size:8.5px;color:#fff;background:#1A8C3C;letter-spacing:.5px;">Affective Domain</div><div style="display:flex;flex-wrap:wrap;">${caeTraits.map(trait=>{const caeR=caeResults.find(c=>c.trait_id===trait.id);const rating=caeR?caeRatings.find(r=>r.id===caeR.rating_id):null;return`<div style="width:50%;padding:2px 8px;font-size:8px;display:flex;justify-content:space-between;border-bottom:1px solid #e8edf3;"><span style="font-weight:600;">${trait.category}</span><span style="font-weight:700;color:${rating?"#1A8C3C":"#94a3b8"};">${rating?(rating.symbol||"")+" "+rating.label:"—"}</span></div>`;}).join("")}</div><div style="padding:2px 8px;font-size:7.5px;color:#64748b;border-top:1px solid #e2e8f0;"><b>Scale:</b> ${ratingLegend}</div></div>`:""}
        <div style="margin:${sm} 10px;border-top:1px solid ${bdr};padding-top:${sm};font-size:8px;">
          ${opts.show_teacher_comment&&classTeacherComment?`
          <div style="margin-bottom:${sm};">
            <div style="font-weight:700;color:#1A4FA0;font-size:9px;">${classTeacherTitle}</div>
            <div style="font-style:italic;font-size:8px;color:#475569;margin-top:2px;">${classTeacherComment}</div>
          </div>`:""}
          ${opts.show_principal_comment&&principalComment?`
          <div style="margin-bottom:${sm};">
            <div style="font-weight:700;color:#E8560A;font-size:9px;">${principalTitle}</div>
            <div style="font-style:italic;font-size:8px;color:#475569;margin-top:2px;">${principalComment}</div>
          </div>`:""}
          ${settings._formTeacherName?`<div style="margin-bottom:8px;font-size:8.5px;border-top:1px solid ${bdr};padding-top:6px;"><span style="color:#7a8ba3;font-weight:600;">Form Staff: </span><b style="color:#1A4FA0;">${settings._formTeacherName}</b></div>`:''}
          <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:10px;">
            <div>
              <div style="font-weight:700;color:#E8560A;font-size:9px;margin-bottom:6px;">${principalTitle}</div>
              <div style="position:relative;display:inline-block;min-width:160px;height:72px;margin-bottom:2px;">
                ${principalSigUrl
                  ?`<img src="${principalSigUrl}" style="height:40px;max-width:150px;object-fit:contain;display:block;position:absolute;bottom:0;left:0;"/>`
                  :`<div style="width:150px;border-bottom:1.5px solid #E8560A;position:absolute;bottom:0;left:0;"></div>`}
                ${principalStampUrl?`<img src="${principalStampUrl}" style="position:absolute;left:0;top:50%;transform:translateY(-50%);height:72px;width:72px;object-fit:contain;opacity:0.82;mix-blend-mode:multiply;"/>`:``}
              </div>
              <div style="font-size:7.5px;color:#94a3b8;">Signature &amp; Stamp</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:7.5px;color:#94a3b8;margin-bottom:2px;">Date of Issue</div>
              <div style="font-size:9px;font-weight:700;color:#1A4FA0;">${today}</div>
            </div>
          </div>
        </div>
        ${opts.show_next_term?`<div style="margin:${sm2} 10px ${sm2};font-size:8.5px;display:flex;gap:24px;"><span><b style="color:#1A8C3C;">Closing Date:</b> ${termClosingDate}</span><span><b style="color:#1A8C3C;">Resumption Date:</b> ${ntbStr!=="—"?ntbStr:termOpeningDate}</span></div>`:""}
        <div style="margin-top:4px;padding:4px 10px;background:linear-gradient(135deg,#0d2d6e,#1A4FA0);color:#b3d4ff;font-size:8px;text-align:center;">${footerText} · ${schoolName} · <b style="color:#fff;">${schoolMotto}</b></div>
        <div style="height:4px;background:linear-gradient(90deg,#E8560A,#1A8C3C,#1A4FA0);"></div>
      </div>`;
    }

  }).join("");

  const rcFilename=pdfName(students.length===1?fullName(students[0]):cls?.name||"GROUP","REPORT",term?.name||"",session?.name||"");

  const fullHtml=`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="${forStorage?'width=device-width,initial-scale=1.0,user-scalable=no':'width=595,initial-scale=1.0,maximum-scale=1.0'}"/>
  <title>${rcFilename}</title>
  <script>document.title=${JSON.stringify(rcFilename)}</script>
  ${forStorage?`<script>
  (function(){
    function scaleCards(){
      var vw=window.innerWidth||document.documentElement.clientWidth||595;
      var CARD=571,PAD=24;
      var avail=vw-PAD;
      var z=avail<CARD?+(avail/CARD).toFixed(4):1;
      var cards=document.querySelectorAll('.report-card');
      cards.forEach(function(c){c.style.zoom=z;});
      document.body.style.padding=z<1?'6px':'12px';
    }
    if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',scaleCards);}
    else{scaleCards();}
    window.addEventListener('resize',scaleCards);
  })();
  </script>`:''}
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    ${forStorage?`
    /* ── STORAGE / EMAIL / DOWNLOAD VIEW ── mirrors the @media print styles so
       the card captures identically to Chrome's "Save as PDF" output (blue
       border, padding, centered layout). */
    *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
    html{
      width:100%!important;
      height:auto!important;overflow-x:hidden!important;
      background:#f4f5f7!important;margin:0!important;padding:0!important;
    }
    body{
      width:100%!important;
      height:auto!important;
      background:#f4f5f7!important;
      margin:0 auto!important;
      padding:12px 16px!important;
      font-family:${rcFontFamily};
      box-sizing:border-box!important;
      display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;
    }
    .report-card{
      width:100%!important;max-width:100%!important;
      margin:0 auto 12px auto!important;
      box-shadow:none!important;
      border:2px solid #1A4FA0!important;
      border-radius:8px!important;
      overflow:hidden!important;
      page-break-after:always;break-after:always;
      page-break-inside:avoid!important;break-inside:avoid!important;
    }
    .report-card:last-child{margin-bottom:0!important;page-break-after:avoid!important;break-after:avoid!important;}
    table{width:100%!important;table-layout:fixed;}
    .no-print{display:none!important;}
    @page{size:A4 portrait;margin:0;}
    `:`
    /* ── PORTAL / DOWNLOAD VIEW ── */
    *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;box-sizing:border-box;}
    html{
      width:595px!important;min-width:595px!important;max-width:595px!important;
      height:auto!important;overflow:visible!important;
      background:#e5e7eb!important;margin:0!important;padding:0!important;
    }
    body{
      width:595px!important;min-width:595px!important;max-width:595px!important;
      height:auto!important;overflow:visible!important;
      background:#e5e7eb!important;
      margin:0 auto!important;
      padding:16px!important;
      font-family:${rcFontFamily};
    }
    .report-card{
      width:563px!important;max-width:563px!important;
      margin:0 auto 12px auto!important;
      box-shadow:0 4px 16px rgba(0,0,0,.15)!important;
      overflow:hidden!important;
      border-radius:6px!important;
      zoom:${rcFontScale};
    }
    .report-card:last-child{margin-bottom:0!important;}
    table{width:100%!important;table-layout:fixed;}
    @page{size:A4 portrait;margin:0;}
    @media print{
      .no-print{display:none!important;position:absolute!important;width:0!important;height:0!important;overflow:hidden!important;}
      html,body{
        width:100%!important;min-width:100%!important;max-width:100%!important;
        background:#f4f5f7!important;margin:0!important;padding:0!important;
      }
      /* Plain block layout in print — flex+justify-content:center caused
         a blank first page when card content spans multiple A4 pages. */
      body{display:block!important;padding:0!important;}
      .report-card{
        width:100%!important;max-width:100%!important;
        margin:0 auto!important;
        box-shadow:none!important;
        border:none!important;
        border-radius:0!important;
        overflow:visible!important;
        page-break-after:always;break-after:always;
        page-break-inside:avoid!important;break-inside:avoid!important;
      }
      .report-card:last-child{page-break-after:avoid!important;break-after:avoid!important;}
    }
    `}
  </style>
  <script>
    // Modern templates (T1-T10): force-fit each card onto a single A4 page.
    // Apply on LOAD (so the print preview shows the final layout) and again
    // on beforeprint (in case anything reflowed). Uses zoom because zoom
    // changes the layout box - Chrome paginates by layout box, not visual.
    function __rcFitModern(){
      if(!document.body.classList.contains('rc-modern')) return;
      var mCards=document.querySelectorAll('.report-card');
      // A4 @96dpi = 794 x 1123 px. @page{margin:0} + Chrome's ~10mm internal
      // margins leave ~277mm ≈ 1048px usable. Target 1040px for safety.
      // Measure at 210mm width (true A4) so height reflects print layout,
      // not the current viewport width — then clear width so CSS width:100%
      // takes over for the actual print render (which fixed the right-side bar).
      var pageH=1040;
      // Font scale from settings (report_card_font_size). Default 1.05 (105%).
      // If content * fontScale fits within pageH, apply fontScale as zoom.
      // If it doesn't fit, use a shrink zoom so card always lands on one page.
      var fontScale=parseFloat(document.body.getAttribute('data-font-scale')||'1');
      mCards.forEach(function(c){
        c.style.zoom='1';c.style.transform='none';c.style.minHeight='0';
        c.style.height='auto';
        // Temporarily fix width to A4 for accurate height measurement.
        c.style.width='210mm';
        void c.offsetHeight;
        var ch=c.scrollHeight;
        // Clear width so CSS width:100% handles it during print (no right bar).
        c.style.width='';
        // Apply font scale if it fits, otherwise shrink to fit (one page always).
        var finalZoom=(ch*fontScale>pageH)?(pageH/ch):fontScale;
        c.style.zoom=String(finalZoom);
      });
    }
    if(document.readyState==='loading'){
      document.addEventListener('DOMContentLoaded',__rcFitModern);
    } else { __rcFitModern(); }
    // Re-fit once webfonts settle (text wrapping can shift heights).
    if(document.fonts&&document.fonts.ready){
      document.fonts.ready.then(function(){ setTimeout(__rcFitModern,50); });
    } else { setTimeout(__rcFitModern,400); }
    window.addEventListener('beforeprint',function(){
      __rcFitModern();
      if(document.body.classList.contains('rc-modern')) return;
      // Classic T11: only shrink when content overflows. No width compensation
      // (the print CSS !important rules block it anyway and the prior attempt
      // collapsed the Subject column when zoom got too aggressive).
      var cards=document.querySelectorAll('.report-card');
      cards.forEach(function(c){
        c.style.zoom='1';c.style.width='';c.style.margin='';
        var ch=c.scrollHeight;
        var pageH=1100; // A4 @96dpi minus a small safety margin
        if(ch>pageH){
          var z=Math.max(pageH/ch,0.5);
          c.style.zoom=z;
        }
      });
    });
    window.addEventListener('afterprint',function(){
      if(document.body.classList.contains('rc-modern')){
        document.querySelectorAll('.report-card').forEach(function(c){
          c.style.zoom='';c.style.transform='';c.style.transformOrigin='';
          c.style.width='';c.style.height='';c.style.minHeight='';
        });
        return;
      }
      var cards=document.querySelectorAll('.report-card');
      cards.forEach(function(c){c.style.zoom='1';c.style.width='100%';c.style.margin='';});
    });
  </script>
  <style id="__rc_modern__">
    /* ── MODERN TEMPLATES (T1–T10): fill A4 page natively ──
       Activated only when body has class "rc-modern". The classic template
       (T11) is unaffected — it keeps the legacy 571px storage / 595px portal
       sizing so existing behavior is preserved. */
    body.rc-modern{
      background:#fff!important;
      padding:0!important;margin:0!important;
      /* Use 100% — never force 210mm on body for Chrome printing.
         @page controls paper size; 210mm on body causes right-side overflow bars. */
      width:100%!important;min-width:0!important;max-width:none!important;
      overflow:hidden!important;
    }
    body.rc-modern .report-card{
      /* width:100% fills @page content area — no hardcoded mm that fights Chrome margins. */
      width:100%;max-width:100%;
      box-sizing:border-box!important;overflow:hidden!important;
      margin:0 auto!important;
      box-shadow:none!important;border-radius:0!important;
      border:none!important;
      page-break-after:always;break-after:page;
      page-break-inside:avoid;
      -webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;
    }
    /* Min-height is SCREEN-only (so the card fills A4 in the preview popup).
       zoom:1 has NO !important here — the beforeprint JS scaler sets
       c.style.zoom=s as an inline style which must win over this rule.
       If zoom:1 had !important it would block the inline zoom and the card
       would never shrink to fit one page. transform:none is kept !important
       because we never use transform for scaling (only zoom). */
    @media screen{
      body.rc-modern .report-card{
        min-height:297mm!important;
        /* zoom:${rcFontScale} — applies font-size setting on screen preview.
           No !important so the beforeprint JS scaler's inline zoom wins.
           Default rcFontScale=1.05 means 105% size, same as classic T11. */
        zoom:${rcFontScale};transform:none!important;
      }
    }
    /* ── Section spacing for T1-T10 ──
       Compact/Spacious settings adjust td/th cell padding.
       !important is needed because T1-T10 templates use inline padding styles. */
    ${_sp==='compact'?`
    body.rc-modern .report-card table td{padding-top:2px!important;padding-bottom:2px!important;}
    body.rc-modern .report-card table th{padding-top:3px!important;padding-bottom:3px!important;}
    body.rc-modern .report-card>div{padding-top:4px!important;padding-bottom:4px!important;}
    `:_sp==='spacious'?`
    body.rc-modern .report-card table td{padding-top:10px!important;padding-bottom:10px!important;}
    body.rc-modern .report-card table th{padding-top:10px!important;padding-bottom:10px!important;}
    body.rc-modern .report-card>div{padding-top:14px!important;padding-bottom:14px!important;}
    `:''}
    body.rc-modern .report-card:last-child{page-break-after:auto;break-after:auto;}
    body.rc-modern *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
    @media print{
      body.rc-modern{
        /* Stay at 100% in print — let @page set the paper dimensions. */
        width:100%!important;min-width:0!important;max-width:none!important;
        padding:0!important;margin:0!important;
      }
      body.rc-modern .report-card{
        width:100%!important;max-width:100%!important;
        margin:0!important;border:none!important;border-radius:0!important;
        box-shadow:none!important;
        /* transform/zoom intentionally NOT reset here so the beforeprint
           JS scaler (which fits content onto one page) is preserved. */
      }
    }
    /* margin:0 maximises usable A4 area. Chrome may add ~10mm UI margins in its
       print dialog but width:100% on the card adapts to whatever Chrome provides
       — the right-side bar was caused by hardcoded 210mm, not by margin:0. */
    @page{size:A4;margin:0;}
  </style>
</head>
<body${_tplId!==11?' class="rc-modern"':''} data-font-scale="${rcFontScale}">
  <div style="width:100%;margin:0;overflow:visible;background:transparent;">
    ${forStorage?'':`<div class="no-print" style="position:fixed;top:16px;right:16px;z-index:999;display:flex;gap:10px;">
      <button onclick="document.querySelectorAll('.no-print').forEach(function(e){e.style.display='none'});window.print();document.querySelectorAll('.no-print').forEach(function(e){e.style.display=''})" style="padding:10px 24px;background:#1A4FA0;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2);">🖨️ Print / Save PDF</button>
      <button onclick="window.close()" style="padding:10px 16px;background:#fff;color:#64748b;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;cursor:pointer;">✕ Close</button>
    </div>
    <div class="no-print" style="text-align:center;padding:16px 0;color:#64748b;font-size:13px;font-family:sans-serif;">
      💡 Click <b>Print / Save PDF</b> → choose <b>Save as PDF</b>, set <b>Margins: None</b> for best results
    </div>`}
    ${cardHtml}
  </div>
</body>
</html>`;
  if(htmlOnly)return fullHtml;
  if(showPDF){openHtmlDoc(fullHtml,{title:rcFilename,showPDF});return;}
  const w=window.open("","_blank");
  if(!w){alert("Please allow popups to generate PDFs.");return;}
  w.document.write(fullHtml);
  w.document.close();
  try{w.document.title=rcFilename;}catch(_){}
  try{w.history.replaceState({},"","/"+encodeURIComponent(rcFilename));}catch(_){}
  w.focus();
}

// ─── ATTENDANCE PAGE ──────────────────────────────────────────────────────────
