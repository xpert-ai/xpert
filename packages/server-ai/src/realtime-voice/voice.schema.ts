import { z } from 'zod'

export const voiceStartSchema = z
    .object({ assistantId: z.string().uuid(), originMode: z.enum(['web', 'desktop']).default('web') })
    .strict()
export const voiceControlSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('mute'), muted: z.boolean() }).strict(),
    z.object({ type: z.literal('interrupt') }).strict(),
    z.object({ type: z.literal('end') }).strict(),
    z.object({ type: z.literal('ping') }).strict(),
    z.object({ type: z.literal('playback.done'), responseId: z.string().min(1).max(256) }).strict()
])
export const voiceScopeSchema = z
    .object({
        tenantId: z.string().uuid(),
        organizationId: z.string().uuid(),
        userId: z.string().uuid(),
        assistantId: z.string().uuid(),
        threadId: z.string().uuid(),
        conversationId: z.string().uuid()
    })
    .strict()
export type VoiceScope = Required<z.output<typeof voiceScopeSchema>>
export const voiceToolSchema = z.discriminatedUnion('name', [
    z.object({
        name: z.literal('delegate_task'),
        arguments: z.object({ goal: z.string().trim().min(1).max(8000) }).strict()
    }),
    z.object({ name: z.literal('get_task_status'), arguments: z.object({ taskHandle: z.string().uuid() }).strict() }),
    z.object({
        name: z.literal('steer_task'),
        arguments: z.object({ taskHandle: z.string().uuid(), instruction: z.string().trim().min(1).max(8000) }).strict()
    }),
    z.object({ name: z.literal('cancel_task'), arguments: z.object({ taskHandle: z.string().uuid() }).strict() })
])
export const voiceFeatureSchema = z.object({
    enabled: z.literal(true),
    voice: z.string().min(1).max(160),
    copilotModel: z.object({
        copilotId: z.string().uuid(),
        model: z.string().min(1).max(200),
        modelType: z.literal('realtime')
    })
})
