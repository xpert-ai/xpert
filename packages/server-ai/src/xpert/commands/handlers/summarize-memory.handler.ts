import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseMessage, HumanMessage } from '@langchain/core/messages'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { SearchItem } from '@langchain/langgraph-checkpoint'
import {
    channelName,
    figureOutXpert,
    IXpert,
    IXpertAgent,
    LongTermMemoryTypeEnum,
    MemoryAudienceEnum,
    MEMORY_PROFILE_PROMPT,
    MEMORY_QA_PROMPT,
    TSummaryMemoryRef,
    TLongTermMemoryConfig,
    TMessageChannel
} from '@metad/contracts'
import { Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import z from 'zod'
import { assignExecutionUsage, XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { XpertAgentExecutionStateQuery } from '../../../xpert-agent-execution/queries'
import { ActiveMemoryMiddleware, MemoryRegistry, resolveActiveMemoryMiddleware } from '../../../xpert-memory'
import { formatMemories } from '../../../copilot-store'
import { GetXpertAgentQuery, GetXpertChatModelQuery } from '../../queries'
import { XpertService } from '../../xpert.service'
import { XpertSummarizeMemoryCommand } from '../summarize-memory.command'
import { AgentStateAnnotation } from '../../../shared'
import { MemoryWriteDecision } from '../../../xpert-memory/types'

const MEMORY_WRITE_DECISION_SCHEMA = z.object({
    action: z.enum(['noop', 'upsert', 'archive']).default('noop'),
    kind: z.nativeEnum(LongTermMemoryTypeEnum).optional(),
    audience: z.nativeEnum(MemoryAudienceEnum).nullable().optional(),
    memoryId: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
    context: z.string().nullable().optional(),
    tags: z.array(z.string()).nullable().optional(),
    reason: z.string().nullable().optional()
})

@CommandHandler(XpertSummarizeMemoryCommand)
export class XpertSummarizeMemoryHandler implements ICommandHandler<XpertSummarizeMemoryCommand> {
    readonly #logger = new Logger(XpertSummarizeMemoryHandler.name)

    constructor(
        private readonly xpertService: XpertService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly memoryRegistry: MemoryRegistry,
        private readonly agentMiddlewareRegistry: AgentMiddlewareRegistry
    ) {}

    public async execute(command: XpertSummarizeMemoryCommand) {
        const { id, threadId, executionId } = command
        const { types, userId } = command.options
        const xpert = await this.xpertService.findOne(id, { relations: ['agent'] })

        const primaryAgent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(
            new GetXpertAgentQuery(xpert.id, xpert.agent.key, command.options?.isDraft)
        )
        if (!primaryAgent) {
            throw new NotFoundException(
                `Xpert agent not found for '${xpert.name}' and key ${xpert.agent.key} draft is ${command.options?.isDraft}`
            )
        }

        const latestXpert = figureOutXpert(xpert, command.options?.isDraft)
        const activeMemoryMiddleware = resolveActiveMemoryMiddleware(
            latestXpert.graph,
            primaryAgent.key,
            this.agentMiddlewareRegistry
        )
        if (!activeMemoryMiddleware) {
            return []
        }

        const memory = primaryAgent.team.memory
        if (!hasEnabledSummaryMemory(memory)) {
            return []
        }

        const summarizedState = await this.queryBus.execute<
            XpertAgentExecutionStateQuery,
            typeof AgentStateAnnotation.State
        >(new XpertAgentExecutionStateQuery(executionId))
        if (!summarizedState) {
            return []
        }

        const execution = await this.commandBus.execute(
            new XpertAgentExecutionUpsertCommand({
                xpertId: xpert.id
            })
        )

        const abortController = new AbortController()
        const chatModel = await this.queryBus.execute<GetXpertChatModelQuery, BaseChatModel>(
            new GetXpertChatModelQuery(primaryAgent.team, primaryAgent, {
                abortController,
                usageCallback: assignExecutionUsage(execution),
                threadId
            })
        )

        const memoryKeys: TSummaryMemoryRef[] = []
        if (types.includes(LongTermMemoryTypeEnum.QA) && memory.qa?.enabled) {
            const memoryKey = await this.summarizeType(xpert, primaryAgent, LongTermMemoryTypeEnum.QA, memory.qa, {
                chatModel,
                userId,
                executionId,
                summarizedState,
                activeMemoryMiddleware
            })
            if (memoryKey) {
                memoryKeys.push(memoryKey)
            }
        }

        if (types.includes(LongTermMemoryTypeEnum.PROFILE) && memory.profile?.enabled) {
            const memoryKey = await this.summarizeType(
                xpert,
                primaryAgent,
                LongTermMemoryTypeEnum.PROFILE,
                memory.profile,
                {
                    chatModel,
                    userId,
                    executionId,
                    summarizedState,
                    activeMemoryMiddleware
                }
            )
            if (memoryKey) {
                memoryKeys.push(memoryKey)
            }
        }

        await this.commandBus.execute(new XpertAgentExecutionUpsertCommand(execution))
        return memoryKeys
    }

    private async summarizeType(
        xpert: IXpert,
        agent: IXpertAgent,
        type: LongTermMemoryTypeEnum,
        memory: TLongTermMemoryConfig,
        options: {
            chatModel: BaseChatModel
            userId: string
            executionId: string
            summarizedState: typeof AgentStateAnnotation.State
            activeMemoryMiddleware: ActiveMemoryMiddleware
        }
    ) {
        const { chatModel, userId, executionId, summarizedState, activeMemoryMiddleware } = options
        const channel = channelName(agent.key)
        const { summary, messages } = (summarizedState[channel] ?? summarizedState) as TMessageChannel
        const providerName = activeMemoryMiddleware.providerName
        const memoryProvider = this.memoryRegistry.getProvider(providerName)
        if (!memoryProvider) {
            this.#logger.warn(
                `Memory provider "${providerName}" is unavailable while summarizing memory for xpert ${xpert.id}.`
            )
            return null
        }
        const scope = memoryProvider.resolveScope(xpert)
        const conversationText = summarizeMessages(messages)
        const candidates = await memoryProvider.search(xpert.tenantId, scope, {
            kinds: [type],
            userId,
            audience: 'all',
            text: conversationText,
            includeArchived: false,
            includeFrozen: false,
            limit: 5
        })
        const candidateMemories = candidates.map((item) => memoryProvider.toSearchItem(item))
        const systemTemplate = buildSystemTemplate(agent.prompt, summary)
        const systemMessage = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
            templateFormat: 'mustache'
        }).format({ ...summarizedState })
        const prompt = buildWriteDecisionPrompt(type, memory.prompt, candidateMemories)

        const rawDecision = await chatModel
            .withStructuredOutput(MEMORY_WRITE_DECISION_SCHEMA)
            .invoke([systemMessage, ...(messages ?? []), new HumanMessage(prompt)])
        const decision = normalizeDecision(type, rawDecision)

        switch (decision.action) {
            case 'archive': {
                if (!decision.memoryId) {
                    return null
                }
                await memoryProvider.applyGovernance(xpert.tenantId, scope, decision.memoryId, 'archive', userId, {
                    userId,
                    audience: 'all'
                })
                return null
            }
            case 'upsert': {
                if (!decision.title || !decision.content) {
                    return null
                }
                const record = await memoryProvider.upsert(xpert.tenantId, {
                    scope,
                    audience: decision.audience,
                    ownerUserId: decision.audience === MemoryAudienceEnum.USER ? userId : undefined,
                    kind: type,
                    memoryId: decision.memoryId,
                    title: decision.title,
                    content: decision.content,
                    context: decision.context,
                    tags: decision.tags,
                    source: 'summary',
                    sourceRef: `execution:${executionId}`,
                    createdBy: userId
                })
                return {
                    providerName,
                    memoryId: record.id,
                    audience: record.audience,
                    ownerUserId: record.ownerUserId ?? undefined
                }
            }
            default:
                return null
        }
    }
}

