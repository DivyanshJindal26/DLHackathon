import { useState } from 'react'
import useAppStore from '../../store/appStore'

export default function LidarBevTab() {
  const { result, bulkIsTimeSeries, bulkBevVideo } = useAppStore()
  const [viewMode, setViewMode] = useState('image') // 'image' | 'video'

  const hasVideo = bulkIsTimeSeries && bulkBevVideo
  const hasImage = !!result?.lidar_bev

  if (!hasImage && !hasVideo) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#555]">
        <span className="text-sm">No LiDAR BEV yet — run inference first</span>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-black">
      {hasVideo && (
        <div className="flex items-center gap-1 p-2 border-b border-white/[0.06]">
          {['image', 'video'].map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-3 py-1 rounded text-[10px] uppercase tracking-wider border transition-colors ${
                viewMode === m
                  ? 'bg-[#00e676]/15 border-[#00e676]/40 text-[#00e676]'
                  : 'bg-transparent border-white/[0.08] text-[#666] hover:text-[#aaa]'
              }`}
            >
              {m === 'image' ? 'Static frame' : 'Sequence video'}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 flex items-center justify-center overflow-hidden">
        {viewMode === 'video' && hasVideo ? (
          <video
            key={bulkBevVideo.slice(0, 32)}
            className="max-h-full max-w-full object-contain"
            controls
            autoPlay
            loop
            src={`data:video/mp4;base64,${bulkBevVideo}`}
          />
        ) : hasImage ? (
          <img
            src={`data:image/png;base64,${result.lidar_bev}`}
            alt="LiDAR BEV"
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-[#555] text-sm">Switch to Sequence video</span>
        )}
      </div>
    </div>
  )
}
