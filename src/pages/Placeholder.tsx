export default function Placeholder({ title, phase, items }: { title: string; phase: string; items: string[] }) {
  return (
    <section>
      <h1>{title}</h1>
      <div className="card muted">
        <p>Coming in {phase}:</p>
        <ul>
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
