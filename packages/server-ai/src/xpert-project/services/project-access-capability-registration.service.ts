import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import {
    ProjectAccessRuntimeCapability,
    type RuntimeCapabilityRegistry,
    XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import { ProjectAccessRuntimeService } from './project-access-runtime.service'

/** Publishes Project access without coupling the Agent runtime module to Project infrastructure. */
@Injectable()
export class ProjectAccessCapabilityRegistrationService implements OnModuleInit {
    constructor(
        @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
        private readonly capabilities: RuntimeCapabilityRegistry,
        private readonly projectAccess: ProjectAccessRuntimeService
    ) {}

    onModuleInit(): void {
        this.capabilities.register(ProjectAccessRuntimeCapability, this.projectAccess)
    }
}
