// A profile currently has one school_id, not an authorised membership list.
// Switching therefore requires reauthentication; never accept a tenant ID here.
export async function signOutForWorkspaceSwitch({signOut, clearSession, clearWorkspace, resetContext, leave}) {
  const result = await signOut({scope:"local"});
  if (!result || result.error !== null) throw result?.error || new Error("Sign-out was not acknowledged.");
  clearSession();
  clearWorkspace();
  resetContext();
  leave(); // Full navigation discards cached records; / removes legacy ?school= links.
}
