// Navigation is not an authority boundary. Keep the owner's new route grant
// closed until its existing role/user overrides have been read for this identity.
const isId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const ownerNavigationScope=user=>JSON.stringify([user?._authUserId||user?.id,user?.school_id,user?.role]);
export async function readOwnerNavigationPermissions(db,user){
 const actor=user?._authUserId||user?.id;
 if(user?.role!=='owner'||!isId(actor)||!isId(user.school_id))throw Error('Owner permission identity is invalid.');
 let results;
 try{results=await Promise.all([db.getRolePermissions('owner'),db.getUserPermissions(actor)]);}catch{throw Error('Owner permissions could not be loaded.');}
 for(const result of results)if(result?.error||!Array.isArray(result?.data)||result.data.some(p=>typeof p?.page_id!=='string'||typeof p.allowed!=='boolean'))throw Error('Owner permissions could not be confirmed.');
 if(results[0].data.some(p=>p.school_id!==user.school_id||p.role!=="owner")||results[1].data.some(p=>p.user_id!==actor))throw Error("Owner permission scope could not be confirmed.");
 return{scope:ownerNavigationScope(user),rolePermissions:results[0].data,userPermissions:results[1].data};
}
