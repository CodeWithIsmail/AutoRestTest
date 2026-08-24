import { LandingPage } from "@/components/landing/LandingPage";
import { AuthRedirect } from "@/components/landing/AuthRedirect";

// Public marketing page for anonymous visitors. Session state lives only in
// localStorage (see components/auth-provider.tsx), so the server can never
// know here whether a visitor is signed in — AuthRedirect is a client island
// that bounces already-authenticated visitors to /projects after mount.
export default function Home() {
  return (
    <>
      <AuthRedirect />
      <LandingPage />
    </>
  );
}
