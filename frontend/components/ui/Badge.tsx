type Tone = "emerald" | "zinc" | "blue" | "amber" | "purple" | "red";

const TONES: Record<Tone, string> = {
  emerald: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  zinc: "bg-zinc-500/10 text-zinc-300 ring-zinc-500/20",
  blue: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
  amber: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  purple: "bg-purple-500/10 text-purple-400 ring-purple-500/20",
  red: "bg-red-500/10 text-red-400 ring-red-500/20",
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
