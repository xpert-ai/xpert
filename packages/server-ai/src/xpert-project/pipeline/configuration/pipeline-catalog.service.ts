import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { t } from 'i18next'
import {
    configureProjectPipelineFromForm,
    canReadProjectPipelineConfiguration,
    projectPipelineCatalogConfigureSchema,
    projectPipelineCatalogRequestSchema,
    type ProjectPipelineCatalogRequest,
    type ProjectPipelineCatalog,
    type ProjectPipelineCatalogConfigure
} from '@xpert-ai/contracts'
import {
    ProjectPipelineCatalogRuntimeCapability,
    ProjectPipelineContributionRegistry,
    type ProjectPipelineCatalogApi,
    type ProjectPipelineContext
} from '@xpert-ai/plugin-sdk'
import { RuntimeCapabilityProvider } from '../../../shared/runtime/runtime-capability-provider.decorator'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { ProjectPipelineManagedStartService } from '../runtime/pipeline-managed-start.service'
import { ProjectPipelineAssistantBridgeService } from '../runtime/pipeline-assistant-bridge.service'
import { ProjectPipelineBindingsService } from './pipeline-bindings.service'
import { ProjectPipelineRuntimeBridgeService } from '../runtime/pipeline-runtime-bridge.service'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { pipelineHostCapabilities } from './pipeline-host-capabilities'
import { pipelineCommandCapability } from '../runtime/pipeline-command-authority'

@Injectable()
@RuntimeCapabilityProvider(ProjectPipelineCatalogRuntimeCapability)
export class ProjectPipelineCatalogService implements ProjectPipelineCatalogApi {
    constructor(
        private readonly access: ProjectAccessRuntimeService,
        private readonly contributions: ProjectPipelineContributionRegistry,
        private readonly launch: ProjectPipelineManagedStartService,
        private readonly assistants: ProjectPipelineAssistantBridgeService,
        private readonly saved: ProjectPipelineBindingsService,
        private readonly runtimes: ProjectPipelineRuntimeBridgeService
    ) {}

    bindings(
        context: ProjectPipelineContext,
        input?: ProjectPipelineCatalogRequest & { after?: string; limit?: number }
    ) {
        return this.saved.list(context, input)
    }
    binding(context: ProjectPipelineContext, bindingId: string, input?: ProjectPipelineCatalogRequest) {
        return this.saved.get(context, bindingId, input)
    }

    async list(
        context: ProjectPipelineContext,
        request: ProjectPipelineCatalogRequest = {}
    ): Promise<ProjectPipelineCatalog> {
        const input = projectPipelineCatalogRequestSchema.parse(request)
        const access = (await this.access.listReadable({ actor: context.actor, projectIds: [context.projectId] }))[0]
        if (!access) throw new ForbiddenException(t('server-ai:Error.ProjectManagerRequired'))
        const capability = pipelineCommandCapability('configure')
        const commandMetadata = input.protocol === 3 ? { commandCapability: capability } : {}
        if (!access.canManage) return { canManage: false, items: [], assistants: [], ...commandMetadata }
        const assistants: ProjectPipelineCatalog['assistants'] = []
        for (const id of new Set(access.assistantIds)) {
            try {
                const target = await this.assistants.candidate(context, id)
                if (!assistants.some((item) => item.id === target.id)) assistants.push(target)
            } catch (error) {
                // A bound Assistant may have been unpublished or revoked. Other failures must remain visible.
                if (!(error instanceof ForbiddenException || error instanceof NotFoundException)) throw error
            }
        }
        const runtimeBindings =
            RequestContext.currentApiPrincipal()?.principalType === 'client_secret'
                ? []
                : await this.runtimes.candidates(context)
        return {
            canManage: true,
            ...commandMetadata,
            assistants,
            runtimeBindings,
            ...(input.protocol !== undefined ? { hostCapabilities: pipelineHostCapabilities() } : {}),
            items: this.contributions.listForActor(context.actor).flatMap((contribution) =>
                contribution.configurations
                    .map((configuration) => ({
                        contributionKey: contribution.key,
                        configuration,
                        form: contribution.forms?.find((form) => form.templateRef === configuration.binding.templateRef)
                    }))
                    .filter((item) => canReadProjectPipelineConfiguration(item.configuration, input, item.form))
            )
        }
    }

    async configure(context: ProjectPipelineContext, request: ProjectPipelineCatalogConfigure) {
        const input = projectPipelineCatalogConfigureSchema.parse(request)
        await this.access.assertManage(context)
        const contribution = this.contributions
            .listForActor(context.actor)
            .find((item) => item.key === input.contributionKey)
        const source = contribution?.configurations.find((item) => item.binding.templateRef === input.templateRef)
        const form = contribution?.forms?.find((item) => item.templateRef === input.templateRef)
        if (!source || !form) throw new BadRequestException(t('server-ai:Error.ProjectPipelineConfigurationInvalid'))
        let configuration: ReturnType<typeof configureProjectPipelineFromForm>
        try {
            configuration = configureProjectPipelineFromForm(source, form, input)
        } catch {
            throw new BadRequestException(t('server-ai:Error.ProjectPipelineConfigurationInvalid'))
        }
        for (const id of new Set(Object.values(input.assistants))) await this.assistants.resolve(context, id)
        for (const selection of Object.values(input.runtimes ?? {}))
            await this.runtimes.resolve(context, selection.bindingId, selection.workspaceId)
        return this.launch.configure(context, { requestId: input.requestId, configuration })
    }
}
