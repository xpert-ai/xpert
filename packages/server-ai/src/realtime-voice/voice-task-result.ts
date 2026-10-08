import type { IChatMessage, RealtimeTaskContext, VoiceServerControl } from '@xpert-ai/contracts'

/** Read the visible answer only. Component payloads and reasoning are not speech or tool results. */
export function voiceTaskAnswer(content: IChatMessage['content']): string | undefined {
    if (typeof content === 'string') return content || undefined
    if (!Array.isArray(content)) return undefined
    return (
        content
            .flatMap((block) =>
                block.type === 'text' && 'text' in block && typeof block.text === 'string' ? [block.text] : []
            )
            .join('\n\n') || undefined
    )
}

/** Keep the source section at the end when bounding model context; the full answer stays in chat. */
export function boundedVoiceResult(text?: string | null) {
    if (!text) return undefined
    return text.length <= 24000
        ? text
        : text.slice(0, 16000) + '\n[Middle omitted; full answer is in chat.]\n' + text.slice(-8000)
}

export function spokenTaskResult(text: string) {
    return text
        .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[#*`]/g, '')
        .trim()
        .slice(0, 500)
}

export function voiceTaskContext(tasks: Extract<VoiceServerControl, { type: 'task' }>[]): RealtimeTaskContext[] {
    return tasks
        .filter((task) => task.action === 'send')
        .slice(0, 8)
        .map((task) => ({
            taskHandle: task.taskId,
            status: task.status,
            result:
                task.text && task.text.length > 4000
                    ? task.text.slice(0, 3000) + '\n[Full result is in chat.]\n' + task.text.slice(-1000)
                    : task.text
        }))
}
