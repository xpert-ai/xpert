import type { AgentOutputItem } from './always-on/agent-output.model'
import { outputFieldSchema, outputWorkbenchTargetSchema } from './always-on/output-workbench.schema'
import { z } from 'zod/v3'

// Application types are independent of delivery channels and external account identities.
export const notificationClientSchema = z.enum(['web', 'desktop'])
export type NotificationClient = z.infer<typeof notificationClientSchema>
export const announcementActionSchema = z
  .object({
    type: z.literal('link'),
    label: z.string().trim().min(1).max(80),
    url: z
      .string()
      .url()
      .max(2048)
      .refine((url) => /^https:\/\//i.test(url))
  })
  .strict()
export const announcementContentSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(20000),
    category: z.enum(['general', 'maintenance', 'model_retirement']).default('general'),
    severity: z.enum(['info', 'important']).default('info'),
    clients: z
      .array(notificationClientSchema)
      .min(1)
      .max(2)
      .refine((items) => new Set(items).size === items.length),
    startsAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
    action: announcementActionSchema.nullable().default(null)
  })
  .strict()
export const createAnnouncementSchema = announcementContentSchema.refine(
  (input) => !input.expiresAt || Date.parse(input.expiresAt) > Date.parse(input.startsAt),
  { path: ['expiresAt'], message: 'Expiry must follow start' }
)
export const updateAnnouncementSchema = announcementContentSchema
  .extend({ revision: z.number().int().positive() })
  .refine((input) => !input.expiresAt || Date.parse(input.expiresAt) > Date.parse(input.startsAt), {
    path: ['expiresAt']
  })
export const announcementRevisionSchema = z.object({ revision: z.number().int().positive() }).strict()
export const announcementSchema = announcementContentSchema.extend({
  id: z.string().uuid(),
  status: z.enum(['draft', 'published', 'withdrawn']),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true }),
  dismissedAt: z.string().datetime({ offset: true }).nullable().default(null)
})
export type AnnouncementInput = z.output<typeof createAnnouncementSchema>
export type Announcement = Omit<Required<z.output<typeof announcementSchema>>, 'action'> & {
  action: Required<z.output<typeof announcementActionSchema>> | null
}

export const notificationSourceSchema = z
  .object({
    type: z.literal('scheduled_task'),
    taskId: z.string().uuid(),
    executionId: z.string().uuid(),
    assistantId: z.string().uuid(),
    conversationId: z.string().uuid()
  })
  .strict()
export const scheduledNotificationOriginSchema = notificationSourceSchema.extend({
  threadId: z.string().uuid().optional()
})
export const notificationThreadIdSchema = z.string().trim().min(1).max(128)
export const openConversationActionSchema = z
  .object({
    type: z.literal('open_conversation'),
    assistantId: z.string().uuid(),
    conversationId: z.string().uuid(),
    threadId: notificationThreadIdSchema.nullable()
  })
  .strict()
export type OpenConversationAction = Required<z.output<typeof openConversationActionSchema>>

const taskNotificationSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.literal('agent.completed'),
    source: notificationSourceSchema,
    createdAt: z.string().datetime({ offset: true }),
    readAt: z.string().datetime({ offset: true }).nullable(),
    action: openConversationActionSchema
  })
  .strict()
type TaskNotification = Omit<Required<z.output<typeof taskNotificationSchema>>, 'source' | 'action'> & {
  source: Required<z.output<typeof notificationSourceSchema>>
  action: OpenConversationAction
}
export const agentOutputOriginSchema = z
  .object({ type: z.literal('agent_output'), deliveryId: z.string().uuid() })
  .strict()
const outputNotificationSchema = taskNotificationSchema.extend({
  kind: z.literal('agent.output'),
  source: agentOutputOriginSchema,
  items: z
    .array(
      z
        .object({
          id: z.string().uuid(),
          title: z.string().min(1).max(240),
          action: openConversationActionSchema.nullable(),
          fields: z.array(outputFieldSchema).max(20).optional(),
          workbench: outputWorkbenchTargetSchema.optional()
        })
        .strict()
    )
    .max(20)
    .optional(),
  titles: z.array(z.string().min(1).max(240)).min(1).max(20),
  action: openConversationActionSchema.nullable()
})
/** Opt-in protocol; older clients must not receive kinds they cannot render. */
export const ACTION_NOTIFICATION_ACCEPT = 'application/json; profile="xpert-notifications-v2"'
export const actionNotificationSourceSchema = z
  .object({
    type: z.literal('action'),
    provider: z.string().min(1).max(100),
    key: z.string().uuid(),
    version: z.string().min(1).max(100)
  })
  .strict()
