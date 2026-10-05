import { boundedVoiceResult, spokenTaskResult, voiceTaskAnswer, voiceTaskContext } from './voice-task-result'

it('returns answer text and citations from rich chat messages without tool internals or reasoning', () => {
    const answer = voiceTaskAnswer([
        { type: 'text', text: 'Found it' },
        { type: 'reasoning', text: 'Private reasoning' },
        { type: 'text', text: '[Official source](https://example.org/source)' }
    ])
    expect(answer).toBe('Found it\n\n[Official source](https://example.org/source)')
    expect(spokenTaskResult(answer)).toBe('Found it\n\nOfficial source')
    expect(voiceTaskAnswer('')).toBeUndefined()
})

it('retains trailing source links when bounding large results', () => {
    const result = boundedVoiceResult('x'.repeat(30000) + '\nhttps://example.org/source')
    expect(result.length).toBeLessThan(24100)
    expect(result).toContain('Middle omitted')
    expect(result).toContain('https://example.org/source')
})

it('bounds authoritative task context while retaining result sources and excluding steering receipts', () => {
    const context = voiceTaskContext([
        { type: 'task', action: 'steer', taskId: 'steer', status: 'completed' },
        ...Array.from({ length: 12 }, (_, index) => ({
            type: 'task' as const,
            action: 'send' as const,
            taskId: `task-${index}`,
            status: 'completed' as const,
            text: 'Found it ' + 'x'.repeat(8000) + '\nhttps://example.org/source'
        }))
    ])
    expect(context).toHaveLength(8)
    expect(context[0]).toMatchObject({ taskHandle: 'task-0', status: 'completed' })
    expect(context[0].result.length).toBeLessThan(4100)
    expect(context[0].result).toContain('https://example.org/source')
    expect(context.some((task) => task.taskHandle === 'steer')).toBe(false)
})
