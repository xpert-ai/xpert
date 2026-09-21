import {
    AIPermissionsEnum,
    AiModelTypeEnum,
    KnowledgebasePermission,
    KnowledgebaseTypeEnum,
    KnowledgeStructureEnum,
    type IKnowledgebase,
    type KBMetadataFieldDef
} from '@xpert-ai/contracts'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { t } from 'i18next'
import { RequestContext } from '@xpert-ai/server-core'
import type {
    KnowledgebaseEnsureItem,
    KnowledgebaseEnsureResult,
    KnowledgebaseProvisioningPermission,
    KnowledgebaseProvisioningSpec
} from '@xpert-ai/plugin-sdk'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { CopilotWithProviderDto } from '../../../copilot/dto'
import { CopilotModelCatalogMode, FindCopilotModelsQuery } from '../../../copilot/queries/copilot-model-find.query'
import { EnsureKnowledgebasesCommand } from '../ensure-knowledgebases.command'

const MANAGED_MARKER_PREFIX = '[xpert-managed:'

@CommandHandler(EnsureKnowledgebasesCommand)
export class EnsureKnowledgebasesHandler implements ICommandHandler<EnsureKnowledgebasesCommand> {
    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly queryBus: QueryBus
    ) {}

    async execute(command: EnsureKnowledgebasesCommand): Promise<KnowledgebaseEnsureResult> {
        if (!RequestContext.hasPermission(AIPermissionsEnum.KNOWLEDGEBASE_EDIT, false)) {
            throw new ForbiddenException('Knowledgebase edit permission is required')
        }

        const input = command.input
        const workspaceId = requiredText(input.workspaceId, 'workspaceId', 200)
        const namespace = requiredText(input.namespace, 'namespace', 80)
        if (!/^[a-z][a-z0-9_]{2,79}$/.test(namespace)) {
            throw new BadRequestException('namespace must contain lowercase letters, numbers, or underscores')
        }
        if (!input.knowledgebases.length || input.knowledgebases.length > 8) {
            throw new BadRequestException('knowledgebases must contain between 1 and 8 items')
        }

        const keys = new Set<string>()
        const names = new Set<string>()
        for (const spec of input.knowledgebases) {
            const key = requiredText(spec.key, 'knowledgebase.key', 80)
            const name = requiredText(spec.name, 'knowledgebase.name', 240)
            if (keys.has(key) || names.has(name)) {
                throw new BadRequestException('knowledgebase keys and names must be unique')
            }
            keys.add(key)
            names.add(name)
        }

        const user = RequestContext.currentUser()
        if (!user?.id) {
            throw new ForbiddenException('An authenticated user is required')
        }
        const accessible = await this.knowledgebaseService.getAllByWorkspace(
            workspaceId,
            {
                take: 500,
                skip: 0,
                where: {},
                withDeleted: false,
                order: { updatedAt: 'DESC' },
                ...(input.inheritEmbeddingModel ? { relations: ['copilotModel'] } : {})
            },
            false,
            user
        )
        const workspaceKnowledgebases = accessible.items.filter((item) => item.workspaceId === workspaceId)
        const needsEmbeddingModel =
            input.inheritEmbeddingModel &&
            input.knowledgebases.some(
                (spec) =>
                    !workspaceKnowledgebases.find((item) =>
                        item.description?.includes(managedMarker(namespace, workspaceId, spec.key))
                    )?.copilotModelId
            )
        const embeddingModel = needsEmbeddingModel
            ? await this.resolveEmbeddingModel(workspaceKnowledgebases)
            : undefined
        const items: KnowledgebaseEnsureItem[] = []

        for (const spec of input.knowledgebases) {
            const marker = managedMarker(namespace, workspaceId, spec.key)
            const existing = workspaceKnowledgebases.find((item) => item.description?.includes(marker))
            const patch = provisioningPatch(spec, workspaceId, marker)
            if (!existing?.copilotModelId && embeddingModel) {
                patch.copilotModel = cloneEmbeddingModel(embeddingModel)
            }
            if (typeof spec.graphRag?.enabled === 'boolean') {
                patch.graphRag = { ...existing?.graphRag, enabled: spec.graphRag.enabled }
            }
            const saved = existing
                ? await this.knowledgebaseService.updateKnowledgebase(existing.id, patch)
                : await this.knowledgebaseService.create(patch)
            items.push({
                id: saved.id,
                key: spec.key,
                name: saved.name,
                description: saved.description ?? null,
                type: saved.type ?? null,
                status: saved.status ?? null,
                permission: saved.permission ?? null,
                workspaceId: saved.workspaceId ?? null,
                documentNum: saved.documentNum ?? null,
                chunkNum: saved.chunkNum ?? null,
                graphRag: saved.graphRag ?? null,
                graphStatus: saved.graphStatus ?? null,
                operation: existing ? 'updated' : 'created'
            })
        }

        return { namespace, workspaceId, knowledgebases: items }
    }

    private async resolveEmbeddingModel(knowledgebases: IKnowledgebase[]) {
        const copilots = await this.queryBus.execute<FindCopilotModelsQuery, CopilotWithProviderDto[]>(
            new FindCopilotModelsQuery(AiModelTypeEnum.TEXT_EMBEDDING, CopilotModelCatalogMode.Available)
        )
        for (const copilot of copilots) {
            const model = copilot.providerWithModels.models.find(
                (item) => item.model_type === AiModelTypeEnum.TEXT_EMBEDDING && item.model?.trim()
            )
            if (model) {
                return { copilotId: copilot.id, model: model.model, modelType: AiModelTypeEnum.TEXT_EMBEDDING }
            }
        }

        // Only inherit from another ordinary knowledgebase in this workspace.
        // Organization-shared knowledgebases returned by the listing are excluded by the caller.
        const inherited = knowledgebases.find(
            (item) =>
                !item.description?.includes(MANAGED_MARKER_PREFIX) &&
                item.copilotModel?.modelType === AiModelTypeEnum.TEXT_EMBEDDING &&
                (item.copilotModel.referencedId || (item.copilotModel.copilotId && item.copilotModel.model?.trim()))
        )
        if (inherited) return cloneEmbeddingModel(inherited.copilotModel)

        throw new BadRequestException(
            t('server-ai:Error.KnowledgebaseProvisioningEmbeddingUnavailable', {
                defaultValue:
                    'No available embedding model was found in accessible Copilot providers or other knowledgebases in this workspace. Configure an embedding model and its access permissions, then retry.'
            })
        )
    }
}

