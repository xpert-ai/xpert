import type { ImprovementProposal } from '@xpert-ai/contracts'
import type { Repository } from 'typeorm'
import { ImprovementProposalEntity } from '../entities'
import { learningProposalRow } from '../entities/evolution-row-guards'
import { tenantWhere, type EvolutionTenantScope } from '../application/evolution-store.helpers'

/** Initialize a checked draft once. Preserve the original JSON evidence and its immutable hash across retries. */
export function finalizeCheckedProposal(
    repository: Repository<ImprovementProposalEntity>,
    tenant: EvolutionTenantScope,
    proposal: ImprovementProposal
) {
    return repository.manager.transaction(async (manager) => {
        const records = manager.getRepository(ImprovementProposalEntity)
        const row = learningProposalRow(
            await records.findOneOrFail({
                where: { ...tenantWhere(tenant), proposalId: proposal.proposalId, revision: proposal.revision },
                lock: { mode: 'pessimistic_write' }
            })
        )
        if (row.status !== 'draft') return row
        row.status = 'ready'
        row.value = {
            ...row.value,
            title: proposal.title,
            riskLevel: proposal.riskLevel,
            rootCause: proposal.rootCause,
            problemStatement: proposal.problemStatement,
            changeHypothesis: proposal.changeHypothesis,
            status: 'ready'
        }
        return learningProposalRow(await records.save(row))
    })
}
