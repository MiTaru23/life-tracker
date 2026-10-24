import { Component, useRef, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { APPS } from './apps'
import { useWm, type Win } from './wm'

const TASKBAR_H = 44
const MIN_W = 320
const MIN_H = 200

export default function Window({ win, focused, mobile }: { win: Win; focused: boolean; mobile: boolean }) {
  const { dispatch } = useWm()
  const app = APPS[win.appId]
  const App = app.component
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const size = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  const full = mobile || win.maximized

  function onTitleDown(e: RPointerEvent<HTMLDivElement>) {
    dispatch({ type: 'focus', id: win.id })
    if (full || (e.target as HTMLElement).closest('button')) return
    drag.current = { dx: e.clientX - win.x, dy: e.clientY - win.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onTitleMove(e: RPointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    // Keep the title bar reachable: never fully off-screen or under the taskbar.
    const x = Math.min(Math.max(e.clientX - drag.current.dx, 80 - win.w), window.innerWidth - 80)
    const y = Math.min(Math.max(e.clientY - drag.current.dy, 0), window.innerHeight - TASKBAR_H - 32)
    dispatch({ type: 'move', id: win.id, x, y })
  }
  function onTitleUp() {
    drag.current = null
  }

  function onGripDown(e: RPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    size.current = { x: e.clientX, y: e.clientY, w: win.w, h: win.h }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onGripMove(e: RPointerEvent<HTMLDivElement>) {
    if (!size.current) return
    const s = size.current
    dispatch({
      type: 'resize',
      id: win.id,
      w: Math.max(MIN_W, s.w + e.clientX - s.x),
      h: Math.max(MIN_H, s.h + e.clientY - s.y),
    })
  }

  const style = full
    ? { zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }

  return (
    <div
      className={`win${focused ? ' focused' : ''}${full ? ' full' : ''}`}
      style={style}
      hidden={win.minimized}
      onPointerDown={() => !focused && dispatch({ type: 'focus', id: win.id })}
      role="dialog"
      aria-label={app.title}
    >
      <div
        className="win-title"
        onPointerDown={onTitleDown}
        onPointerMove={onTitleMove}
        onPointerUp={onTitleUp}
        onDoubleClick={() => !mobile && dispatch({ type: 'toggleMax', id: win.id })}
      >
        <span className="win-glyph">{app.glyph}</span>
        <span className="win-name">{app.title}</span>
        <span className="win-pid">pid {win.id.slice(0, 4)}</span>
        <div className="win-ctrls">
          {!mobile && (
            <>
              <button title="Minimize" onClick={() => dispatch({ type: 'minimize', id: win.id })}>_</button>
              <button title="Maximize" onClick={() => dispatch({ type: 'toggleMax', id: win.id })}>
                {win.maximized ? '❐' : '□'}
              </button>
            </>
          )}
          <button title="Close" className="kill" onClick={() => dispatch({ type: 'close', id: win.id })}>×</button>
        </div>
      </div>
      <div className="win-body">
        <Crashguard>
          <App close={() => dispatch({ type: 'close', id: win.id })} />
        </Crashguard>
      </div>
      {!full && <div className="win-grip" onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={() => (size.current = null)} />}
    </div>
  )
}

/** Keeps one crashing app from taking down the whole desktop. */
class Crashguard extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="panic">
        <div className="panic-head">*** SEGFAULT ***</div>
        <pre>{this.state.error.message}</pre>
        <button onClick={() => this.setState({ error: undefined })}>restart process</button>
      </div>
    )
  }
}
