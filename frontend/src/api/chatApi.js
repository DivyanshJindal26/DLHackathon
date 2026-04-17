export async function sendChat({ messages, sceneContext }) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, scene_context: sceneContext }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Chat failed (${res.status}): ${text}`)
  }
  return res.json()
  // Expected: { content: string, tool_calls?: [{name, input}], done: boolean }
}
