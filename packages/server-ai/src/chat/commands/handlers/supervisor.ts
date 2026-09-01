import { LanguageModelLike } from '@langchain/core/language_models/base'
import { BaseChatModel, BindToolsInput } from '@langchain/core/language_models/chat_models'

export type OutputMode = 'full_history' | 'last_message'
export const PROVIDERS_WITH_PARALLEL_TOOL_CALLS_PARAM = new Set(['ChatOpenAI'])

// type guards
type ChatModelWithBindTools = BaseChatModel & {
    bindTools(tools: BindToolsInput[], kwargs?: unknown): LanguageModelLike
}

type ChatModelWithParallelToolCallsParam = BaseChatModel & {
    bindTools(
        tools: BindToolsInput[],
        kwargs?: { parallel_tool_calls?: boolean } & Record<string, unknown>
    ): LanguageModelLike
}

export function isChatModelWithBindTools(llm: LanguageModelLike): llm is ChatModelWithBindTools {
    return (
        '_modelType' in llm &&
        typeof llm._modelType === 'function' &&
        llm._modelType() === 'base_chat_model' &&
        'bindTools' in llm &&
        typeof llm.bindTools === 'function'
    )
}

export function isChatModelWithParallelToolCallsParam(
    llm: ChatModelWithBindTools
): llm is ChatModelWithParallelToolCallsParam {
    return llm.bindTools.length >= 2
}

export const Instruction = `Please answer in '{{sys.language}}'`
export const PlanInstruction = ``
export const ProjectTaskInstruction = `
You coordinate work within the current Xpert Project. Project experts are peers; do not claim a privileged role above them. Treat the project task ledger as the source of truth for work status.
- Use project_list_tasks before planning or reporting project work.
- Use project_create_tasks for new work and keep each task's steps current with project_update_tasks.
- When delegating a task to another project expert, pass the exact taskId to the handoff tool so the execution context is linked to that task.
- Report only execution states and outputs that are present in the project task context; never invent completion results.
`
