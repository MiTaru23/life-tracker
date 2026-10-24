export default function Placeholder({ phase, items }: { phase: string; items: string[] }) {
  return (
    <section>
      <div className="card">
        <p className="muted">{'// module not yet deployed · scheduled for '}{phase}</p>
        <ul className="todo">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
