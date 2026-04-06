import { applyDecorators, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '../types'

export const VIEW_EXTENSION_PROVIDER = 'VIEW_EXTENSION_PROVIDER'

export const ViewExtensionProvider = (providerKey: string) =>
  applyDecorators(SetMetadata(VIEW_EXTENSION_PROVIDER, providerKey), SetMetadata(STRATEGY_META_KEY, VIEW_EXTENSION_PROVIDER))
