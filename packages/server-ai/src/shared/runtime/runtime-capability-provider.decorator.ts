import { SetMetadata } from '@nestjs/common'
import type { RuntimeCapabilityKey } from '@xpert-ai/plugin-sdk'

export const RUNTIME_CAPABILITY_PROVIDER = 'XPERT_RUNTIME_CAPABILITY_PROVIDER'

/** Declares the platform runtime capability implemented by a Nest provider. */
export const RuntimeCapabilityProvider = <T>(capability: RuntimeCapabilityKey<T>) =>
    SetMetadata(RUNTIME_CAPABILITY_PROVIDER, capability)
