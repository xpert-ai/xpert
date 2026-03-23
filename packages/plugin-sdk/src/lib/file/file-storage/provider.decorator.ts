import { applyDecorators, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '../../types'

export const FILE_STORAGE_PROVIDER = 'FILE_STORAGE_PROVIDER'

export const FileStorageProvider = (provider: string) =>
  applyDecorators(SetMetadata(FILE_STORAGE_PROVIDER, provider), SetMetadata(STRATEGY_META_KEY, FILE_STORAGE_PROVIDER))
