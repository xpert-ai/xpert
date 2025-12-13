import { applyDecorators, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '../../types'

export const KNOWLEDGE_STRATEGY = 'KNOWLEDGE_STRATEGY'

export const KnowledgeStrategyKey = (provider: string) =>
  applyDecorators(
    SetMetadata(KNOWLEDGE_STRATEGY, provider),
    SetMetadata(STRATEGY_META_KEY, KNOWLEDGE_STRATEGY)
  );
