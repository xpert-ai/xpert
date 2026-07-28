import {
    AiModelTypeEnum,
    IWFNMiddleware,
    IWFNClassifier,
    TCopilotModel,
    TXpertTeamDraft,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { BadRequestException, Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { t } from 'i18next'
import { ModelAccessService } from '../model-access'
import { XpertAgentService } from '../xpert-agent/xpert-agent.service'
import {
    buildMiddlewareModelTargetCatalog,
    MiddlewareModelTargetCatalog
} from './copilot-model-sync.util'
import { EventNameXpertValidate, XpertDraftValidateEvent } from './types'

type DraftModelReference = {
    label: string
    copilotId: string
    copilotModelId: string
    modelType: AiModelTypeEnum | null
}

@Injectable()
export class XpertModelAccessValidator {
    constructor(
        private readonly modelAccessService: ModelAccessService,
        private readonly xpertAgentService: XpertAgentService
    ) {}

    @OnEvent(EventNameXpertValidate)
    async handle(event: XpertDraftValidateEvent) {
        const context = event.context
        if (!context?.tenantId || !context.xpertId) {
            return []
        }
        const userId = context.creatorId ?? RequestContext.currentUserId()
        if (!userId) {
            return []
        }

        const middlewareModelTargets = buildMiddlewareModelTargetCatalog(
            this.xpertAgentService.getMiddlewareStrategies()
        )
        for (const reference of collectDraftModelReferences(event.draft, middlewareModelTargets)) {
            if (!reference.modelType) {
                throw new BadRequestException(
                    t('server-ai:Error.ModelAccessXpertModelTypeRequired', {
                        defaultValue: 'The model "{{model}}" used by {{field}} is missing its model type.',
                        model: reference.copilotModelId,
                        field: reference.label
                    })
                )
            }
            const allowed = await this.modelAccessService.canUseCatalogModel({
                tenantId: context.tenantId,
                organizationId: context.organizationId ?? null,
                userId,
                xpertId: context.xpertId,
                copilotId: reference.copilotId,
                copilotModelId: reference.copilotModelId,
                modelType: reference.modelType
            })
            if (!allowed) {
                throw new BadRequestException(
                    t('server-ai:Error.ModelAccessXpertModelUnavailable', {
                        defaultValue:
                            'The model "{{model}}" used by {{field}} is not available to the assistant creator.',
                        model: reference.copilotModelId,
                        field: reference.label
                    })
                )
            }
        }

        return []
    }
}

export function collectDraftModelReferences(
    draft: TXpertTeamDraft,
    middlewareModelTargets: MiddlewareModelTargetCatalog = {}
): DraftModelReference[] {
    const references: DraftModelReference[] = []
    const append = (label: string, model: TCopilotModel | null | undefined) => {
        const copilotId =
            model?.copilotId ??
            model?.copilot?.id ??
            model?.referencedModel?.copilotId ??
            model?.referencedModel?.copilot?.id
        const copilotModelId =
            model?.model ?? model?.referencedModel?.model ?? model?.copilot?.copilotModel?.model
        if (!copilotId || !copilotModelId) {
            return
        }
        references.push({
            label,
            copilotId,
            copilotModelId,
            modelType:
                model?.modelType ??
                model?.referencedModel?.modelType ??
                model?.copilot?.copilotModel?.modelType ??
                null
        })
    }

    append('team.copilotModel', draft.team?.copilotModel)
    append('team.memory.copilotModel', draft.team?.memory?.copilotModel)
    if (draft.team?.features?.textToSpeech?.enabled) {
        append('team.features.textToSpeech.copilotModel', draft.team.features.textToSpeech.copilotModel)
    }
    if (draft.team?.features?.speechToText?.enabled) {
        append('team.features.speechToText.copilotModel', draft.team.features.speechToText.copilotModel)
    }

    for (const node of draft.nodes ?? []) {
        if (node.type === 'agent') {
            append(`nodes.${node.key}.copilotModel`, node.entity.copilotModel)
            if (node.entity.options?.fallback?.enabled) {
                append(`nodes.${node.key}.options.fallback.copilotModel`, node.entity.options.fallback.copilotModel)
            }
        } else if (node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.CLASSIFIER) {
            append(
                `nodes.${node.key}.copilotModel`,
                (node.entity as IWFNClassifier).copilotModel
            )
        } else if (node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE) {
            const middleware = node.entity as IWFNMiddleware
            for (const target of middlewareModelTargets[middleware.provider] ?? []) {
                const model = readMiddlewareModel(middleware.options, target.path, target.modelType)
                if (model) {
                    append(`nodes.${node.key}.options.${target.path}`, model)
                }
            }
        }
    }

    const seen = new Set<string>()
    return references.filter((reference) => {
        const key = `${reference.copilotId}:${reference.modelType ?? 'missing'}:${reference.copilotModelId}`
        if (seen.has(key)) {
            return false
        }
        seen.add(key)
        return true
    })
}

function readMiddlewareModel(
    options: IWFNMiddleware['options'],
    path: string,
    expectedModelType?: AiModelTypeEnum
): TCopilotModel | null {
    let value: unknown = options
    for (const segment of path.split('.')) {
        if (!isObject(value)) {
            return null
        }
        value = value[segment]
    }
    if (!isObject(value)) {
        return null
    }
    const copilotId = readText(value['copilotId'])
    const model = readText(value['model'])
    const modelType = readText(value['modelType']) || expectedModelType
    if (!copilotId || !model || !modelType || !Object.values(AiModelTypeEnum).includes(modelType as AiModelTypeEnum)) {
        return null
    }
    return {
        copilotId,
        model,
        modelType: modelType as AiModelTypeEnum
    }
}

function isObject(value: unknown): value is { [key: string]: unknown } {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readText(value: unknown) {
    return typeof value === 'string' ? value.trim() : ''
}
