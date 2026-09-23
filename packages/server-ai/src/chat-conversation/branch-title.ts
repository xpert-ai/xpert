// Invariants: allocate within the branch transaction, after idempotency checks. The family
// lock also serializes branches created from different threads or descendants.
import type { TConversationBranchNaming } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { EntityManager } from 'typeorm'
import { ChatConversation } from './conversation.entity'

/** Allocate the next family number atomically with target creation, without parsing display suffixes. */
export async function allocateBranchTitle(
    manager: EntityManager,
    source: ChatConversation
): Promise<TConversationBranchNaming> {
    const stored = source.branchSource?.naming
    // Only an unchanged generated title inherits its group; user renames establish a new base title.
    const inherited = isBranchNaming(stored) && source.title === stored.generatedTitle ? stored : null
    const familyId = inherited?.familyId ?? source.id
    const baseTitle = inherited?.baseTitle ?? (source.title || t('server-ai:ConversationBranch.Untitled'))

    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
        'conversation-branch-title',
        JSON.stringify([source.tenantId, source.organizationId ?? null, familyId, baseTitle])
    ])
    const branches = await manager
        .getRepository(ChatConversation)
        .createQueryBuilder('conversation')
        .select('conversation.branchSource')
        .where('conversation.tenantId = :tenantId', { tenantId: source.tenantId })
        .andWhere('conversation.organizationId IS NOT DISTINCT FROM :organizationId', {
            organizationId: source.organizationId ?? null
        })
        .andWhere(`conversation."branchSource" -> 'naming' ->> 'familyId' = :familyId`, { familyId })
        .andWhere(`conversation."branchSource" -> 'naming' ->> 'baseTitle' = :baseTitle`, { baseTitle })
        .getMany()
    // Keep advancing from the source even when other conversations in its family have been deleted.
    let latest = inherited?.number ?? 1
    for (const branch of branches) {
        const naming = branch.branchSource?.naming
        if (isBranchNaming(naming)) latest = Math.max(latest, naming.number)
    }
    const number = latest + 1
    const generatedTitle = t('server-ai:ConversationBranch.Title', {
        title: baseTitle,
        number,
        interpolation: { escapeValue: false }
    })
    return { familyId, baseTitle, number, generatedTitle }
}

// JSONB boundary: legacy conversations have no numbering metadata.
function isBranchNaming(value: unknown): value is TConversationBranchNaming {
    return (
        typeof value === 'object' &&
        value !== null &&
        'familyId' in value &&
        typeof value.familyId === 'string' &&
        'baseTitle' in value &&
        typeof value.baseTitle === 'string' &&
        'number' in value &&
        typeof value.number === 'number' &&
        Number.isSafeInteger(value.number) &&
        value.number >= 2 &&
        'generatedTitle' in value &&
        typeof value.generatedTitle === 'string'
    )
}
