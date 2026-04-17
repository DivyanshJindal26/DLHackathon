import { useState, useRef } from 'react'
import useAppStore from '../../store/appStore'

export default function ChatInput({ onSend }) {
  const [text, setText] = useState('')
  const { chatLoading } = useAppStore()
  const textareaRef = useRef()

  function submit() {
    const trimmed = text.trim()
    if (!trimmed || chatLoading) return
    onSend(trimmed)
    setText('')
    textareaRef.current?.focus()
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex items-end gap-2 p-3 border-t border-slate-800/60">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask about the scene… (Enter to send)"
        rows={1}
        disabled={chatLoading}
        className="flex-1 resize-none bg-slate-800/60 border border-slate-700/40 rounded-xl px-3 py-2.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500/50 transition-colors disabled:opacity-50 min-h-[38px] max-h-[120px]"
        style={{ fieldSizing: 'content' }}
      />
      <button
        onClick={submit}
        disabled={!text.trim() || chatLoading}
        className="flex-shrink-0 w-9 h-9 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:bg-slate-800 disabled:text-slate-600 text-white transition-all duration-150 flex items-center justify-center"
      >
        {chatLoading ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
          </svg>
        )}
      </button>
    </div>
  )
}
