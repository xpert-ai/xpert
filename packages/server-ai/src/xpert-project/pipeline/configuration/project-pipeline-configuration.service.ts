import { Injectable } from '@nestjs/common'
import {
    checkProjectPipelineConfiguration,
    checkProjectPipelineHostCompatibility,
    isProjectPipelineApplicable,
    type ProjectPipelineConfiguration
} from '@xpert-ai/contracts'
import { pipelineHostCapabilities } from './pipeline-host-capabilities'
import {
    ProjectPipelineContributionRegistry,
    ProjectPipelineConfigurationRuntimeCapability,
    type ProjectPipelineConfigurationApi,
    type ProjectPipelineContext
} from '@xpert-ai/plugin-sdk'
import { RuntimeCapabilityProvider } from '../../../shared/runtime/runtime-capability-provider.decorator'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'

@Injectable()
@RuntimeCapabilityProvider(ProjectPipelineConfigurationRuntimeCapability)
export class ProjectPipelineConfigurationService implements ProjectPipelineConfigurationApi {
    constructor(
        private readonly access: ProjectAccessRuntimeService,
        private readonly contributions: ProjectPipelineContributionRegistry
    ) {}

    async check(context: ProjectPipelineContext, configuration: ProjectPipelineConfiguration) {
        const access = await this.access.assertManage({ actor: context.actor, projectId: context.projectId })
        const contributions = this.contributions.listForActor(context.actor)
        const result = checkProjectPipelineConfiguration(
            configuration,
            contributions.flatMap((item) => item.descriptors)
        )
        const registered = contributions
            .flatMap((item) => item.configurations)
            .find((item) => item.binding.templateRef === configuration.binding.templateRef)
        if (
            !isProjectPipelineApplicable(configuration.template, access) ||
            (registered && !isProjectPipelineApplicable(registered.template, access))
        )
            result.issues.push({ code: 'PIPELINE_PROJECT_TYPE_MISMATCH', path: ['template', 'projectTypes'] })
        result.issues.push(
            ...checkProjectPipelineHostCompatibility(
                configuration.template,
                configuration.binding,
                pipelineHostCapabilities()
            )
        )
        result.valid = result.issues.length === 0
        return result
    }
}
