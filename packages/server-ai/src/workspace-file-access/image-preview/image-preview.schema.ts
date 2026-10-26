import { z } from 'zod'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'

const identifier = z.string().trim().min(1).max(512)

export const imagePreviewSchema = z
    .object({
        hostType: z.literal('agent'),
        hostId: identifier,
        viewKey: identifier,
        fileKey: identifier,
        targetId: identifier.optional(),
        variant: z.enum(['thumbnail', 'original']).default('thumbnail'),
        runtimeScope: z
            .object({
                projectId: identifier.nullable().optional(),
                conversationId: identifier.nullable().optional()
            })
            .strict()
            .optional()
    })
    .strict()

export type ImagePreviewRequest = z.output<typeof imagePreviewSchema>

export const imagePreviewInvalid = () =>
    new BadRequestException(
        t('server-ai:Error.WorkspaceImagePreviewInvalid', {
            defaultValue: 'A valid image preview reference and scope are required.'
        })
    )
