/**
 * Tools domain pages:
 *   RecycleBinPage, DataExportPage, ActivityPage,
 *   BroadsheetPage, AuditLogPage, BulkPromotionPage
 */
import React, { useState, useEffect, useMemo, useCallback, useContext } from "react";
import {
  Trash2, Search, RotateCcw, Download, Users, UserCheck, BarChart3,
  Receipt, CalendarCheck, Activity, Table, Loader2, Printer, ClipboardList,
} from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import * as XLSX from "xlsx-js-style";
import { useIsMobile } from "../utils/hooks.js";
import { useConfirm } from "../contexts/confirm.jsx";
import { SectionCtx } from "../contexts/section.jsx";
import { buildBroadsheetHTML } from "../services/pdf/broadsheet.js";
import { fullName, fmt } from "../utils/grades.js";
import { Card, Btn, Badge, Spinner, Modal, AppIcon } from "../components/ui.jsx";

// ─── RECYCLE BIN PAGE ─────────────────────────────────────────────────────────
export function RecycleBinPage({ctx}){
  const{notify,user}=ctx;
  const confirm=useConfirm();
  const[items,setItems]=useState([]);
  const[loading,setLoading]=useState(true);
  const[search,setSearch]=useState('');
  const[typeFilter,setTypeFilter]=useState('all');
  const[restoring,setRestoring]=useState(null);

  const load=async()=>{
    setLoading(true);
    await db.purgeExpiredBinItems();
    const{data}=await db.getRecycleBin();
    setItems(data||[]);
    setLoading(false);
  };
  useEffect(()=>{load();},[]);

  const displayName=(item)=>{
    const d=item.record_data||{};
    if(item.record_type==='student') return (`${d.first_name||''} ${d.last_name||''}`).trim()||item.record_id;
    if(item.record_type==='teacher') return d.full_name||d.display_name||item.record_id;
    return d.name||item.record_id;
  };
  const daysLeft=(exp)=>Math.max(0,Math.ceil((new Date(exp)-Date.now())/(864e5)));
  const typeColor={student:C.blue,teacher:C.green,class:C.orange,section:'#8b5cf6',subject:'#0891b2'};
  const typeLabel={student:'Student',teacher:'Teacher',class:'Class',section:'Section',subject:'Subject'};

  const restore=async(item)=>{
    const name=displayName(item);
    const ok=await confirm({title:`Restore ${typeLabel[item.record_type]||item.record_type}?`,
      message:`Restore "${name}"? It will be re-added to the portal exactly as it was.`,
      confirmLabel:'Restore'});
    if(!ok)return;
    setRestoring(item.id);
    const{error}=await db.restoreFromRecycleBin(item.id);
    setRestoring(null);
    if(error) notify(`Restore failed: ${error.message}`,'error');
    else{notify(`"${name}" restored ✓`);load();}
  };

  const permDelete=async(item)=>{
    const name=displayName(item);
    const ok=await confirm({title:'Delete Forever?',
      message:`Permanently delete "${name}"? This cannot be undone.`,
      confirmLabel:'Delete Forever',danger:true,typeToConfirm:name});
    if(!ok)return;
    await db.permanentDeleteFromBin(item.id);
    notify(`"${name}" permanently deleted`,'warn');
    load();
  };

  const emptyBin=async()=>{
    if(!items.length)return;
    const ok=await confirm({title:'Empty Recycle Bin?',
      message:`Permanently delete all ${items.length} item(s) in the bin? This cannot be undone.`,
      confirmLabel:'Empty Bin',danger:true,typeToConfirm:'EMPTY'});
    if(!ok)return;
    await db.emptyRecycleBin();
    notify('Recycle bin emptied','warn');
    load();
  };

  const filtered=items.filter(item=>{
    const q=search.toLowerCase();
    const name=displayName(item).toLowerCase();
    const matchQ=!q||name.includes(q)||item.record_id.toLowerCase().includes(q)||item.deleted_by.toLowerCase().includes(q);
    const matchT=typeFilter==='all'||item.record_type===typeFilter;
    return matchQ&&matchT;
  });

  const typeCounts=items.reduce((a,i)=>{a[i.record_type]=(a[i.record_type]||0)+1;return a;},{});

  return(
    <div style={{padding:24,maxWidth:1000,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20,gap:12,flexWrap:'wrap'}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
            <Trash2 size={22} color={C.red}/>
            <h2 style={{margin:0,fontSize:20,fontWeight:900,color:C.text}}>Recycle Bin</h2>
            {items.length>0&&<span style={{background:C.redPale,color:C.red,borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:700}}>{items.length}</span>}
          </div>
          <p style={{margin:0,fontSize:12,color:C.muted}}>Deleted items are kept here until their retention period expires. Restore or permanently delete them below.</p>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {items.length>0&&(
            <Btn onClick={emptyBin} color={C.red} style={{fontSize:12,padding:'7px 14px'}}>
              <Trash2 size={13}/> Empty Bin
            </Btn>
          )}
        </div>
      </div>

      {/* Type filter pills */}
      <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
        {['all','student','teacher','class','section','subject'].map(t=>{
          const count=t==='all'?items.length:(typeCounts[t]||0);
          const active=typeFilter===t;
          return(
            <button key={t} onClick={()=>setTypeFilter(t)}
              style={{padding:'5px 12px',borderRadius:20,border:`1.5px solid ${active?(typeColor[t]||C.blue):C.border}`,
                background:active?(typeColor[t]||C.blue)+'18':C.white,
                color:active?(typeColor[t]||C.blue):C.muted,
                fontWeight:active?700:500,fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
              {t==='all'?'All':typeLabel[t]}
              {count>0&&<span style={{background:active?(typeColor[t]||C.blue)+'30':'#e2e8f0',borderRadius:10,padding:'0 6px',fontSize:10,fontWeight:700,color:active?(typeColor[t]||C.blue):C.muted}}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{position:'relative',marginBottom:16}}>
        <Search size={14} style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:C.muted,pointerEvents:'none'}}/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, ID, or deleted by…"
          style={{width:'100%',padding:'9px 12px 9px 34px',border:`1.5px solid ${C.border}`,borderRadius:8,
            fontSize:12,background:C.white,color:C.text,boxSizing:'border-box'}}/>
      </div>

      {/* Content */}
      {loading?(
        <div style={{textAlign:'center',padding:60,color:C.muted,fontSize:13}}>Loading…</div>
      ):filtered.length===0?(
        <div style={{textAlign:'center',padding:60,background:C.offWhite,borderRadius:12,border:`1px dashed ${C.border}`}}>
          <Trash2 size={40} color={C.border} style={{marginBottom:12}}/>
          <div style={{fontWeight:700,color:C.muted,fontSize:14,marginBottom:4}}>
            {items.length===0?'Recycle bin is empty':'No items match your filter'}
          </div>
          <div style={{fontSize:12,color:C.light}}>
            {items.length===0?'Deleted students, teachers, classes, sections, and subjects will appear here.':'Try clearing the search or filter.'}
          </div>
        </div>
      ):(
        <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden'}}>
          {/* Table header */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 110px 130px 90px 120px',gap:0,
            padding:'9px 16px',background:C.offWhite,borderBottom:`1px solid ${C.border}`,
            fontSize:10,fontWeight:800,color:C.muted,textTransform:'uppercase',letterSpacing:.5}}>
            <span>Item</span><span>Deleted By</span><span>Deleted</span><span>Expires</span><span style={{textAlign:'right'}}>Actions</span>
          </div>
          {filtered.map((item,i)=>{
            const name=displayName(item);
            const color=typeColor[item.record_type]||C.muted;
            const days=daysLeft(item.expires_at);
            const urgent=days<=3;
            return(
              <div key={item.id} style={{display:'grid',gridTemplateColumns:'1fr 110px 130px 90px 120px',
                alignItems:'center',gap:0,padding:'11px 16px',
                borderBottom:i<filtered.length-1?`1px solid ${C.border}`:'none',
                background:restoring===item.id?C.offWhite:'transparent'}}>
                {/* Name + type */}
                <div style={{display:'flex',alignItems:'center',gap:9,minWidth:0}}>
                  <span style={{background:color+'18',color,border:`1px solid ${color}30`,
                    borderRadius:6,padding:'2px 7px',fontSize:10,fontWeight:700,flexShrink:0,textTransform:'capitalize'}}>
                    {typeLabel[item.record_type]||item.record_type}
                  </span>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:13,color:C.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</div>
                    <div style={{fontSize:10,color:C.muted}}>ID: {item.record_id}</div>
                  </div>
                </div>
                {/* Deleted by */}
                <div style={{fontSize:11,color:C.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.deleted_by}</div>
                {/* Deleted at */}
                <div style={{fontSize:11,color:C.muted}}>{new Date(item.deleted_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>
                {/* Days left */}
                <div style={{fontSize:11,fontWeight:700,color:urgent?C.red:days<=7?C.orange:C.muted}}>
                  {days===0?'Expires today':`${days}d left`}
                </div>
                {/* Actions */}
                <div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
                  <button onClick={()=>restore(item)} disabled={restoring===item.id}
                    title="Restore" style={{padding:'5px 10px',borderRadius:6,border:`1.5px solid ${C.green}`,
                      background:C.greenPale,color:C.green,fontSize:11,fontWeight:700,cursor:'pointer',
                      opacity:restoring===item.id?0.5:1,display:'flex',alignItems:'center',gap:4}}>
                    <RotateCcw size={11}/> Restore
                  </button>
                  <button onClick={()=>permDelete(item)}
                    title="Delete Forever" style={{padding:'5px 8px',borderRadius:6,border:`1.5px solid ${C.border}`,
                      background:C.white,color:C.red,fontSize:11,cursor:'pointer',display:'flex',alignItems:'center'}}>
                    <Trash2 size={11}/>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer note */}
      {items.length>0&&(
        <div style={{marginTop:12,fontSize:11,color:C.light,textAlign:'center'}}>
          Items are permanently deleted when their retention period expires. Change the retention period in Settings → Portal.
        </div>
      )}
    </div>
  );
}

// ─── DATA EXPORT PAGE ─────────────────────────────────────────────────────────
export function DataExportPage({ctx}){
  const{notify}=ctx;
  const[loading,setLoading]=useState({});
  const[sessions,setSessions]=useState([]);
  const[terms,setTerms]=useState([]);
  const[classes,setClasses]=useState([]);
  const[selSession,setSelSession]=useState("");
  const[selTerm,setSelTerm]=useState("");
  const[selClass,setSelClass]=useState("");

  useEffect(()=>{
    Promise.all([db.getSessions(),db.getClasses()]).then(([s,c])=>{
      setSessions(s.data||[]);setClasses(c.data||[]);
      const a=s.data?.find(x=>x.is_active);if(a){setSelSession(String(a.id));db.getTerms(a.id).then(({data})=>{setTerms(data||[]);const at=data?.find(x=>x.is_active);if(at)setSelTerm(String(at.id));});}
    });
  },[]);
  useEffect(()=>{if(selSession)db.getTerms(+selSession).then(({data})=>setTerms(data||[]));},[selSession]);

  const run=async(key,fn)=>{
    setLoading(p=>({...p,[key]:true}));
    try{await fn();}catch(e){notify("Export failed: "+e.message,"error");}
    setLoading(p=>({...p,[key]:false}));
  };

  const exportStudents=()=>run("students",async()=>{
    const{data}=await db.getStudents();
    const rows=(data||[]).map(s=>({
      "Student ID":s.id,"First Name":s.first_name,"Middle Name":s.middle_name||"","Last Name":s.last_name,
      "Class":s.classes?.name||"","Section":s.classes?.sections?.name||"",
      "Gender":s.gender||"","DOB":s.dob||"","Email":s.email||"","Phone":s.phone||"",
      "Status":s.status||"","Admission Year":s.admission_year||"","Last Login":s.last_login?new Date(s.last_login).toLocaleDateString():"Never",
    }));
    downloadXlsx(rows,"Students");notify(`${rows.length} students exported ✓`);
  });

  const exportTeachers=()=>run("teachers",async()=>{
    const{data}=await db.getTeachers();
    const rows=(data||[]).map(t=>({
      "Staff ID":t.staff_id,"Full Name":t.full_name,"Role":t.role||"teacher",
      "Email":t.email||"","Phone":t.phone||"","Section":t.sections?.name||"",
      "Last Login":t.last_login?new Date(t.last_login).toLocaleDateString():"Never",
    }));
    downloadXlsx(rows,"Teachers");notify(`${rows.length} staff exported ✓`);
  });

  const exportResults=()=>run("results",async()=>{
    if(!selSession||!selTerm){notify("Select a session and term first","error");return;}
    const{data}=await db.getResults({term_id:+selTerm,session_id:+selSession,class_id:selClass?+selClass:undefined});
    const rows=(data||[]).map(r=>({
      "Student ID":r.student_id,"Class":r.class_id,"Subject":r.section_subjects?.name||r.subject_id,
      "CA Score":r.ca_score??""," Exam Score":r.exam_score??""," Total":r.total_score??"",
    }));
    downloadXlsx(rows,"Results");notify(`${rows.length} result rows exported ✓`);
  });

  const exportFees=()=>run("fees",async()=>{
    const{data}=await db.getFeeBills({});
    const rows=(data||[]).map(b=>({
      "Bill ID":b.id,"Student ID":b.student_id,"Class":b.class_id,
      "Total Amount":b.total_amount,"Amount Paid":b.amount_paid,"Balance":b.balance,
      "Status":b.status,"Term":b.term,"Academic Year":b.academic_year,"Due Date":b.due_date||"",
    }));
    downloadXlsx(rows,"FeeBills");notify(`${rows.length} bills exported ✓`);
  });

  const exportAttendance=()=>run("attendance",async()=>{
    if(!selSession||!selTerm){notify("Select a session and term first","error");return;}
    const{data}=await db.getAttendanceSummary(selClass?+selClass:null,+selTerm,+selSession);
    const rows=(data||[]).map(r=>({
      "Student ID":r.student_id,"Present":r.present||0,"Absent":r.absent||0,"Late":r.late||0,"Total Days":r.total||0,
    }));
    downloadXlsx(rows,"Attendance");notify(`Attendance exported ✓`);
  });

  function downloadXlsx(rows,name){
    if(!rows.length){notify("No data to export","error");return;}
    const ws=XLSX.utils.json_to_sheet(rows);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31));
    XLSX.writeFile(wb,`${name}_${new Date().toISOString().slice(0,10)}.xlsx`);
    try{ db.logView('data_export','dataset',name,{name,summary:`${rows.length} rows`}); }catch{}
  }

  const ExportCard=({icon:Ico,title,desc,btnLabel,onExport,loadKey,extra})=>(
    <div style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:12,padding:18,
      display:"flex",flexDirection:"column",gap:10}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:40,height:40,borderRadius:10,background:C.bluePale,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <Ico size={20} color={C.blue}/>
        </div>
        <div>
          <div style={{fontWeight:800,fontSize:13,color:C.text}}>{title}</div>
          <div style={{fontSize:11,color:C.muted,marginTop:2}}>{desc}</div>
        </div>
      </div>
      {extra}
      <Btn onClick={onExport} color={C.blue} disabled={loading[loadKey]} style={{fontSize:12,alignSelf:"flex-start"}}>
        {loading[loadKey]?<><div style={{width:12,height:12,border:"2px solid rgba(255,255,255,.4)",borderTop:"2px solid #fff",borderRadius:"50%",animation:"spin .7s linear infinite"}}/> Exporting…</>:<><Download size={13}/> {btnLabel}</>}
      </Btn>
    </div>
  );

  const FilterRow=(
    <div style={{display:"flex",gap:8,flexWrap:"wrap",padding:"12px 0",borderTop:`1px solid ${C.border}`,marginTop:4}}>
      <select value={selSession} onChange={e=>{setSelSession(e.target.value);setSelTerm("");}}
        style={{padding:"6px 10px",border:`1.5px solid ${C.border}`,borderRadius:7,fontSize:11,background:C.white,color:C.text}}>
        <option value="">All Sessions</option>
        {sessions.map(s=><option key={s.id} value={String(s.id)}>{s.name}{s.is_active?" ✓":""}</option>)}
      </select>
      <select value={selTerm} onChange={e=>setSelTerm(e.target.value)}
        style={{padding:"6px 10px",border:`1.5px solid ${C.border}`,borderRadius:7,fontSize:11,background:C.white,color:C.text}}>
        <option value="">All Terms</option>
        {terms.map(t=><option key={t.id} value={String(t.id)}>{t.name}{t.is_active?" ✓":""}</option>)}
      </select>
      <select value={selClass} onChange={e=>setSelClass(e.target.value)}
        style={{padding:"6px 10px",border:`1.5px solid ${C.border}`,borderRadius:7,fontSize:11,background:C.white,color:C.text}}>
        <option value="">All Classes</option>
        {classes.map(c=><option key={c.id} value={String(c.id)}>{c.name}</option>)}
      </select>
    </div>
  );

  return(
    <div style={{padding:24,maxWidth:900,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
        <Download size={22} color={C.blue}/>
        <h2 style={{margin:0,fontSize:20,fontWeight:900,color:C.text}}>Data Export</h2>
      </div>
      <p style={{margin:"0 0 24px",fontSize:12,color:C.muted}}>Download school data as Excel spreadsheets for reporting, government returns, or archiving.</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <ExportCard icon={Users} title="Students" desc="Full student list with class, status, and contact info." btnLabel="Export Students (.xlsx)" onExport={exportStudents} loadKey="students"/>
        <ExportCard icon={UserCheck} title="Staff" desc="All teachers and managers with roles and contact info." btnLabel="Export Staff (.xlsx)" onExport={exportTeachers} loadKey="teachers"/>
        <ExportCard icon={BarChart3} title="Results" desc="Student scores by subject, class, term, and session." btnLabel="Export Results (.xlsx)" onExport={exportResults} loadKey="results"
          extra={FilterRow}/>
        <ExportCard icon={Receipt} title="Fee Bills" desc="All generated bills with payment status and balances." btnLabel="Export Fee Bills (.xlsx)" onExport={exportFees} loadKey="fees"/>
        <ExportCard icon={CalendarCheck} title="Attendance" desc="Attendance summary per student (present / absent / late)." btnLabel="Export Attendance (.xlsx)" onExport={exportAttendance} loadKey="attendance"
          extra={FilterRow}/>
      </div>
    </div>
  );
}

// ─── ACTIVITY ANALYTICS PAGE ──────────────────────────────────────────────────
export function ActivityPage({ctx}){
  const isMobile=useIsMobile();
  const[data,setData]=useState({students:[],teachers:[]});
  const[loading,setLoading]=useState(true);
  const[tab,setTab]=useState("teachers");
  const[search,setSearch]=useState("");

  useEffect(()=>{
    db.getLoginActivity().then(d=>{setData(d);setLoading(false);});
  },[]);

  const now=Date.now();
  const daysSince=(ts)=>{
    if(!ts)return null;
    const a=new Date(ts); a.setHours(0,0,0,0);
    const b=new Date();   b.setHours(0,0,0,0);
    return Math.max(0,Math.floor((b-a)/864e5));
  };
  const actColor=(d)=>{if(d===null)return C.light;if(d<=1)return C.green;if(d<=7)return C.orange;return C.red;};
  const actLabel=(d)=>{if(d===null)return"Never logged in";if(d===0)return"Today";if(d===1)return"Yesterday";return`${d} days ago`;};

  const list=tab==="teachers"?data.teachers:data.students;
  const filtered=list.filter(u=>{
    const q=search.toLowerCase();
    const name=(u.full_name||fullName(u)).toLowerCase();
    return!q||name.includes(q)||(u.staff_id||u.id||"").toString().toLowerCase().includes(q);
  });

  const buckets={today:0,week:0,month:0,old:0,never:0};
  list.forEach(u=>{const d=daysSince(u.last_login);if(d===null)buckets.never++;else if(d<=1)buckets.today++;else if(d<=7)buckets.week++;else if(d<=30)buckets.month++;else buckets.old++;});

  return(
    <div style={{padding:isMobile?"14px 12px":24,maxWidth:1000,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
        <Activity size={22} color={C.blue}/>
        <h2 style={{margin:0,fontSize:isMobile?17:20,fontWeight:900,color:C.text}}>Login Activity</h2>
      </div>
      <p style={{margin:"0 0 20px",fontSize:12,color:C.muted}}>See who is actively using the portal and who hasn't logged in recently.</p>

      {/* Tab */}
      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {[{v:"teachers",l:"Staff"},{v:"students",l:"Students"}].map(x=>(
          <button key={x.v} onClick={()=>{setTab(x.v);setSearch("");}}
            style={{padding:"7px 18px",borderRadius:8,border:`2px solid ${tab===x.v?C.blue:C.border}`,
              background:tab===x.v?C.blue:"transparent",color:tab===x.v?"#fff":C.muted,
              fontWeight:700,fontSize:12,cursor:"pointer"}}>
            {x.l} ({tab===x.v?filtered.length:x.v==="teachers"?data.teachers.length:data.students.length})
          </button>
        ))}
      </div>

      {/* Activity summary buckets */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(3,1fr)":"repeat(5,1fr)",gap:isMobile?6:8,marginBottom:16}}>
        {[
          {k:"today",l:"Today",c:C.green},{k:"week",l:"This Week",c:C.blue},
          {k:"month",l:"This Month",c:C.orange},{k:"old",l:"Over 30 days",c:C.red},{k:"never",l:"Never",c:C.muted},
        ].map(b=>(
          <div key={b.k} style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:10,padding:isMobile?"10px 6px":"12px",textAlign:"center",minWidth:0}}>
            <div style={{fontSize:isMobile?18:22,fontWeight:900,color:b.c}}>{buckets[b.k]}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:2,lineHeight:1.2}}>{b.l}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{position:"relative",marginBottom:14}}>
        <Search size={13} style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:C.muted,pointerEvents:"none"}}/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${tab==="teachers"?"staff":"students"} by name or ID…`}
          style={{width:"100%",padding:"8px 10px 8px 32px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,background:C.white,color:C.text,boxSizing:"border-box"}}/>
      </div>

      {loading?<Spinner/>:(
        <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
          {!isMobile&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 120px 150px 120px",
              padding:"8px 16px",background:C.offWhite,borderBottom:`1px solid ${C.border}`,
              fontSize:10,fontWeight:800,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>
              <span>Name</span><span>{tab==="teachers"?"Role":"Class"}</span><span>Last Login</span><span>Status</span>
            </div>
          )}
          {filtered.length===0?(
            <div style={{textAlign:"center",padding:32,color:C.muted,fontSize:12}}>No results</div>
          ):filtered.map((u,i)=>{
            const d=daysSince(u.last_login);
            const name=u.full_name||fullName(u);
            const sub=tab==="teachers"?(u.role||"teacher"):(u.classes?.name||"—");
            const lastLogin=u.last_login?new Date(u.last_login).toLocaleString("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"Never";
            if(isMobile){
              return(
                <div key={u.id} style={{padding:"12px 14px",borderBottom:i<filtered.length-1?`1px solid ${C.border}`:"none"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{fontWeight:700,fontSize:13,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div>
                      <div style={{fontSize:10,color:C.muted}}>{u.staff_id||u.id} · <span style={{textTransform:"capitalize"}}>{sub}</span></div>
                    </div>
                    <div style={{fontSize:11,fontWeight:700,color:actColor(d),flexShrink:0}}>{actLabel(d)}</div>
                  </div>
                  <div style={{fontSize:10,color:C.muted,marginTop:4}}>{lastLogin}</div>
                </div>
              );
            }
            return(
              <div key={u.id} style={{display:"grid",gridTemplateColumns:"1fr 120px 150px 120px",
                alignItems:"center",padding:"10px 16px",borderBottom:i<filtered.length-1?`1px solid ${C.border}`:"none"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:C.text}}>{name}</div>
                  <div style={{fontSize:10,color:C.muted}}>{u.staff_id||u.id}</div>
                </div>
                <div style={{fontSize:11,color:C.muted,textTransform:"capitalize"}}>{sub}</div>
                <div style={{fontSize:11,color:C.muted}}>{lastLogin}</div>
                <div style={{fontSize:11,fontWeight:700,color:actColor(d)}}>{actLabel(d)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── BROADSHEET PAGE ──────────────────────────────────────────────────────────
export function BroadsheetPage({ctx}){
  const{notify,role}=ctx;
  const[classes,setClasses]=useState([]);
  const[sessions,setSessions]=useState([]);
  const[terms,setTerms]=useState([]);
  const[selClass,setSelClass]=useState("");
  const[selSession,setSelSession]=useState("");
  const[selTerm,setSelTerm]=useState("");
  const[mode,setMode]=useState("summary"); // summary | detailed
  const[bsData,setBsData]=useState(null);
  const[loading,setLoading]=useState(false);
  const[gradeSchema,setGradeSchema]=useState([]);
  const{schoolName}=useContext(SectionCtx)||{};

  useEffect(()=>{
    Promise.all([db.getClasses(),db.getSessions(),db.getGradingSchema()]).then(([cl,ss,gs])=>{
      setClasses(cl.data||[]);setSessions(ss.data||[]);setGradeSchema(gs.data||[]);
      const active=(ss.data||[]).find(s=>s.is_active);
      if(active){
        setSelSession(String(active.id));
        db.getTerms(active.id).then(({data})=>{setTerms(data||[]);const at=(data||[]).find(t=>t.is_active);if(at)setSelTerm(String(at.id));});
      }
    });
  },[]);

  const loadTerms=async(sid)=>{
    if(!sid)return;
    const{data}=await db.getTerms(sid);setTerms(data||[]);
    const at=(data||[]).find(t=>t.is_active);if(at)setSelTerm(String(at.id));
  };

  const generate=async()=>{
    if(!selClass||!selSession||!selTerm){notify("Select class, session and term first.","error");return;}
    setLoading(true);setBsData(null);
    const d=await db.getBroadsheetData(+selClass,+selTerm,+selSession);
    setLoading(false);
    if(d.error){notify("Error: "+d.error.message,"error");return;}
    setBsData(d);
    if(d.students.length===0) notify("No active students found in this class.","warn");
    else if(d.results.length===0) notify("No results uploaded for this class/term/session yet.","warn");
  };

  const gradeFor=useCallback((score)=>{
    if(score==null||isNaN(score))return'—';
    const g=[...gradeSchema].sort((a,b)=>b.min_score-a.min_score).find(g=>score>=g.min_score);
    return g?g.grade:'F';
  },[gradeSchema]);
  const ordinal=n=>{if(n===1)return'1st';if(n===2)return'2nd';if(n===3)return'3rd';return`${n}th`;};

  const rows=useMemo(()=>{
    if(!bsData)return[];
    const{students,subjects,results}=bsData;
    const rMap={};results.forEach(r=>{rMap[`${r.student_id}_${r.subject_id}`]=r;});

    const withTotals=students.map(stu=>{
      const subjectScores=subjects.map(sub=>{
        const r=rMap[`${stu.id}_${sub.id}`];
        return{subjectId:sub.id,ca:r?.ca_score??null,exam:r?.exam_score??null,total:r?.total_score??null};
      });
      const valid=subjectScores.filter(s=>s.total!=null);
      const grandTotal=valid.reduce((s,ss)=>s+(ss.total||0),0);
      const average=valid.length>0?grandTotal/valid.length:0;
      return{student:stu,subjectScores,grandTotal,average,position:0};
    });

    const sorted=[...withTotals].sort((a,b)=>b.grandTotal-a.grandTotal);
    const posMap={};let pos=1;
    sorted.forEach((row,i)=>{
      if(i>0&&row.grandTotal===sorted[i-1].grandTotal){posMap[row.student.id]=posMap[sorted[i-1].student.id];}
      else posMap[row.student.id]=pos;
      pos++;
    });
    withTotals.forEach(r=>{r.position=posMap[r.student.id]||0;});
    return[...withTotals].sort((a,b)=>a.position-b.position||`${a.student.last_name} ${a.student.first_name}`.localeCompare(`${b.student.last_name} ${b.student.first_name}`));
  },[bsData]);

  const exportExcel=()=>{
    if(!bsData||rows.length===0){notify("Generate the broadsheet first.","error");return;}
    const{subjects}=bsData;
    const cls=classes.find(c=>String(c.id)===selClass);
    const session=sessions.find(s=>String(s.id)===selSession);
    const term=terms.find(t=>String(t.id)===selTerm);

    const hdr1=['#','Student Name','Adm. No.'];
    const hdr2=['','',''];
    subjects.forEach(s=>{
      if(mode==='detailed'){hdr1.push(s.name,'','');hdr2.push('CA','Exam','Total');}
      else{hdr1.push(s.name);hdr2.push('Total');}
    });
    hdr1.push('Grand Total','Average','Position','Grade');hdr2.push('','','','');

    const dataRows=rows.map((row,i)=>{
      const r=[i+1,`${row.student.last_name||''} ${row.student.first_name||''}`.trim(),row.student.admission_number||''];
      row.subjectScores.forEach(ss=>{
        if(mode==='detailed')r.push(ss.ca??'—',ss.exam??'—',ss.total??'—');
        else r.push(ss.total??'—');
      });
      r.push(+row.grandTotal.toFixed(1),+row.average.toFixed(2),ordinal(row.position),gradeFor(row.average));
      return r;
    });

    const avgRow=['','CLASS AVERAGE',''];
    subjects.forEach(sub=>{
      const scores=rows.map(r=>r.subjectScores.find(ss=>ss.subjectId===sub.id)?.total).filter(v=>v!=null);
      const avg=scores.length?+(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1):'—';
      if(mode==='detailed')avgRow.push('','',avg);else avgRow.push(avg);
    });
    avgRow.push(+(rows.reduce((s,r)=>s+r.grandTotal,0)/rows.length).toFixed(1),
                +(rows.reduce((s,r)=>s+r.average,0)/rows.length).toFixed(1),'','');

    const ws=XLSX.utils.aoa_to_sheet([
      [`${cls?.name||'Class'} Broadsheet — ${term?.name||''} ${session?.name||''}`],
      hdr1,hdr2,...dataRows,avgRow,
    ]);
    ws['!cols']=[{wch:4},{wch:22},{wch:10},...subjects.flatMap(()=>mode==='detailed'?[{wch:6},{wch:7},{wch:7}]:[{wch:8}]),{wch:10},{wch:8},{wch:7},{wch:7}];
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Broadsheet');
    XLSX.writeFile(wb,`Broadsheet_${(cls?.name||'Class').replace(/\s/g,'_')}_${(term?.name||'T').replace(/\s/g,'_')}.xlsx`);
    notify("Excel downloaded ✓");
  };

  const exportPDF=()=>{
    if(!bsData||rows.length===0){notify("Generate the broadsheet first.","error");return;}
    const cls=classes.find(c=>String(c.id)===selClass);
    const session=sessions.find(s=>String(s.id)===selSession);
    const term=terms.find(t=>String(t.id)===selTerm);
    const html=buildBroadsheetHTML({rows,subjects:bsData.subjects,cls,session,term,mode,gradeSchema,schoolName});
    try{ db.logView('broadsheet_export','broadsheet',cls?.id,{name:cls?.name,summary:`${term?.name||''} ${session?.name||''} · ${rows.length} students`.trim()}); }catch{}
    const w=window.open('','_blank');
    if(!w){notify("Pop-up blocked — please allow pop-ups for this site.","error");return;}
    w.document.write(html);w.document.close();w.focus();
  };

  const TH=({w,bg,rowSpan,colSpan,children,style={}})=>(
    <th rowSpan={rowSpan} colSpan={colSpan} style={{padding:'6px 4px',background:bg||C.offWhite,
      border:`1px solid ${C.border}`,fontSize:10,fontWeight:800,color:bg?'#fff':C.muted,
      textAlign:'center',whiteSpace:'nowrap',...(w?{width:w,minWidth:w}:{}),...style}}>
      {children}
    </th>
  );
  const TD=({align='center',bold,color,bg,style={},children})=>(
    <td style={{padding:'5px 5px',border:`1px solid ${C.border}`,fontSize:11,
      textAlign:align,fontWeight:bold?700:400,color:color||C.text,
      background:bg||'transparent',...style}}>
      {children}
    </td>
  );

  const cls_sel=classes.find(c=>String(c.id)===selClass);

  return(
    <div style={{padding:24,maxWidth:1400,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
        <Table size={22} color={C.blue}/>
        <h2 style={{margin:0,fontSize:20,fontWeight:900,color:C.text}}>Class Broadsheet</h2>
      </div>
      <p style={{margin:"0 0 18px",fontSize:12,color:C.muted}}>
        Comprehensive class performance table — all students, all subjects, positions and grades. Export as PDF (A3 landscape) or Excel.
      </p>

      <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap",alignItems:"center"}}>
        <select value={selSession} onChange={e=>{setSelSession(e.target.value);setSelTerm("");loadTerms(e.target.value);}}
          style={{padding:"8px 12px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,background:C.white,color:C.text}}>
          <option value="">Session…</option>
          {sessions.map(s=><option key={s.id} value={String(s.id)}>{s.name}{s.is_active?" (active)":""}</option>)}
        </select>
        <select value={selTerm} onChange={e=>setSelTerm(e.target.value)}
          style={{padding:"8px 12px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,background:C.white,color:C.text}}>
          <option value="">Term…</option>
          {terms.map(t=><option key={t.id} value={String(t.id)}>{t.name}{t.is_active?" (active)":""}</option>)}
        </select>
        <select value={selClass} onChange={e=>setSelClass(e.target.value)}
          style={{padding:"8px 12px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,background:C.white,color:C.text,minWidth:140}}>
          <option value="">Class…</option>
          {classes.map(c=><option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
        <div style={{display:"flex",border:`1.5px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
          {[{v:"summary",l:"Summary"},{v:"detailed",l:"Detailed (CA+Exam+Total)"}].map(x=>(
            <button key={x.v} onClick={()=>setMode(x.v)}
              style={{padding:"7px 14px",border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                background:mode===x.v?C.blue:"transparent",color:mode===x.v?"#fff":C.muted}}>
              {x.l}
            </button>
          ))}
        </div>
        <Btn onClick={generate} color={C.orange} disabled={loading||!selClass||!selSession||!selTerm} style={{fontSize:12}}>
          {loading?<><Loader2 size={12} style={{animation:"spin 1s linear infinite",marginRight:4}}/>Generating…</>:<><BarChart3 size={12}/>&nbsp;Generate</>}
        </Btn>
        {bsData&&rows.length>0&&(
          <>
            <Btn onClick={exportExcel} color={C.green} outline style={{fontSize:11}}><Download size={12}/>&nbsp;Excel</Btn>
            <Btn onClick={exportPDF}   color={C.red}   outline style={{fontSize:11}}><Printer size={12}/>&nbsp;PDF (A3)</Btn>
          </>
        )}
      </div>

      {bsData&&rows.length===0&&(
        <div style={{textAlign:"center",padding:50,color:C.muted,fontSize:13}}>
          <Table size={36} color={C.border} style={{marginBottom:10}}/>
          <div>No active students or results found for this selection.</div>
        </div>
      )}

      {bsData&&rows.length>0&&(
        <div style={{borderRadius:12,border:`1.5px solid ${C.border}`,overflow:"hidden"}}>
          <div style={{display:"flex",gap:20,padding:"9px 16px",background:C.offWhite,
            borderBottom:`1px solid ${C.border}`,flexWrap:"wrap",alignItems:"center"}}>
            <div style={{fontWeight:800,fontSize:13,color:C.text}}>{cls_sel?.name}</div>
            <div style={{fontSize:11,color:C.muted}}>{rows.length} students &bull; {bsData.subjects.length} subjects</div>
            <div style={{fontSize:11,color:C.muted}}>Class avg: <strong style={{color:C.blue}}>{(rows.reduce((s,r)=>s+r.average,0)/rows.length).toFixed(1)}</strong></div>
            <div style={{fontSize:11,color:C.muted}}>Highest: <strong style={{color:C.green}}>{Math.max(...rows.map(r=>r.grandTotal)).toFixed(1)}</strong></div>
            <div style={{fontSize:11,color:C.muted}}>Lowest: <strong style={{color:C.red}}>{Math.min(...rows.map(r=>r.grandTotal)).toFixed(1)}</strong></div>
            <div style={{fontSize:11,color:C.muted}}>
              Pass rate: <strong style={{color:C.blue}}>{Math.round(rows.filter(r=>r.average>=50).length/rows.length*100)}%</strong>
            </div>
          </div>

          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,
              minWidth:mode==='detailed'?bsData.subjects.length*110+320:bsData.subjects.length*72+320}}>
              <thead>
                <tr>
                  <TH w={28} bg="#0d2d6e" rowSpan={mode==='detailed'?2:1}>#</TH>
                  <TH w={150} bg="#0d2d6e" rowSpan={mode==='detailed'?2:1} style={{textAlign:"left"}}>Student Name</TH>
                  <TH w={72} bg="#0d2d6e" rowSpan={mode==='detailed'?2:1}>Adm. No.</TH>
                  {bsData.subjects.map(sub=>(
                    <TH key={sub.id} bg="#1A4FA0" colSpan={mode==='detailed'?3:1}>{sub.name}</TH>
                  ))}
                  <TH bg="#0d2d6e" rowSpan={mode==='detailed'?2:1}>Grand Total</TH>
                  <TH bg="#0d2d6e" rowSpan={mode==='detailed'?2:1}>Avg</TH>
                  <TH bg="#0d2d6e" rowSpan={mode==='detailed'?2:1}>Pos</TH>
                  <TH bg="#0d2d6e" rowSpan={mode==='detailed'?2:1}>Grade</TH>
                </tr>
                {mode==='detailed'&&(
                  <tr>
                    {bsData.subjects.map(sub=>(
                      <React.Fragment key={sub.id}>
                        <TH bg="#2563eb" style={{fontSize:9}}>CA</TH>
                        <TH bg="#2563eb" style={{fontSize:9}}>Exam</TH>
                        <TH bg="#1e4fa0" style={{fontSize:9}}>Total</TH>
                      </React.Fragment>
                    ))}
                  </tr>
                )}
              </thead>
              <tbody>
                {rows.map((row,i)=>{
                  const isEven=i%2===0;
                  const rowBg=isEven?C.white:C.offWhite;
                  return(
                    <tr key={row.student.id} style={{background:rowBg}}>
                      <TD style={{fontSize:10,color:C.muted,background:rowBg}}>{i+1}</TD>
                      <TD align="left" bold style={{background:rowBg}}>
                        {row.student.last_name||''} {row.student.first_name||''}
                      </TD>
                      <TD style={{fontSize:10,color:C.muted,background:rowBg}}>{row.student.admission_number||'—'}</TD>
                      {row.subjectScores.map(ss=>(
                        mode==='detailed'?(
                          <React.Fragment key={ss.subjectId}>
                            <TD style={{color:C.muted,fontSize:10,background:rowBg}}>{ss.ca??'—'}</TD>
                            <TD style={{color:C.muted,fontSize:10,background:rowBg}}>{ss.exam??'—'}</TD>
                            <TD bold color={ss.total!=null?(ss.total>=50?C.green:C.red):C.muted} style={{background:rowBg}}>{ss.total??'—'}</TD>
                          </React.Fragment>
                        ):(
                          <TD key={ss.subjectId} bold
                            color={ss.total!=null?(ss.total>=50?C.green:C.red):C.muted}
                            style={{background:rowBg}}>{ss.total??'—'}</TD>
                        )
                      ))}
                      <TD bold color={C.blue} bg={C.bluePale} style={{fontSize:13}}>{row.grandTotal.toFixed(1)}</TD>
                      <TD color={C.blue} bg={C.bluePale}>{row.average.toFixed(1)}</TD>
                      <TD bold color={row.position<=3?C.orange:C.text} style={{background:rowBg,fontSize:12}}>
                        {ordinal(row.position)}
                      </TD>
                      <TD bold style={{fontSize:13,background:rowBg,
                        color:gradeFor(row.average)==='F'?C.red:(gradeFor(row.average).startsWith('A')?C.green:C.text)}}>
                        {gradeFor(row.average)}
                      </TD>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{background:C.bluePale}}>
                  <TD colSpan={3} align="left" bold color={C.blue} style={{background:C.bluePale,fontSize:10,letterSpacing:.3}}>CLASS AVERAGE</TD>
                  {bsData.subjects.map(sub=>{
                    const scores=rows.map(r=>r.subjectScores.find(ss=>ss.subjectId===sub.id)?.total).filter(v=>v!=null);
                    const avg=scores.length?(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1):'—';
                    return mode==='detailed'?(
                      <React.Fragment key={sub.id}>
                        <TD style={{background:C.bluePale}}/>
                        <TD style={{background:C.bluePale}}/>
                        <TD bold color={C.blue} style={{background:C.bluePale}}>{avg}</TD>
                      </React.Fragment>
                    ):(
                      <TD key={sub.id} bold color={C.blue} style={{background:C.bluePale}}>{avg}</TD>
                    );
                  })}
                  <TD bold color={C.blue} style={{background:C.bluePale,fontSize:13}}>{(rows.reduce((s,r)=>s+r.grandTotal,0)/rows.length).toFixed(1)}</TD>
                  <TD bold color={C.blue} style={{background:C.bluePale}}>{(rows.reduce((s,r)=>s+r.average,0)/rows.length).toFixed(1)}</TD>
                  <TD style={{background:C.bluePale}}/>
                  <TD style={{background:C.bluePale}}/>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AUDIT LOG PAGE ───────────────────────────────────────────────────────────
export function AuditLogPage({ctx}){
  const {notify}=ctx;
  const isMobile=useIsMobile();
  const [logs,setLogs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [filterType,setFilterType]=useState("");
  const [filterAction,setFilterAction]=useState("");
  const [filterActor,setFilterActor]=useState("");
  const [fromDate,setFromDate]=useState("");
  const [toDate,setToDate]=useState("");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(0);
  const [expanded,setExpanded]=useState(null);
  const PAGE_SIZE=50;

  const loadLogs=(reset=false)=>{
    setLoading(true);
    const filters={limit:5000};
    if(fromDate)filters.from=new Date(fromDate).toISOString();
    if(toDate){const d=new Date(toDate);d.setHours(23,59,59,999);filters.to=d.toISOString();}
    db.getAdminAuditLog(filters).then(({data})=>{setLogs(data||[]);setLoading(false);if(reset)setPage(0);});
  };
  useEffect(()=>{loadLogs(true);},[fromDate,toDate]);

  const actionIcon=(a)=>({status_change:"↻",delete:"✕",edit:"✎",create:"+",
    login_success:"→",login_failed:"⚠",logout:"←",logout_kicked:"⏏",logout_idle:"⏱",
    role_change:"⇄",results_upsert:"Σ",setting_change:"⚙",bulk_delete:"✕",bulk_status_change:"↻",
    page_view:"👁",report_card_view:"👁",report_card_print:"🖨",report_card_generate:"📄",
    report_card_view_bulk:"👁",report_card_print_bulk:"🖨",report_card_generate_bulk:"📄",
    transcript_open:"📜",broadsheet_export:"📊",data_export:"⇩"}[a]||"•");
  const actionLabel=(a)=>({status_change:"Status Change",delete:"Deleted",edit:"Edited",create:"Created",
    login_success:"Login",login_failed:"Login Failed",logout:"Logout",logout_kicked:"Kicked",logout_idle:"Idle Logout",
    role_change:"Role Change",results_upsert:"Results Saved",setting_change:"Setting Changed",
    bulk_delete:"Bulk Delete",bulk_status_change:"Bulk Status",
    page_view:"Page View",report_card_view:"Report Viewed",report_card_print:"Report Printed",
    report_card_generate:"Report Generated",report_card_view_bulk:"Reports Viewed (bulk)",
    report_card_print_bulk:"Reports Printed (bulk)",report_card_generate_bulk:"Reports Generated (bulk)",
    transcript_open:"Transcript Opened",broadsheet_export:"Broadsheet Exported",data_export:"Data Exported"}[a]||a);
  const typeColor=(t)=>({student:C.blue,educator:C.green,teacher:C.green,result:C.purple,
    auth:C.orange,setting:"#6366f1",member:C.muted,fee:C.green,bill:C.green,
    page:C.muted,report_card:C.blue,transcript:C.purple,broadsheet:C.orange,dataset:C.muted}[t]||C.muted);
  const actionColor=(a)=>({login_success:C.green,login_failed:C.red,logout:C.muted,logout_kicked:C.red,
    delete:C.red,bulk_delete:C.red,create:C.green,edit:C.blue,role_change:C.purple,
    results_upsert:C.purple,setting_change:"#6366f1",
    page_view:C.muted,report_card_view:C.blue,report_card_print:C.blue,report_card_generate:C.blue,
    report_card_view_bulk:C.blue,report_card_print_bulk:C.blue,report_card_generate_bulk:C.blue,
    transcript_open:C.purple,broadsheet_export:C.orange,data_export:C.muted}[a]||C.text);

  const actors=useMemo(()=>{const s=new Set();logs.forEach(l=>{if(l.performed_by)s.add(l.performed_by);});return[...s].sort();},[logs]);
  const actions=useMemo(()=>{const s=new Set();logs.forEach(l=>{if(l.action)s.add(l.action);});return[...s].sort();},[logs]);
  const entityTypes=useMemo(()=>{const s=new Set();logs.forEach(l=>{if(l.entity_type)s.add(l.entity_type);});return[...s].sort();},[logs]);

  const filtered=useMemo(()=>logs.filter(l=>{
    if(filterType&&l.entity_type!==filterType)return false;
    if(filterAction&&l.action!==filterAction)return false;
    if(filterActor&&!(l.performed_by||"").toLowerCase().includes(filterActor.toLowerCase())&&
       !(l.actor_email||"").toLowerCase().includes(filterActor.toLowerCase()))return false;
    if(search){const q=search.toLowerCase();
      if(!(l.entity_name||"").toLowerCase().includes(q)&&
         !(l.entity_id||"").toLowerCase().includes(q)&&
         !(l.performed_by||"").toLowerCase().includes(q)&&
         !(l.summary||"").toLowerCase().includes(q)&&
         !(l.notes||"").toLowerCase().includes(q))return false;}
    return true;
  }),[logs,filterType,filterAction,filterActor,search]);

  const paged=filtered.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const safePage=Math.min(page,totalPages-1);

  const exportCSV=()=>{
    const rows=[["Date","Action","Type","ID","Name","Summary","Old Value","New Value","Actor","Actor Email","Actor Role","IP","Session"],...filtered.map(l=>[
      new Date(l.performed_at).toLocaleString("en-NG"),
      l.action,l.entity_type,l.entity_id,l.entity_name||"",l.summary||l.notes||"",
      JSON.stringify(l.old_value||""),JSON.stringify(l.new_value||""),
      l.performed_by,l.actor_email||"",l.actor_type||"",l.ip_address||"",l.session_id||""
    ])];
    const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\n");
    const a=document.createElement("a");a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download=`audit_trail_${new Date().toISOString().slice(0,10)}.csv`;a.click();
  };
  const clearFilters=()=>{setSearch("");setFilterType("");setFilterAction("");setFilterActor("");setFromDate("");setToDate("");setPage(0);};

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="audit-log" size={20}/>Audit Trail</h2>
          <p style={{color:C.muted,fontSize:12}}>Every action by every user — logins, edits, deletes, results, settings. Click a row to see full details.</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={()=>loadLogs(false)} color={C.blue} outline>Refresh</Btn>
          <Btn onClick={exportCSV} color={C.green} outline>Export CSV</Btn>
        </div>
      </div>
      <Card style={{padding:12,marginBottom:12}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:8,alignItems:"end"}}>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>Search</label>
            <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="Name, ID, actor, note…"
              style={{width:"100%",padding:"7px 10px",border:`1.5px solid ${C.border}`,borderRadius:6,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>Actor</label>
            <select value={filterActor} onChange={e=>{setFilterActor(e.target.value);setPage(0);}}
              style={{width:"100%",padding:"7px 10px",border:`1.5px solid ${C.border}`,borderRadius:6,fontSize:13,background:C.white,outline:"none",boxSizing:"border-box",cursor:"pointer"}}>
              <option value="">All users</option>
              {actors.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>Action</label>
            <select value={filterAction} onChange={e=>{setFilterAction(e.target.value);setPage(0);}}
              style={{width:"100%",padding:"7px 10px",border:`1.5px solid ${C.border}`,borderRadius:6,fontSize:13,background:C.white,outline:"none",boxSizing:"border-box",cursor:"pointer"}}>
              <option value="">All actions</option>
              {actions.map(a=><option key={a} value={a}>{actionLabel(a)}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>Entity</label>
            <select value={filterType} onChange={e=>{setFilterType(e.target.value);setPage(0);}}
              style={{width:"100%",padding:"7px 10px",border:`1.5px solid ${C.border}`,borderRadius:6,fontSize:13,background:C.white,outline:"none",boxSizing:"border-box",cursor:"pointer"}}>
              <option value="">All entities</option>
              {entityTypes.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>From</label>
            <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}
              style={{width:"100%",padding:"7px 10px",border:`1.5px solid ${C.border}`,borderRadius:6,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>To</label>
            <input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}
              style={{width:"100%",padding:"7px 10px",border:`1.5px solid ${C.border}`,borderRadius:6,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div style={{display:"flex",alignItems:"end"}}>
            {(search||filterType||filterAction||filterActor||fromDate||toDate)
              ?<Btn outline color={C.muted} onClick={clearFilters} style={{width:"100%"}}>Clear all</Btn>
              :<div style={{fontSize:11,color:C.muted,padding:"8px 0"}}>{filtered.length} of {logs.length} event(s)</div>}
          </div>
        </div>
        {(search||filterType||filterAction||filterActor||fromDate||toDate)&&(
          <div style={{marginTop:8,fontSize:11,color:C.muted}}>
            Showing {filtered.length.toLocaleString()} of {logs.length.toLocaleString()} event(s)
          </div>
        )}
      </Card>
      {loading?<Spinner/>:filtered.length===0?(
        <Card style={{textAlign:"center",padding:52}}>
          <div style={{marginBottom:10}}><ClipboardList size={40} color={C.muted}/></div>
          <div style={{fontWeight:800,color:C.blue,fontSize:16}}>No Audit Records</div>
          <div style={{color:C.muted,fontSize:13,marginTop:6}}>No events match the current filters.</div>
        </Card>
      ):(
        <>
        <Card style={{padding:0,overflow:isMobile?"auto":"hidden"}}>
          <table style={{width:"100%",minWidth:isMobile?720:undefined,borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:C.offWhite,borderBottom:`2px solid ${C.border}`}}>
                {["When","Actor","Action","Entity","Summary / Change",""].map(h=>(
                  <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:11,fontWeight:800,
                    color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((l,i)=>{
                const isOpen=expanded===l.id;
                return(
                  <React.Fragment key={l.id}>
                    <tr style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:C.offWhite,cursor:"pointer"}}
                        onClick={()=>setExpanded(isOpen?null:l.id)}>
                      <td style={{padding:"10px 14px",fontSize:12,color:C.muted,whiteSpace:"nowrap"}}>
                        {new Date(l.performed_at).toLocaleString("en-NG",{day:"numeric",month:"short",year:"2-digit",hour:"2-digit",minute:"2-digit"})}
                      </td>
                      <td style={{padding:"10px 14px",fontSize:12}}>
                        <div style={{fontWeight:700,color:C.text}}>{l.performed_by||"System"}</div>
                        {l.actor_email&&<div style={{color:C.muted,fontSize:10}}>{l.actor_email}</div>}
                      </td>
                      <td style={{padding:"10px 14px"}}>
                        <span style={{fontSize:13,display:"flex",alignItems:"center",gap:6,color:actionColor(l.action),fontWeight:700}}>
                          <span>{actionIcon(l.action)}</span>
                          <span style={{fontSize:12}}>{actionLabel(l.action)}</span>
                        </span>
                      </td>
                      <td style={{padding:"10px 14px",fontSize:12}}>
                        {l.entity_type&&<Badge color={typeColor(l.entity_type)} style={{fontSize:10,marginRight:6}}>{l.entity_type}</Badge>}
                        <div style={{fontWeight:700,color:C.text,marginTop:3}}>{l.entity_name||"—"}</div>
                        {l.entity_id&&<div style={{color:C.muted,fontSize:10}}>{l.entity_id}</div>}
                      </td>
                      <td style={{padding:"10px 14px",fontSize:12,color:C.muted,maxWidth:280,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {l.summary||(l.old_value&&l.new_value?(
                          <span>
                            <span style={{color:C.red}}>{JSON.stringify(l.old_value).slice(0,60)}</span>
                            {" → "}
                            <span style={{color:C.green,fontWeight:700}}>{JSON.stringify(l.new_value).slice(0,60)}</span>
                          </span>
                        ):l.notes||(l.new_value?JSON.stringify(l.new_value).slice(0,80):"—"))}
                      </td>
                      <td style={{padding:"10px 14px",fontSize:11,color:C.muted,whiteSpace:"nowrap"}}>
                        {isOpen?"▼":"▶"}
                      </td>
                    </tr>
                    {isOpen&&(
                      <tr style={{background:C.bluePale}}>
                        <td colSpan={6} style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`}}>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,fontSize:12}}>
                            <div><strong style={{color:C.blue}}>Actor</strong><div>{l.performed_by}</div>
                              {l.actor_email&&<div style={{color:C.muted,fontSize:11}}>{l.actor_email}</div>}
                              {l.actor_type&&<div style={{color:C.muted,fontSize:11}}>Role: {l.actor_type}</div>}
                              {l.actor_id&&<div style={{color:C.muted,fontSize:11}}>ID: {l.actor_id}</div>}
                            </div>
                            <div><strong style={{color:C.blue}}>Session</strong>
                              <div style={{color:C.muted,fontSize:11,wordBreak:"break-all"}}>{l.session_id||"—"}</div>
                              {l.ip_address&&<div style={{color:C.muted,fontSize:11}}>IP: {l.ip_address}</div>}
                              {l.user_agent&&<div style={{color:C.muted,fontSize:10,maxHeight:60,overflow:"auto"}}>{l.user_agent}</div>}
                            </div>
                            <div><strong style={{color:C.blue}}>Target</strong>
                              <div>{l.entity_type||"—"} / {l.entity_id||"—"}</div>
                              <div style={{color:C.muted,fontSize:11}}>{l.entity_name||""}</div>
                            </div>
                            <div><strong style={{color:C.blue}}>When</strong>
                              <div>{new Date(l.performed_at).toLocaleString("en-NG")}</div>
                            </div>
                          </div>
                          {(l.old_value||l.new_value)&&(
                            <div style={{marginTop:14,display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
                              <div>
                                <strong style={{color:C.red,fontSize:11,textTransform:"uppercase",letterSpacing:.5}}>Before</strong>
                                <pre style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:10,fontSize:11,overflow:"auto",maxHeight:240,margin:0}}>
{l.old_value?JSON.stringify(l.old_value,null,2):"—"}
                                </pre>
                              </div>
                              <div>
                                <strong style={{color:C.green,fontSize:11,textTransform:"uppercase",letterSpacing:.5}}>After</strong>
                                <pre style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:10,fontSize:11,overflow:"auto",maxHeight:240,margin:0}}>
{l.new_value?JSON.stringify(l.new_value,null,2):"—"}
                                </pre>
                              </div>
                            </div>
                          )}
                          {l.notes&&<div style={{marginTop:10,fontSize:12,color:C.muted}}><strong>Notes:</strong> {l.notes}</div>}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
        {totalPages>1&&(
          <div style={{display:"flex",flexDirection:isMobile?"column":"row",justifyContent:"space-between",alignItems:isMobile?"stretch":"center",gap:8,marginTop:12,fontSize:12,color:C.muted}}>
            <div style={{textAlign:isMobile?"center":"left"}}>Page {safePage+1} of {totalPages} · {filtered.length.toLocaleString()} event(s)</div>
            <div style={{display:"flex",gap:6,justifyContent:"center"}}>
              <Btn outline color={C.muted} onClick={()=>setPage(0)} disabled={safePage===0}>First</Btn>
              <Btn outline color={C.muted} onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={safePage===0}>Prev</Btn>
              <Btn outline color={C.muted} onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={safePage>=totalPages-1}>Next</Btn>
              <Btn outline color={C.muted} onClick={()=>setPage(totalPages-1)} disabled={safePage>=totalPages-1}>Last</Btn>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}

// ─── BULK PROMOTION PAGE ──────────────────────────────────────────────────────
export function BulkPromotionPage({ctx}){
  const {notify,user}=ctx;
  const confirm=useConfirm();
  const [tab,setTab]=useState("run");        // "run" | "map"
  const [classes,setClasses]=useState([]);
  const [students,setStudents]=useState([]);
  const [sessions,setSessions]=useState([]);
  const [terms,setTerms]=useState([]);
  const [loading,setLoading]=useState(true);
  const [selectedSession,setSelectedSession]=useState("");
  const [activeRun,setActiveRun]=useState(null);   // {run, decisions} | null
  const [nextSessionName,setNextSessionName]=useState("");
  const [busy,setBusy]=useState(false);

  const load=()=>{
    setLoading(true);
    Promise.all([db.getClasses(),db.getStudents(),db.getSessions(),db.getTerms()]).then(([c,s,se,t])=>{
      setClasses(c.data||[]);setStudents(s.data||[]);setSessions(se.data||[]);setTerms(t.data||[]);
      setLoading(false);
    });
  };
  useEffect(load,[]);

  // Default the session picker to the active session.
  useEffect(()=>{
    if(!selectedSession&&sessions.length){
      const act=sessions.find(s=>s.is_active)||sessions[0];
      if(act)setSelectedSession(String(act.id));
    }
  },[sessions]); // eslint-disable-line

  const refreshRun=async(sid=selectedSession)=>{
    if(!sid){setActiveRun(null);return;}
    const {data}=await db.getActivePromotionRun(sid);
    setActiveRun(data||null);
  };
  useEffect(()=>{refreshRun();},[selectedSession]); // eslint-disable-line

  // Outstanding fee balance per student in the run — a graduating student's debt
  // has nowhere to carry forward (they'll never be billed again), so we surface it.
  const [balances,setBalances]=useState({});
  useEffect(()=>{
    const ids=(activeRun?.decisions||[]).map(d=>String(d.student_id));
    if(!ids.length){setBalances({});return;}
    db.getOutstandingBalancesForStudents(ids).then(({data})=>setBalances(data||{}));
  },[activeRun]);
  const bal=id=>balances[String(id)]||0;

  function suggestNextName(name){
    const m=(name||"").match(/(\d{4})\s*\/\s*(\d{4})/);
    return m?`${+m[1]+1}/${+m[2]+1}`:"";
  }
  useEffect(()=>{
    const sess=sessions.find(s=>String(s.id)===String(selectedSession));
    setNextSessionName(suggestNextName(sess?.name));
  },[selectedSession,sessions]);

  const classById=useMemo(()=>Object.fromEntries(classes.map(c=>[c.id,c])),[classes]);
  const classNm=id=>classById[id]?.name||"—";
  const stuName=useMemo(()=>{
    const m={};students.forEach(s=>{m[String(s.id)]=fullName(s)||s.name||String(s.id);});return m;
  },[students]);

  const activeCountByClass=useMemo(()=>{
    const m={};students.forEach(s=>{if((s.status||"active")==="active"&&s.class_id)m[s.class_id]=(m[s.class_id]||0)+1;});return m;
  },[students]);
  const terminalWithStudents=useMemo(()=>classes.filter(c=>!c.promotes_to_class_id&&activeCountByClass[c.id]),[classes,activeCountByClass]);

  const decisions=activeRun?.decisions||[];
  const runStatus=activeRun?.run?.status;
  const committed=runStatus==="committed";
  const promoteCount=decisions.filter(d=>d.decision==="promote").length;
  const repeatCount=decisions.filter(d=>d.decision==="repeat").length;
  const gradCount=decisions.filter(d=>d.decision==="graduate").length;

  // Graduating students who still owe — their debt won't carry forward.
  const gradsOwing=decisions.filter(d=>d.decision==="graduate"&&bal(d.student_id)>0);
  const gradsOwingTotal=gradsOwing.reduce((a,d)=>a+bal(d.student_id),0);

  const grouped=useMemo(()=>{
    const g={};decisions.forEach(d=>{(g[d.from_class_id]=g[d.from_class_id]||[]).push(d);});
    return Object.entries(g).map(([cid,ds])=>[+cid,ds]).sort((a,b)=>classNm(a[0]).localeCompare(classNm(b[0])));
  },[decisions,classes]);

  const promoTermName=useMemo(()=>{
    const t=terms.filter(t=>String(t.session_id)===String(selectedSession)).slice().sort((a,b)=>(b.term_order||0)-(a.term_order||0))[0];
    return t?.name||"the final term";
  },[terms,selectedSession]);

  // ── Actions ──
  const setPromotesTo=async(classId,toId)=>{
    await db.setPromotesTo(classId,toId||null);
    load();
  };
  const arm=async()=>{
    if(!selectedSession)return;
    setBusy(true);
    const {error}=await db.armPromotionRun(selectedSession,user?.name||"admin");
    setBusy(false);
    if(error){notify("Could not arm promotion: "+error.message,"error");return;}
    await refreshRun();
    notify("Promotion armed — everyone defaults to Promote. Mark your exceptions below.","success");
  };
  const setDecision=async(d,decision)=>{
    let to_class_id=null;
    if(decision==="promote"){
      to_class_id=classById[d.from_class_id]?.promotes_to_class_id||null;
      if(!to_class_id){notify(`${classNm(d.from_class_id)} has no destination in the Progression Map — set it first.`,"warn");return;}
    }
    await db.updatePromotionDecision(d.id,{decision,to_class_id});
    await refreshRun();
  };
  const discard=async()=>{
    if(!await confirm({title:"Discard draft?",message:"Deletes this armed promotion draft. Nothing has been moved yet.",confirmLabel:"Discard",danger:true}))return;
    await db.discardPromotionRun(activeRun.run.id);
    await refreshRun();
  };
  const commit=async()=>{
    if(!nextSessionName.trim()){notify("Enter a name for the next session","error");return;}
    const ok=await confirm({title:"Commit promotions?",
      message:`This moves ${promoteCount} student(s) up, keeps ${repeatCount} back, graduates ${gradCount}, and creates the draft session "${nextSessionName}". You can undo this afterwards.`,
      confirmLabel:"Commit"});
    if(!ok)return;
    setBusy(true);
    const {data,error}=await db.commitPromotionRun(activeRun.run.id,{committedBy:user?.name||"admin",nextSessionName:nextSessionName.trim()});
    setBusy(false);
    if(error){notify("Commit failed: "+error.message,"error");return;}
    await refreshRun();load();
    notify(`Committed — ${data.promoted} promoted, ${data.graduated} graduated. Draft session "${nextSessionName}" created (inactive).`,"success");
  };
  const revert=async()=>{
    if(!await confirm({title:"Undo this promotion?",message:"Restores every student's previous class and status, and removes the drafted next session if it hasn't been activated. This reverses the whole run.",confirmLabel:"Undo Promotion",danger:true}))return;
    setBusy(true);
    const {error}=await db.revertPromotionRun(activeRun.run.id);
    setBusy(false);
    if(error){notify("Undo failed: "+error.message,"error");return;}
    await refreshRun();load();
    notify("Promotion reverted — students restored to their previous classes.","warn");
  };

  const printList=(title,filterFn)=>{
    const list=decisions.filter(filterFn);
    const owed=list.reduce((a,d)=>a+bal(d.student_id),0);
    const rows=list.slice()
      .sort((a,b)=>classNm(a.from_class_id).localeCompare(classNm(b.from_class_id))||(stuName[String(a.student_id)]||"").localeCompare(stuName[String(b.student_id)]||""))
      .map(d=>{const b=bal(d.student_id);return `<tr><td style="border:1px solid #cbd5e1;padding:5px 9px">${stuName[String(d.student_id)]||d.student_id}</td><td style="border:1px solid #cbd5e1;padding:5px 9px">${d.student_id}</td><td style="border:1px solid #cbd5e1;padding:5px 9px">${classNm(d.from_class_id)}</td><td style="border:1px solid #cbd5e1;padding:5px 9px">${d.decision==="promote"?"→ "+classNm(d.to_class_id):d.decision==="graduate"?"Graduated":"Repeats"}</td><td style="border:1px solid #cbd5e1;padding:5px 9px;text-align:right;${b>0?"color:#b91c1c;font-weight:700":"color:#94a3b8"}">${b>0?fmt(b):"—"}</td></tr>`;}).join("");
    const html=`<html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:Arial,sans-serif;padding:24px;color:#111"><h2 style="margin:0 0 4px">${title}</h2><div style="color:#64748b;font-size:12px;margin-bottom:14px">${sessions.find(s=>String(s.id)===String(selectedSession))?.name||""} · ${list.length} student(s)${owed>0?` · outstanding: <b style="color:#b91c1c">${fmt(owed)}</b>`:""}</div><table style="border-collapse:collapse;font-size:13px;width:100%"><thead><tr style="background:#0d2d6e;color:#fff"><th style="border:1px solid #0d2d6e;padding:6px 9px;text-align:left">Student</th><th style="border:1px solid #0d2d6e;padding:6px 9px;text-align:left">ID</th><th style="border:1px solid #0d2d6e;padding:6px 9px;text-align:left">From Class</th><th style="border:1px solid #0d2d6e;padding:6px 9px;text-align:left">Outcome</th><th style="border:1px solid #0d2d6e;padding:6px 9px;text-align:right">Balance</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    ctx.showPDF ? ctx.showPDF(html,title) : (()=>{const w=window.open("","_blank");w.document.write(html);w.document.close();})();
  };

  const DEC=[
    {id:"promote",label:"Promote",color:C.green},
    {id:"repeat", label:"Repeat", color:C.amber},
    {id:"graduate",label:"Graduate",color:C.purple},
  ];

  return(
    <div>
      <div style={{marginBottom:18}}>
        <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="bulk-promote" size={20}/>Promotions & Rollover</h2>
        <p style={{color:C.muted,fontSize:12}}>End-of-session promotion. Everyone promotes by default via the map — you just mark the exceptions.</p>
      </div>

      <div style={{display:"flex",gap:4,marginBottom:18,background:C.offWhite,borderRadius:10,padding:4,width:"fit-content"}}>
        {[{id:"run",label:"Run Promotion"},{id:"map",label:"Progression Map"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"8px 18px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,
              background:tab===t.id?C.blue:"transparent",color:tab===t.id?"#fff":C.muted,transition:"all .15s"}}>
            {t.label}
          </button>
        ))}
      </div>

      {loading?<Spinner/>:tab==="map"?(
        /* ══ PROGRESSION MAP ══ */
        <Card>
          <div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:4}}>Class Progression Map</div>
          <div style={{color:C.muted,fontSize:12,marginBottom:16}}>Set where each class's students move at promotion. Leave a class as <b>Graduate</b> if it's the final class (its students leave the school). Set once — reused every year.</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {classes.slice().sort((a,b)=>(a.name||"").localeCompare(b.name||"")).map(c=>(
              <div key={c.id} style={{display:"grid",gridTemplateColumns:"1fr auto 1.2fr",gap:10,alignItems:"center",
                padding:"8px 12px",background:C.offWhite,borderRadius:8}}>
                <span style={{fontWeight:700,fontSize:13}}>{c.name}
                  {activeCountByClass[c.id]?<span style={{color:C.muted,fontWeight:400}}> · {activeCountByClass[c.id]} active</span>:null}
                </span>
                <span style={{color:C.blue,fontSize:16}}>→</span>
                <select value={c.promotes_to_class_id?String(c.promotes_to_class_id):""}
                  onChange={e=>setPromotesTo(c.id,e.target.value)}
                  style={{padding:"7px 10px",border:`1.5px solid ${c.promotes_to_class_id?C.border:C.purple}`,borderRadius:7,
                    fontSize:13,background:C.white,color:C.text,cursor:"pointer"}}>
                  <option value="">Graduate (leaves school)</option>
                  {classes.filter(x=>x.id!==c.id).map(x=><option key={x.id} value={String(x.id)}>{x.name}</option>)}
                </select>
              </div>
            ))}
            {!classes.length&&<div style={{color:C.muted,fontSize:13,padding:12}}>No classes found.</div>}
          </div>
        </Card>
      ):(
        /* ══ RUN PROMOTION ══ */
        <>
          <Card style={{marginBottom:14}}>
            <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div style={{flex:"1 1 220px"}}>
                <label style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.6,display:"block",marginBottom:6}}>Session to close</label>
                <select value={selectedSession} onChange={e=>setSelectedSession(e.target.value)}
                  style={{width:"100%",padding:"10px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,background:C.white,color:C.text,cursor:"pointer"}}>
                  <option value="">Select session…</option>
                  {sessions.map(s=><option key={s.id} value={String(s.id)}>{s.name}{s.is_active?" (active)":""}</option>)}
                </select>
              </div>
              {selectedSession&&!activeRun&&(
                <div style={{fontSize:12,color:C.muted,flex:"1 1 240px"}}>
                  Promotion term: <b style={{color:C.blue}}>{promoTermName}</b>. Arming snapshots all active students, defaulting everyone to Promote via the map.
                </div>
              )}
            </div>

            {/* Not yet armed */}
            {selectedSession&&!activeRun&&(
              <div style={{marginTop:14}}>
                {terminalWithStudents.length>0&&(
                  <div style={{background:C.amberPale,border:`1px solid ${C.amber}44`,borderRadius:8,padding:"10px 13px",fontSize:12,color:C.amber,marginBottom:12}}>
                    <b>Heads up:</b> these classes have no destination in the map, so their active students will default to <b>Graduate</b>: {terminalWithStudents.map(c=>c.name).join(", ")}. If that's wrong, set their destination on the <b>Progression Map</b> tab first.
                  </div>
                )}
                <Btn onClick={arm} color={C.orange} disabled={busy}
                  style={{width:"100%",justifyContent:"center",padding:"12px"}}>
                  {busy?"Arming…":"Arm Promotion for this session"}
                </Btn>
              </div>
            )}

            {/* Armed / committed summary */}
            {activeRun&&(
              <div style={{marginTop:14,display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                <Badge color={committed?C.green:C.orange}>{committed?"Committed":"Armed — draft"}</Badge>
                <Badge color={C.green}>{promoteCount} promote</Badge>
                <Badge color={C.amber}>{repeatCount} repeat</Badge>
                <Badge color={C.purple}>{gradCount} graduate</Badge>
                <div style={{flex:1}}/>
                <Btn xs outline color={C.blue} onClick={()=>printList("Promotion List",d=>d.decision==="promote")}>Promotion List</Btn>
                <Btn xs outline color={C.amber} onClick={()=>printList("Repeaters List",d=>d.decision==="repeat")}>Repeaters</Btn>
                <Btn xs outline color={C.purple} onClick={()=>printList("Graduates List",d=>d.decision==="graduate")}>Graduates</Btn>
              </div>
            )}

            {/* Graduating-with-debt warning — their balance can't carry forward */}
            {activeRun&&gradsOwing.length>0&&(
              <div style={{marginTop:12,padding:"11px 14px",background:C.redPale,border:`1.5px solid ${C.red}44`,borderRadius:9,
                display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <span style={{fontSize:16}}>⚠️</span>
                <span style={{flex:1,fontSize:12.5,color:C.red,minWidth:220}}>
                  <b>{gradsOwing.length}</b> graduating student{gradsOwing.length!==1?"s":""} still owe{gradsOwing.length!==1?"":"s"} a total of <b>{fmt(gradsOwingTotal)}</b>. Once graduated they won't be billed again, so this debt <b>won't carry forward</b> — clear or record it before committing.
                </span>
                <Btn xs outline color={C.red} onClick={()=>printList("Graduates with Outstanding Balances",d=>d.decision==="graduate"&&bal(d.student_id)>0)}>View list</Btn>
              </div>
            )}
          </Card>

          {/* Commit / revert bar */}
          {activeRun&&!committed&&(
            <Card style={{marginBottom:14,border:`1.5px solid ${C.orange}33`}}>
              <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div style={{flex:"1 1 220px"}}>
                  <label style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.6,display:"block",marginBottom:6}}>Next session name (created as draft)</label>
                  <input value={nextSessionName} onChange={e=>setNextSessionName(e.target.value)} placeholder="e.g. 2026/2027"
                    style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:13,boxSizing:"border-box",color:C.text,background:C.white}}/>
                </div>
                <Btn onClick={commit} color={C.green} disabled={busy}>{busy?"Committing…":"Commit Promotions"}</Btn>
                <Btn onClick={discard} color={C.muted} outline disabled={busy}>Discard</Btn>
              </div>
              <div style={{fontSize:11,color:C.muted,marginTop:8}}>The next session is created <b>inactive</b> — you activate it separately when the new year begins.</div>
            </Card>
          )}
          {activeRun&&committed&&(
            <Card style={{marginBottom:14,border:`1.5px solid ${C.green}33`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
                <div style={{fontSize:13,color:C.text}}>
                  Committed by <b>{activeRun.run.committed_by||"—"}</b>
                  {activeRun.run.to_session_id&&<span> · draft session created</span>}
                </div>
                <Btn onClick={revert} color={C.red} outline disabled={busy}>{busy?"Undoing…":"Undo this Promotion"}</Btn>
              </div>
            </Card>
          )}

          {/* Review grouped by class */}
          {activeRun&&grouped.map(([cid,ds])=>{
            const dest=classById[cid]?.promotes_to_class_id;
            return(
              <Card key={cid} style={{marginBottom:12}}>
                <div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:10}}>
                  {classNm(cid)} <span style={{color:C.muted,fontWeight:600,fontSize:12}}>· {ds.length} student{ds.length!==1?"s":""} {dest?`· promotes to ${classNm(dest)}`:"· terminal (graduates)"}</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {ds.slice().sort((a,b)=>(stuName[String(a.student_id)]||"").localeCompare(stuName[String(b.student_id)]||"")).map(d=>(
                    <div key={d.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",background:C.offWhite,borderRadius:8,flexWrap:"wrap"}}>
                      <div style={{flex:1,minWidth:140}}>
                        <span style={{fontWeight:600,fontSize:13}}>{stuName[String(d.student_id)]||d.student_id}</span>
                        <span style={{color:C.muted,fontSize:11,marginLeft:6}}>{d.student_id}</span>
                        {bal(d.student_id)>0&&(
                          <span title="Outstanding fee balance"
                            style={{marginLeft:8,fontSize:10,fontWeight:800,color:C.red,background:`${C.red}14`,
                              border:`1px solid ${C.red}33`,padding:"1px 7px",borderRadius:99,whiteSpace:"nowrap"}}>
                            owes {fmt(bal(d.student_id))}
                          </span>
                        )}
                      </div>
                      {!committed?(
                        <div style={{display:"flex",gap:4}}>
                          {DEC.map(opt=>{
                            const on=d.decision===opt.id;
                            const disabled=opt.id==="promote"&&!dest;
                            return(
                              <button key={opt.id} onClick={()=>!disabled&&setDecision(d,opt.id)} disabled={disabled}
                                title={disabled?"No destination in the map — set it on the Progression Map tab":""}
                                style={{padding:"4px 11px",borderRadius:6,fontSize:11,fontWeight:700,cursor:disabled?"not-allowed":"pointer",
                                  border:`1.5px solid ${on?opt.color:C.border}`,background:on?opt.color:C.white,
                                  color:on?"#fff":disabled?C.light:C.muted,opacity:disabled?.5:1}}>
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      ):(
                        <Badge color={d.decision==="promote"?C.green:d.decision==="graduate"?C.purple:C.amber}>
                          {d.decision==="promote"?"→ "+classNm(d.to_class_id):d.decision==="graduate"?"Graduated":"Repeated"}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
          {activeRun&&!grouped.length&&(
            <Card><div style={{color:C.muted,fontSize:13,padding:12,textAlign:"center"}}>No active students were snapshotted for this session.</div></Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── ADMIN TOOLS HUB ──────────────────────────────────────────────────────────
export function AdminToolsPage({ctx}){
  const {setPage}=ctx;

  const TOOLS=[
    {id:"bulk-promote",  icon:"bulk-promote",  label:"Promotions",
     desc:"End-of-session promotion via the class map, with review, commit & undo.",
     color:"#7C3AED",bg:"#F5F3FF"},
    {id:"export",        icon:"export",        label:"Data Export",
     desc:"Download students, staff, results, fees, and attendance as Excel files.",
     color:"#0369A1",bg:"#E0F2FE"},
    {id:"activity",      icon:"activity",      label:"Login Activity",
     desc:"View login history, failed attempts, and session duration across all users.",
     color:"#0F766E",bg:"#F0FDFA"},
    {id:"audit-log",     icon:"audit-log",     label:"Audit Trail",
     desc:"Full chronological record of every admin action taken in the portal.",
     color:"#B45309",bg:"#FFFBEB"},
    {id:"recycle-bin",   icon:"recycle-bin",   label:"Recycle Bin",
     desc:"Restore soft-deleted records or permanently remove them from the system.",
     color:"#DC2626",bg:"#FEF2F2"},
  ];

  return(
    <div style={{maxWidth:860,margin:"0 auto",paddingBottom:40}}>
      <div style={{background:`linear-gradient(135deg,#1e3a5f,#1A4FA0)`,
        padding:"20px 28px",marginBottom:28,display:"flex",alignItems:"center",gap:16,borderRadius:14}}>
        <div style={{background:"rgba(255,255,255,.18)",borderRadius:10,padding:10,display:"flex"}}>
          <AppIcon name="database" size={22} color="#fff"/>
        </div>
        <div>
          <h2 style={{color:"#fff",fontWeight:900,fontSize:18,margin:0}}>Admin Tools</h2>
          <p style={{color:"rgba(255,255,255,.75)",fontSize:12,margin:"2px 0 0"}}>
            Maintenance, exports, audit history and system utilities
          </p>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:16}}>
        {TOOLS.map(t=>(
          <div key={t.id} onClick={()=>setPage(t.id)}
            style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:14,
              padding:"20px 22px",cursor:"pointer",transition:"all .15s",
              boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=t.color;e.currentTarget.style.boxShadow=`0 4px 16px ${t.color}22`;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,.06)";}}>
            <div style={{width:46,height:46,borderRadius:12,background:t.bg,
              display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14}}>
              <AppIcon name={t.icon} size={22} color={t.color}/>
            </div>
            <div style={{fontWeight:800,fontSize:14,color:C.text,marginBottom:6}}>{t.label}</div>
            <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>{t.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
