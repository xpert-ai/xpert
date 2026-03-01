import {
  createOperationGuardedPermissionService,
  PluginServicePermissionHandler,
  registerPluginServicePermissionHandler,
  resolvePermissionOperations
} from '@metad/server-core'
import {
  HANDOFF_PERMISSION_SERVICE_TOKEN,
  HANDOFF_QUEUE_SERVICE_TOKEN,
  HandoffPermissionOperation,
  HandoffPermissionService,
  Permissions
} from '@xpert-ai/plugin-sdk'

const HANDOFF_ALL_OPERATIONS = ['enqueue', 'wait'] as const

function resolveHandoffOperations(permissions: Permissions): Set<HandoffPermissionOperation> {
  return resolvePermissionOperations<HandoffPermissionOperation>(
    permissions,
    'handoff',
    HANDOFF_ALL_OPERATIONS,
    (operation): operation is HandoffPermissionOperation =>
      operation === 'enqueue' || operation === 'wait'
  )
}

function createGuardedHandoffPermissionService(
  pluginName: string,
  service: HandoffPermissionService,
  permissions: Permissions
): HandoffPermissionService {
  return createOperationGuardedPermissionService<HandoffPermissionOperation, HandoffPermissionService>(
    pluginName,
    'handoff',
    service,
    permissions,
    resolveHandoffOperations
  )
}

const HANDOFF_PLUGIN_SERVICE_PERMISSION_HANDLER: PluginServicePermissionHandler = {
  token: HANDOFF_PERMISSION_SERVICE_TOKEN,
  permissionType: 'handoff',
  resolveToken: HANDOFF_QUEUE_SERVICE_TOKEN,
  cacheKey: 'handoff',
  createGuardedService: (pluginName, resolvedService, permissions) =>
    createGuardedHandoffPermissionService(
      pluginName,
      resolvedService as HandoffPermissionService,
      permissions
    ),
  unavailableMessage: (pluginName) =>
    `Plugin '${pluginName}' attempted to resolve handoff service but it is not available.`
}

export function registerHandoffPluginServicePermissionHandler(): void {
  registerPluginServicePermissionHandler(HANDOFF_PLUGIN_SERVICE_PERMISSION_HANDLER)
}
