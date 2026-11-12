import {
    IWFNMiddleware,
    ModelFeature,
    TXpertTeamDraft,
    TXpertTeamNode,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { BadRequestException, Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import {
    AssistantCapabilityProvider,
    AssistantCapabilityApplyContext,
    AssistantCapabilityContext,
    IAssistantCapabilityProvider,
    applyAssistantMiddleware,
    hasAssistantMiddleware
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { SandboxService } from '../../sandbox/sandbox.service'
import { REQUEST_USER_INPUT_MIDDLEWARE_NAME } from '../../shared/agent/user-input'
import { EventNameXpertValidate, type XpertDraftValidateEvent } from '../../xpert/types'

@Injectable()
@AssistantCapabilityProvider('request-user-input')
export class RequestUserInputCapabilityProvider implements IAssistantCapabilityProvider {
    readonly key = 'request-user-input'
    readonly availableForBlankAssistant = true
    readonly requiredModelFeatures = [ModelFeature.TOOL_CALL]
    readonly label = { en_US: 'Ask for user input', zh_Hans: '向用户提问' }
    readonly description = {
        en_US: 'Allow the primary Agent to request missing information and wait for a reply in any run.',
        zh_Hans: '允许主 Agent 在任意入口发起的任务中询问缺少的信息，并等待用户回答。'
    }
    isEnabled(draft: TXpertTeamDraft) {
        return hasAssistantMiddleware(draft, REQUEST_USER_INPUT_MIDDLEWARE_NAME)
    }
    async check({ draft }: AssistantCapabilityContext) {
        const options = primaryAgent(draft).entity.options
        const available = !options?.hidden && !options?.structuredOutputMethod
        return { available, reason: available ? undefined : t('server-ai:UserInput.UnsupportedAgent') }
    }
    async apply(context: AssistantCapabilityApplyContext) {
        const availability = await this.check(context)
        if (!availability.available) throw new BadRequestException(availability.reason)
        const { draft } = context
        applyAssistantMiddleware(draft, {
            provider: REQUEST_USER_INPUT_MIDDLEWARE_NAME,
            key: 'Capability_RequestUserInput',
            title: 'Ask for user input',
            instructions: ''
        })
    }

    @OnEvent(EventNameXpertValidate, { suppressErrors: false })
    validateDraft({ draft }: XpertDraftValidateEvent) {
        const middlewareKeys = new Set(
            draft.nodes
                .filter(
                    (node) =>
                        node.type === 'workflow' &&
                        node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE &&
                        (node.entity as IWFNMiddleware).provider === REQUEST_USER_INPUT_MIDDLEWARE_NAME
                )
                .map(({ key }) => key)
        )
        for (const connection of draft.connections) {
            if (connection.type !== 'workflow' || !middlewareKeys.has(connection.to.split('/')[0])) continue
            const node = draft.nodes.find((node) => node.type === 'agent' && node.key === connection.from)
            if (
                node?.type !== 'agent' ||
                node.key !== draft.team.agent?.key ||
                node.entity.options?.hidden ||
                node.entity.options?.structuredOutputMethod
            ) {
                throw new BadRequestException(t('server-ai:UserInput.UnsupportedAgent'))
            }
        }
        return []
    }
}

@Injectable()
@AssistantCapabilityProvider('desktop-shell')
export class DesktopShellCapabilityProvider implements IAssistantCapabilityProvider {
    readonly key = 'desktop-shell'
    readonly availableForBlankAssistant = true
    readonly requiredModelFeatures = [ModelFeature.TOOL_CALL]
    readonly label = { en_US: 'Local command line', zh_Hans: '本机命令行' }
    readonly description = {
        en_US: 'Run commands on this computer in Bosi. Each operation follows your local approval policy.',
        zh_Hans: '在 Bosi 中使用此电脑的命令行，每次操作仍遵循本机授权设置。'
    }
    isEnabled(draft: TXpertTeamDraft) {
        return hasMiddleware(draft, 'DesktopShell')
    }
    async check() {
        return { available: true }
    }
    async apply({ draft }: AssistantCapabilityApplyContext) {
        addMiddleware(draft, 'DesktopShell', { desktop_shell: true })
        appendPrompt(
            draft,
            'For local commands, call desktop_shell directly; Bosi connects on demand and requests approval according to local policy. If denied or unavailable, stop; never bypass approval or substitute the cloud sandbox. Omit cwd if unknown. Do not inspect credentials or unrelated private files.'
        )
    }
}

@Injectable()
@AssistantCapabilityProvider('sandbox-tools')
export class SandboxToolsCapabilityProvider implements IAssistantCapabilityProvider {
    readonly key = 'sandbox-tools'
    readonly availableForBlankAssistant = true
    readonly requiredModelFeatures = [ModelFeature.TOOL_CALL]
    readonly label = { en_US: 'Server sandbox', zh_Hans: '服务端沙箱' }
    readonly description = {
        en_US: 'Use the platform sandbox for commands and files, separate from your computer.',
        zh_Hans: '在平台配置的沙箱中执行命令、处理文件，与本机环境分开。'
    }
    isEnabled(draft: TXpertTeamDraft) {
        return hasMiddleware(draft, 'SandboxShell') && hasMiddleware(draft, 'SandboxFile')
    }
    constructor(private readonly sandbox: SandboxService) {}
    async check({ draft, sandboxProviders }: AssistantCapabilityContext) {
        const providers = await this.sandbox.listProviders()
        const desired = draft.team.features?.sandbox?.provider
        const available = providers.some(
            ({ type }) =>
                (!desired || type === desired) &&
                (!sandboxProviders || sandboxProviders.some((item) => item.type === type))
        )
        return { available, reason: available ? undefined : t('server-ai:Error.AssistantSandboxUnavailable') }
    }
    async apply({ draft }: AssistantCapabilityApplyContext) {
        const provider = draft.team.features?.sandbox?.provider ?? (await this.sandbox.getDefaultProviderType())
        if (!provider) throw new BadRequestException(t('server-ai:Error.AssistantSandboxUnavailable'))
        draft.team.features = { ...draft.team.features, sandbox: { enabled: true, provider } }
        addMiddleware(draft, 'SandboxShell')
        addMiddleware(draft, 'SandboxFile')
        appendPrompt(
            draft,
            "Sandbox commands and files run on the server, not the user's computer. On a clear DNS or network error, explain that external access may be unavailable and stop repeating requests to that destination."
        )
    }
}

function primaryAgent(draft: TXpertTeamDraft) {
    const node = draft.nodes.find((node) => node.type === 'agent' && node.key === draft.team.agent?.key)
    if (node?.type !== 'agent') throw new BadRequestException(t('server-ai:Error.TemplateCapabilityDraftInvalid'))
    return node
}

function addMiddleware(draft: TXpertTeamDraft, provider: string, tools?: { [key: string]: boolean }) {
    const agent = primaryAgent(draft)
    if (
        draft.nodes
            .filter(isMiddleware)
            .some(
                (node) =>
                    node.entity.provider === provider &&
                    draft.connections.some((edge) => edge.from === agent.key && edge.to === node.key)
            )
    )
        return
    const key = `Capability_${provider}`
    const entity: IWFNMiddleware = {
        id: key,
        key,
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        title: provider,
        provider,
        required: true,
        options: {},
        ...(tools ? { tools } : {})
    }
    draft.nodes.push({ type: 'workflow', key, position: { x: 620, y: 160 * (draft.nodes.length - 1) }, entity })
    draft.connections.push({ key: `${agent.key}/${key}`, type: 'workflow', from: agent.key, to: key, required: true })
    agent.entity.options = {
        ...agent.entity.options,
        parallelToolCalls: false,
        middlewares: {
            ...agent.entity.options?.middlewares,
            order: [...(agent.entity.options?.middlewares?.order ?? []), key]
        }
    }
}

function appendPrompt(draft: TXpertTeamDraft, instruction: string) {
    const agent = primaryAgent(draft)
    if (!agent.entity.prompt?.includes(instruction))
        agent.entity.prompt = [agent.entity.prompt, instruction].filter(Boolean).join('\n\n')
}

function isMiddleware(node: TXpertTeamNode): node is TXpertTeamNode<'workflow'> & { entity: IWFNMiddleware } {
    return node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE
}

function hasMiddleware(draft: TXpertTeamDraft, provider: string) {
    return draft.nodes
        .filter(isMiddleware)
        .some(
            (node) =>
                node.entity.provider === provider &&
                draft.connections.some(
                    (edge) => edge.type === 'workflow' && edge.from === draft.team.agent?.key && edge.to === node.key
                )
        )
}
