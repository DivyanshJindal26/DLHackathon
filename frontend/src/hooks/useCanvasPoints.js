import { useCallback } from 'react'
import useAppStore from '../store/appStore'
import { hitTestDetection, segmentDistance } from '../utils/distanceCalc'

export function useCanvasPoints(detections) {
  const {
    canvasMode,
    canvasPoints,
    addCanvasPoint,
    removeLastCanvasPoint,
    clearCanvasPoints,
  } = useAppStore()

  const handleCanvasClick = useCallback(
    (e, canvas) => {
      if (canvasMode !== 'measure') return
      const rect = canvas.getBoundingClientRect()
      const natX = (e.clientX - rect.left) * (canvas.width / rect.width)
      const natY = (e.clientY - rect.top) * (canvas.height / rect.height)
      const detectionIndex = hitTestDetection(natX, natY, detections)
      addCanvasPoint({ x: natX, y: natY, detectionIndex })
    },
    [canvasMode, detections, addCanvasPoint]
  )

  const handleCanvasRightClick = useCallback(
    (e) => {
      if (canvasMode !== 'measure') return
      e.preventDefault()
      removeLastCanvasPoint()
    },
    [canvasMode, removeLastCanvasPoint]
  )

  const segments = canvasPoints.map((pt, i) => {
    if (i === 0) return null
    return {
      p1: canvasPoints[i - 1],
      p2: pt,
      ...segmentDistance(canvasPoints[i - 1], pt, detections),
    }
  }).filter(Boolean)

  return {
    canvasPoints,
    segments,
    handleCanvasClick,
    handleCanvasRightClick,
    clearCanvasPoints,
  }
}
