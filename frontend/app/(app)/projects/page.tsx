"use client";

import { useAuth } from "@/components/auth-provider";
import { Card } from "@/components/ui/Card";

export default function ProjectsPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold text-zinc-900">Projects</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Signed in as {user?.email}
      </p>

      <Card className="mt-6 p-8 text-center">
        <p className="text-sm text-zinc-500">
          Project management arrives in Slice 2. The foundation, auth, and
          dashboard shell are working.
        </p>
      </Card>
    </div>
  );
}
