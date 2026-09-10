import {
    XpertTypeEnum,
    type IXpert,
    type IXpertAgentExecution,
    type TAssistantPrimaryModelSelection,
    type TChatRequest,
    type TChatRequestHuman
} from '@xpert-ai/contracts'
import type { AssistantModelSelectionService } from './assistant-model-selection.service'

export function supportsAssistantPrimaryModelSelection(xpert: Partial<IXpert> | null | undefined): boolean {
    return xpert?.type !== XpertTypeEnum.Knowledge
}

/**
 * Task and chat selections share the same model id and audited snapshot.
 * Retry preserves the original selection source so base inheritance stays deterministic.
 */
export async function resolveAssistantExecutionModel(
    selectionService: Pick<AssistantModelSelectionService, 'resolveSelection'> | undefined,
    {
        request,
        xpert,
        runtimeAgentKey,
        input,
        sourceExecution,
        isDraft,
        primaryModelId
    }: {
        request: TChatRequest
        xpert: Partial<IXpert>
        runtimeAgentKey: string
        input: TChatRequestHuman | null
        sourceExecution: IXpertAgentExecution | null
        isDraft: boolean
        primaryModelId?: string
    }
): Promise<TAssistantPrimaryModelSelection | null> {
    const metadata = sourceExecution?.metadata
    const continuingSelection = (request.action === 'resume' || request.action === 'retry') && metadata?.primaryModelId
    if (
        isDraft ||
        !selectionService ||
        !supportsAssistantPrimaryModelSelection(xpert) ||
        !xpert.agent?.key ||
        (runtimeAgentKey !== xpert.agent.key && !primaryModelId && !continuingSelection)
    ) {
        return null
    }

    if (request.action === 'resume') {
        return selectionService.resolveSelection(xpert, {
            continuationModelId: metadata?.primaryModelId,
            continuationModelSnapshot: metadata?.primaryModelSnapshot,
            continuationSource: metadata?.primaryModelSource,
            ignorePreference: !metadata?.primaryModelId
        })
    }
    if (request.action === 'retry') {
        const selection = await selectionService.resolveSelection(xpert, {
            retryModelId: metadata?.primaryModelId,
            retryModelSnapshot: metadata?.primaryModelSnapshot,
            ignorePreference: !metadata?.primaryModelId
        })
        // A fallback must retain its own source; only a successful retry inherits origin.
        return selection.source === 'retry' && metadata?.primaryModelSource
            ? { ...selection, source: metadata.primaryModelSource }
            : selection
    }
    if (primaryModelId) {
        return selectionService.resolveSelection(xpert, { explicitModelId: primaryModelId, ignorePreference: true })
    }
    return selectionService.resolveSelection(xpert, {
        explicitModelId: typeof input?.model === 'string' ? input.model : undefined
    })
}
