"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { Badge, roleTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api";
import {
  acceptInvitation,
  declineInvitation,
  listMyInvitations,
} from "@/lib/collaboration";
import { useApi } from "@/lib/useApi";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function MyInvitationsPage() {
  const router = useRouter();
  const toast = useToast();
  const {
    data: invitations,
    loading,
    error,
    reload,
  } = useApi(listMyInvitations, []);

  // Token currently being acted on, to disable its buttons.
  const [busyToken, setBusyToken] = useState<string | null>(null);

  async function onAccept(token: string) {
    setBusyToken(token);
    try {
      const res = await acceptInvitation(token);
      toast.success("Invitation accepted.");
      router.push(`/projects/${res.projectId}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to accept");
      setBusyToken(null);
      reload();
    }
  }

  async function onDecline(token: string) {
    setBusyToken(token);
    try {
      await declineInvitation(token);
      toast.success("Invitation declined.");
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to decline");
    } finally {
      setBusyToken(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold text-zinc-50">Invitations</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Projects you&apos;ve been invited to collaborate on.
      </p>

      <div className="mt-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-emerald-500" />
          </div>
        ) : error ? (
          <div className="py-12 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={reload}
            >
              Retry
            </Button>
          </div>
        ) : !invitations || invitations.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-sm text-zinc-400">
              You have no pending invitations.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {invitations.map((inv) => (
              <Card
                key={inv.id}
                className="flex items-center justify-between gap-4 p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-zinc-100">
                      {inv.projectName}
                    </p>
                    <Badge tone={roleTone(inv.role)}>{inv.role}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Invited by {inv.invitedBy} · expires{" "}
                    {formatDate(inv.expiresAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onDecline(inv.token)}
                    disabled={busyToken === inv.token}
                  >
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onAccept(inv.token)}
                    loading={busyToken === inv.token}
                  >
                    Accept
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
