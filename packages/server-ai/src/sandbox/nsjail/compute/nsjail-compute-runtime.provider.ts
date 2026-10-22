import { Injectable } from '@nestjs/common'
import { SandboxRuntimeProviderStrategy } from '@xpert-ai/plugin-sdk'
import {
    COMPUTE_RUNTIME_PROFILE,
    SandboxRuntimeDefinitionRegistry
} from '../../sandbox-job/sandbox-runtime-definition.registry'
import { NsjailJobRuntimeProvider } from '../nsjail-job-runtime.provider'
import { NSJAIL_COMPUTE_BINDING, NSJAIL_COMPUTE_PROVIDER } from './compute-contract'

@Injectable()
@SandboxRuntimeProviderStrategy(NSJAIL_COMPUTE_PROVIDER)
export class NsjailComputeRuntimeProvider extends NsjailJobRuntimeProvider {
    constructor(definitions: SandboxRuntimeDefinitionRegistry) {
        super(definitions, NSJAIL_COMPUTE_PROVIDER, [
            {
                name: COMPUTE_RUNTIME_PROFILE,
                bindingId: NSJAIL_COMPUTE_BINDING,
                route: '/v1/compute',
                healthTimeoutMs: 15_000,
                digest: 'runner'
            }
        ])
    }
}
