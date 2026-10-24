export function fmtMin(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  return min % 60 ? `${h}h ${min % 60}m` : `${h}h`
}

export function fmtDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}
