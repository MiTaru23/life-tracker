import { useEffect, useState } from 'react'

const LINES: [string, string][] = [
  ['', 'LIFE/OS v0.2.0 · kernel 6.6.6-opsec · x86_64'],
  ['OK', 'verifying system integrity'],
  ['OK', 'mounting encrypted volume /dev/lifedb'],
  ['OK', 'loading modules: journal tracker intel analytics'],
  ['OK', 'starting window manager'],
  ['OK', 'uplink module loaded · vault AES-256-GCM'],
  ['OK', 'operator session established'],
  ['', '> welcome back, operator.'],
]

/** Short fake boot log. Click or any key skips it. */
export default function Boot({ onDone }: { onDone: () => void }) {
  const [shown, setShown] = useState(0)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      onDone()
      return
    }
    const timers = LINES.map((_, i) => setTimeout(() => setShown(i + 1), 120 + i * 150))
    const end = setTimeout(onDone, 120 + LINES.length * 150 + 450)
    const skip = () => onDone()
    window.addEventListener('keydown', skip)
    return () => {
      timers.forEach(clearTimeout)
      clearTimeout(end)
      window.removeEventListener('keydown', skip)
    }
  }, [onDone])

  return (
    <div className="boot" onClick={onDone}>
      <pre>
        {LINES.slice(0, shown).map(([tag, text], i) => (
          <div key={i}>
            {tag && <span className={`tag tag-${tag.toLowerCase()}`}>[{tag.padStart(4)}]</span>} {text}
          </div>
        ))}
        <span className="cursor">█</span>
      </pre>
      <div className="boot-skip">click or press any key to skip</div>
    </div>
  )
}
