// Platform actions provision Projects without an Agent invocation. Register the
// host-authorized lifecycle API in the platform registry, not only a scoped one.
import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ProjectProvisioningRuntimeCapability, type ProjectProvisioningApi } from '@xpert-ai/plugin-sdk'
import { RuntimeCapabilityProvider } from '../../shared/runtime/runtime-capability-provider.decorator'
import { EnsureXpertProjectCommand } from '../commands/ensure-project.command'
import { XpertProjectPurgeService } from './project-purge.service'

@Injectable()
@RuntimeCapabilityProvider(ProjectProvisioningRuntimeCapability)
export class ProjectProvisioningRuntimeService implements ProjectProvisioningApi {
    constructor(
        private readonly commandBus: CommandBus,
        private readonly projects: XpertProjectPurgeService
    ) {}

    ensure(input: Parameters<ProjectProvisioningApi['ensure']>[0]) {
        return this.commandBus.execute(new EnsureXpertProjectCommand(input))
    }

    purge(input: Parameters<NonNullable<ProjectProvisioningApi['purge']>>[0]) {
        return this.projects.purge(input)
    }
}
