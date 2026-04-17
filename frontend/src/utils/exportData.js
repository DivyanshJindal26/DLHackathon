function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

export function exportJSON(detections) {
  const blob = new Blob([JSON.stringify(detections, null, 2)], {
    type: 'application/json',
  })
  downloadBlob(blob, 'detections.json')
}

export function exportCSV(detections) {
  const headers = ['class', 'confidence', 'distance_m', 'x', 'y', 'z', 'bbox_x1', 'bbox_y1', 'bbox_x2', 'bbox_y2']
  const rows = detections.map((d) => [
    d.class,
    d.confidence.toFixed(4),
    d.distance_m?.toFixed(2) ?? '',
    d.xyz?.[0]?.toFixed(2) ?? '',
    d.xyz?.[1]?.toFixed(2) ?? '',
    d.xyz?.[2]?.toFixed(2) ?? '',
    ...(d.bbox_2d ?? ['', '', '', '']),
  ])
  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  downloadBlob(blob, 'detections.csv')
}
