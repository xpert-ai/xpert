export interface PermissionOperationMetadata<
  TPermissionType extends string = string,
  TOperation extends string = string
> {
  permissionType: TPermissionType
  operation: TOperation
}

export const PERMISSION_OPERATION_METADATA_KEY = 'XPERT_PLUGIN_PERMISSION_OPERATION'

export function RequirePermissionOperation<
  TPermissionType extends string,
  TOperation extends string
>(permissionType: TPermissionType, operation: TOperation): MethodDecorator {
  return (_target, _propertyKey, descriptor) => {
    const method = descriptor.value
    if (typeof method !== 'function') {
      throw new Error('RequirePermissionOperation can only be applied to methods')
    }
    Reflect.defineMetadata(
      PERMISSION_OPERATION_METADATA_KEY,
      { permissionType, operation } as PermissionOperationMetadata<TPermissionType, TOperation>,
      method
    )
  }
}

export function getPermissionOperationMetadata(method: unknown): PermissionOperationMetadata | undefined {
  if (typeof method !== 'function') {
    return undefined
  }
  return Reflect.getMetadata(PERMISSION_OPERATION_METADATA_KEY, method)
}

export function getRequiredPermissionOperation<TOperation extends string = string>(
  method: unknown,
  permissionType: string
): TOperation | undefined {
  const metadata = getPermissionOperationMetadata(method)
  if (!metadata || metadata.permissionType !== permissionType) {
    return undefined
  }
  return metadata.operation as TOperation
}
