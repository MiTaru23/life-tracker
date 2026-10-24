/**
 * Client-side encryption for the cloud snapshot. Self-contained (no imports)
 * so it also runs in Node for the PC-side uplink script.
 *
 * passphrase --PBKDF2-SHA256 (600k)--> AES-256-GCM key
 * payload: JSON -> gzip -> AES-GCM -> base64
 */

export interface Envelope {
  app: 'life-os-vault'
  v: 1
  kdf: { name: 'PBKDF2-SHA256'; iter: number; salt: string }
  cipher: 'AES-256-GCM'
  iv: string
  data: string
  writtenAt: number
  deviceId: string
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('Wrong passphrase (or the vault is corrupted).')
    this.name = 'WrongPassphraseError'
  }
}

const ITER = 600_000

function toB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/\s/g, ''))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, t: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(t)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function seal(payload: unknown, passphrase: string, deviceId: string): Promise<Envelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt, ITER)
  const plain = await pipe(new TextEncoder().encode(JSON.stringify(payload)), new CompressionStream('gzip'))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain))
  return {
    app: 'life-os-vault',
    v: 1,
    kdf: { name: 'PBKDF2-SHA256', iter: ITER, salt: toB64(salt) },
    cipher: 'AES-256-GCM',
    iv: toB64(iv),
    data: toB64(ct),
    writtenAt: Date.now(),
    deviceId,
  }
}

export async function unseal<T = unknown>(env: Envelope, passphrase: string): Promise<T> {
  if (env?.app !== 'life-os-vault' || env.v !== 1) throw new Error('Not a LIFE/OS vault file.')
  const key = await deriveKey(passphrase, fromB64(env.kdf.salt), env.kdf.iter)
  let plain: Uint8Array<ArrayBuffer>
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) }, key, fromB64(env.data)))
  } catch {
    // GCM auth tag mismatch: wrong key or tampered data.
    throw new WrongPassphraseError()
  }
  const json = await pipe(plain, new DecompressionStream('gzip'))
  return JSON.parse(new TextDecoder().decode(json)) as T
}
