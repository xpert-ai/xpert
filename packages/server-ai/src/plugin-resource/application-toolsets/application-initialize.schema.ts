import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { z } from 'zod/v3'

const identifier = z.string().trim().min(1).max(255)

/** Only option IDs are accepted. Credentials and target scope stay in their owning APIs. */
export const applicationInitializeSchema = z
    .object({
        pluginName: identifier,
        appName: identifier,
        operationId: identifier,
        embeddingModelId: identifier.optional(),
        visionModelId: identifier.optional(),
        toolsets: z
            .array(z.object({ key: identifier, toolsetId: z.string().uuid() }).strict())
            .max(100)
            .optional()
    })
    .strict()
    .refine((input) => new Set(input.toolsets?.map((item) => item.key)).size === (input.toolsets?.length ?? 0))
    // Explicit output properties retain required fields even in host builds without strictNullChecks.
    .transform((input) => ({
        pluginName: input.pluginName,
        appName: input.appName,
        operationId: input.operationId,
        ...(input.embeddingModelId ? { embeddingModelId: input.embeddingModelId } : {}),
        ...(input.visionModelId ? { visionModelId: input.visionModelId } : {}),
        ...(input.toolsets
            ? { toolsets: input.toolsets.map((item) => ({ key: item.key, toolsetId: item.toolsetId })) }
            : {})
    }))

export type ApplicationInitializeInput = z.output<typeof applicationInitializeSchema>

export function invalidApplicationInitializeRequest() {
    return new BadRequestException(
        t('server-ai:Error.ApplicationInitializeRequestInvalid', {
            defaultValue:
                'Invalid application setup request. Refresh the application and select its configurations again.'
        })
    )
}
