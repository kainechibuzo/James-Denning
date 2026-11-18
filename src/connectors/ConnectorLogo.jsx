import React from 'react';
import logos from './logos.json';
export function ConnectorLogo({id,name,className=''}){
 const logo=logos[id];
 return <span className={'jd-connector-logo '+className}><img src={logo?.file||'/connectors/mcp.svg'} alt={logo?`${name||logo.name} logo`:'MCP connector'} width="28" height="28" loading="lazy"/></span>;
}
