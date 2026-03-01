import { Permissions, getRequiredPermissionOperation } from '@xpert-ai/plugin-sdk'

interface PermissionWithOperations {
  operations?: unknown
}

export function resolvePermissionOperations<TOperation extends string>(
  permissions: Permissions,
  permissionType: string,
  allOperations: readonly TOperation[],
  isOperation: (operation: string) => operation is TOperation
): Set<TOperation> {
  const permission = permissions.find(
    (item) => item.type === permissionType
  )

  const operations = (permission as PermissionWithOperations | undefined)?.operations
  if (!Array.isArray(operations) || operations.length === 0) {
    return new Set(allOperations)
  }

  return new Set(
    operations.filter(
      (operation): operation is TOperation => typeof operation === 'string' && isOperation(operation)
    )
  )
}

export function createOperationGuardedPermissionService<
  TOperation extends string,
  TService extends object
>(
  pluginName: string,
  permissionType: string,
  service: TService,
  permissions: Permissions,
  resolveAllowedOperations: (permissions: Permissions) => Set<TOperation>
): TService {
  const allowedOperations = resolveAllowedOperations(permissions)
  const methodCache = new Map<PropertyKey, unknown>()

  return new Proxy(service, {
    get(target, property, receiver) {
      const cached = methodCache.get(property)
      if (cached) {
        return cached
      }

      const value = Reflect.get(target as object, property, receiver)
      if (typeof value !== 'function') {
        return value
      }

      const requiredOperation = getRequiredPermissionOperation<TOperation>(value, permissionType)
      const guardedMethod = (...args: any[]) => {
        if (!requiredOperation) {
          throw new Error(
            `Plugin '${pluginName}' attempted to call unannotated ${permissionType} method '${String(property)}'.`
          )
        }
        if (!allowedOperations.has(requiredOperation)) {
          throw new Error(
            `Plugin '${pluginName}' attempted ${permissionType} operation '${requiredOperation}' without declaring it in '${permissionType}.operations'.`
          )
        }
        return value.apply(target, args)
      }

      methodCache.set(property, guardedMethod)
      return guardedMethod
    }
  }) as TService
}
