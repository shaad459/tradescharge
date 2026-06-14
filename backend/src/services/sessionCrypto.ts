import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRET_FILE = path.resolve(__dirname, "../../data/.session-secret");

let cachedKey: Buffer | null = null;

async function loadOrCreateSecretMaterial(): Promise<string> {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 32) {
    return fromEnv;
  }

  try {
    const existing = (await fs.readFile(SECRET_FILE, "utf8")).trim();
    if (existing.length >= 32) {
      return existing;
    }
  } catch {
    // generate below
  }

  const generated = randomBytes(32).toString("hex");
  await fs.mkdir(path.dirname(SECRET_FILE), { recursive: true });
  await fs.writeFile(SECRET_FILE, `${generated}\n`, { encoding: "utf8", mode: 0o600 });
  console.warn(
    "SESSION_SECRET not set — generated a local secret at backend/data/.session-secret (do not commit).",
  );
  return generated;
}

function syncEncryptionKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 32) {
    cachedKey = createHash("sha256").update(fromEnv).digest();
    return cachedKey;
  }
  throw new Error("SESSION_SECRET must be at least 32 characters");
}

async function encryptionKey(): Promise<Buffer> {
  if (cachedKey) {
    return cachedKey;
  }
  const material = await loadOrCreateSecretMaterial();
  cachedKey = createHash("sha256").update(material).digest();
  return cachedKey;
}

/** Synchronous encrypt for HttpOnly session cookies (serverless-safe). */
export function encryptJsonSync(value: unknown): string {
  const key = syncEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  });
}

export function decryptJsonSync<T>(payload: string): T {
  const key = syncEncryptionKey();
  const parsed = JSON.parse(payload) as { v: number; iv: string; tag: string; data: string };
  if (parsed.v !== 1) {
    throw new Error("Unsupported encrypted session format");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}

export async function encryptJson(value: unknown): Promise<string> {
  const key = await encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  });
}

export async function decryptJson<T>(payload: string): Promise<T> {
  const key = await encryptionKey();
  const parsed = JSON.parse(payload) as { v: number; iv: string; tag: string; data: string };
  if (parsed.v !== 1) {
    throw new Error("Unsupported encrypted session format");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}
