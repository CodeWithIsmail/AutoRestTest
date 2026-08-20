// A one-slot registry for "the session is gone, get out".
//
// The QueryClient needs to react to a 401 from any read, but signing out means
// clearing auth state and navigating — both of which live in AuthProvider,
// which sits *inside* the QueryClientProvider and uses it. Importing one from
// the other would be circular, so the client raises an event through this
// module and AuthProvider registers the handler on mount.
//
// Deliberately not a React context: the caller is the QueryCache, which is
// constructed outside the component tree.

type UnauthorizedHandler = () => void;

let handler: UnauthorizedHandler | null = null;

/** Called by AuthProvider on mount; pass null on unmount to deregister. */
export function setUnauthorizedHandler(next: UnauthorizedHandler | null): void {
  handler = next;
}

/**
 * Raised when a *read* comes back 401. Not wired to mutations on purpose —
 * `POST /auth/login` answers 401 for a wrong password, and that has to surface
 * as "invalid credentials" on the login form, not as a redirect to it.
 */
export function notifyUnauthorized(): void {
  handler?.();
}
