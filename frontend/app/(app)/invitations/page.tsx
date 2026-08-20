"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useToast } from "@/components/toast";
import { Badge, roleTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { errMsg } from "@/lib/api";
import { acceptInvitation, declineInvitation } from "@/lib/collaboration";
import { myInvitationsOptions } from "@/lib/queries";
import { qk } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * `useSearchParams` client-side-renders everything up to the nearest Suspense
 * boundary, so the Next docs call for wrapping the component that uses it.
 */
export default function MyInvitationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
        </div>
      }
    >
      <MyInvitations />
    </Suspense>
  );
}

function MyInvitations() {
  const router = useRouter();
  const toast = useToast();

  // Set when the user arrives from the link in an invitation email. Highlights
  // that one invitation so the link lands on something specific rather than on
  // an undifferentiated list.
  const highlightToken = useSearchParams().get("token");

  const queryClient = useQueryClient();
  const { data: invitations, isPending, error } = useQuery(
    myInvitationsOptions(),
  );

  // Token currently being acted on, to disable its buttons.
  const [busyToken, setBusyToken] = useState<string | null>(null);

  // Both outcomes refresh the pending list — which is also what feeds the
  // count in the app header, so the badge now decrements on its own.
  function refreshInvitations() {
    void queryClient.invalidateQueries({ queryKey: qk.myInvitations });
  }

  const acceptMutation = useMutation({
    mutationFn: (token: string) => acceptInvitation(token),
    onSuccess: (res) => {
      toast.success("Invitation accepted.");
      refreshInvitations();
      // Joining a project changes what the projects list contains.
      void queryClient.invalidateQueries({ queryKey: qk.projects.list() });
      router.push(`/projects/${res.projectId}`);
    },
    onError: (err) => {
      toast.error(errMsg(err, "Failed to accept"));
      setBusyToken(null);
      refreshInvitations();
    },
  });

  const declineMutation = useMutation({
    mutationFn: (token: string) => declineInvitation(token),
    onSuccess: () => {
      toast.success("Invitation declined.");
      refreshInvitations();
    },
    onError: (err) => toast.error(errMsg(err, "Failed to decline")),
    onSettled: () => setBusyToken(null),
  });

  function onAccept(token: string) {
    setBusyToken(token);
    acceptMutation.mutate(token);
  }

  function onDecline(token: string) {
    setBusyToken(token);
    declineMutation.mutate(token);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Invitations</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Projects you&apos;ve been invited to collaborate on.
      </p>

      <div className="mt-6">
        {isPending ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
          </div>
        ) : error ? (
          <div className="py-12 text-center">
            <p className="text-sm text-red-600 dark:text-red-400">
              {errMsg(error, "Failed to load invitations")}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={refreshInvitations}
            >
              Retry
            </Button>
          </div>
        ) : !invitations || invitations.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              You have no pending invitations.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {invitations.map((inv) => (
              <Card
                key={inv.id}
                className={`flex items-center justify-between gap-4 p-4 ${
                  inv.token === highlightToken
                    ? "ring-1 ring-emerald-500/40"
                    : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
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
