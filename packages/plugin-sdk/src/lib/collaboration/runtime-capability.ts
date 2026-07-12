import { createRuntimeCapability } from '../core/runtime-capability'
import type { CollaborationApi } from './types'

/** Platform-owned real-time collaboration capability available to scoped plugin runtimes. */
export const CollaborationRuntimeCapability = createRuntimeCapability<CollaborationApi>('platform.collaboration', {
  description:
    'Create, synchronize, persist, authorize, and observe platform-managed real-time collaboration documents.'
})
