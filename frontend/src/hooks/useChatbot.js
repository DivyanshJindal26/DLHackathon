import { useCallback } from 'react'
import { v4 as uuid } from 'uuid'
import { sendChat } from '../api/chatApi'
import { queryScene } from '../api/queryApi'
import useAppStore from '../store/appStore'

function buildSystemPrompt(result) {
  if (!result) {
    return 'You are a LiDAR + Camera Fusion perception assistant. No scene has been loaded yet. Ask the user to upload a scene first.'
  }
  const detections = result.detections || []
  const summary = detections
    .map(
      (d) => {
        const cls = d.label ?? d.class ?? 'unknown'
        const conf = d.score ?? d.confidence ?? null
        const pos = d.center ?? d.xyz ?? []
        const confText = conf == null ? '?' : Math.round(conf * 100)
        const posText = Array.isArray(pos)
          ? pos.map((v) => (typeof v === 'number' ? v.toFixed(1) : String(v))).join(', ')
          : ''
        const distText = typeof d.distance_m === 'number' ? d.distance_m.toFixed(1) : '?'
        return `- ${cls}: ${distText}m away, confidence ${confText}%, position [${posText}]`
      }
    )
    .join('\n')

  return `You are a LiDAR + Camera Fusion perception assistant analyzing a KITTI autonomous driving scene.

Scene stats: ${result.num_points?.toLocaleString() ?? '?'} LiDAR points processed in ${result.inference_time_ms ?? '?'}ms.

Detected objects (${detections.length} total):
${summary || '(none)'}

Use the query_scene tool to search for specific objects or answer semantic questions about the scene. Be concise and reference actual numbers from the data. When mentioning distances, be precise.`
}

const QUERY_TOOL = {
  type: 'function',
  function: {
    name: 'query_scene',
    description:
      'Semantically search the current scene\'s detected objects. Use this to answer questions about what objects are present, where they are, and their properties.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Natural language search query, e.g. "cars within 15 meters"',
        },
        max_distance_m: {
          type: 'number',
          description: 'Optional: filter results to objects within this many meters',
        },
      },
      required: ['text'],
    },
  },
}

export function useChatbot() {
  const {
    result,
    conversationHistory,
    addChatMessage,
    updateLastChatMessage,
    setConversationHistory,
    setChatLoading,
  } = useAppStore()

  const sendMessage = useCallback(
    async (userText) => {
      const userMsgId = uuid()
      const userMsg = { id: userMsgId, role: 'user', content: userText }
      addChatMessage(userMsg)
      setChatLoading(true)

      const history = [
        ...conversationHistory,
        { role: 'user', content: userText },
      ]

      // Placeholder assistant message
      const asstId = uuid()
      addChatMessage({ id: asstId, role: 'assistant', content: '', loading: true })

      try {
        let response = await sendChat({
          messages: history,
          sceneContext: {
            system: buildSystemPrompt(result),
            tools: [QUERY_TOOL],
          },
        })

        // Agentic tool-use loop
        while (response.tool_calls?.length > 0) {
          const call = response.tool_calls[0]
          updateLastChatMessage({
            toolCall: { name: call.name, input: call.input, status: 'running' },
            content: '',
            loading: false,
          })

          let toolResult
          try {
            if (call.name === 'query_scene') {
              toolResult = await queryScene(call.input)
            } else {
              toolResult = { error: `Unknown tool: ${call.name}` }
            }
          } catch (err) {
            toolResult = { error: err.message }
          }

          updateLastChatMessage({
            toolCall: {
              name: call.name,
              input: call.input,
              status: 'done',
              result: toolResult,
            },
          })

          // Continue conversation with tool result
          history.push({ role: 'assistant', content: response.content ?? '', tool_calls: response.tool_calls })
          history.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(toolResult),
          })

          response = await sendChat({
            messages: history,
            sceneContext: {
              system: buildSystemPrompt(result),
              tools: [QUERY_TOOL],
            },
          })
        }

        const finalText = response.content ?? ''
        updateLastChatMessage({ content: finalText, loading: false, toolCall: undefined })
        history.push({ role: 'assistant', content: finalText })
        setConversationHistory(history)
      } catch (err) {
        updateLastChatMessage({ content: `Error: ${err.message}`, loading: false, error: true })
      } finally {
        setChatLoading(false)
      }
    },
    [result, conversationHistory, addChatMessage, updateLastChatMessage, setConversationHistory, setChatLoading]
  )

  return { sendMessage }
}
