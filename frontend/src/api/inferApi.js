export async function runInference({ bin, image, calib, label }) {
  const form = new FormData()
  form.append('bin_file', bin)
  form.append('image_file', image)
  form.append('calib_file', calib)
  if (label) form.append('label_file', label)

  const res = await fetch('/api/infer', { method: 'POST', body: form })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Inference failed (${res.status}): ${text}`)
  }
  return res.json()
}

export async function runSceneInference(sceneId) {
  const res = await fetch(`/api/infer-scene/${encodeURIComponent(sceneId)}`, {
    method: 'POST',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Scene inference failed (${res.status}): ${text}`)
  }
  return res.json()
}
