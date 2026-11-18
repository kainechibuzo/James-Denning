// Translate transport/setup errors without mistaking them for denied consent.
// Never request a PAT, expose response diagnostics, or retry a consent write.
export async function connectorSignInError(error, data) {
  const status = error?.context?.status;
  if (status === 401) return 'Your JD session has expired. Sign in to JD again, then retry.';
  if (status === 403) return 'Your account cannot set up this connection. Ask a workspace owner to review your access.';
  if (status === 404) return 'Provider sign-in is not deployed for this workspace yet. Ask the JD operator to finish backend deployment and provider setup. You do not need an API key.';
  if (error?.name === 'FunctionsFetchError' || error?.name === 'FunctionsRelayError' || /Failed to (send a request|fetch)|NetworkError/i.test(error?.message || '')) {
    return 'JD could not reach its sign-in service. Check your connection and retry. If this continues, the JD operator needs to check backend deployment and access settings. You do not need an API key.';
  }
  if (status >= 500) return 'JD’s sign-in service is temporarily unavailable. Retry later or ask the JD operator to check the service.';
  // Only application-provided errors are displayed; an HTTP failure's raw body
  // may contain infrastructure details and is deliberately not dumped into UI.
  return data?.error || (status ? 'The sign-in request could not be completed. Ask the JD operator to check provider setup.' : error?.message) || 'Sign-in request failed. Please try again.';
}
