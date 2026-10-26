// The start callback is awaited and raises errors before LangChain enters the provider implementation.
// Settlement consumes the existing SDK usage callback; missing/estimated usage keeps the durable hold.
import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import { BaseLanguageModel } from '@langchain/core/language_models/base'
import type { Callbacks } from '@langchain/core/callbacks/manager'
import { t } from 'i18next'
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons'
import type { CommandBus } from '@nestjs/cqrs'
import type { TLLMUsage } from '@xpert-ai/plugin-sdk'
import {
    AdmitPipelineModelCallCommand,
    SettlePipelineModelCallCommand,
    type PipelineModelBudgetActor,
    type PipelineModelBudgetCall
} from '../../xpert-project/pipeline/budget/pipeline-model-budget.command'

function supportsModelCallbacks(model: unknown): model is { callbacks?: Callbacks } {
    if (model instanceof BaseLanguageModel) return true
    // ESM plugins and the CommonJS host can load separate LangChain constructors.
    // Check the language-model callback contract, not just Runnable membership.
    if (
        !model ||
        typeof model !== 'object' ||
        !('lc_namespace' in model) ||
        !Array.isArray(model.lc_namespace) ||
        model.lc_namespace[0] !== 'langchain' ||
        !['chat_models', 'llms'].includes(model.lc_namespace[1]) ||
        !('generatePrompt' in model) ||
        typeof model.generatePrompt !== 'function' ||
        !('invoke' in model) ||
        typeof model.invoke !== 'function' ||
        !('stream' in model) ||
        typeof model.stream !== 'function' ||
        !('_modelType' in model) ||
        typeof model._modelType !== 'function' ||
        !['base_chat_model', 'base_llm'].includes(model._modelType())
    )
        return false
    if (!('callbacks' in model) || model.callbacks == null || Array.isArray(model.callbacks)) return true
    const callbacks = model.callbacks
    return (
        typeof callbacks === 'object' &&
        'copy' in callbacks &&
        typeof callbacks.copy === 'function' &&
        'addHandler' in callbacks &&
        typeof callbacks.addHandler === 'function'
    )
}

export function createNativeModelBudgetGate(
    commands: CommandBus,
    actor: PipelineModelBudgetActor,
    resolveExecutionId?: () => string | undefined
) {
    const active = new Map<string, PipelineModelBudgetCall>()
    const callback = BaseCallbackHandler.fromMethods({
        handleLLMStart: async (_llm, _prompts, requestId) => {
            const configured = AsyncLocalStorageProviderSingleton.getRunnableConfig()?.configurable?.executionId
            const executionId = resolveExecutionId?.() ?? (typeof configured === 'string' ? configured : undefined)
            if (!executionId) return
            const call = { actor, executionId, requestId }
            if (await commands.execute(new AdmitPipelineModelCallCommand(call))) {
                // Eviction only loses local reconciliation; its database hold is retained, never released.
                if (active.size >= 4096) active.delete(active.keys().next().value)
                active.set(requestId, call)
            }
        }
    })
    callback.name = 'pipeline_native_model_budget'
    callback.awaitHandlers = true
    callback.raiseError = true
    return {
        attach(model: unknown) {
            if (!supportsModelCallbacks(model))
                throw new Error(
                    t('server-ai:Error.ProjectPipelineModelGateUnsupported', {
                        defaultValue: 'This model client does not support native model admission callbacks.'
                    })
                )
            const callbacks = model.callbacks
            if (!callbacks) model.callbacks = [callback]
            else if (Array.isArray(callbacks)) model.callbacks = [callback, ...callbacks]
            else {
                const manager = callbacks.copy()
                manager.addHandler(callback, true)
                model.callbacks = manager
            }
            return model
        },
        async record(requestId: string | undefined, usage: TLLMUsage | undefined) {
            const call = requestId && active.get(requestId)
            if (
                !call ||
                !usage ||
                usage.type === 'estimated' ||
                !Number.isSafeInteger(usage.totalTokens) ||
                usage.totalTokens <= 0
            )
                return
            await commands.execute(new SettlePipelineModelCallCommand({ ...call, actualTokens: usage.totalTokens }))
            active.delete(requestId)
        }
    }
}
