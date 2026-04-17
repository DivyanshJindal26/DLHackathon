export async function queryScene({ text, max_distance_m }) {
  const body = { text }
  if (max_distance_m != null) body.max_distance_m = max_distance_m

  const res = await fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Query failed (${res.status})`)
  return res.json()
}