export const notificationWorkbenchSchema = z
  .object({
    target: z.literal('project.pipelines'),
    organizationId: z.string().uuid().nullable(),
    projectId: z.string().uuid(),
    pipelineInstanceId: z.string().uuid(),
    pipelineRoundId: z.string().uuid(),
    pipelineNodeId: z.string().uuid()
  })
  .strict()
export const actionNotificationPresentationSchema = z
  .object({
    title: z.string().min(1).max(240),
    state: z.enum(['pending', 'handled', 'closed']),
    workbench: notificationWorkbenchSchema
  })
  .strict()
const actionNotificationSchema = taskNotificationSchema.extend({
  kind: z.literal('action.required'),
  source: actionNotificationSourceSchema,
  presentation: actionNotificationPresentationSchema,
  action: z.null()
})
export type ActionNotificationSource = Required<z.output<typeof actionNotificationSourceSchema>>
export type NotificationWorkbench = Required<z.output<typeof notificationWorkbenchSchema>>
export type ActionNotificationPresentation = Omit<
  Required<z.output<typeof actionNotificationPresentationSchema>>,
  'workbench'
> & {
  workbench: NotificationWorkbench
}
export type ActionNotification = Omit<TaskNotification, 'kind' | 'source' | 'action'> & {
  kind: 'action.required'
  source: ActionNotificationSource
  presentation: ActionNotificationPresentation
  action: null
}
export const userNotificationSchema = z.discriminatedUnion('kind', [
  taskNotificationSchema,
  outputNotificationSchema,
  actionNotificationSchema
])
export type UserNotification =
  | TaskNotification
  | ActionNotification
  | {
      id: string
      kind: 'agent.output'
      createdAt: string
      readAt: string | null
      source: Required<z.output<typeof agentOutputOriginSchema>>
      items?: AgentOutputItem[]
      titles: string[]
      action: OpenConversationAction | null
    }
export const notificationSnapshotSchema = z
  .object({
    supported: z.literal(true),
    version: z.string(),
    announcements: z.array(announcementSchema),
    notifications: z.array(userNotificationSchema),
    hasMoreAnnouncements: z.boolean(),
    hasMoreNotifications: z.boolean(),
    pendingCount: z.number().int().nonnegative().optional()
  })
  .strict()
export type NotificationSnapshot = Omit<
  Required<z.output<typeof notificationSnapshotSchema>>,
  'announcements' | 'notifications' | 'pendingCount'
> & { announcements: Announcement[]; notifications: UserNotification[]; pendingCount?: number }

export const notificationChangeSchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal('sync.required'),
    eventId: z.string().uuid()
  })
  .strict()
export const notificationOutboxPayloadSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('changed') }).strict(),
  z.object({ type: z.literal('agent.output.dispatch'), deliveryId: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal('announcement.scheduled'),
      announcementId: z.string().uuid(),
      revision: z.number().int().positive(),
      phase: z.enum(['start', 'expiry'])
    })
    .strict(),
  z.object({ type: z.literal('agent.completed'), source: scheduledNotificationOriginSchema }).strict()
])
/** Durable worker instructions. An output dispatch points to a delivery whose contents are revalidated at send time. */
export type NotificationOutboxPayload = z.output<typeof notificationOutboxPayloadSchema>

/**
 * Per-channel outcome. Feishu acceptance requires a provider message ID. In-app delivery means
 * the notification was persisted. An unknown external outcome must be reconciled before resending.
 * Reading is recorded separately on the user's notification.
 */
export type NotificationDeliveryState = 'pending' | 'accepted' | 'delivered' | 'failed' | 'unknown' | 'cancelled'
export type NotificationDestination =
  | { type: 'in_app'; tenantId: string; userId: string }
  | {
      type: 'external_identity'
      tenantId: string
      userId: string
      integrationId: string
      bindingId: string
      bindingRevision: number
    }

// The contracts declaration build uses strictNullChecks=false, which makes Zod's emitted
// object outputs optional. These boundaries validate every required field before narrowing.
export function parseAnnouncement(value: unknown): Announcement {
  return announcementSchema.parse(value) as Announcement
}
export function parseOpenConversationAction(value: unknown): OpenConversationAction {
  return openConversationActionSchema.parse(value) as OpenConversationAction
}
export function parseUserNotification(value: unknown): UserNotification {
  return userNotificationSchema.parse(value) as UserNotification
}
export function parseNotificationSnapshot(value: unknown): NotificationSnapshot {
  return notificationSnapshotSchema.parse(value) as NotificationSnapshot
}
