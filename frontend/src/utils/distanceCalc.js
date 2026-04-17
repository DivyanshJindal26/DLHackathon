// Standard KITTI camera intrinsics (cam2, sequence 0-10)
const KITTI = { fx: 721.5377, fy: 721.5377, cx: 609.5593, cy: 172.854 }

function pixelToWorld(px, py, depthM) {
  return {
    X: (px - KITTI.cx) * depthM / KITTI.fx,
    Y: (py - KITTI.cy) * depthM / KITTI.fy,
    Z: depthM,
  }
}

export function segmentDistance(p1, p2, detections) {
  const pixDist = Math.hypot(p2.x - p1.x, p2.y - p1.y)

  if (p1.detectionIndex == null || p2.detectionIndex == null) {
    return { pixDist, worldDist: null }
  }

  const depth1 = detections[p1.detectionIndex]?.distance_m
  const depth2 = detections[p2.detectionIndex]?.distance_m

  if (depth1 == null || depth2 == null) {
    return { pixDist, worldDist: null }
  }

  const w1 = pixelToWorld(p1.x, p1.y, depth1)
  const w2 = pixelToWorld(p2.x, p2.y, depth2)
  const worldDist = Math.hypot(w2.X - w1.X, w2.Y - w1.Y, w2.Z - w1.Z)

  return { pixDist, worldDist }
}

export function hitTestDetection(natX, natY, detections) {
  if (!detections) return null
  for (let i = 0; i < detections.length; i++) {
    const [x1, y1, x2, y2] = detections[i].bbox_2d ?? []
    if (x1 != null && natX >= x1 && natX <= x2 && natY >= y1 && natY <= y2) {
      return i
    }
  }
  return null
}

export function formatDist(meters) {
  if (meters == null) return null
  return meters < 1000 ? `${meters.toFixed(1)} m` : `${(meters / 1000).toFixed(2)} km`
}