function hasEnabledSummaryMemory(
    memory?: {
        profile?: { enabled?: boolean } | null
        qa?: { enabled?: boolean } | null
    } | null
) {
    return !!(memory?.profile?.enabled || memory?.qa?.enabled)
}

function buildSystemTemplate(agentPrompt: string, summary?: string) {
    let systemTemplate = `${agentPrompt}`
    if (summary) {
        systemTemplate += `\nSummary of conversation earlier:\n${summary}`
    }
    return systemTemplate
}

function buildWriteDecisionPrompt(
    type: LongTermMemoryTypeEnum,
    customPrompt: string | undefined,
    candidateMemories: SearchItem[]
) {
    const basePrompt = customPrompt || (type === LongTermMemoryTypeEnum.QA ? MEMORY_QA_PROMPT : MEMORY_PROFILE_PROMPT)
    const formatHint =
        type === LongTermMemoryTypeEnum.QA
            ? `For qa memories:
- title must be the canonical user question
- content must be the best answer or standard reply
- context is optional`
            : `For profile memories:
- title should be a short label
- content should be the durable preference, rule, or profile fact
- context is optional`

    return `${basePrompt}

You are writing file-backed long-term memory for kind "${type}".

Return exactly one action object:
- action="noop" when there is nothing worth saving
- action="upsert" when there is a durable memory to create or update. Include audience="user" for personal preferences and audience="shared" for shared business rules or standard replies.
- action="archive" when one existing memory is wrong, obsolete, or should be removed from normal use

${formatHint}

If you update an existing memory, reuse its memoryId.
Choose audience="user" for personal habits, preferences, and user-specific context.
Choose audience="shared" for project rules, standard talk tracks, reusable semantics, and team conventions.
If there is no candidate memory worth changing, create a new one or return noop.

Existing candidate memories:
<memories>
${candidateMemories.length ? formatMemories(candidateMemories) : 'None'}
</memories>`
}

function normalizeDecision(
    type: LongTermMemoryTypeEnum,
    payload: z.infer<typeof MEMORY_WRITE_DECISION_SCHEMA>
): MemoryWriteDecision {
    const action = payload?.action ?? 'noop'
    if (action === 'archive' && payload.memoryId) {
        return {
            action: 'archive',
            memoryId: payload.memoryId,
            reason: payload.reason
        }
    }

    if (action === 'upsert') {
        const title = payload.title?.trim()
        const content = payload.content?.trim()
        if (!title || !content) {
            return { action: 'noop' }
        }
        return {
            action: 'upsert',
            kind: payload.kind ?? type,
            audience: payload.audience ?? undefined,
            memoryId: payload.memoryId,
            title,
            content,
            context: payload.context?.trim(),
            tags: payload.tags?.filter(Boolean)
        }
    }

    return { action: 'noop' }
}

function summarizeMessages(messages: BaseMessage[] = []) {
    return messages
        .map((message) => {
            const type = message.getType()
            const content = Array.isArray(message.content)
                ? message.content
                      .map((item) => (typeof item === 'string' ? item : 'text' in item ? item.text : ''))
                      .join('\n')
                : typeof message.content === 'string'
                  ? message.content
                  : ''
            return `[${type}] ${content}`.trim()
        })
        .join('\n')
        .slice(0, 4000)
}
