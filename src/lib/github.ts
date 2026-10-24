/**
 * Minimal GitHub Contents API client. Self-contained (no imports) so the
 * PC-side uplink script can reuse it in Node.
 */

export interface Remote {
  /** "owner/name" */
  repo: string
  token: string
  path: string
}

export class ConflictError extends Error {
  constructor() {
    super('Remote changed while syncing.')
    this.name = 'ConflictError'
  }
}

async function call(r: Remote, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`https://api.github.com${url}`, {
    ...init,
    // The API sends max-age=60; a cached read right after a write would return a stale sha.
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${r.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (res.status === 401) throw new Error('GitHub rejected the token (expired or wrong?).')
  if (res.status === 403) throw new Error('GitHub token lacks access to this repo (needs Contents: read & write).')
  return res
}

function utf8ToB64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function b64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/** Read a file. Returns null if it doesn't exist yet. */
export async function readFile(r: Remote): Promise<{ text: string; sha: string } | null> {
  const res = await call(r, `/repos/${r.repo}/contents/${r.path}`)
  if (res.status === 404) {
    // 404 is also what GitHub returns for a repo the token can't see.
    const repo = await call(r, `/repos/${r.repo}`)
    if (repo.status === 404) throw new Error(`Repo ${r.repo} not found or not visible to this token.`)
    return null
  }
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`)
  const meta = (await res.json()) as { sha: string; content?: string; encoding?: string }
  if (meta.content && meta.encoding === 'base64') return { text: b64ToUtf8(meta.content), sha: meta.sha }
  // Files over 1 MB come back without content; fetch the blob instead.
  const blob = await call(r, `/repos/${r.repo}/git/blobs/${meta.sha}`)
  if (!blob.ok) throw new Error(`GitHub blob read failed: ${blob.status}`)
  const b = (await blob.json()) as { content: string }
  return { text: b64ToUtf8(b.content), sha: meta.sha }
}

/** Create or replace a file. `sha` must be the current one (optimistic locking). */
export async function writeFile(r: Remote, text: string, sha: string | undefined, message: string): Promise<string> {
  const res = await call(r, `/repos/${r.repo}/contents/${r.path}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: utf8ToB64(text), ...(sha ? { sha } : {}) }),
  })
  if (res.status === 409 || res.status === 422) throw new ConflictError()
  if (!res.ok) throw new Error(`GitHub write failed: ${res.status}`)
  return ((await res.json()) as { content: { sha: string } }).content.sha
}
