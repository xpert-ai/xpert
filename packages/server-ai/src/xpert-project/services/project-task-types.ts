// A task's business type is explicit and owned by its provider. Legacy type strings
// remain intact; titles, status and executor names never determine presentation.
import { PROJECT_TASK_ICON_NAMES, type ProjectTaskTypePresentation } from '@xpert-ai/contracts'
import type { IProjectTaskProvider } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { z } from 'zod'

const definitionsSchema = z.array(
    z
        .object({
            key: z.string().min(1).max(160),
            presentation: z
                .object({
                    label: z.object({
                        en_US: z.string().trim().min(1).max(120),
                        zh_Hans: z.string().trim().min(1).max(120).optional()
                    }),
                    icon: z.enum(PROJECT_TASK_ICON_NAMES)
                })
                .strict()
        })
        .strict()
)

export function registeredProjectTaskTypes(provider: Pick<IProjectTaskProvider, 'key' | 'taskTypes'>) {
    const parsed = definitionsSchema.safeParse(provider.taskTypes ?? [])
    if (!parsed.success) throw invalidProjectTaskType()
    const result = new Map<string, ProjectTaskTypePresentation>()
    for (const definition of parsed.data) {
        if (
            !definition.key.startsWith(`${provider.key}.`) ||
            definition.key.length <= provider.key.length + 1 ||
            result.has(definition.key)
        )
            throw invalidProjectTaskType()
        result.set(definition.key, {
            icon: definition.presentation.icon,
            label: { en_US: definition.presentation.label.en_US, zh_Hans: definition.presentation.label.zh_Hans }
        })
    }
    return result
}

export function invalidProjectTaskType() {
    return Error(
        t('server-ai:Error.ProjectTaskTypeInvalid', {
            defaultValue: 'Project task types must use unique provider-owned keys and registered presentation tokens.'
        })
    )
}
