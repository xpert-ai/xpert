import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ForbiddenException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { createHash } from 'node:crypto'
import type { ContentActor } from '@xpert-ai/plugin-sdk'
import type { ResourceAnalysisDescription, ResourceAnalysisQuery, ResourceAnalysisResult } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { ArtifactGroupReferenceService } from '../../../group-references/artifact-group-reference.service'
import { GroupResourceAnalysisService } from '../../group-resource-analysis.service'
import { ResourceAnalysisExecution } from '../../resource-analysis-execution.entity'

import { GroupResourceAnalysisCommand } from '../group-resource-analysis.command'

@CommandHandler(GroupResourceAnalysisCommand)
export class GroupResourceAnalysisHandler implements ICommandHandler<GroupResourceAnalysisCommand> {
    constructor(
        private readonly db: DataSource,
        private readonly references: ArtifactGroupReferenceService,
        private readonly analysis: GroupResourceAnalysisService
    ) {}
    async execute(command: GroupResourceAnalysisCommand) {
        const { actor, groupId, assistantId, executionId, operation } = command
        const scope = { tenantId: actor.tenantId, organizationId: actor.organizationId, groupId, executionId }
        if (operation.kind === 'validate-delivery') {
            const rows = await this.db
                .getRepository(ResourceAnalysisExecution)
                .findBy({ ...scope, status: 'succeeded' })
            for (const row of rows) {
                if (row.actorId !== actor.userId || row.assistantId !== assistantId) throw denied()
                const current = await this.references.resolve(actor, groupId, row.referenceId)
                if (
                    current.grant.id !== row.grantId ||
                    current.grant.revision !== row.grantRevision ||
                    !current.grant.analysis
                )
                    throw denied()
            }
            return
        }
        if (operation.kind === 'describe') return this.analysis.describeAnalysis(actor, groupId, operation.referenceId)
        const selected = await this.references.resolve(actor, groupId, operation.referenceId)
        if (!selected.grant.analysis) throw denied()
        const audit = await this.db.transaction(async (manager) => {
            // Serialize the shared execution budget across resources and parallel tool calls.
            await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
                `${actor.tenantId}:${groupId}:${executionId}`
            ])
            const repository = manager.getRepository(ResourceAnalysisExecution)
            if ((await repository.countBy(scope)) >= 8)
                throw new ForbiddenException(t('server-ai:Error.ResourceAnalysisBudget'))
            return repository.save(
                repository.create({
                    ...scope,
                    actorId: actor.userId,
                    assistantId,
                    grantId: selected.grant.id,
                    referenceId: operation.referenceId,
                    grantRevision: selected.grant.revision,
                    datasetKey: operation.query.datasetKey,
                    queryHash: createHash('sha256').update(JSON.stringify(operation.query)).digest('hex'),
                    status: 'running'
                })
            )
        })
        try {
            const result = await this.analysis.queryAnalysis(actor, groupId, operation.referenceId, operation.query)
            const current = await this.references.resolve(actor, groupId, operation.referenceId)
            if (current.grant.id !== audit.grantId || current.grant.revision !== audit.grantRevision) throw denied()
            await this.db
                .getRepository(ResourceAnalysisExecution)
                .update({ id: audit.id, ...scope }, { status: 'succeeded' })
            return result
        } catch (error) {
            await this.db
                .getRepository(ResourceAnalysisExecution)
                .update({ id: audit.id, ...scope }, { status: 'denied' })
            throw error
        }
    }
}
const denied = () => new ForbiddenException(t('server-ai:Error.ResourceAnalysisDenied'))