function cloneEmbeddingModel(model: IKnowledgebase['copilotModel']) {
    if (!model) return undefined
    return {
        copilotId: model.copilotId,
        referencedId: model.referencedId,
        modelType: model.modelType,
        model: model.model,
        options: model.options ? { ...model.options } : undefined
    }
}

function provisioningPatch(
    spec: KnowledgebaseProvisioningSpec,
    workspaceId: string,
    marker: string
): Partial<IKnowledgebase> {
    return {
        name: requiredText(spec.name, 'knowledgebase.name', 240),
        description: `${requiredText(spec.description, 'knowledgebase.description', 2000)}\n\n${marker}`,
        workspaceId,
        type: KnowledgebaseTypeEnum.Standard,
        structure: KnowledgeStructureEnum.General,
        language: spec.language ?? 'Chinese',
        permission: mapPermission(spec.permission),
        parserConfig: {
            chunkSize: boundedInteger(spec.chunkSize, 200, 4000, 1000),
            chunkOverlap: boundedInteger(spec.chunkOverlap, 0, 1000, 120),
            delimiter: spec.delimiter?.slice(0, 20) || '\n'
        },
        recall: {
            topK: boundedInteger(spec.topK, 1, 100, 10),
            score: boundedNumber(spec.score, 0, 1, 0.4)
        },
        metadataSchema: (spec.metadataSchema ?? []).map(toMetadataField),
        incrementalSyncEnabled: spec.incrementalSyncEnabled ?? true
    }
}

function mapPermission(value: KnowledgebaseProvisioningPermission) {
    switch (value) {
        case 'organization':
            return KnowledgebasePermission.Organization
        case 'public':
            return KnowledgebasePermission.Public
        default:
            return KnowledgebasePermission.Private
    }
}

function toMetadataField(field: KnowledgebaseProvisioningSpec['metadataSchema'][number]): KBMetadataFieldDef {
    const label = field.label?.en_US
        ? {
              en_US: field.label.en_US,
              ...(field.label.zh_Hans ? { zh_Hans: field.label.zh_Hans } : {})
          }
        : undefined
    return {
        key: requiredText(field.key, 'metadataSchema.key', 80),
        type: field.type,
        ...(label ? { label } : {}),
        ...(field.scope ? { scope: field.scope } : {}),
        ...(field.enumValues ? { enumValues: field.enumValues.slice(0, 100) } : {}),
        ...(field.description ? { description: field.description.slice(0, 500) } : {})
    }
}

function managedMarker(namespace: string, workspaceId: string, key: string) {
    return `${MANAGED_MARKER_PREFIX}${namespace};workspace:${workspaceId};key:${key}]`
}

function requiredText(value: string, field: string, max: number) {
    const normalized = value?.trim()
    if (!normalized || normalized.length > max) {
        throw new BadRequestException(`${field} is required and must not exceed ${max} characters`)
    }
    return normalized
}

function boundedInteger(value: number | undefined, min: number, max: number, fallback: number) {
    return Number.isInteger(value) && value !== undefined && value >= min && value <= max ? value : fallback
}

function boundedNumber(value: number | undefined, min: number, max: number, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback
}
