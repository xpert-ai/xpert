import { applyDecorators, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '../types'

export const COLLABORATION_DOCUMENT_PROVIDER = 'COLLABORATION_DOCUMENT_PROVIDER'

/** Register a plugin adapter for one stable collaboration resource type. */
export const CollaborationDocumentProvider = (providerKey: string) =>
  applyDecorators(
    SetMetadata(COLLABORATION_DOCUMENT_PROVIDER, providerKey),
    SetMetadata(STRATEGY_META_KEY, COLLABORATION_DOCUMENT_PROVIDER)
  )
