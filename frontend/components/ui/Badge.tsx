export type Tone = "emerald" | "zinc" | "blue" | "amber" | "purple" | "red";

const TONES: Record<Tone, string> = {
  emerald: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400",
  zinc: "bg-zinc-500/10 text-zinc-700 ring-zinc-500/20 dark:text-zinc-300",
  blue: "bg-blue-500/10 text-blue-700 ring-blue-500/20 dark:text-blue-400",
  amber: "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400",
  purple: "bg-purple-500/10 text-purple-700 ring-purple-500/20 dark:text-purple-400",
  red: "bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-400",
};

export function Badge({
  children,
  tone = "zinc",
  className = "",
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Maps a project role (or "Owner") to a badge tone. */
export function roleTone(role: string): Tone {
  switch (role.toLowerCase()) {
    case "owner":
      return "emerald";
    case "admin":
      return "blue";
    case "tester":
      return "amber";
    default:
      return "zinc";
  }
}

/** Maps an HTTP method to a badge tone (KushoAI-style colouring). */
export function methodTone(method: string): Tone {
  switch (method.toUpperCase()) {
    case "GET":
      return "emerald";
    case "POST":
      return "amber";
    case "PUT":
      return "blue";
    case "PATCH":
      return "purple";
    case "DELETE":
      return "red";
    default:
      return "zinc";
  }
}

/** Maps a test-suite status to a badge tone. */
export function statusTone(status: string): Tone {
  switch (status) {
    case "completed":
      return "emerald";
    case "running":
      return "blue";
    case "failed":
      return "red";
    default:
      return "zinc"; // pending
  }
}

/** A capitalized status badge for test-suite runs. */
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={statusTone(status)}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

/** A fixed-width, monospace HTTP-method badge for endpoint tables. */
export function MethodBadge({ method }: { method: string }) {
  return (
    <Badge
      tone={methodTone(method)}
      className="w-16 justify-center font-mono tracking-wide"
    >
      {method.toUpperCase()}
    </Badge>
  );
}
