import type { ProjectConfigurationEditorAction, ProjectConfigurationAutomationAction, ProjectConfigurationConnectorAction } from './configuration-action.types'
import { z } from 'zod'
import { TaskFrequency, generateCronExpression, projectConfigurationValuesSchema, projectConfigurationUpdateSchema } from '@xpert-ai/contracts'

export const idSchema = z.string().uuid()
export const pageSchema = z.object({ page: z.number().int().min(1).default(1), search: z.string().max(200).default('') }).strict()
export const memberRoleSchema = z.enum(['manager', 'editor', 'member'])
export const scheduleSchema = z.object({
    frequency: z.nativeEnum(TaskFrequency), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    date: z.string().date().optional(), dayOfWeek: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(), month: z.number().int().min(1).max(12).optional()
}).strict().superRefine((value, context) => {
    const required = value.frequency === TaskFrequency.Once ? value.date : value.frequency === TaskFrequency.Weekly ? value.dayOfWeek : value.frequency === TaskFrequency.Monthly ? value.dayOfMonth : value.frequency === TaskFrequency.Yearly ? (value.month !== undefined ? value.dayOfMonth : undefined) : true
    if (required === undefined) context.addIssue({ code: 'custom', message: 'Missing schedule fields' })
    try { generateCronExpression({ ...value, frequency: value.frequency, time: value.time }) } catch { context.addIssue({ code: 'custom', message: 'Invalid schedule' }) }
})
export const automationSchema = z.object({
    taskId: idSchema.optional(), xpertId: idSchema, agentKey: z.string().max(200).optional(),
    name: z.string().trim().min(1).max(100), prompt: z.string().trim().min(1).max(65536),
    options: scheduleSchema,
    timeZone: z.string().max(100).refine((value) => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false } }),
    runtimeState: projectConfigurationValuesSchema.optional()
}).strict()

export const editorsActionSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('type'), input: z.object({}).strict() }).strict(),
    z.object({ action: z.literal('type-save'), input: projectConfigurationUpdateSchema }).strict(),
    z.object({ action: z.literal('experts'), input: pageSchema }).strict(),
    z.object({ action: z.literal('members'), input: pageSchema }).strict(),
    z.object({ action: z.literal('skill-catalog'), input: pageSchema }).strict(),
    z.object({ action: z.literal('expert-add'), input: z.object({ xpertId: idSchema }).strict() }).strict(),
    z.object({ action: z.literal('expert-remove'), input: z.object({ xpertId: idSchema }).strict() }).strict(),
    z.object({ action: z.literal('member-add'), input: z.object({ userId: idSchema, role: memberRoleSchema.optional() }).strict() }).strict(),
    z.object({ action: z.literal('member-role'), input: z.object({ userId: idSchema, role: memberRoleSchema }).strict() }).strict(),
    z.object({ action: z.literal('member-remove'), input: z.object({ userId: idSchema }).strict() }).strict(),
    z.object({ action: z.literal('member-owner'), input: z.object({ userId: idSchema }).strict() }).strict(),
    z.object({ action: z.literal('member-invite'), input: z.object({ email: z.string().email().max(320), role: memberRoleSchema }).strict() }).strict(),
    z.object({ action: z.literal('invitation-revoke'), input: z.object({ invitationId: idSchema }).strict() }).strict(),
    z.object({ action: z.literal('skill-install'), input: z.object({ indexId: idSchema }).strict() }).strict(),
    z.object({ action: z.literal('skill-toggle'), input: z.object({ skillId: z.string().min(1).max(512), enabled: z.boolean() }).strict() }).strict(),
    z.object({ action: z.literal('skill-remove'), input: z.object({ skillId: z.string().min(1).max(512) }).strict() }).strict(),
    z.object({ action: z.literal('delete'), input: z.object({ name: z.string() }).strict() }).strict()
])

export const automationActionSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('automations'), input: pageSchema }).strict(),
    z.object({ action: z.literal('automation-options'), input: z.object({ xpertId: idSchema, agentKey: z.string().max(200).optional() }).strict() }).strict(),
    z.object({ action: z.literal('automation-save'), input: automationSchema }).strict(),
    z.object({ action: z.literal('automation-pause'), input: z.object({ taskId: idSchema }).strict() }).strict(),
    z.object({ action: z.literal('automation-resume'), input: z.object({ taskId: idSchema }).strict() }).strict(),
    z.object({ action: z.literal('automation-delete'), input: z.object({ taskId: idSchema }).strict() }).strict(),
    z.object({ action: z.literal('automation-accept'), input: z.object({ taskId: idSchema }).strict() }).strict(),
    z.object({ action: z.literal('automation-propose'), input: z.object({ taskId: idSchema, userId: idSchema }).strict() }).strict(),
    z.object({ action: z.literal('automation-connectors'), input: z.object({ taskId: idSchema, runtimeState: projectConfigurationValuesSchema }).strict() }).strict()
])

export const connectorsActionSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('connectors'), input: z.object({}).strict() }).strict(),
    z.object({ action: z.literal('connector-add'), input: z.object({ provider: z.string().min(1).max(200) }).strict() }).strict(),
    z.object({ action: z.literal('connector-remove'), input: z.object({ bindingId: idSchema }).strict() }).strict(),
    z.object({ action: z.literal('connector-status'), input: z.object({ bindingId: idSchema }).strict() }).strict(),
    z.object({ action: z.literal('connector-cancel'), input: z.object({ bindingId: idSchema }).strict() }).strict(),
    z.object({ action: z.literal('connector-connect'), input: z.object({ bindingId: idSchema, authMethodId: z.string().max(200).optional(), values: z.record(z.string().max(16384)).optional() }).strict() }).strict()
])

// The host TypeScript config disables strictNullChecks, so Zod v3 infers required properties as optional.
// These assertions apply only after the complete discriminated payload has passed runtime validation.
export function parseEditorsAction(action: string, input: unknown): ProjectConfigurationEditorAction {
    return editorsActionSchema.parse({ action, input }) as ProjectConfigurationEditorAction
}
export function parseAutomationAction(action: string, input: unknown): ProjectConfigurationAutomationAction {
    return automationActionSchema.parse({ action, input }) as ProjectConfigurationAutomationAction
}
export function parseConnectorsAction(action: string, input: unknown): ProjectConfigurationConnectorAction {
    return connectorsActionSchema.parse({ action, input }) as ProjectConfigurationConnectorAction
}
