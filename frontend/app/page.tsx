import { redirect } from "next/navigation";

// The app is auth-gated; send everyone to the dashboard, where the (app)
// layout guard bounces unauthenticated visitors to /login.
export default function Home() {
  redirect("/projects");
}
