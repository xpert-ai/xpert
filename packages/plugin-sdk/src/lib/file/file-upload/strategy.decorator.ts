import { applyDecorators, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '../../types'

export const FILE_UPLOAD_TARGET_STRATEGY = 'FILE_UPLOAD_TARGET_STRATEGY'

export const FileUploadTargetStrategy = (type: string) =>
  applyDecorators(
    SetMetadata(FILE_UPLOAD_TARGET_STRATEGY, type),
    SetMetadata(STRATEGY_META_KEY, FILE_UPLOAD_TARGET_STRATEGY)
  )
