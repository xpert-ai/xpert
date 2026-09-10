import {
    DocumentSourceProviderCategoryEnum,
    IKnowledgebaseTask,
    KBDocumentStatusEnum,
    TXpertGraph,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'
import type { KnowledgeDocumentService } from '../../knowledge-document/document.service'
import type { KnowledgebaseTaskService } from './task.service'
import type { KnowledgePipelineInputs } from './pipeline-task'

/** Save selected preview documents before dispatch so the first list refresh can see them. */
export async function prepareKnowledgePipelineDocuments(
    task: IKnowledgebaseTask,
    graph: TXpertGraph | undefined,
    inputs: KnowledgePipelineInputs,
    documentService: Pick<KnowledgeDocumentService, 'createBulk'>,
    taskService: Pick<KnowledgebaseTaskService, 'savePreparedSource' | 'withLockedTask'>
): Promise<KnowledgePipelineInputs> {
    if (inputs.stage !== 'prod' || inputs.isDraft || !task.context?.documents?.length || !inputs.sources) {
        return inputs
    }

    // Validate the entire selection before saving the first source.
    const sources = Object.entries(inputs.sources).map(([key, selection]) => {
        const node = graph?.nodes.find((node) => node.key === key)
        if (
            node?.type !== 'workflow' ||
            node.entity.type !== WorkflowNodeTypeEnum.SOURCE ||
            !('provider' in node.entity) ||
            typeof node.entity.provider !== 'string'
        ) {
            throw new ForbiddenException(t('server-ai:Error.KnowledgebaseTaskAccessDenied'))
        }
        return { key, selection, provider: node.entity.provider }
    })
    return taskService.withLockedTask(task.id, async (lockedTask, manager) => {
        const preparedSources: NonNullable<KnowledgePipelineInputs['sources']> = {}
        for (const { key, selection, provider } of sources) {
            const bindings = { ...lockedTask.context.materializedSources?.[key] }
            const pending = lockedTask.context.documents.filter(
                (doc) => selection.documents.includes(doc.id) && !bindings[doc.id]
            )
            if (pending.length) {
                const documents = await documentService.createBulk(
                    pending.map(({ id: _id, ...doc }) => ({
                        ...doc,
                        knowledgebaseId: task.knowledgebaseId,
                        sourceType: provider as DocumentSourceProviderCategoryEnum,
                        sourceConfig: { key },
                        status: KBDocumentStatusEnum.WAITING,
                        processMsg: null,
                        progress: 0
                    })),
                    manager
                )
                pending.forEach((doc, index) => {
                    bindings[doc.id] = documents[index].id
                })
                await taskService.savePreparedSource(task.id, key, bindings, documents, { task: lockedTask, manager })
            }
            preparedSources[key] = { documents: selection.documents.map((id) => bindings[id] ?? id) }
        }
        return { ...inputs, sources: preparedSources }
    })
}
