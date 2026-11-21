import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/styles/app.css';
import {ChatHome} from '../../src/chat/ChatHome.jsx';
function Fixture(){const [navigation,setNavigation]=useState(null);return <div style={{height:'100dvh',display:'flex',flexDirection:'column'}}><nav aria-label="Test navigation"><button onClick={()=>setNavigation({view:'history'})}>History</button><button onClick={()=>setNavigation({view:'new'})}>New chat</button></nav><ChatHome user={{id:'synthetic',school_id:'synthetic-org',role:'admin',name:'Test User'}} navigationRequest={navigation}/></div>;}
createRoot(document.getElementById('root')).render(<Fixture/>);
