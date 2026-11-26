import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { z } from 'zod/v3'

export const sidebarListSchema = z
    .object({
        assistantId: z.string().uuid(),
        projectId: z.string().uuid().nullable().optional(),
        archived: z.boolean().default(false),
        search: z.string().trim().max(200).default(''),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).max(100000).default(0)
    })
    .strict()

export const sidebarPatchSchema = z
    .object({
        pinned: z.boolean().optional(),
        archived: z.boolean().optional()
    })
    .strict()
    .refine((value) => value.pinned !== undefined || value.archived !== undefined)

export type SidebarListInput = z.output<typeof sidebarListSchema>
export type SidebarPatchInput = z.output<typeof sidebarPatchSchema>
export const invalidSidebar = () => new BadRequestException(t('server-ai:Error.InvalidConversationSidebarRequest'))
