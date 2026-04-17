export async function getScenes() {
  const res = await fetch('/api/scenes')
  if (!res.ok) throw new Error(`Failed to load scenes (${res.status})`)
  return res.json() // string[]
}
