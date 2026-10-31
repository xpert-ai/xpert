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
export const userNotificationSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.literal('agent.completed'),
    source: notificationSourceSchema,
    createdAt: z.string().datetime({ offset: true }),
    readAt: z.string().datetime({ offset: true }).nullable(),
    action: z
      .object({
        type: z.literal('open_conversation'),
        assistantId: z.string().uuid(),
        conversationId: z.string().uuid(),
        threadId: z.string().uuid().nullable()
      })
      .strict()
  })
  .strict()
export type UserNotification = Omit<Required<z.output<typeof userNotificationSchema>>, 'source' | 'action'> & {
  source: Required<z.output<typeof notificationSourceSchema>>
  action: Required<NonNullable<z.output<typeof userNotificationSchema>['action']>>
}
export const notificationSnapshotSchema = z
  .object({
    supported: z.literal(true),
    version: z.string(),
    announcements: z.array(announcementSchema),
    notifications: z.array(userNotificationSchema),
    hasMoreAnnouncements: z.boolean(),
    hasMoreNotifications: z.boolean()
  })
  .strict()
export type NotificationSnapshot = Omit<
  Required<z.output<typeof notificationSnapshotSchema>>,
  'announcements' | 'notifications'
> & { announcements: Announcement[]; notifications: UserNotification[] }

export const notificationChangeSchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal('sync.required'),
    eventId: z.string().uuid()
  })
  .strict()
export const notificationOutboxPayloadSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('changed') }).strict(),
  z
    .object({
      type: z.literal('announcement.scheduled'),
      announcementId: z.string().uuid(),
      revision: z.number().int().positive(),
      phase: z.enum(['start', 'expiry'])
    })
    .strict(),
  z.object({ type: z.literal('agent.completed'), source: notificationSourceSchema }).strict()
])
export type NotificationOutboxPayload = z.output<typeof notificationOutboxPayloadSchema>

// Delivery facts never imply human reading, approval or completion of a business action.
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
export function parseUserNotification(value: unknown): UserNotification {
  return userNotificationSchema.parse(value) as UserNotification
}
export function parseNotificationSnapshot(value: unknown): NotificationSnapshot {
  return notificationSnapshotSchema.parse(value) as NotificationSnapshot
}
