import { useEffect, useRef } from 'react'
import GlassPanel from '../shared/GlassPanel'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import useAppStore from '../../store/appStore'
import { useChatbot } from '../../hooks/useChatbot'

export default function ChatPanel() {
  const { chatOpen, setChatOpen, chatMessages, clearChat } = useAppStore()
  const { sendMessage } = useChatbot()
  const bottomRef = useRef()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  if (!chatOpen) return null

  return (
    <div className="fixed right-0 top-0 h-full w-80 z-50 animate-slide-in-right flex flex-col shadow-2xl shadow-black/50">
      <GlassPanel elevated className="flex flex-col h-full rounded-none rounded-l-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-200">AI Assistant</p>
              <p className="text-xs text-slate-600">claude-sonnet-4-6 via OpenRouter</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {chatMessages.length > 0 && (
              <button
                onClick={clearChat}
                className="text-xs text-slate-600 hover:text-slate-400 px-2 py-1 rounded-lg hover:bg-slate-800/50 transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setChatOpen(false)}
              className="text-slate-600 hover:text-slate-300 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-800/50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
          {chatMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="text-3xl opacity-30">💬</div>
              <p className="text-xs text-slate-500 max-w-[200px]">
                Ask anything about the scene — detected objects, distances, or spatial relationships.
              </p>
              <div className="flex flex-col gap-1.5 w-full mt-2">
                {[
                  'How many cars are detected?',
                  "What's closest to the ego vehicle?",
                  'Any pedestrians within 20m?',
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-xs text-left px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/30 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chatMessages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          <div ref={bottomRef} />
        </div>

        <ChatInput onSend={sendMessage} />
      </GlassPanel>
    </div>
  )
}
