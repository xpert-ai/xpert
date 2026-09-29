import { TXpertTeamDraft } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { parse } from 'yaml'

export function parseCapabilityTemplateDraft(content: string): TXpertTeamDraft {
    let value: unknown
    try {
        value = parse(content)
    } catch {
        invalid()
    }
    if (!isDraft(value)) invalid()
    return value
}

function isDraft(value: unknown): value is TXpertTeamDraft {
    return (
        !!value &&
        typeof value === 'object' &&
        'team' in value &&
        !!value.team &&
        typeof value.team === 'object' &&
        'nodes' in value &&
        Array.isArray(value.nodes) &&
        value.nodes.every(
            (node) =>
                node &&
                typeof node.key === 'string' &&
                typeof node.type === 'string' &&
                node.entity &&
                typeof node.entity === 'object'
        ) &&
        'connections' in value &&
        Array.isArray(value.connections) &&
        value.connections.every((edge) => edge && typeof edge.from === 'string' && typeof edge.to === 'string')
    )
}

function invalid(): never {
    throw new BadRequestException(t('server-ai:Error.TemplateCapabilityDraftInvalid'))
}
