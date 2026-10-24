import { createContext, useContext } from 'react'
import { APPS, type AppId } from './apps'

export interface Win {
  id: string
  appId: AppId
  x: number
  y: number
  w: number
  h: number
  z: number
  minimized: boolean
  maximized: boolean
}

export interface WmState {
  windows: Win[]
  topZ: number
}

export type WmAction =
  | { type: 'open'; appId: AppId }
  | { type: 'close'; id: string }
  | { type: 'focus'; id: string }
  | { type: 'minimize'; id: string }
  | { type: 'minimizeAll' }
  | { type: 'toggleMax'; id: string }
  | { type: 'move'; id: string; x: number; y: number }
  | { type: 'resize'; id: string; w: number; h: number }

const STORAGE_KEY = 'lifeos.windows'

export function loadWm(): WmState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const s = JSON.parse(raw) as WmState
      // Drop windows of apps that no longer exist.
      s.windows = s.windows.filter((w) => w.appId in APPS)
      return s
    }
  } catch {
    /* storage unavailable or corrupt: start clean */
  }
  return { windows: [], topZ: 1 }
}

export function saveWm(s: WmState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

/** The focused window is the visible one with the highest z. */
export function focusedId(s: WmState): string | undefined {
  const visible = s.windows.filter((w) => !w.minimized)
  if (!visible.length) return undefined
  return visible.reduce((a, b) => (a.z > b.z ? a : b)).id
}

export function wmReducer(s: WmState, a: WmAction): WmState {
  const patch = (id: string, p: Partial<Win>) => ({
    ...s,
    windows: s.windows.map((w) => (w.id === id ? { ...w, ...p } : w)),
  })

  switch (a.type) {
    case 'open': {
      const existing = s.windows.find((w) => w.appId === a.appId)
      const z = s.topZ + 1
      if (existing) return { ...patch(existing.id, { minimized: false, z }), topZ: z }
      const app = APPS[a.appId]
      // Cascade new windows so they don't stack exactly on top of each other.
      const offset = (s.windows.length % 6) * 28
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800
      const w = Math.min(app.size[0], vw - 40)
      const h = Math.min(app.size[1], vh - 90)
      const win: Win = {
        id: crypto.randomUUID(),
        appId: a.appId,
        x: Math.max(10, Math.round((vw - w) / 2 - 80 + offset)),
        y: Math.max(10, Math.round((vh - 48 - h) / 2 - 40 + offset)),
        w,
        h,
        z,
        minimized: false,
        maximized: false,
      }
      return { windows: [...s.windows, win], topZ: z }
    }
    case 'close':
      return { ...s, windows: s.windows.filter((w) => w.id !== a.id) }
    case 'focus': {
      const z = s.topZ + 1
      return { ...patch(a.id, { z, minimized: false }), topZ: z }
    }
    case 'minimize':
      return patch(a.id, { minimized: true })
    case 'minimizeAll':
      return { ...s, windows: s.windows.map((w) => ({ ...w, minimized: true })) }
    case 'toggleMax': {
      const w = s.windows.find((x) => x.id === a.id)
      return w ? patch(a.id, { maximized: !w.maximized }) : s
    }
    case 'move':
      return patch(a.id, { x: a.x, y: a.y })
    case 'resize':
      return patch(a.id, { w: a.w, h: a.h })
  }
}

export interface WmApi {
  state: WmState
  dispatch: (a: WmAction) => void
  open: (appId: AppId) => void
}

export const WmContext = createContext<WmApi | null>(null)

export function useWm(): WmApi {
  const ctx = useContext(WmContext)
  if (!ctx) throw new Error('useWm outside WmContext')
  return ctx
}
