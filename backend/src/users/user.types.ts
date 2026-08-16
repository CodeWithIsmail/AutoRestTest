// The one definition of "a user, as the outside world sees them".
//
// This lives in `users/` rather than `auth/` because three separate places need
// it — AuthService, UsersService, and JwtStrategy — and pointing them all at
// `auth.service.ts` would make the strategy import the service it protects.
// Everything here is types and plain data, so importing it never creates a
// module dependency.

/**
 * Accent colours a user can pick for their generated initial avatar. Stored as
 * a key, not a hex value, so the frontend owns the actual shades and can
 * re-theme without a migration.
 */
export const AVATAR_COLORS = [
  'emerald',
  'blue',
  'purple',
  'amber',
  'rose',
  'cyan',
  'zinc',
] as const;

export type AvatarColor = (typeof AVATAR_COLORS)[number];

/**
 * Whether signing up has to prove the address before an account is created.
 *
 * Read from `process.env` rather than `ConfigService` so it stays usable from a
 * plain function; `ConfigModule` is global and has already loaded `.env` by the
 * time any of this runs. Only `AuthService.register` consults it — with it off,
 * registration skips the pending step entirely, which is the escape hatch for
 * demos and for hosts where mail cannot be delivered.
 */
export function emailVerificationRequired(): boolean {
  return (
    (process.env['REQUIRE_EMAIL_VERIFICATION'] ?? 'true')
      .trim()
      .toLowerCase() === 'true'
  );
}

/** Public-safe projection of a User row. Never includes the password hash. */
export interface PublicUser {
  id: string;
  username: string;
  email: string;
  /** Display name. Null means "fall back to the username". */
  name: string | null;
  avatarColor: string | null;
  /**
   * Always true in practice: a `User` row cannot be created until its address
   * has been proven. Kept as an honest field rather than dropped, because a
   * change-email flow would need it again.
   */
  emailVerified: boolean;
  notifyRunFinished: boolean;
  notifyInvitations: boolean;
  createdAt: Date;
}

/**
 * Prisma `select` matching PublicUser. Note it selects `emailVerifiedAt` (the
 * column) while the interface exposes `emailVerified` (a boolean) — clients
 * only ever need to know *whether*, and the timestamp is an internal detail.
 */
export const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  email: true,
  name: true,
  avatarColor: true,
  emailVerifiedAt: true,
  notifyRunFinished: true,
  notifyInvitations: true,
  createdAt: true,
} as const;

/** The row shape `PUBLIC_USER_SELECT` produces. */
export interface UserRow {
  id: string;
  username: string;
  email: string;
  name: string | null;
  avatarColor: string | null;
  emailVerifiedAt: Date | null;
  notifyRunFinished: boolean;
  notifyInvitations: boolean;
  createdAt: Date;
}

export function toPublicUser(row: UserRow): PublicUser {
  const { emailVerifiedAt, ...rest } = row;
  return { ...rest, emailVerified: emailVerifiedAt !== null };
}
