import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import {
    SandboxJobsRuntimeCapability,
    type RuntimeCapabilityRegistry,
    XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import { SandboxJobRuntimeCapabilityService } from './sandbox-job-runtime-capability.service'

/** Publishes the Core Sandbox Jobs implementation through the Plugin SDK capability registry. */
@Injectable()
export class SandboxJobCapabilityRegistrationService implements OnModuleInit {
    constructor(
        @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
        private readonly capabilities: RuntimeCapabilityRegistry,
        private readonly sandboxJobs: SandboxJobRuntimeCapabilityService
    ) {}

    onModuleInit(): void {
        this.capabilities.register(SandboxJobsRuntimeCapability, this.sandboxJobs)
    }
}
