import { Injectable } from '@nestjs/common'
import {
    checkProjectPipelineConfiguration,
    checkProjectPipelineHostCompatibility,
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
        await this.access.assertManage({ actor: context.actor, projectId: context.projectId })
        const result = checkProjectPipelineConfiguration(
            configuration,
            this.contributions.listForActor(context.actor).flatMap((item) => item.descriptors)
        )
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
