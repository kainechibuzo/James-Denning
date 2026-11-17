// Presentation identity only. Supabase session, API checks and RLS remain the
// authority; never manufacture admin or remap a role to gain UI access.
const roles=new Set(['owner','admin','manager','staff','finance','hr','contractor','viewer']);
const isId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function workspaceIdentity({user,profile,school}={}){
 if(!isId(user?.id)||profile?.id!==user.id||!isId(school?.id)||profile?.school_id!==school.id)throw Error('Your account is missing a valid workspace association. Please contact your administrator.');
 if(!roles.has(profile.role))throw Error('Your account role is missing or unsupported. Please contact your administrator.');
 return{id:profile.id,role:profile.role,name:profile.full_name||user.email,email:user.email,school_id:school.id,_authUserId:user.id};
}
