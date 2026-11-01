import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import {
    ExecuteModelReplacementInput,
    ICopilotWithProvider,
    ModelReplacementInput,
    ModelReplacementPreview,
    ModelReplacementResult,
    ModelReplacementScope,
    ModelReplacementSource,
    ParameterRule
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { In, IsNull, Repository } from 'typeorm'
import { t } from 'i18next'
import { FindCopilotModelsQuery } from '../../copilot/queries/copilot-model-find.query'
import { CopilotProviderModelParameterRulesQuery } from '../../copilot-provider/queries/model-parameter-rules.query'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { Xpert } from '../xpert.entity'
import { XpertService } from '../xpert.service'
import { draftRevision, referencedDraftModels, replaceDraftModels } from './replacement'
import { ModelReplacementOperation } from './operation.entity'

@Injectable()
export class ModelReplacementService {
    constructor(
        @InjectRepository(Xpert) private readonly xperts: Repository<Xpert>,
        @InjectRepository(ModelReplacementOperation) private readonly operations: Repository<ModelReplacementOperation>,
        private readonly access: XpertWorkspaceAccessService,
        private readonly queries: QueryBus,
        private readonly service: XpertService
    ) {}

    private scope() {
        return {
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId() ?? IsNull()
        }
    }

    private async rules(input: ModelReplacementInput): Promise<ParameterRule[]> {
        const catalog = await this.queries.execute<FindCopilotModelsQuery, ICopilotWithProvider[]>(
            new FindCopilotModelsQuery(input.target.modelType)
        )
        const target = catalog.find((item) => item.id === input.target.copilotId)
        const targetModel = target?.providerWithModels.models.find(
            (model) => model.model === input.target.model && model.model_type === input.target.modelType
        )
        if (!targetModel) throw new BadRequestException(t('server-ai:Error.ModelDefaultUnavailable'))
        const source = catalog
            .find((item) => item.id === input.source.copilotId)
            ?.providerWithModels.models.find(
                (model) => model.model === input.source.model && model.model_type === input.source.modelType
            )
        // Conservatively preserve declared source capabilities across mixed agent uses.
        if (source?.features?.some((feature) => !targetModel.features?.includes(feature)))
            throw new BadRequestException(t('server-ai:Error.ModelCapabilitiesIncompatible'))
        return this.queries.execute(
            new CopilotProviderModelParameterRulesQuery(
                target.modelProvider.id,
                input.target.modelType,
                input.target.model
            )
        )
    }

    private async editableDrafts(input: ModelReplacementScope) {
        const workspaces = await this.access.findAccessibleWorkspaces(undefined, { purpose: 'authoring' })
        const ids: string[] = []
        for (const workspace of workspaces) {
            if (input.workspaceId && input.workspaceId !== workspace.id) continue
            try {
                await this.access.assertCanWrite(workspace.id)
                ids.push(workspace.id)
            } catch {
                /* Omit records without write access. */
            }
        }
        if (!ids.length) return []
        const xperts = await this.xperts.find({
            where: { ...this.scope(), workspaceId: In(ids), latest: true },
            order: { updatedAt: 'DESC' },
            take: 501
        })
        if (xperts.length > 500) throw new BadRequestException(t('server-ai:Error.ModelReplacementNarrowScope'))
        return xperts.filter((item) => item.draft)
    }

    async sources(input: ModelReplacementScope): Promise<ModelReplacementSource[]> {
        const sources = new Map<string, ModelReplacementSource>()
        for (const item of await this.editableDrafts(input)) {
            for (const identity of referencedDraftModels(item.draft)) {
                const key = JSON.stringify([identity.copilotId, identity.modelType, identity.model])
                const entry = sources.get(key)
                if (entry) entry.references++
                else sources.set(key, { identity, references: 1 })
            }
        }
        return [...sources.values()]
    }

    async preview(input: ModelReplacementInput): Promise<ModelReplacementPreview[]> {
        const rules = await this.rules(input)
        return (await this.editableDrafts(input))
            .map((item) => {
                const result = replaceDraftModels(item.draft, input, rules)
                return {
                    id: item.id,
                    name: item.name,
                    workspaceId: item.workspaceId,
                    revision: draftRevision(item.draft),
                    count: result.changes.length,
                    changes: result.changes,
                    missing: result.missing
                }
            })
            .filter((item) => item.count > 0)
    }

    async execute(request: ExecuteModelReplacementInput): Promise<ModelReplacementResult[]> {
        const results: ModelReplacementResult[] = []
        for (const selection of request.selections) {
            try {
                // Re-resolve both authorization and the target catalog for each mutation.
                const rules = await this.rules(request.input)
                const result = await this.xperts.manager.transaction(async (manager) => {
                    const repo = manager.getRepository(Xpert)
                    const current = await repo.findOne({
                        where: { ...this.scope(), id: selection.id, latest: true },
                        lock: { mode: 'pessimistic_write' }
                    })
                    if (!current) throw new BadRequestException(t('server-ai:Error.ModelDefaultUnavailable'))
                    await this.access.assertCanWrite(current.workspaceId)
                    if (request.input.workspaceId && current.workspaceId !== request.input.workspaceId)
                        throw new BadRequestException(t('server-ai:Error.ModelDefaultInvalid'))
                    if (!current.draft || draftRevision(current.draft) !== selection.revision)
                        throw new ConflictException()
                    const next = replaceDraftModels(current.draft, request.input, rules)
                    if (!next.changes.length) return { id: current.id, status: 'skipped' as const }
                    if (next.missing.length) throw new BadRequestException(t('server-ai:Error.ModelParametersRequired'))
                    next.draft.checklist = await this.service.validate(next.draft, {
                        tenantId: current.tenantId,
                        organizationId: current.organizationId,
                        xpertId: current.id,
                        creatorId: current.createdById
                    })
                    next.draft.team = {
                        ...next.draft.team,
                        updatedAt: new Date(),
                        updatedById: RequestContext.currentUserId()
                    }
                    const operation = await manager
                        .getRepository(ModelReplacementOperation)
                        .save({
                            ...this.scopeForSave(),
                            xpertId: current.id,
                            actorId: RequestContext.currentUserId(),
                            beforeDraft: current.draft,
                            afterRevision: draftRevision(next.draft)
                        })
                    // Only draft is written. Published relations and knowledge indexes are untouched.
                    await repo.update(current.id, { draft: next.draft })
                    return { id: current.id, status: 'updated' as const, operationId: operation.id }
                })
                results.push(result)
            } catch (error) {
                results.push({
                    id: selection.id,
                    status: error instanceof ConflictException ? 'conflict' : 'failed',
                    message:
                        error instanceof ConflictException
                            ? t('server-ai:Error.ModelReplacementConflict')
                            : t('server-ai:Error.ModelReplacementFailed')
                })
            }
        }
        return results
    }

    private scopeForSave() {
        return {
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId() ?? null
        }
    }

    async restore(id: string) {
        return this.operations.manager.transaction(async (manager) => {
            const operations = manager.getRepository(ModelReplacementOperation)
            const operation = await operations.findOne({
                where: { ...this.scope(), id, actorId: RequestContext.currentUserId() },
                lock: { mode: 'pessimistic_write' }
            })
            if (!operation || operation.restored)
                throw new BadRequestException(t('server-ai:Error.ModelReplacementFailed'))
            const xperts = manager.getRepository(Xpert)
            const current = await xperts.findOne({
                where: { ...this.scope(), id: operation.xpertId },
                lock: { mode: 'pessimistic_write' }
            })
            if (!current) throw new BadRequestException(t('server-ai:Error.ModelReplacementFailed'))
            await this.access.assertCanWrite(current.workspaceId)
            if (draftRevision(current.draft) !== operation.afterRevision)
                throw new ConflictException(t('server-ai:Error.ModelReplacementConflict'))
            await xperts.update(current.id, { draft: operation.beforeDraft })
            await operations.update(id, { restored: true })
            return { restored: true }
        })
    }
}
