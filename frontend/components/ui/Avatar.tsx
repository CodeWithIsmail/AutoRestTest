// The generated initial avatar, in one place.
//
// There is no file storage in this project, so an avatar is a coloured disc
// with a letter in it. The colour is the one piece the user picks; everything
// else is derived, which keeps it consistent between the header, the team list
// and the settings page.

const COLORS: Record<string, string> = {
  emerald: "bg-emerald-600",
  blue: "bg-blue-600",
  purple: "bg-purple-600",
  amber: "bg-amber-600",
  rose: "bg-rose-600",
  cyan: "bg-cyan-600",
  zinc: "bg-zinc-600",
};

const DEFAULT_COLOR = "emerald";

const SIZES = {
  sm: "h-7 w-7 text-xs",
  md: "h-8 w-8 text-sm",
  lg: "h-14 w-14 text-xl",
} as const;

export type AvatarSize = keyof typeof SIZES;

/** Resolve the accent class, tolerating a colour key we no longer offer. */
export function avatarColorClass(color: string | null | undefined): string {
  return COLORS[color ?? ""] ?? COLORS[DEFAULT_COLOR];
}

export interface AvatarProps {
  /** Only the fields the avatar actually needs, so any user-ish row will do. */
  user: { username: string; name?: string | null; avatarColor?: string | null };
  size?: AvatarSize;
  /** Native tooltip; the header uses it to show the email address. */
  title?: string;
  className?: string;
}

export function Avatar({
  user,
  size = "md",
  title,
  className = "",
}: AvatarProps) {
  const label = user.name?.trim() || user.username;
  const initial = label.charAt(0).toUpperCase();

  return (
    <div
      title={title}
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${avatarColorClass(
        user.avatarColor,
      )} ${SIZES[size]} ${className}`}
    >
      {initial}
    </div>
  );
}
