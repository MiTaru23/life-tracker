import type { ComponentType } from 'react'
import TodayPage from '../pages/TodayPage'
import JournalPage from '../pages/JournalPage'
import TrackerPage from '../pages/TrackerPage'
import TasksPage from '../pages/TasksPage'
import SuggestionsPage from '../pages/SuggestionsPage'
import StatsPage from '../pages/StatsPage'
import SettingsPage from '../pages/SettingsPage'
import Terminal from './Terminal'

export interface AppProps {
  /** Close this app's window. */
  close: () => void
}

export interface AppDef {
  /** Name shown in the title bar, e.g. "JOURNAL // field log". */
  title: string
  /** Short label for desktop icon and taskbar. */
  label: string
  glyph: string
  size: [number, number]
  component: ComponentType<AppProps>
}

export const APPS = {
  status: { title: 'STATUS // sitrep', label: 'status', glyph: '◉', size: [680, 600], component: TodayPage },
  journal: { title: 'JOURNAL // field log', label: 'journal', glyph: '✎', size: [820, 600], component: JournalPage },
  tracker: { title: 'TRACKER // ops', label: 'tracker', glyph: '▦', size: [780, 640], component: TrackerPage },
  tasks: { title: 'TASKS // queue', label: 'tasks', glyph: '☑', size: [620, 560], component: TasksPage },
  intel: { title: 'INTEL // briefings', label: 'intel', glyph: '◈', size: [680, 500], component: SuggestionsPage },
  analytics: { title: 'ANALYTICS // telemetry', label: 'analytics', glyph: '▤', size: [760, 520], component: StatsPage },
  term: { title: 'TERMINAL // tty1', label: 'term', glyph: '>_', size: [680, 420], component: Terminal },
  system: { title: 'SYSTEM // config', label: 'system', glyph: '⚙', size: [640, 600], component: SettingsPage },
} satisfies Record<string, AppDef>

export type AppId = keyof typeof APPS
export const APP_IDS = Object.keys(APPS) as AppId[]
