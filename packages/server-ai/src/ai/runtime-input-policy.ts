import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { z } from 'zod/v3'

// Workbench views also send display context. Only Project scope reaches managed execution;
// environment and model configuration always come from the published installation.
// ChatKit represents a conversation without a Project as null after history restoration.
const projectIdSchema = z.string().nullish().transform(value => value ?? undefined)
const contextSchema = z.object({ projectId: projectIdSchema }).strip()
// File and reference handles retain their existing resource-authorization boundary.
const humanSchema = z.object({
    input: z.string().optional(), files: z.array(z.unknown()).optional(), references: z.array(z.unknown()).optional(),
    referenceComposition: z.enum(['compose', 'preserve']).optional(), planMode: z.boolean().optional(),
    // ChatKit includes its initial capability selection even with resource controls hidden.
    // Managed execution uses the published capability policy, never this client selection.
    runtimeCapabilities: z.unknown().optional()
}).strict().transform(({ runtimeCapabilities: _selection, ...human }) => human)
const stateSchema = z.object({ human: humanSchema.optional() }).strict()
const targetSchema = z.object({ aiMessageId: z.string().optional(), executionId: z.string().optional() }).strict()
const messageSchema = z.object({ clientMessageId: z.string().optional(), input: humanSchema }).strict()
const projectSelectionSchema = z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('none') }).strict(),
    z.object({ mode: z.literal('auto-new') }).strict(),
    z.object({ mode: z.literal('existing'), projectId: z.string().min(1) }).strict()
])
const inputSchema = z.union([
    z.object({ action: z.literal('send'), conversationId: z.string().optional(), projectId: projectIdSchema,
        projectSelection: projectSelectionSchema.optional(), message: messageSchema, state: stateSchema.optional() }).strict(),
    z.object({ action: z.literal('resume'), conversationId: z.string(), target: targetSchema,
        decision: z.object({ type: z.enum(['confirm', 'reject']), payload: z.unknown().optional() }).strict() }).strict(),
    z.object({ action: z.literal('retry'), conversationId: z.string(), source: targetSchema }).strict(),
    z.object({ action: z.literal('follow_up'), conversationId: z.string(), mode: z.enum(['queue', 'steer']),
        message: messageSchema, target: targetSchema.optional(), state: stateSchema.optional() }).strict(),
    z.object({ input: humanSchema, projectId: projectIdSchema, projectSelection: projectSelectionSchema.optional(),
        conversationId: z.string().optional(), id: z.string().optional(), executionId: z.string().optional(),
        confirm: z.boolean().optional(), retry: z.boolean().optional(), followUpMode: z.enum(['queue', 'steer']).optional(),
        command: z.object({ resume: z.unknown().optional() }).strict().optional(), state: stateSchema.optional() }).strict()
])
const managedRunSchema = z.object({
    assistant_id: z.string().min(1), input: inputSchema,
    context: contextSchema.optional(), config: z.never().optional(), metadata: z.never().optional(),
    stream_mode: z.union([z.literal('messages'), z.array(z.literal('messages'))]).optional(),
    stream_subgraphs: z.literal(false).optional(),
    stream_resumable: z.boolean().optional(), on_disconnect: z.literal('continue').optional(),
    multitask_strategy: z.enum(['reject', 'enqueue']).optional()
}).strict()

/** Validate before admitting a run or resolving mutable environment state. */
export function assertRuntimeInputPolicy(input: unknown) {
    if (RequestContext.hasPermission(AIPermissionsEnum.XPERT_EDIT)) return
    const parsed = managedRunSchema.safeParse(input)
    if (!parsed.success) throw new BadRequestException(t('server-ai:Error.ApplicationRuntimeInputDenied'))
    return parsed.data
}

/** Return the validated context, so discarded View environment values cannot reach execution. */
export function applyRuntimeInputPolicy<T extends { context?: unknown }>(input: T) {
    const parsed = assertRuntimeInputPolicy(input)
    return parsed ? { ...input, input: parsed.input, context: parsed.context } : input
}
