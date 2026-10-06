import { t } from 'i18next'
import type { ConversationResourceCard } from '@xpert-ai/contracts'

type ProjectTaskCardInput = {
    id: string
    title: string
    status: string
} & (
    | { type: 'task' }
    | { type: 'execution'; attempt: number; purpose?: 'implementation' | 'review'; provider?: string }
)

export function projectTaskCard(input: ProjectTaskCardInput): ConversationResourceCard {
    const parts =
        input.type === 'execution'
            ? [
                  t(`server-ai:ProjectTaskCard.${input.purpose === 'review' ? 'Review' : 'Implementation'}`),
                  t('server-ai:ProjectTaskCard.Attempt', { count: input.attempt }),
                  input.provider
              ]
            : []
    return {
        resource: { namespace: 'platform.project-tasks', type: input.type, id: input.id },
        title: input.title,
        description: [
            ...parts,
            t(`server-ai:ProjectTaskCard.Status.${input.status}`, {
                defaultValue: t('server-ai:ProjectTaskCard.Status.unknown')
            })
        ]
            .filter(Boolean)
            .join(' · '),
        icon: { type: 'emoji', value: input.type === 'execution' && input.purpose === 'review' ? '🔎' : '📋' },
        // This release navigates only to the existing timeline. No execution detail UI.
        open: { target: 'workbench.view', viewKey: 'platform.project-tasks__timeline' }
    }
}
