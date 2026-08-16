// Password hashing, in one place.
//
// Both AuthService and UsersService hash passwords, and they must agree on the
// cost factor: a login compares against whatever the other module wrote. Two
// copies of the constant is one edit away from a silent mismatch.

import * as bcrypt from 'bcrypt';

const BCRYPT_SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
