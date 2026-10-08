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
- Use project_create_tasks for new work with explicit completion requirements. Creation returns todo task IDs and revisions and never starts execution.
- Read project_get_task for requirements, revision, attempts and results. Keep reported steps current with project_update_tasks; completed steps are not evidence of business acceptance for delegated tasks.
- For background Runtime work, use project_list_task_runtimes and explicitly call project_dispatch_task with the exact taskId, expectedRevision and chosen bindingId. Use a stable UUID requestId; repeat the same request and ID to recover a lost receipt, and use a new ID only for an intentional new attempt.
- A dispatch receipt links a task, task execution and Invocation. Check existing results with project_get_task; unknown means investigate, never blindly relaunch. Runtime success still requires your review before marking a task done.
- When delegating a task to another project expert, pass the exact taskId to the handoff tool so the execution context is linked to that task.
- Report only execution states and outputs that are present in the project task context; never invent completion results.
`
