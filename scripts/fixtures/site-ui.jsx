import {ConnectorDirectory} from '../../src/connectors/ConnectorDirectory.jsx';
import {ComposerTools} from '../../src/chat/ComposerTools.jsx';
import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/styles/app.css';
import AppDemo from '../../src/AppDemo.jsx';
import {EmailAuthPage} from '../../src/pages/saas-entry.jsx';
import {OAuthConsentPage} from '../../src/pages/oauth-consent.jsx';
import {PublicLanding} from '../../src/pages/public-landing.jsx';
import {user,school} from './site-ui-client.mjs';

localStorage.setItem('jd_session_user',JSON.stringify(user));
sessionStorage.setItem('jd_session_active','1');
localStorage.setItem('jd_selected_org',JSON.stringify(school));
localStorage.setItem('jd_tour_done_ui-admin','1');
localStorage.setItem('jd_dark','0');
window.__siteCalls=[];window.__siteUnexpected=[];
const root=createRoot(document.getElementById('root'));
let generation=0;
window.__mountSite=(mode='workspace')=>{
 const props={key:++generation,onBack:()=>window.__mountSite('landing'),onAuthenticated:()=>window.__mountSite('workspace')};
 root.render(mode==='landing'?<PublicLanding onSignIn={()=>window.__mountSite('signin')} onGetStarted={()=>window.__mountSite('signup')}/>:['signin','signup','reset','update','invite-sent'].includes(mode)?<EmailAuthPage {...props} mode={mode}/>:mode==='oauth'?<OAuthConsentPage key={++generation}/>:<React.Suspense fallback={<p data-fixture-loading>Loading fixture route…</p>}><AppDemo key={++generation}/></React.Suspense>);
};
window.__mountSite(new URLSearchParams(location.search).get('screen')||'workspace');

function ComposerHarness({role}){const [draft,setDraft]=React.useState('');return <div className="jd-command"><div className="jd-compose" style={{marginTop:450,width:400}}><ComposerTools role={role} draft={draft} setDraft={setDraft} actions={[{label:'People',prompt:'Review people.'}]} onSend={()=>{window.__testSent=true;}} onNavigate={()=>{}}/></div></div>;}
window.__mountConnectorRole=role=>root.render(<ConnectorDirectory key={++generation} role={role}/>);
window.__mountComposerRole=role=>root.render(<ComposerHarness key={++generation} role={role}/>);
