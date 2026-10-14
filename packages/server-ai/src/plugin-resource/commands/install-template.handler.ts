import { templateBaseline } from '../../xpert-template/lifecycle/template-baseline'
import { AssistantTemplateToolsetBinder } from './assistant-template-toolset-binder.service'
import { TemplateDependencyInstaller } from '../template-installation/template-dependency-installer.service'
import { TemplateReadinessService } from '../template-installation/template-readiness.service'
import {
    AiModelTypeEnum,
    IXpert,
    TCopilotModel,
    TXpertFeatures,
    TXpertTeamConnection,
    TXpertTeamDraft,
    TXpertTeamNode
} from '@xpert-ai/contracts'
import { updateAssistantPrompt } from '../../xpert-template/capabilities/capability-state'
import { randomUUID } from 'node:crypto'
import { t } from 'i18next'
import { BLANK_ASSISTANT_TEMPLATE_ID } from '../../xpert-template/capabilities/blank-assistant-template'
import { parseCapabilityTemplateId } from '../../xpert-template/capabilities/template-capability-reference'
import { getErrorMessage, yaml } from '@xpert-ai/server-common'
import { BadRequestException, Inject, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { EnvironmentService } from '../../environment'
import { XpertImportCommand, XpertImportCommandOptions } from '../../xpert/commands/import.command'
import { XpertPublishCommand } from '../../xpert/commands/publish.command'
import { XpertDraftDslDTO } from '../../xpert/dto'
import { XpertService } from '../../xpert/xpert.service'
import { XpertTemplateWorkspaceInitializer } from '../../xpert/template-workspace-initializer.service'
import { createXpertTemplateSource, resolveXpertTemplateSource } from '../../xpert/template-source'
import { XpertTemplateService } from '../../xpert-template/xpert-template.service'
import { AssistantCapabilityService } from '../../xpert-template/capabilities/assistant-capability.service'
import { capabilityTemplateId } from '../../xpert-template/capabilities/template-capability-reference'
import { XpertWorkspaceAccessService } from '../../xpert-workspace'
import { PluginResourceInstallResult, PluginResourceInstallerService } from '../plugin-resource-installer.service'
import { PluginTemplateInstallCommand, PluginTemplateInstallBasic } from './install-template.command'
import {
    InstallationSourceChangedError,
    templateInstallationSourceHash
} from '../template-installation/template-installation-source'

@CommandHandler(PluginTemplateInstallCommand)
export class PluginTemplateInstallHandler implements ICommandHandler<PluginTemplateInstallCommand> {
    readonly #logger = new Logger(PluginTemplateInstallHandler.name)

    constructor(
        private readonly installer: PluginResourceInstallerService,
        private readonly workspaceAccess: XpertWorkspaceAccessService,
        private readonly xpertTemplateService: XpertTemplateService,
        private readonly templateWorkspaceInitializer: XpertTemplateWorkspaceInitializer,
        private readonly environmentService: EnvironmentService,
        private readonly commandBus: CommandBus,
        private readonly xpertService: XpertService,
        private readonly toolsetBinder: AssistantTemplateToolsetBinder,
        private readonly capabilities: AssistantCapabilityService,
        @Inject(TemplateReadinessService) private readonly readiness: Pick<TemplateReadinessService, 'prepare'>,
        @Inject(TemplateDependencyInstaller)
        private readonly dependencyInstaller: Pick<TemplateDependencyInstaller, 'install'>
    ) {}

    async execute(command: PluginTemplateInstallCommand): Promise<PluginResourceInstallResult> {
        await this.workspaceAccess.assertCanAuthor(command.workspaceId)
        const templateId = capabilityTemplateId(command.templateId, command.capabilities)
        const template = command.locale
            ? await this.xpertTemplateService.getTemplateDetail(templateId, command.language, {
                  locale: command.locale
              })
            : await this.xpertTemplateService.getTemplateDetail(templateId, command.language)
        if (
            command.bootstrap?.expectedSourceHash &&
            command.bootstrap.expectedSourceHash !== templateInstallationSourceHash(template)
        ) {
            throw new InstallationSourceChangedError()
        }
        const prepared = await this.readiness.prepare(template, command.workspaceId, command.bootstrap?.dependencyLocks)
        const source = createXpertTemplateSource(template)
        if (source.manifest?.schemaVersion === 2) delete source.manifest
        const normalized = prepared.normalized
        if (normalized) {
            template.dependencies = normalized.dependencies
            template.export_data = normalized.exportData
        }
        template.manifest = prepared.manifest
        if (!command.bootstrap?.dependencyLocks)
            await command.bootstrap?.onDependenciesLocked?.(prepared.readiness.dependencies)
        if (
            template.manifest?.files &&
            command.basic?.workspaceDataScope &&
            command.basic.workspaceDataScope !== template.manifest.files.scope
        )
            throw new BadRequestException(t('server-ai:Error.TemplateFileScopeConflict'))
        const parsed = yaml.parse(template.export_data) as unknown
        const sandboxProviders = await this.xpertService.getSandboxProviders()
        const draft = this.normalizeDraft(parsed, command.workspaceId, command.basic, sandboxProviders)
        const isBlankTemplate =
            (parseCapabilityTemplateId(template.id)?.templateId ?? template.id) === BLANK_ASSISTANT_TEMPLATE_ID
        if (isBlankTemplate) {
            draft.team.name = `assistant-${command.bootstrap?.newXpertId ?? randomUUID()}`
            const primary = draft.nodes.find((node) => node.type === 'agent' && node.key === draft.team.agent?.key)
            if (primary?.type === 'agent') {
                primary.entity.name = draft.team.name
                primary.entity.title = draft.team.title
            }
        }
        await this.capabilities.prepareInstallation(
            template,
            draft,
            command.language,
            command.capabilities,
            command.basic?.copilotModel,
            sandboxProviders
        )
        if (
            draft.team.features?.sandbox?.enabled &&
            (!prepared.readiness.legacy ||
                (source.manifest?.schemaVersion === 1 && source.manifest.execution?.sandbox === 'server'))
        ) {
            const providers = sandboxProviders.filter(({ type }) => type !== 'local-shell-sandbox')
            if (!providers.length) throw new BadRequestException(t('server-ai:Error.TemplateRequirementsUnmet'))
            draft.team.features = normalizeTemplateSandboxFeatures(
                {
                    ...draft.team.features,
                    sandbox: { ...draft.team.features?.sandbox, enabled: true }
                },
                providers
            )
        }
        await this.capabilities.configureRealtimeVoice(draft, command.basic?.realtimeVoice)
        if (command.basic?.prompt !== undefined) updateAssistantPrompt(draft, command.basic.prompt)
        const importOptions: XpertImportCommandOptions = {
            normalizeCopilotModels: !hasExplicitLlmCopilotModel(command.basic?.copilotModel),
            language: command.language,
            templateId,
            sourceTemplateId: template.id,
            templateSource: {
                ...source,
                baseline: templateBaseline(template.export_data),
                ...(prepared.readiness.legacy ? { dependencyLocks: prepared.readiness.dependencies } : {})
            },
            templateDefinition: normalized?.definition.template,
            dependencyLocks: prepared.readiness.dependencies,
            workspaceDataScope: template.manifest?.files?.scope ?? command.basic?.workspaceDataScope,
            newXpertId: command.bootstrap?.newXpertId
        }
        const resumeXpertId = command.bootstrap?.resumeXpertId
        const resumedXpert = resumeXpertId ? await this.xpertService.findOneByIdWithinTenant(resumeXpertId) : null
        if (!isBlankTemplate && !resumedXpert && command.basic?.name === undefined) {
            // Each installation owns its identity; the source name may already exist.
            draft.team.name = `assistant-${command.bootstrap?.newXpertId ?? randomUUID()}`
        }
        if (!resumedXpert) await command.bootstrap?.onStage?.('importing')
        let xpert =
            resumedXpert ??
            (await this.commandBus.execute<XpertImportCommand, IXpert>(new XpertImportCommand(draft, importOptions)))

        if (
            !xpert.id ||
            xpert.workspaceId !== command.workspaceId ||
            (resumeXpertId && resolveXpertTemplateSource(xpert)?.templateId !== template.id)
        ) {
            throw new BadRequestException(t('server-ai:Error.TemplateInstallResumeMismatch'))
        }
        await command.bootstrap?.onImported({ id: xpert.id })

        // Publishing clears the draft. Recovery must not overwrite a published Assistant
        // or a subsequent user draft when only workspace initialization remains unfinished.
        if (resumedXpert?.publishAt) {
            if (command.bootstrap?.expectedSourceHash && command.publish && !command.bootstrap.publicationCompleted) {
                await command.bootstrap.onStage?.('publishing')
                await this.commandBus.execute(
                    new XpertPublishCommand(xpert.id, false, undefined, '', undefined, undefined, true)
                )
                await command.bootstrap.onPublished?.()
            }
            await command.bootstrap?.onStage?.('initializing')
            const initialization = await this.templateWorkspaceInitializer.initializeByTemplateId(
                command.templateId,
                xpert.workspaceId,
                command.language,
                xpert.id,
                ...(command.bootstrap?.expectedSourceHash ? [template] : [])
            )
            if (command.bootstrap?.expectedSourceHash && initialization?.status === 'failed') {
                throw new Error('Template workspace initialization failed')
            }
            return { installations: [], pendingAuth: [], xpert }
        }

        // An interrupted import may leave an Assistant without its graph.
        if (resumeXpertId && !xpert.draft?.nodes?.length) {
            xpert = await this.commandBus.execute<XpertImportCommand, IXpert>(
                new XpertImportCommand(draft, { ...importOptions, targetXpertId: xpert.id })
            )
        }

        try {
            await command.bootstrap?.onStage?.('dependencies')
            const dependencies = template.dependencies
            const pluginName = template.pluginName
            const components = prepared.components
            const result = await this.dependencyInstaller.install(xpert, components, prepared.readiness.dependencies)
            await this.toolsetBinder.bind(xpert, pluginName, dependencies)
            await command.bootstrap?.onDependenciesInstalled?.(result)
            const environment = command.publish
                ? await this.environmentService.getDefaultByWorkspace(xpert.workspaceId ?? command.workspaceId)
                : null
            if (command.publish) await command.bootstrap?.onStage?.('publishing')
            const installedXpert = command.publish
                ? await this.commandBus.execute<XpertPublishCommand, IXpert>(
                      new XpertPublishCommand(xpert.id, false, environment?.id ?? null, 'Installed from template')
                  )
                : xpert
            if (command.publish) await command.bootstrap?.onPublished?.()
            await command.bootstrap?.onStage?.('initializing')
            const initialization = await this.templateWorkspaceInitializer.initializeByTemplateId(
                command.templateId,
                installedXpert.workspaceId ?? command.workspaceId,
                command.language,
                installedXpert.id,
                ...(command.bootstrap?.expectedSourceHash ? [template] : [])
            )
            if (command.bootstrap?.expectedSourceHash && initialization?.status === 'failed') {
                throw new Error('Template workspace initialization failed')
            }
            return {
                ...result,
                xpert: installedXpert
            }
        } catch (error) {
            if (!command.bootstrap) await this.rollbackTemplateXpert(xpert)
            throw error
        }
    }

    private normalizeDraft(
        value: unknown,
        workspaceId: string,
        basic: PluginTemplateInstallBasic | undefined,
        sandboxProviders: Array<{ type: string }>
    ): XpertDraftDslDTO {
        if (!isObjectValue(value) || !isObjectValue(Reflect.get(value, 'team'))) {
            throw new BadRequestException('Template export_data must be a valid Xpert draft')
        }
        const teamValue = Reflect.get(value, 'team')
        const nodesValue = Reflect.get(value, 'nodes')
        const connectionsValue = Reflect.get(value, 'connections')
        const memoriesValue = Reflect.get(value, 'memories')
        if (!Array.isArray(nodesValue) || !Array.isArray(connectionsValue)) {
            throw new BadRequestException('Template draft must include nodes and connections')
        }

        const team = teamValue as TXpertTeamDraft['team']
        const features = normalizeTemplateSandboxFeatures(team.features, sandboxProviders)
        const { workspaceDataScope: _workspaceDataScope, prompt: _prompt, ...portableBasic } = basic ?? {}
        return new XpertDraftDslDTO({
            team: {
                ...team,
                ...portableBasic,
                ...(features ? { features } : {}),
                workspaceId
            },
            nodes: nodesValue as TXpertTeamNode[],
            connections: connectionsValue as TXpertTeamConnection[],
            // The import handler persists seed memories under the newly created Assistant.
            ...(Array.isArray(memoriesValue) ? { memories: memoriesValue } : {})
        })
    }

    private async rollbackTemplateXpert(xpert: IXpert) {
        if (!xpert.id) {
            return
        }
        try {
            await this.xpertService.delete(xpert.id)
        } catch (error) {
            this.#logger.warn(`Failed to rollback template xpert '${xpert.id}': ${getErrorMessage(error)}`)
        }
    }
}

function isObjectValue(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeNonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeTemplateSandboxFeatures(
    features: TXpertFeatures | undefined,
    sandboxProviders: Array<{ type: string }>
): TXpertFeatures | undefined {
    const sandbox = features?.sandbox
    if (!sandbox?.enabled) {
        return features
    }

    const providerTypes = uniqueStrings(sandboxProviders.map(({ type }) => type))
    const provider = normalizeNonEmptyString(sandbox.provider)
    if (provider && providerTypes.includes(provider)) {
        return features
    }

    const fallbackProvider = providerTypes[0]
    return fallbackProvider
        ? {
              ...features,
              sandbox: {
                  ...sandbox,
                  provider: fallbackProvider
              }
          }
        : features
}

function hasExplicitLlmCopilotModel(copilotModel: TCopilotModel | undefined) {
    const copilotId = normalizeNonEmptyString(copilotModel?.copilotId)
    const model = normalizeNonEmptyString(copilotModel?.model)
    const modelType = copilotModel?.modelType ?? AiModelTypeEnum.LLM

    return !!copilotId && !!model && modelType === AiModelTypeEnum.LLM
}

function uniqueStrings(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value)))
}
