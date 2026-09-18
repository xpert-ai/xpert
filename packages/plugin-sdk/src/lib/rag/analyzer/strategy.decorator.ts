import { applyDecorators, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '../../types'

export const KEYWORD_ANALYZER_STRATEGY = 'KEYWORD_ANALYZER_STRATEGY'
export const KeywordAnalyzerStrategy = (provider: string) =>
  applyDecorators(
    SetMetadata(KEYWORD_ANALYZER_STRATEGY, provider),
    SetMetadata(STRATEGY_META_KEY, KEYWORD_ANALYZER_STRATEGY)
  )
