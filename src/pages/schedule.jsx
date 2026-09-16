/**
 * Schedule pages: Attendance, Academic Calendar, Timetable.
 */
import React, { useState, useEffect, useMemo } from "react";
import {
  ClipboardList, BarChart3, CalendarDays, Plus, Pencil, CalendarCheck, Trash2,
} from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { useConfirm } from "../contexts/confirm.jsx";
import {
  Card, Btn, Badge, Sel, Spinner, Modal, AppIcon,
} from "../components/ui.jsx";

// ─── ATTENDANCE PAGE ──────────────────────────────────────────────────────────
export function AttendancePage({ctx}){
  const {notify,role,user,canAccess}=ctx;
  const canManage=role==="admin"||canAccess("action:manage_attendance");
  const [sessions,setSessions]=useState([]);
  const [terms,setTerms]=useState([]);
  const [classes,setClasses]=useState([]);
  const [students,setStudents]=useState([]);
  const [selSession,setSelSession]=useState("");
  const [selTerm,setSelTerm]=useState("");
  const [selClass,setSelClass]=useState("");
  const [selDate,setSelDate]=useState(new Date().toISOString().split("T")[0]);
  const [attendance,setAttendance]=useState({});
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [viewMode,setViewMode]=useState("daily");
  const [summaryData,setSummaryData]=useState([]);
  const filterTerms=terms.filter(t=>t.session_id===+selSession);

  useEffect(()=>{
    Promise.all([db.getSessions(),db.getClasses()]).then(([s,c])=>{
      const allClasses=c.data||[];
      setSessions(s.data||[]);
      const active=s.data?.find(x=>x.is_active);
      if(active){
        setSelSession(String(active.id));
        db.getTerms(active.id).then(({data})=>{
          setTerms(data||[]);
          const at=data?.find(x=>x.is_active);
          if(at)setSelTerm(String(at.id));
        });
      }
      if(role==="teacher"&&user?.teacher_db_id){
        db.getTeacherSubjects(user.teacher_db_id).then(({data})=>{
          const ids=[...new Set((data||[]).map(a=>a.class_id))];
          setClasses(allClasses.filter(c=>ids.includes(c.id)));
        });
      } else {
        setClasses(allClasses);
      }
    });
  },[]);

  useEffect(()=>{
    if(!selClass)return;
    db.getStudents().then(({data})=>setStudents((data||[]).filter(s=>s.class_id===+selClass&&(s.status||"active")==="active")));
  },[selClass]);

  useEffect(()=>{
    if(!selClass||!selDate)return;
    setLoading(true);
    db.getAttendance({class_id:+selClass,date:selDate}).then(({data})=>{
      const map={};(data||[]).forEach(r=>{map[r.student_id]=r.status;});
      setAttendance(map);setLoading(false);
    });
  },[selClass,selDate]);

  useEffect(()=>{
    if(viewMode==="summary"&&selClass&&selTerm&&selSession&&students.length>0)loadSummary();
  },[viewMode,selClass,selTerm,selSession,students]);

  const loadSummary=async()=>{
    setLoading(true);
    const {data}=await db.getAttendanceSummary(+selClass,+selTerm,+selSession);
    const byStudent={};
    (data||[]).forEach(r=>{
      if(!byStudent[r.student_id])byStudent[r.student_id]={present:0,absent:0,late:0,excused:0,total:0};
      byStudent[r.student_id][r.status]=(byStudent[r.student_id][r.status]||0)+1;
      byStudent[r.student_id].total++;
    });
    setSummaryData(students.map(s=>({student:s,...({present:0,absent:0,late:0,excused:0,total:0,...(byStudent[s.id]||{})})})));
    setLoading(false);
  };

  const setAll=status=>{const m={};students.forEach(s=>{m[s.id]=status;});setAttendance(m);};

  const save=async()=>{
    if(!selClass||!selDate||!selTerm||!selSession){notify("Select class, date, term and session","error");return;}
    if(!students.length){notify("No students in this class","error");return;}
    setSaving(true);
    const records=students.map(s=>({
      student_id:s.id,class_id:+selClass,date:selDate,
      status:attendance[s.id]||"present",
      term_id:+selTerm,session_id:+selSession,
      updated_at:new Date().toISOString()
    }));
    const {error}=await db.upsertAttendance(records);
    if(error)notify(error.message,"error");
    else notify(`\u2705 Attendance saved for ${records.length} students`);
    setSaving(false);
  };

  const SC={present:C.green,absent:C.red,late:C.amber,excused:C.purple};
  const SB={present:C.greenPale,absent:C.redPale,late:C.amberPale,excused:C.purplePale};

  return(
    <div>
      <div style={{marginBottom:18}}>
        <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="attendance" size={20}/>Student Attendance</h2>
        <p style={{color:C.muted,fontSize:12}}>Record and track daily student attendance per class.</p>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {[{id:"daily",label:"Daily Entry"},{id:"summary",label:"Summary"}].map(m=>(
          <button key={m.id} onClick={()=>setViewMode(m.id)}
            style={{padding:"8px 18px",borderRadius:8,border:`2px solid ${viewMode===m.id?C.blue:C.border}`,
              background:viewMode===m.id?C.blue:"transparent",color:viewMode===m.id?"#fff":C.muted,
              cursor:"pointer",fontSize:13,fontWeight:700}}>
            {m.label}
          </button>
        ))}
      </div>
      <Card style={{marginBottom:16}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12}}>
          <Sel label="Session" value={selSession} onChange={v=>{setSelSession(v);setSelTerm("");}}
            options={[{value:"",label:"Select\u2026"},...sessions.map(s=>({value:String(s.id),label:s.name}))]}/>
          <Sel label="Term" value={selTerm} onChange={setSelTerm} disabled={!selSession}
            options={[{value:"",label:"Select\u2026"},...filterTerms.map(t=>({value:String(t.id),label:t.name}))]}/>
          <Sel label="Class" value={selClass} onChange={setSelClass}
            options={[{value:"",label:"Select\u2026"},...classes.map(c=>({value:String(c.id),label:c.name}))]}/>
          {viewMode==="daily"&&(
            <div>
              <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:4}}>DATE</label>
              <input type="date" value={selDate} onChange={e=>setSelDate(e.target.value)}
                style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,
                  fontSize:13,color:C.text,background:C.white,boxSizing:"border-box"}}/>
            </div>
          )}
        </div>
      </Card>

      {viewMode==="daily"&&(!selClass?(
        <Card style={{textAlign:"center",padding:44}}>
          <div style={{marginBottom:8}}><ClipboardList size={40} color={C.muted}/></div>
          <div style={{fontWeight:700,color:C.blue}}>Select a class to take attendance</div>
        </Card>
      ):loading?<Spinner/>:(
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
            <div>
              <span style={{fontWeight:800,color:C.blue,fontSize:14}}>{classes.find(c=>c.id===+selClass)?.name} \u2014 {selDate}</span>
              <span style={{fontSize:12,color:C.muted,marginLeft:8}}>{students.length} students</span>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:12,color:C.muted}}>Mark all:</span>
              {["present","absent","late","excused"].map(s=>(
                <Btn key={s} xs onClick={()=>setAll(s)}
                  style={{background:SB[s],color:SC[s],border:`1px solid ${SC[s]}44`}}>
                  {s[0].toUpperCase()+s.slice(1)}
                </Btn>
              ))}
              {canManage&&<Btn onClick={save} color={C.green} disabled={saving} sm>{saving?"Saving\u2026":"Save"}</Btn>}
            </div>
          </div>
          {students.length===0?(
            <div style={{textAlign:"center",padding:32,color:C.muted}}>No students in this class.</div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {students.map((s,i)=>{
                const st=attendance[s.id]||"present";
                return(
                  <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",
                    borderRadius:8,background:i%2===0?C.offWhite:C.white,border:`1px solid ${C.border}`}}>
                    <div style={{flex:1,minWidth:100}}>
                      <div style={{fontWeight:700,fontSize:13,color:C.text}}>
                        {s.first_name?`${s.first_name} ${s.last_name||""}`.trim():s.name}
                      </div>
                      <div style={{fontSize:11,color:C.muted}}>{s.id}</div>
                    </div>
                    <div style={{display:"flex",gap:5}}>
                      {["present","absent","late","excused"].map(opt=>(
                        <button key={opt} onClick={()=>canManage&&setAttendance(p=>({...p,[s.id]:opt}))}
                          style={{padding:"5px 10px",borderRadius:6,fontSize:11,fontWeight:700,
                            cursor:canManage?"pointer":"default",
                            border:`2px solid ${st===opt?SC[opt]:C.border}`,
                            background:st===opt?SB[opt]:"transparent",
                            color:st===opt?SC[opt]:C.muted}}>
                          {opt[0].toUpperCase()+opt.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      ))}

      {viewMode==="summary"&&(!selClass||!selTerm||!selSession?(
        <Card style={{textAlign:"center",padding:44}}>
          <div style={{marginBottom:8}}><BarChart3 size={40} color={C.muted}/></div>
          <div style={{fontWeight:700,color:C.blue}}>Select session, term and class to view summary</div>
        </Card>
      ):loading?<Spinner/>:(
        <Card>
          <div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:14}}>
            Attendance Summary \u2014 {classes.find(c=>c.id===+selClass)?.name}
          </div>
          {summaryData.length===0?(
            <div style={{textAlign:"center",padding:32,color:C.muted}}>No attendance records found for this period.</div>
          ):(
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr style={{background:C.blue}}>
                    {["Student","Present","Absent","Late","Excused","Total Days","Attendance %"].map(h=>(
                      <th key={h} style={{padding:"9px 13px",color:"#fff",textAlign:h==="Student"?"left":"center",fontWeight:700,fontSize:11}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summaryData.map((row,i)=>{
                    const pct=row.total>0?Math.round(((row.present+row.late)/row.total)*100):0;
                    const pc=pct>=80?C.green:pct>=60?C.amber:C.red;
                    return(
                      <tr key={row.student.id} style={{background:i%2===0?C.white:C.offWhite,borderBottom:`1px solid ${C.border}`}}>
                        <td style={{padding:"9px 13px"}}>
                          <div style={{fontWeight:700}}>{row.student.first_name?`${row.student.first_name} ${row.student.last_name||""}`.trim():row.student.name}</div>
                          <div style={{fontSize:11,color:C.muted}}>{row.student.id}</div>
                        </td>
                        <td style={{padding:"9px 13px",textAlign:"center",color:C.green,fontWeight:700}}>{row.present}</td>
                        <td style={{padding:"9px 13px",textAlign:"center",color:C.red,fontWeight:700}}>{row.absent}</td>
                        <td style={{padding:"9px 13px",textAlign:"center",color:C.amber,fontWeight:700}}>{row.late}</td>
                        <td style={{padding:"9px 13px",textAlign:"center",color:C.purple,fontWeight:700}}>{row.excused}</td>
                        <td style={{padding:"9px 13px",textAlign:"center",color:C.muted,fontWeight:700}}>{row.total}</td>
                        <td style={{padding:"9px 13px",textAlign:"center"}}>
                          <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
                            background:`${pc}18`,color:pc,border:`1px solid ${pc}33`}}>{pct}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ─── ACADEMIC CALENDAR PAGE ─────────────────────────────────────────────────────────────────────────────
const CAL_TYPES=[
  {id:"resumption", label:"Resumption",    color:"#10B981"},
  {id:"mid_term",   label:"Mid-Term",      color:"#F59E0B"},
  {id:"exam",       label:"Exams",         color:"#6366F1"},
  {id:"vacation",   label:"Vacation",      color:"#EF4444"},
  {id:"holiday",    label:"Public Holiday",color:"#EC4899"},
  {id:"event",      label:"School Event",  color:"#0891B2"},
  {id:"other",      label:"Other",         color:"#94A3B8"},
];
const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function calDuration(start,end){
  if(!end||end===start)return null;
  const ms=new Date(end+"T00:00:00")-new Date(start+"T00:00:00");
  const days=Math.round(ms/86400000)+1;
  return days>1?`${days} days`:null;
}
function daysUntil(dateStr){
  const today=new Date();today.setHours(0,0,0,0);
  const d=new Date(dateStr+"T00:00:00");
  const diff=Math.round((d-today)/86400000);
  if(diff===0)return{label:"Today",color:"#10B981"};
  if(diff===1)return{label:"Tomorrow",color:"#F59E0B"};
  if(diff>0&&diff<=7)return{label:`In ${diff} days`,color:"#6366F1"};
  if(diff<0&&diff>=-1)return{label:"Yesterday",color:"#94A3B8"};
  if(diff<0)return{label:`${Math.abs(diff)}d ago`,color:"#94A3B8"};
  return null;
}

export function AcademicCalendarPage({ctx}){
  const{notify,role,user}=ctx;
  const isAdmin=role==="admin";
  const confirm=useConfirm();
  const[events,setEvents]=useState([]);
  const[sessions,setSessions]=useState([]);
  const[terms,setTerms]=useState([]);
  const[selSession,setSelSession]=useState("");
  const[selTerm,setSelTerm]=useState("");
  const[typeFilter,setTypeFilter]=useState(null);
  const[search,setSearch]=useState("");
  const[view,setView]=useState("month");
  const[curDate,setCurDate]=useState(new Date());
  const[modal,setModal]=useState(null);
  const[form,setForm]=useState({});
  const[saving,setSaving]=useState(false);
  const[loading,setLoading]=useState(true);

  const load=async()=>{
    setLoading(true);
    const[ev,ss]=await Promise.all([
      db.getCalendarEvents({session_id:selSession||undefined,term_id:selTerm||undefined}),
      db.getSessions()
    ]);
    setEvents(ev.data||[]);setSessions(ss.data||[]);
    if(!selSession){const a=ss.data?.find(s=>s.is_active);if(a)setSelSession(String(a.id));}
    setLoading(false);
  };
  useEffect(()=>{load();},[selSession,selTerm]);
  useEffect(()=>{
    if(selSession){db.getTerms(selSession).then(({data})=>{setTerms(data||[]);});}
    else{setTerms([]);setSelTerm("");}
  },[selSession]);

  const typeMap=Object.fromEntries(CAL_TYPES.map(t=>[t.id,t]));
  const today=new Date().toISOString().slice(0,10);

  const filteredEvents=events.filter(e=>{
    if(typeFilter&&e.event_type!==typeFilter)return false;
    if(search&&!e.title.toLowerCase().includes(search.toLowerCase()))return false;
    return true;
  });

  const openAdd=(date=null)=>{
    if(!isAdmin)return;
    const ds=date?date.toISOString().slice(0,10):"";
    setForm({title:"",event_type:"event",start_date:ds,end_date:ds,
      session_id:selSession||"",term_id:selTerm||"",color:"#0891B2",description:""});
    setModal({mode:"add"});
  };
  const openDetail=(ev)=>setModal({mode:"detail",event:ev});
  const openEdit=(ev)=>{
    if(!isAdmin)return;
    setForm({...ev,session_id:String(ev.session_id||""),term_id:String(ev.term_id||"")});
    setModal({mode:"edit",event:ev});
  };
  const save=async()=>{
    if(!form.title?.trim()||!form.start_date){notify("Title and start date are required","error");return;}
    setSaving(true);
    const payload={...form,session_id:form.session_id?+form.session_id:null,
      term_id:form.term_id?+form.term_id:null,end_date:form.end_date||form.start_date,
      created_by:user?.name||"admin"};
    const{error}=await db.upsertCalendarEvent(payload,modal?.event?.id||null);
    setSaving(false);
    if(error)notify(error.message,"error");
    else{notify(modal.mode==="edit"?"Event updated ✓":"Event added ✓");setModal(null);load();}
  };
  const del=async(ev)=>{
    const ok=await confirm({title:"Delete Event?",message:`Delete "${ev.title}"?`,confirmLabel:"Delete",danger:true});
    if(!ok)return;
    await db.deleteCalendarEvent(ev.id);notify("Event deleted","warn");setModal(null);load();
  };

  const year=curDate.getFullYear(),month=curDate.getMonth();
  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const cellDates=[];
  for(let i=0;i<firstDay;i++)cellDates.push(null);
  for(let d=1;d<=daysInMonth;d++)cellDates.push(new Date(year,month,d));
  while(cellDates.length%7!==0)cellDates.push(null);

  const eventsOnDate=(d)=>{
    if(!d)return[];
    const ds=d.toISOString().slice(0,10);
    return filteredEvents.filter(e=>{
      if(e.start_date>ds)return false;
      return(e.end_date||e.start_date)>=ds;
    });
  };

  const sortedEvents=[...filteredEvents].sort((a,b)=>a.start_date.localeCompare(b.start_date));
  const upcoming=sortedEvents.filter(e=>(e.end_date||e.start_date)>=today);
  const past=[...sortedEvents.filter(e=>(e.end_date||e.start_date)<today)].reverse();
  const typeCounts=CAL_TYPES.map(t=>({...t,count:events.filter(e=>e.event_type===t.id).length})).filter(t=>t.count>0);
  const fmtDate=d=>new Date(d+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});

  return(
    <div style={{maxWidth:1100,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16,gap:12,flexWrap:"wrap"}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
            <CalendarDays size={22} color={C.blue}/>
            <h2 style={{margin:0,fontSize:20,fontWeight:900,color:C.text}}>Academic Calendar</h2>
            <span style={{background:C.bluePale,color:C.blue,borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700,border:`1px solid ${C.blue}30`}}>
              {events.length} event{events.length!==1?"s":""}
            </span>
          </div>
          <p style={{margin:0,fontSize:12,color:C.muted}}>Term dates, exams, holidays, and school events at a glance.</p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <select value={selSession} onChange={e=>{setSelSession(e.target.value);setSelTerm("");}}
            style={{padding:"7px 10px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,background:C.white,color:C.text}}>
            <option value="">All Sessions</option>
            {sessions.map(s=><option key={s.id} value={String(s.id)}>{s.name}{s.is_active?" (active)":""}</option>)}
          </select>
          <select value={selTerm} onChange={e=>setSelTerm(e.target.value)} disabled={!selSession}
            style={{padding:"7px 10px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,background:C.white,color:C.text}}>
            <option value="">All Terms</option>
            {terms.map(t=><option key={t.id} value={String(t.id)}>{t.name}{t.is_active?" (active)":""}</option>)}
          </select>
          <div style={{display:"flex",border:`1.5px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
            {[{v:"month",l:"Month"},{v:"list",l:"List"}].map(x=>(
              <button key={x.v} onClick={()=>setView(x.v)}
                style={{padding:"6px 14px",border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                  background:view===x.v?C.blue:"transparent",color:view===x.v?"#fff":C.muted}}>
                {x.l}
              </button>
            ))}
          </div>
          {isAdmin&&<Btn onClick={()=>openAdd()} color={C.blue} style={{fontSize:12}}><Plus size={13}/> Add Event</Btn>}
        </div>
      </div>

      {typeCounts.length>0&&(
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
          <button onClick={()=>setTypeFilter(null)}
            style={{display:"flex",alignItems:"center",gap:5,fontSize:11,fontWeight:700,
              padding:"4px 10px",borderRadius:20,cursor:"pointer",
              border:`1.5px solid ${typeFilter===null?C.blue:C.border}`,
              background:typeFilter===null?C.bluePale:"transparent",
              color:typeFilter===null?C.blue:C.muted}}>
            All ({events.length})
          </button>
          {typeCounts.map(t=>(
            <button key={t.id} onClick={()=>setTypeFilter(typeFilter===t.id?null:t.id)}
              style={{display:"flex",alignItems:"center",gap:5,fontSize:11,fontWeight:700,
                padding:"4px 10px",borderRadius:20,cursor:"pointer",
                border:`1.5px solid ${typeFilter===t.id?t.color:t.color+"50"}`,
                background:typeFilter===t.id?t.color+"18":"transparent",
                color:typeFilter===t.id?t.color:C.muted}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:t.color,display:"inline-block"}}/>
              {t.label} ({t.count})
            </button>
          ))}
        </div>
      )}

      <div style={{marginBottom:14}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search events..."
          style={{padding:"8px 12px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,
            width:"100%",boxSizing:"border-box",background:C.white,color:C.text,maxWidth:320}}/>
      </div>

      {loading?<Spinner/>:view==="month"?(
        <>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,gap:8}}>
            <button onClick={()=>setCurDate(new Date(year,month-1,1))}
              style={{background:C.offWhite,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12,color:C.text,fontWeight:600}}>
              {"‹ Prev"}
            </button>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontWeight:800,fontSize:16,color:C.text}}>{MONTHS[month]} {year}</span>
              {(year!==new Date().getFullYear()||month!==new Date().getMonth())&&(
                <button onClick={()=>setCurDate(new Date())}
                  style={{padding:"3px 10px",borderRadius:6,border:`1px solid ${C.border}`,background:C.offWhite,fontSize:11,cursor:"pointer",color:C.muted,fontWeight:600}}>
                  Today
                </button>
              )}
            </div>
            <button onClick={()=>setCurDate(new Date(year,month+1,1))}
              style={{background:C.offWhite,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12,color:C.text,fontWeight:600}}>
              {"Next ›"}
            </button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:2}}>
            {DAYS.map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:800,color:C.muted,padding:"5px 0",textTransform:"uppercase",letterSpacing:.5}}>{d}</div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
            {cellDates.map((d,i)=>{
              if(!d)return<div key={i} style={{minHeight:100,background:C.offWhite,borderRadius:6,opacity:.25}}/>;
              const ds=d.toISOString().slice(0,10);
              const dayEvs=eventsOnDate(d);
              const isToday=ds===today;
              const isWeekend=d.getDay()===0||d.getDay()===6;
              return(
                <div key={i} onClick={()=>isAdmin&&openAdd(d)}
                  style={{minHeight:100,background:isWeekend?C.offWhite:C.white,
                    border:`1.5px solid ${isToday?C.blue:C.border}`,borderRadius:8,
                    padding:"4px 4px 6px",cursor:isAdmin?"pointer":"default",
                    transition:"border-color .15s,box-shadow .15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=C.blue+"80";e.currentTarget.style.boxShadow=`0 2px 8px ${C.blue}15`;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=isToday?C.blue:C.border;e.currentTarget.style.boxShadow="none";}}>
                  <div style={{fontSize:11,fontWeight:isToday?900:600,
                    color:isToday?"#fff":isWeekend?C.muted:C.text,
                    background:isToday?C.blue:"transparent",borderRadius:"50%",
                    width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:3}}>
                    {d.getDate()}
                  </div>
                  {dayEvs.slice(0,3).map(ev=>{
                    const t=typeMap[ev.event_type]||typeMap.other;
                    const col=ev.color||t.color;
                    return(
                      <div key={ev.id} onClick={e=>{e.stopPropagation();openDetail(ev);}}
                        style={{fontSize:9,padding:"2px 5px",borderRadius:4,marginBottom:2,
                          background:col+"20",color:col,fontWeight:700,
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                          cursor:"pointer",border:`1px solid ${col}35`,lineHeight:1.4}}
                        title={ev.title}>
                        {ev.title}
                      </div>
                    );
                  })}
                  {dayEvs.length>3&&<div style={{fontSize:9,color:C.blue,fontWeight:700,paddingLeft:4}}>+{dayEvs.length-3} more</div>}
                </div>
              );
            })}
          </div>
        </>
      ):(
        <div>
          {upcoming.length===0&&past.length===0?(
            <div style={{textAlign:"center",padding:60,color:C.muted,fontSize:13}}>
              <CalendarDays size={44} color={C.border} style={{marginBottom:12}}/>
              <div style={{fontWeight:700,marginBottom:4}}>{search||typeFilter?"No matching events":"No calendar events yet"}</div>
              <div style={{fontSize:12}}>{isAdmin&&!search&&!typeFilter?"Click \"Add Event\" to get started.":""}</div>
            </div>
          ):(
            <>
              {upcoming.length>0&&(
                <div style={{marginBottom:24}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                    <div style={{fontWeight:800,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:.8}}>Upcoming</div>
                    <span style={{background:C.greenPale,color:C.green,borderRadius:20,padding:"1px 8px",fontSize:10,fontWeight:700}}>{upcoming.length}</span>
                  </div>
                  {upcoming.map(ev=><CalEventRow key={ev.id} ev={ev} typeMap={typeMap} isAdmin={isAdmin} onDetail={openDetail} today={today}/>)}
                </div>
              )}
              {past.length>0&&(
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                    <div style={{fontWeight:800,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:.8}}>Past</div>
                    <span style={{background:C.offWhite,color:C.muted,borderRadius:20,padding:"1px 8px",fontSize:10,fontWeight:700,border:`1px solid ${C.border}`}}>{past.length}</span>
                  </div>
                  {past.map(ev=><CalEventRow key={ev.id} ev={ev} typeMap={typeMap} isAdmin={isAdmin} onDetail={openDetail} today={today}/>)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {modal?.mode==="detail"&&modal.event&&(()=>{
        const ev=modal.event;
        const t=typeMap[ev.event_type]||typeMap.other;
        const col=ev.color||t.color;
        const dur=calDuration(ev.start_date,ev.end_date);
        const badge=daysUntil(ev.start_date);
        const sess=sessions.find(s=>String(s.id)===String(ev.session_id));
        const term=terms.find(x=>String(x.id)===String(ev.term_id));
        return(
          <Modal title="Event Details" onClose={()=>setModal(null)} width={440}>
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              <div style={{background:`${col}12`,border:`1.5px solid ${col}30`,borderRadius:10,padding:"14px 16px",marginBottom:14}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:6}}>
                  <div style={{fontWeight:900,fontSize:16,color:C.text,flex:1}}>{ev.title}</div>
                  <span style={{background:col+"20",color:col,border:`1px solid ${col}40`,borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700,flexShrink:0}}>{t.label}</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <span style={{fontSize:12,color:C.muted,fontWeight:600}}>
                    {fmtDate(ev.start_date)}{ev.end_date&&ev.end_date!==ev.start_date?` — ${fmtDate(ev.end_date)}`:""}
                  </span>
                  {dur&&<span style={{fontSize:11,color:col,fontWeight:700,background:col+"15",padding:"1px 7px",borderRadius:10}}>{dur}</span>}
                  {badge&&<span style={{fontSize:11,fontWeight:700,color:badge.color,background:badge.color+"15",padding:"1px 7px",borderRadius:10}}>{badge.label}</span>}
                </div>
              </div>
              {ev.description&&(
                <div style={{marginBottom:12,padding:"10px 14px",background:C.offWhite,borderRadius:8,fontSize:13,color:C.text,lineHeight:1.5}}>
                  {ev.description}
                </div>
              )}
              {(sess||term)&&(
                <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
                  {sess&&<span style={{fontSize:11,color:C.muted,background:C.offWhite,padding:"3px 10px",borderRadius:6,border:`1px solid ${C.border}`}}>Session: {sess.name}</span>}
                  {term&&<span style={{fontSize:11,color:C.muted,background:C.offWhite,padding:"3px 10px",borderRadius:6,border:`1px solid ${C.border}`}}>Term: {term.name}</span>}
                </div>
              )}
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                {isAdmin&&<Btn onClick={()=>del(ev)} color={C.red} outline style={{marginRight:"auto"}}>Delete</Btn>}
                <Btn onClick={()=>setModal(null)} color={C.muted} outline>Close</Btn>
                {isAdmin&&<Btn onClick={()=>openEdit(ev)} color={C.blue}>Edit</Btn>}
              </div>
            </div>
          </Modal>
        );
      })()}

      {(modal?.mode==="add"||modal?.mode==="edit")&&(
        <Modal title={modal.mode==="edit"?"Edit Event":"Add Calendar Event"} onClose={()=>setModal(null)} width={500}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:4}}>Event Title *</label>
              <input value={form.title||""} onChange={e=>setForm(p=>({...p,title:e.target.value}))}
                placeholder="e.g. Third Term Resumption" autoFocus
                style={{width:"100%",padding:"9px 12px",border:`1.5px solid ${C.border}`,borderRadius:8,
                  fontSize:13,boxSizing:"border-box",background:C.white,color:C.text}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:4}}>Type</label>
                <select value={form.event_type||"event"}
                  onChange={e=>setForm(p=>({...p,event_type:e.target.value,color:CAL_TYPES.find(t=>t.id===e.target.value)?.color||p.color}))}
                  style={{width:"100%",padding:"9px 10px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:13,background:C.white,color:C.text}}>
                  {CAL_TYPES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:4}}>Colour</label>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <input type="color" value={form.color||"#0891B2"} onChange={e=>setForm(p=>({...p,color:e.target.value}))}
                    style={{width:40,height:36,border:`1px solid ${C.border}`,borderRadius:6,cursor:"pointer",padding:2}}/>
                  <span style={{fontSize:11,color:C.muted,fontFamily:"monospace"}}>{form.color||"#0891B2"}</span>
                </div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:4}}>Start Date *</label>
                <input type="date" value={form.start_date||""}
                  onChange={e=>{const v=e.target.value;setForm(p=>({...p,start_date:v,end_date:p.end_date&&p.end_date>=v?p.end_date:v}));}}
                  style={{width:"100%",padding:"9px 10px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:13,background:C.white,color:C.text,boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:4}}>End Date</label>
                <input type="date" value={form.end_date||""} min={form.start_date||""}
                  onChange={e=>setForm(p=>({...p,end_date:e.target.value}))}
                  style={{width:"100%",padding:"9px 10px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:13,background:C.white,color:C.text,boxSizing:"border-box"}}/>
              </div>
            </div>
            {form.start_date&&form.end_date&&form.end_date>form.start_date&&(
              <div style={{fontSize:11,color:C.blue,background:C.bluePale,borderRadius:6,padding:"5px 10px",border:`1px solid ${C.blue}30`}}>
                {calDuration(form.start_date,form.end_date)} duration
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:4}}>Session</label>
                <select value={form.session_id||""} onChange={e=>setForm(p=>({...p,session_id:e.target.value}))}
                  style={{width:"100%",padding:"9px 10px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:13,background:C.white,color:C.text}}>
                  <option value="">{"\u2014 None \u2014"}</option>
                  {sessions.map(s=><option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:4}}>Term</label>
                <select value={form.term_id||""} onChange={e=>setForm(p=>({...p,term_id:e.target.value}))}
                  style={{width:"100%",padding:"9px 10px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:13,background:C.white,color:C.text}}>
                  <option value="">{"\u2014 None \u2014"}</option>
                  {terms.map(t=><option key={t.id} value={String(t.id)}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:4}}>Description</label>
              <textarea value={form.description||""} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={2}
                placeholder="Optional notes about this event..."
                style={{width:"100%",padding:"9px 12px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,
                  background:C.white,color:C.text,resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              {modal.mode==="edit"&&<Btn onClick={()=>del(modal.event)} color={C.red} outline style={{marginRight:"auto"}}>Delete</Btn>}
              <Btn onClick={()=>setModal(null)} color={C.muted} outline>Cancel</Btn>
              <Btn onClick={save} color={C.blue} disabled={saving}>{saving?"Saving...":modal.mode==="edit"?"Update Event":"Add Event"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CalEventRow({ev,typeMap,isAdmin,onDetail,today}){
  const t=typeMap[ev.event_type]||typeMap.other;
  const col=ev.color||t.color;
  const fmtDate=d=>new Date(d+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
  const isPast=(ev.end_date||ev.start_date)<today;
  const dur=calDuration(ev.start_date,ev.end_date);
  const badge=!isPast?daysUntil(ev.start_date):null;
  return(
    <div onClick={()=>onDetail(ev)} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",
      background:C.white,border:`1.5px solid ${C.border}`,borderRadius:10,marginBottom:6,
      opacity:isPast?.6:1,cursor:"pointer",transition:"border-color .15s,box-shadow .15s"}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor=col;e.currentTarget.style.boxShadow=`0 2px 10px ${col}20`;}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.boxShadow="none";}}>
      <div style={{width:4,borderRadius:4,alignSelf:"stretch",background:col,flexShrink:0,minHeight:40}}/>
      <div style={{width:44,height:44,borderRadius:8,background:col+"15",border:`1.5px solid ${col}30`,
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <div style={{fontSize:15,fontWeight:900,color:col,lineHeight:1}}>
          {new Date(ev.start_date+"T00:00:00").getDate()}
        </div>
        <div style={{fontSize:9,fontWeight:700,color:col,textTransform:"uppercase",letterSpacing:.3}}>
          {MONTHS[new Date(ev.start_date+"T00:00:00").getMonth()].slice(0,3)}
        </div>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:800,fontSize:13,color:C.text,marginBottom:3}}>{ev.title}</div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{background:col+"18",color:col,border:`1px solid ${col}30`,borderRadius:6,padding:"1px 7px",fontSize:10,fontWeight:700}}>{t.label}</span>
          <span style={{fontSize:11,color:C.muted}}>
            {fmtDate(ev.start_date)}{ev.end_date&&ev.end_date!==ev.start_date?` — ${fmtDate(ev.end_date)}`:""}
          </span>
          {dur&&<span style={{fontSize:10,color:C.muted}}>{dur}</span>}
          {badge&&<span style={{fontSize:10,fontWeight:700,color:badge.color,background:badge.color+"12",padding:"1px 7px",borderRadius:10}}>{badge.label}</span>}
        </div>
        {ev.description&&<div style={{fontSize:11,color:C.light,marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.description}</div>}
      </div>
    </div>
  );
}

// ─── TIMETABLE PAGE ────────────────────────────────────────────────────────────
const WEEK_DAYS=[{d:1,l:"Monday"},{d:2,l:"Tuesday"},{d:3,l:"Wednesday"},{d:4,l:"Thursday"},{d:5,l:"Friday"}];
const TODAY_DOW=new Date().getDay();// 0=Sun,1=Mon...

export function TimetablePage({ctx}){
  const{notify,role,user}=ctx;
  const isAdmin=role==="admin";
  const confirm=useConfirm();
  const[view,setView]=useState(isAdmin?"admin":"mine");
  const[periods,setPeriods]=useState([]);
  const[allPeriods,setAllPeriods]=useState([]); // all periods across sections (for Manage Periods)
  const[sections,setSections]=useState([]);
  const[classes,setClasses]=useState([]);
  const[subjects,setSubjects]=useState([]);
  const[teachers,setTeachers]=useState([]);
  const[sessions,setSessions]=useState([]);
  const[terms,setTerms]=useState([]);
  const[selClass,setSelClass]=useState("");
  const[selSession,setSelSession]=useState("");
  const[selTerm,setSelTerm]=useState("");
  const[slots,setSlots]=useState([]);
  const[loading,setLoading]=useState(true);
  const[slotModal,setSlotModal]=useState(null);
  const[slotForm,setSlotForm]=useState({subject_id:"",teacher_id:""});
  const[periodModal,setPeriodModal]=useState(false);
  const[periodSectionFilter,setPeriodSectionFilter]=useState(""); // section shown in Manage Periods
  const[periodForm,setPeriodForm]=useState({name:"",start_time:"",end_time:"",is_break:false,order_index:0,section_id:""});
  const[editPeriodId,setEditPeriodId]=useState(null);
  const[saving,setSaving]=useState(false);
  const[subjectTeacherMap,setSubjectTeacherMap]=useState({});
  const[autoTeacherNote,setAutoTeacherNote]=useState(null);

  // section_id of the currently selected class
  const selClassSectionId=useMemo(()=>{
    if(!selClass)return null;
    return classes.find(c=>String(c.id)===selClass)?.section_id||null;
  },[selClass,classes]);

  const loadAllPeriods=async()=>{
    const{data}=await db.getTimetablePeriods();// no filter = all sections
    setAllPeriods(data||[]);
  };
  const loadPeriodsForClass=async(sectionId)=>{
    if(!sectionId){setPeriods([]);return;}
    const{data}=await db.getTimetablePeriods(sectionId);
    setPeriods(data||[]);
  };

  const load=async()=>{
    setLoading(true);
    const[cl,ss,t,sec]=await Promise.all([db.getClasses(),db.getSessions(),db.getTeachers(),db.getSections(false)]);
    setClasses(cl.data||[]);setSessions(ss.data||[]);setTeachers(t.data||[]);setSections(sec.data||[]);
    await loadAllPeriods();
    if(!selSession){const a=(ss.data||[]).find(x=>x.is_active);if(a){setSelSession(String(a.id));await loadTerms(String(a.id));}}
    setLoading(false);
  };
  const loadTerms=async(sid)=>{
    if(!sid)return;
    const{data}=await db.getTerms(sid);
    setTerms(data||[]);
    if(!selTerm){const a=data?.find(x=>x.is_active);if(a)setSelTerm(String(a.id));}
  };
  const loadSlots=async()=>{
    if(view==="mine"&&user?.teacher_db_id&&selTerm&&selSession){
      const{data}=await db.getTimetableForTeacher(user.teacher_db_id,+selTerm,+selSession);setSlots(data||[]);
    }else if(view==="admin"&&selClass&&selTerm&&selSession){
      const{data}=await db.getTimetableSlots(+selClass,+selTerm,+selSession);setSlots(data||[]);
    }else{
      setSlots([]);
    }
  };
  useEffect(()=>{load();},[]);
  useEffect(()=>{if(selSession)loadTerms(selSession);},[selSession]);
  useEffect(()=>{loadSlots();},[view,selClass,selTerm,selSession]);
  useEffect(()=>{
    if(selClassSectionId){loadPeriodsForClass(selClassSectionId);}
    else setPeriods([]);
  },[selClassSectionId]);
  useEffect(()=>{
    if(selClass){
      db.getClassSubjects(+selClass).then(({data})=>setSubjects(data||[]));
      db.getTeacherSubjects().then(({data})=>{
        const map={};
        (data||[]).filter(a=>String(a.class_id)===String(selClass)).forEach(a=>{
          if(a.subject_id&&a.teacher_id) map[String(a.subject_id)]=String(a.teacher_id);
        });
        setSubjectTeacherMap(map);
      });
    }else{
      setSubjects([]);
      setSubjectTeacherMap({});
    }
  },[selClass]);

  const slotMap=useMemo(()=>{
    const m={};slots.forEach(s=>{const key=`${s.day_of_week}_${s.period_id}`;m[key]=s;});return m;
  },[slots]);

  // Subject colour palette for visual coding
  const subjColors=useMemo(()=>{
    const palette=["#6366F1","#0891B2","#10B981","#F59E0B","#EF4444","#EC4899","#8B5CF6","#F97316","#14B8A6","#84CC16"];
    const m={};subjects.forEach((s,i)=>{m[String(s.subject_id||s.section_subjects?.id)]=palette[i%palette.length];});
    return m;
  },[subjects]);

  const resolveTeacherForSubject=(subjectId)=>{
    if(!subjectId)return{teacher_id:"",note:null};
    const tid=subjectTeacherMap[String(subjectId)]||"";
    if(tid){
      const name=teachers.find(t=>String(t.id)===tid)?.full_name||"Unknown";
      return{teacher_id:tid,note:{found:true,name}};
    }
    const subjName=subjects.find(s=>String(s.subject_id||s.section_subjects?.id)===String(subjectId))?.section_subjects?.name||"this subject";
    return{teacher_id:"",note:{found:false,subjName}};
  };

  const openSlotEdit=(day,period)=>{
    if(!isAdmin||!selClass)return;
    const key=`${day}_${period.id}`;const existing=slotMap[key];
    // If slot already has a teacher saved, use that; otherwise auto-resolve from assignments
    let teacher_id=existing?.teacher_id!=null?String(existing.teacher_id):"";
    let note=null;
    if(!existing){
      // empty slot — no auto-resolve yet; will fire when user picks subject
      note=null;
    }
    setAutoTeacherNote(note);
    setSlotForm({subject_id:existing?.subject_id?String(existing.subject_id):"",teacher_id});
    setSlotModal({day,period,existing});
  };

  const openPeriodEdit=(p)=>{
    setPeriodForm({name:p.name,start_time:p.start_time,end_time:p.end_time,is_break:p.is_break,order_index:p.order_index});
    setEditPeriodId(p.id);
    setPeriodModal(true);
  };

  const saveSlot=async()=>{
    if(!slotForm.subject_id){
      await db.clearTimetableSlot(+selClass,slotModal.period.id,slotModal.day,+selTerm,+selSession);
      notify("Slot cleared");setSlotModal(null);loadSlots();return;
    }
    const tid=(slotForm.teacher_id!==null&&slotForm.teacher_id!=="")?+slotForm.teacher_id:null;

    // ── Clash detection ──────────────────────────────────────────────────────
    if(tid){
      const{data:clash}=await db.checkTeacherClash(
        tid, slotModal.period.id, slotModal.day, +selTerm, +selSession, +selClass);
      if(clash&&clash.length>0){
        const clashClass=clash[0].classes?.name||"another class";
        const teacherName=teachers.find(t=>String(t.id)===String(tid))?.full_name||"This teacher";
        const day=WEEK_DAYS.find(x=>x.d===slotModal.day)?.l||"";
        notify(
          `⚠ Clash — ${teacherName} is already assigned to ${clashClass} on ${day} during ${slotModal.period.name}. Fix the other slot first or choose a different teacher.`,
          "error"
        );
        return;
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    setSaving(true);
    const{error}=await db.upsertTimetableSlot({class_id:+selClass,period_id:slotModal.period.id,
      day_of_week:slotModal.day,subject_id:+slotForm.subject_id,teacher_id:tid,
      term_id:+selTerm,session_id:+selSession});
    setSaving(false);
    if(error)notify(error.message,"error");
    else{notify("Slot saved ✓");setSlotModal(null);loadSlots();}
  };

  const savePeriod=async()=>{
    if(!periodForm.name||!periodForm.start_time||!periodForm.end_time){
      notify("Period name and times are required","error");return;
    }
    if(!periodForm.section_id){
      notify("Select a section for this period","error");return;
    }
    setSaving(true);
    const payload={...periodForm,
      section_id:+periodForm.section_id,
      order_index:+periodForm.order_index||0};
    const{error}=await db.upsertTimetablePeriod(payload,editPeriodId);
    setSaving(false);
    if(error)notify(error.message,"error");
    else{
      notify(editPeriodId?"Period updated ✓":"Period added ✓");
      setEditPeriodId(null);
      // keep same section selected for next period
      setPeriodForm({name:"",start_time:"",end_time:"",is_break:false,order_index:0,section_id:periodForm.section_id});
      await loadAllPeriods();
      if(selClassSectionId) loadPeriodsForClass(selClassSectionId);
    }
  };

  const delPeriod=async(p)=>{
    const ok=await confirm({title:"Delete Period?",
      message:`Delete "${p.name}"? All timetable slots using this period will also be removed.`,
      confirmLabel:"Delete",danger:true});
    if(!ok)return;
    await db.deleteTimetablePeriod(p.id);
    notify(`"${p.name}" deleted`,"warn");
    await loadAllPeriods();
    if(selClassSectionId) loadPeriodsForClass(selClassSectionId);
  };

  const teacherName=id=>(teachers.find(t=>String(t.id)===String(id))?.full_name)||"";

  const mySlotsByDay=useMemo(()=>{
    const m={};
    WEEK_DAYS.forEach(d=>{
      m[d.d]=slots.filter(s=>s.day_of_week===d.d)
        .sort((a,b)=>(a.timetable_periods?.order_index||0)-(b.timetable_periods?.order_index||0));
    });
    return m;
  },[slots]);

  const selectedClassName=classes.find(c=>String(c.id)===selClass)?.name||"";
  const selectedSessionName=sessions.find(s=>String(s.id)===selSession)?.name||"";
  const selectedTermName=terms.find(t=>String(t.id)===selTerm)?.name||"";

  return(
    <div style={{padding:24,maxWidth:1200,margin:"0 auto"}}>
      {/* ── Header ── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,gap:12,flexWrap:"wrap"}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
            <CalendarCheck size={22} color={C.blue}/>
            <h2 style={{margin:0,fontSize:20,fontWeight:900,color:C.text}}>Timetable</h2>
            {view==="admin"&&selClass&&selTerm&&selSession&&(
              <span style={{background:C.bluePale,color:C.blue,borderRadius:20,padding:"2px 10px",
                fontSize:11,fontWeight:700,border:`1px solid ${C.blue}30`}}>
                {selectedClassName}
              </span>
            )}
          </div>
          <p style={{margin:0,fontSize:12,color:C.muted}}>
            {isAdmin?"Manage class schedules and periods.":"Your weekly teaching schedule."}
          </p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {isAdmin&&(
            <>
              <div style={{display:"flex",border:`1.5px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                {[{v:"admin",l:"Class Grid"},{v:"mine",l:"My Schedule"}].map(x=>(
                  <button key={x.v} onClick={()=>setView(x.v)}
                    style={{padding:"6px 14px",border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                      background:view===x.v?C.blue:"transparent",color:view===x.v?"#fff":C.muted}}>
                    {x.l}
                  </button>
                ))}
              </div>
              <Btn onClick={()=>{
                setEditPeriodId(null);
                const defaultSec=selClassSectionId?String(selClassSectionId):sections[0]?String(sections[0].id):"";
                setPeriodSectionFilter(defaultSec);
                setPeriodForm({name:"",start_time:"",end_time:"",is_break:false,order_index:0,section_id:defaultSec});
                setPeriodModal(true);
              }} color={C.orange} style={{fontSize:12}}>
                <Plus size={13}/> Manage Periods
              </Btn>
            </>
          )}
        </div>
      </div>

      {/* ── Filters ── */}
      <Card style={{marginBottom:16,padding:"12px 16px"}}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div style={{flex:"1 1 140px"}}>
            <label style={{fontSize:10,fontWeight:700,color:C.muted,display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:.5}}>Session</label>
            <select value={selSession} onChange={e=>{setSelSession(e.target.value);setSelTerm("");}}
              style={{width:"100%",padding:"8px 10px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,background:C.white,color:C.text}}>
              <option value="">Select Session</option>
              {sessions.map(s=><option key={s.id} value={String(s.id)}>{s.name}{s.is_active?" ✓":""}</option>)}
            </select>
          </div>
          <div style={{flex:"1 1 130px"}}>
            <label style={{fontSize:10,fontWeight:700,color:C.muted,display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:.5}}>Term</label>
            <select value={selTerm} onChange={e=>setSelTerm(e.target.value)} disabled={!selSession}
              style={{width:"100%",padding:"8px 10px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,background:C.white,color:C.text}}>
              <option value="">Select Term</option>
              {terms.map(t=><option key={t.id} value={String(t.id)}>{t.name}{t.is_active?" ✓":""}</option>)}
            </select>
          </div>
          {view==="admin"&&(
            <div style={{flex:"1 1 140px"}}>
              <label style={{fontSize:10,fontWeight:700,color:C.muted,display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:.5}}>
                Class {periods.length>0&&!selClass&&<span style={{color:C.orange}}>← required</span>}
              </label>
              <select value={selClass} onChange={e=>setSelClass(e.target.value)}
                style={{width:"100%",padding:"8px 10px",
                  border:`1.5px solid ${selClass?C.blue:periods.length>0?C.orange:C.border}`,
                  borderRadius:8,fontSize:12,
                  background:selClass?C.bluePale:C.white,
                  color:selClass?C.blue:C.text,fontWeight:selClass?700:400}}>
                <option value="">Select Class</option>
                {classes.map(c=><option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </Card>

      {/* ── Main content ── */}
      {loading?<Spinner/>:(view==="admin"&&selClass&&selClassSectionId&&periods.length===0)?(
        <div style={{textAlign:"center",padding:60,color:C.muted}}>
          <CalendarCheck size={44} color={C.border} style={{marginBottom:14}}/>
          <div style={{fontWeight:800,fontSize:15,color:C.text,marginBottom:6}}>
            No periods for <span style={{color:C.orange}}>{sections.find(s=>s.id===selClassSectionId)?.name||"this section"}</span>
          </div>
          <div style={{fontSize:12,marginBottom:20}}>
            Each section needs its own period schedule. Add periods for this section to get started.
          </div>
          {isAdmin&&(
            <Btn onClick={()=>{
              const defaultSec=selClassSectionId?String(selClassSectionId):sections[0]?String(sections[0].id):"";
              setPeriodSectionFilter(defaultSec);
              setPeriodForm({name:"",start_time:"",end_time:"",is_break:false,order_index:0,section_id:defaultSec});
              setEditPeriodId(null);setPeriodModal(true);
            }} color={C.orange}><Plus size={13}/> Add Periods</Btn>
          )}
        </div>
      ):view==="mine"&&role==="teacher"?(
        // ── My Schedule (teacher) ──
        <div>
          {(!selTerm||!selSession)?(
            <div style={{textAlign:"center",padding:40,border:`2px dashed ${C.border}`,borderRadius:12,color:C.muted}}>
              Select a session and term above to view your schedule.
            </div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
              {WEEK_DAYS.map(({d,l})=>{
                const isToday=d===TODAY_DOW;
                return(
                  <div key={d} style={{background:C.white,border:`1.5px solid ${isToday?C.blue:C.border}`,
                    borderRadius:10,overflow:"hidden",
                    boxShadow:isToday?`0 4px 16px ${C.blue}25`:"none"}}>
                    <div style={{background:isToday?C.blue:"#f1f5f9",color:isToday?"#fff":C.muted,
                      padding:"8px 10px",fontWeight:800,fontSize:12,textAlign:"center"}}>
                      {l}
                      {isToday&&<div style={{fontSize:9,fontWeight:600,opacity:.8,letterSpacing:.5}}>TODAY</div>}
                    </div>
                    {mySlotsByDay[d].length===0?(
                      <div style={{padding:20,textAlign:"center",color:C.light,fontSize:11,fontStyle:"italic"}}>
                        No classes
                      </div>
                    ):mySlotsByDay[d].map(s=>(
                      <div key={s.id} style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}`,
                        background:isToday?`${C.blue}08`:C.white}}>
                        <div style={{fontSize:10,color:C.muted,fontWeight:600}}>
                          {s.timetable_periods?.start_time?.slice(0,5)} – {s.timetable_periods?.end_time?.slice(0,5)}
                        </div>
                        <div style={{fontWeight:800,fontSize:12,color:C.blue,marginTop:2}}>
                          {s.section_subjects?.name||"—"}
                        </div>
                        <div style={{fontSize:10,color:C.muted,marginTop:1}}>
                          {s.classes?.name||"—"}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
          {selTerm&&selSession&&slots.length===0&&(
            <div style={{textAlign:"center",padding:24,color:C.muted,fontSize:13,marginTop:8}}>
              No classes assigned to you this term.
            </div>
          )}
        </div>
      ):view==="admin"&&(!selClass||!selTerm||!selSession)?(
        // ── Admin: nothing selected yet ──
        <div style={{textAlign:"center",padding:48,borderRadius:12,
          border:`2px dashed ${periods.length>0&&!selClass?C.orange:C.border}`,color:C.muted}}>
          <CalendarCheck size={40} color={periods.length>0&&!selClass?C.orange:C.border} style={{marginBottom:12}}/>
          <div style={{fontWeight:800,fontSize:14,color:C.text,marginBottom:6}}>
            {!selSession?"Select a session to get started":!selTerm?"Now select a term":"Now select a class"}
          </div>
          <div style={{fontSize:12}}>
            {periods.length>0&&!selClass&&selSession&&selTerm?(
              <span style={{color:C.orange,fontWeight:700}}>
                ↑ {periods.length} period{periods.length!==1?"s":""} ready — pick a class to assign subjects
              </span>
            ):""}
          </div>
        </div>
      ):(
        // ── Admin: Class Grid ──
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:12,color:C.muted,fontWeight:600}}>
              {selectedSessionName} · {selectedTermName} ·{" "}
              <span style={{color:C.blue,fontWeight:800}}>{selectedClassName}</span>
            </div>
            {subjects.length>0&&(
              <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontSize:10,color:C.muted,fontWeight:600}}>Subjects:</span>
                {subjects.slice(0,7).map(s=>{
                  const sid=String(s.subject_id||s.section_subjects?.id);
                  const col=subjColors[sid]||C.blue;
                  return(
                    <span key={sid} style={{fontSize:10,padding:"2px 8px",borderRadius:10,
                      background:col+"18",color:col,fontWeight:700,border:`1px solid ${col}30`}}>
                      {s.section_subjects?.name||"?"}
                    </span>
                  );
                })}
                {subjects.length>7&&<span style={{fontSize:10,color:C.muted}}>+{subjects.length-7} more</span>}
              </div>
            )}
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
              <thead>
                <tr>
                  <th style={{padding:"9px 12px",background:C.offWhite,border:`1px solid ${C.border}`,
                    fontSize:11,fontWeight:800,color:C.muted,textAlign:"left",width:130,minWidth:130}}>
                    Period
                  </th>
                  {WEEK_DAYS.map(({d,l})=>{
                    const isToday=d===TODAY_DOW;
                    return(
                      <th key={d} style={{padding:"9px 12px",
                        background:isToday?C.blue:`${C.blue}cc`,
                        border:`1px solid ${C.border}`,fontSize:11,fontWeight:800,color:"#fff",
                        textAlign:"center",minWidth:120}}>
                        {l}
                        {isToday&&<div style={{fontSize:9,opacity:.85,fontWeight:600,letterSpacing:.4}}>TODAY</div>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {periods.map(p=>(
                  <tr key={p.id} style={{background:p.is_break?"#F8FAFC":C.white}}>
                    <td style={{padding:"8px 10px",border:`1px solid ${C.border}`,verticalAlign:"middle"}}>
                      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:4}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:12,color:p.is_break?C.muted:C.text}}>{p.name}</div>
                          <div style={{fontSize:10,color:C.light}}>
                            {p.start_time?.slice(0,5)} – {p.end_time?.slice(0,5)}
                          </div>
                          {p.is_break&&(
                            <span style={{fontSize:9,background:"#FEF3C7",color:"#D97706",padding:"1px 6px",
                              borderRadius:4,fontWeight:700,marginTop:2,display:"inline-block"}}>
                              Break
                            </span>
                          )}
                        </div>
                        {isAdmin&&(
                          <button onClick={e=>{e.stopPropagation();openPeriodEdit(p);}}
                            title="Edit period"
                            style={{padding:"3px 6px",borderRadius:5,border:`1px solid ${C.border}`,
                              background:C.white,cursor:"pointer",color:C.muted,flexShrink:0,
                              marginTop:1,opacity:.7}}>
                            <Pencil size={10}/>
                          </button>
                        )}
                      </div>
                    </td>
                    {WEEK_DAYS.map(({d})=>{
                      if(p.is_break)return(
                        <td key={d} style={{border:`1px solid ${C.border}`,background:"#F8FAFC",
                          textAlign:"center",padding:8}}>
                          <span style={{fontSize:10,color:C.light,fontStyle:"italic"}}>break</span>
                        </td>
                      );
                      const key=`${d}_${p.id}`;const slot=slotMap[key];
                      const subj=slot?.section_subjects?.name;
                      const tch=slot?.teacher_id?teacherName(slot.teacher_id):null;
                      const sid=slot?.subject_id?String(slot.subject_id):null;
                      const col=sid?subjColors[sid]:null;
                      const isToday=d===TODAY_DOW;
                      return(
                        <td key={d} onClick={()=>isAdmin&&openSlotEdit(d,p)}
                          style={{border:`1px solid ${C.border}`,padding:"6px 8px",
                            cursor:isAdmin?"pointer":"default",verticalAlign:"top",minWidth:120,
                            background:slot?(col?`${col}14`:C.bluePale):(isToday?"#EFF6FF":C.white),
                            transition:"background .12s,box-shadow .12s",borderLeft:slot&&col?`3px solid ${col}`:undefined}}
                          onMouseEnter={e=>{if(isAdmin){e.currentTarget.style.background=slot?(col?`${col}28`:C.bluePale):C.offWhite;e.currentTarget.style.boxShadow=`inset 0 0 0 1.5px ${col||C.blue}60`;}}}
                          onMouseLeave={e=>{e.currentTarget.style.background=slot?(col?`${col}14`:C.bluePale):(isToday?"#EFF6FF":C.white);e.currentTarget.style.boxShadow="none";}}>
                          {slot?(
                            <div>
                              <div style={{fontWeight:800,fontSize:11,color:col||C.blue,marginBottom:1}}>
                                {subj||"Untitled"}
                              </div>
                              {tch&&<div style={{fontSize:9,color:C.muted}}>{tch}</div>}
                            </div>
                          ):(
                            isAdmin&&<div style={{textAlign:"center",color:C.light,fontSize:10,paddingTop:4}}>+ Add</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Slot edit modal ── */}
      {slotModal&&(
        <Modal title={`${slotModal.period.name} — ${WEEK_DAYS.find(x=>x.d===slotModal.day)?.l}`} onClose={()=>{setSlotModal(null);setAutoTeacherNote(null);}} width={400}>
          <div style={{marginBottom:14,padding:"9px 12px",background:C.offWhite,borderRadius:8,fontSize:12,color:C.muted}}>
            <span style={{fontWeight:700,color:C.text}}>{selectedClassName}</span>
            {" · "}
            {slotModal.period.start_time?.slice(0,5)} – {slotModal.period.end_time?.slice(0,5)}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:4}}>Subject *</label>
              <select value={slotForm.subject_id}
                onChange={e=>{
                  const sid=e.target.value;
                  const{teacher_id,note}=resolveTeacherForSubject(sid);
                  setSlotForm(p=>({...p,subject_id:sid,teacher_id}));
                  setAutoTeacherNote(sid?note:null);
                }}
                style={{width:"100%",padding:"9px 10px",border:`1.5px solid ${slotForm.subject_id?C.blue:C.border}`,
                  borderRadius:8,fontSize:13,background:C.white,color:C.text}}>
                <option value="">{"— Clear this slot —"}</option>
                {subjects.map(s=><option key={s.subject_id||s.section_subjects?.id} value={String(s.subject_id||s.section_subjects?.id)}>{s.section_subjects?.name||"?"}</option>)}
              </select>
              {subjects.length===0&&<div style={{fontSize:11,color:C.orange,marginTop:4,fontWeight:600}}>No subjects assigned to {selectedClassName} yet.</div>}
            </div>
            {/* Auto-match notice */}
            {autoTeacherNote&&(
              <div style={{padding:"7px 12px",borderRadius:7,fontSize:11,fontWeight:600,
                background:autoTeacherNote.found?"#ECFDF5":"#FFF7ED",
                border:`1px solid ${autoTeacherNote.found?"#6EE7B7":"#FED7AA"}`,
                color:autoTeacherNote.found?"#065F46":"#92400E",
                display:"flex",alignItems:"center",gap:6}}>
                {autoTeacherNote.found?(
                  <><span style={{fontSize:14}}>✓</span> Auto-matched: <strong>{autoTeacherNote.name}</strong></>
                ):(
                  <><span style={{fontSize:14}}>⚠</span> No teacher assigned to <strong>{autoTeacherNote.subjName}</strong> in {selectedClassName}. Assign one in Teachers → Subject Assignments.</>
                )}
              </div>
            )}
            <div>
              <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:4}}>
                Teacher <span style={{fontWeight:400,fontSize:10}}>(optional — override auto-match)</span>
              </label>
              <select value={slotForm.teacher_id} onChange={e=>{setSlotForm(p=>({...p,teacher_id:e.target.value}));setAutoTeacherNote(null);}}
                disabled={!slotForm.subject_id}
                style={{width:"100%",padding:"9px 10px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:13,
                  background:slotForm.subject_id?C.white:C.offWhite,color:slotForm.subject_id?C.text:C.light,
                  cursor:slotForm.subject_id?"auto":"not-allowed"}}>
                <option value="">{"— Unassigned —"}</option>
                {teachers.map(t=><option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
              {!slotForm.subject_id&&(
                <div style={{fontSize:10,color:C.muted,marginTop:4}}>Select a subject first to assign a teacher.</div>
              )}
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:4}}>
              <Btn onClick={()=>setSlotModal(null)} color={C.muted} outline>Cancel</Btn>
              <Btn onClick={saveSlot} disabled={saving}
                color={slotForm.subject_id?C.blue:C.red}>
                {saving?"Saving…":slotForm.subject_id?"Save Slot":"Clear Slot"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Manage Periods modal ── */}
      {periodModal&&(()=>{
        const filteredPeriods=allPeriods.filter(p=>!periodSectionFilter||String(p.section_id)===periodSectionFilter);
        return(
        <Modal title="Manage Periods" onClose={()=>{setPeriodModal(false);setEditPeriodId(null);}} width={540}>
          {/* Section tabs */}
          {sections.length>0&&(
            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:14}}>
              {sections.map(s=>{
                const count=allPeriods.filter(p=>String(p.section_id)===String(s.id)).length;
                const active=periodSectionFilter===String(s.id);
                return(
                  <button key={s.id} onClick={()=>{
                    setPeriodSectionFilter(String(s.id));
                    setEditPeriodId(null);
                    setPeriodForm({name:"",start_time:"",end_time:"",is_break:false,order_index:0,section_id:String(s.id)});
                  }}
                  style={{padding:"5px 12px",borderRadius:20,border:`1.5px solid ${active?(s.color||C.blue):C.border}`,
                    background:active?(s.color||C.blue)+"18":"transparent",
                    color:active?(s.color||C.blue):C.muted,
                    fontSize:11,fontWeight:700,cursor:"pointer"}}>
                    {s.name} {count>0&&<span style={{opacity:.7}}>({count})</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Periods list for selected section */}
          {filteredPeriods.length===0?(
            <div style={{textAlign:"center",padding:16,color:C.muted,fontSize:12,marginBottom:14,
              background:C.offWhite,borderRadius:8}}>
              {periodSectionFilter
                ?`No periods yet for ${sections.find(s=>String(s.id)===periodSectionFilter)?.name||"this section"} — add one below.`
                :"Select a section above, then add periods."}
            </div>
          ):(
            <div style={{marginBottom:14,maxHeight:260,overflowY:"auto"}}>
              {filteredPeriods.map(p=>(
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",
                  borderRadius:8,marginBottom:4,
                  background:editPeriodId===p.id?C.bluePale:C.offWhite,
                  border:`1.5px solid ${editPeriodId===p.id?C.blue:C.border}`,
                  transition:"background .12s,border-color .12s"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:12,color:C.text}}>{p.name}</div>
                    <div style={{fontSize:11,color:C.muted}}>
                      {p.start_time?.slice(0,5)} – {p.end_time?.slice(0,5)}
                      {p.is_break&&<span style={{marginLeft:6,fontSize:9,background:"#FEF3C7",color:"#D97706",padding:"1px 5px",borderRadius:4,fontWeight:700}}>Break</span>}
                    </div>
                  </div>
                  <button onClick={()=>{
                    if(editPeriodId===p.id){
                      setEditPeriodId(null);
                      setPeriodForm({name:"",start_time:"",end_time:"",is_break:false,order_index:0,section_id:periodSectionFilter});
                    }else{
                      setPeriodForm({name:p.name,start_time:p.start_time,end_time:p.end_time,
                        is_break:p.is_break,order_index:p.order_index,section_id:String(p.section_id||"")});
                      setEditPeriodId(p.id);
                    }
                  }} style={{padding:"4px 10px",borderRadius:6,fontSize:11,cursor:"pointer",
                    border:`1px solid ${editPeriodId===p.id?C.blue:C.border}`,
                    background:editPeriodId===p.id?C.blue:"transparent",
                    color:editPeriodId===p.id?"#fff":C.muted}}>
                    <Pencil size={11}/>
                  </button>
                  <button onClick={()=>delPeriod(p)}
                    style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${C.red}30`,
                      background:C.redPale,fontSize:11,cursor:"pointer",color:C.red}}>
                    <Trash2 size={11}/>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add / Edit form */}
          <div style={{background:C.offWhite,borderRadius:10,padding:16,border:`1.5px solid ${editPeriodId?C.blue:C.orange}30`}}>
            <div style={{fontWeight:800,fontSize:12,color:editPeriodId?C.blue:C.orange,marginBottom:12,
              display:"flex",alignItems:"center",gap:6}}>
              {editPeriodId?<><Pencil size={12}/> Editing Period</>:<><Plus size={12}/> New Period</>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div style={{gridColumn:"1/-1"}}>
                <label style={{fontSize:10,fontWeight:700,color:C.muted,display:"block",marginBottom:3}}>Section *</label>
                <select value={periodForm.section_id||""}
                  onChange={e=>{setPeriodSectionFilter(e.target.value);setPeriodForm(p=>({...p,section_id:e.target.value}));setEditPeriodId(null);}}
                  style={{width:"100%",padding:"8px 10px",border:`1.5px solid ${periodForm.section_id?C.blue:C.orange}`,
                    borderRadius:7,fontSize:12,background:C.white,color:C.text}}>
                  <option value="">{"— Select section —"}</option>
                  {sections.map(s=><option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
              </div>
              <div style={{gridColumn:"1/-1"}}>
                <label style={{fontSize:10,fontWeight:700,color:C.muted,display:"block",marginBottom:3}}>Name *</label>
                <input value={periodForm.name} onChange={e=>setPeriodForm(p=>({...p,name:e.target.value}))}
                  placeholder="e.g. Period 1, Short Break, Assembly"
                  style={{width:"100%",padding:"8px 10px",border:`1.5px solid ${C.border}`,borderRadius:7,
                    fontSize:13,background:C.white,color:C.text,boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{fontSize:10,fontWeight:700,color:C.muted,display:"block",marginBottom:3}}>Start *</label>
                <input type="time" value={periodForm.start_time}
                  onChange={e=>setPeriodForm(p=>({...p,start_time:e.target.value}))}
                  style={{width:"100%",padding:"8px",border:`1.5px solid ${C.border}`,borderRadius:7,
                    fontSize:12,background:C.white,color:C.text,boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{fontSize:10,fontWeight:700,color:C.muted,display:"block",marginBottom:3}}>End *</label>
                <input type="time" value={periodForm.end_time}
                  onChange={e=>setPeriodForm(p=>({...p,end_time:e.target.value}))}
                  style={{width:"100%",padding:"8px",border:`1.5px solid ${C.border}`,borderRadius:7,
                    fontSize:12,background:C.white,color:C.text,boxSizing:"border-box"}}/>
              </div>
              <div style={{gridColumn:"1/-1",display:"flex",alignItems:"center",gap:8}}>
                <input type="checkbox" id="is-break-cb" checked={!!periodForm.is_break}
                  onChange={e=>setPeriodForm(p=>({...p,is_break:e.target.checked}))}/>
                <label htmlFor="is-break-cb" style={{fontSize:12,color:C.text,cursor:"pointer"}}>
                  This is a break / non-teaching slot
                </label>
              </div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              {editPeriodId&&(
                <button onClick={()=>{setEditPeriodId(null);setPeriodForm({name:"",start_time:"",end_time:"",is_break:false,order_index:0,section_id:periodSectionFilter});}}
                  style={{padding:"7px 14px",borderRadius:7,border:`1px solid ${C.border}`,background:"none",fontSize:12,cursor:"pointer",color:C.muted}}>
                  + New Period
                </button>
              )}
              <Btn onClick={savePeriod} color={editPeriodId?C.blue:C.orange} disabled={saving} style={{fontSize:12}}>
                {saving?"Saving…":editPeriodId?"Update Period":"Add Period"}
              </Btn>
            </div>
          </div>
          <div style={{marginTop:14,display:"flex",justifyContent:"flex-end"}}>
            <Btn onClick={()=>{setPeriodModal(false);setEditPeriodId(null);}} color={C.muted} outline>Done</Btn>
          </div>
        </Modal>
        );
      })()}
    </div>
  );
}
