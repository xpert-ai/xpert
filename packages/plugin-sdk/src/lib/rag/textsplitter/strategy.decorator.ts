import { applyDecorators, SetMetadata } from '@nestjs/common';
import { STRATEGY_META_KEY } from '../../types';

export const TEXT_SPLITTER_STRATEGY = 'TEXT_SPLITTER_STRATEGY';

export const TextSplitterStrategy = (provider: string) =>
  applyDecorators(
    SetMetadata(TEXT_SPLITTER_STRATEGY, provider),
    SetMetadata(STRATEGY_META_KEY, TEXT_SPLITTER_STRATEGY)
  );