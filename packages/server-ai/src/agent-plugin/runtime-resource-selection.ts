import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import type { RuntimeResourcesSelection } from '@xpert-ai/contracts'
import { z } from 'zod/v3'

export const runtimeResourcesSchema = z
    .object({
        revision: z.number().int().nonnegative(),
        resources: z
            .array(z.object({ bindingId: z.string().uuid(), version: z.string().regex(/^[a-f0-9]{64}$/) }).strict())
            .max(50)
    })
    .strict()
    .refine(
        (value) => new Set(value.resources.map((item) => item.bindingId)).size === value.resources.length,
        'Duplicate resource bindings'
    )

export function parseRuntimeResources(input: unknown): RuntimeResourcesSelection {
    const result = runtimeResourcesSchema.safeParse(input)
    if (!result.success) throw new BadRequestException(t('server-ai:Error.AgentResourceInvalidSelection'))
    return result.data as RuntimeResourcesSelection
}

export function sameRuntimeResources(left: RuntimeResourcesSelection, right: RuntimeResourcesSelection): boolean {
    // JSON columns may reorder object keys; selection order and versions still matter.
    return (
        left.revision === right.revision &&
        left.resources.length === right.resources.length &&
        left.resources.every(
            (resource, index) =>
                resource.bindingId === right.resources[index].bindingId &&
                resource.version === right.resources[index].version
        )
    )
}
