/**
 * Password hashing with Node's built-in scrypt (no native dependencies).
 * Stored format: scrypt$N$r$p$saltBase64$hashBase64, so parameters can be
 * raised later without breaking existing hashes.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const KEY_LEN = 32;
const DEFAULT = { N: 2 ** 15, r: 8, p: 1 };

function derive(password: string, salt: Buffer, opts: { N: number; r: number; p: number }): Promise<Buffer> {
  const options: ScryptOptions = { ...opts, maxmem: 128 * opts.N * opts.r * 2 };
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LEN, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string, opts = DEFAULT): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, opts);
  return ["scrypt", opts.N, opts.r, opts.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await derive(password, Buffer.from(salt, "base64"), { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A hash to verify against when the account does not exist, so timing does not reveal it. */
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword("not a real password"));
