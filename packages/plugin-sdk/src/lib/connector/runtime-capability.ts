import { createRuntimeCapability } from '../core'
import type { ConnectorRuntimeApi } from './strategy.interface'

export const ConnectorRuntimeCapability = createRuntimeCapability<ConnectorRuntimeApi>('platform.connector', {
  description: 'Resolve workspace connector credentials for agent middleware.'
})
