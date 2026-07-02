"use client";

import { useProject } from "@/components/projects/project-context";
import { Badge, roleTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ProjectOverviewPage() {
  const { project } = useProject();

  // The backend includes the owner in members[] (as admin). Show the owner
  // once (with an Owner badge) and list only the other members below.
  const otherMembers = project.members.filter(
    (m) => m.userId !== project.ownerId,
  );

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* Details */}
      <Card className="p-5 md:col-span-2">
        <h2 className="text-sm font-semibold text-zinc-200">Description</h2>
        <p className="mt-2 text-sm text-zinc-400">
          {project.description || "No description provided."}
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-zinc-800 pt-4 text-sm">
          <div>
            <dt className="text-zinc-500">Owner</dt>
            <dd className="mt-0.5 text-zinc-200">{project.owner.username}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Members</dt>
            <dd className="mt-0.5 text-zinc-200">{project.members.length}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Created</dt>
            <dd className="mt-0.5 text-zinc-200">
              {formatDate(project.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Last updated</dt>
            <dd className="mt-0.5 text-zinc-200">
              {formatDate(project.updatedAt)}
            </dd>
          </div>
        </dl>
      </Card>

      {/* Members */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-zinc-200">Team</h2>
        <ul className="mt-3 flex flex-col gap-3">
          <li className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-200">
                {project.owner.username}
              </p>
              <p className="truncate text-xs text-zinc-500">
                {project.owner.email}
              </p>
            </div>
            <Badge tone="emerald">Owner</Badge>
          </li>
          {otherMembers.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-zinc-200">{m.username}</p>
                <p className="truncate text-xs text-zinc-500">{m.email}</p>
              </div>
              <Badge tone={roleTone(m.role)}>{m.role}</Badge>
            </li>
          ))}
          {otherMembers.length === 0 && (
            <li className="text-xs text-zinc-500">
              No other members yet. Invite teammates from the Team tab.
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}
