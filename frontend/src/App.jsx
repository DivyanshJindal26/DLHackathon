import Header from './components/layout/Header'
import UploadPanel from './components/upload/UploadPanel'
import ImagePanel from './components/image/ImagePanel'
import BEVPanel from './components/bev/BEVPanel'
import DetectionTable from './components/detections/DetectionTable'
import MetricsPanel from './components/metrics/MetricsPanel'
import ChatPanel from './components/chatbot/ChatPanel'
import GlassPanel from './components/shared/GlassPanel'
import useAppStore from './store/appStore'

export default function App() {
  const { result } = useAppStore()
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#020617]">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <Header />

      <div className="flex flex-1 min-h-0 gap-3 p-3 relative">
        {/* Left sidebar: upload + controls */}
        <div className="w-56 flex-shrink-0 flex flex-col gap-3">
          <GlassPanel className="flex-1">
            <UploadPanel />
          </GlassPanel>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Top row: image + BEV */}
          <div className="flex gap-3 flex-1 min-h-0">
            <div className="flex-1 min-w-0">
              <ImagePanel />
            </div>
            <div className="w-80 flex-shrink-0">
              <BEVPanel />
            </div>
          </div>

          {/* Bottom: detection table */}
          <DetectionTable />

          {/* Metrics panel — only when GT labels were provided */}
          {result?.metrics && <MetricsPanel metrics={result.metrics} />}
        </div>
      </div>

      {/* Chat panel — fixed right drawer */}
      <ChatPanel />
    </div>
  )
}
