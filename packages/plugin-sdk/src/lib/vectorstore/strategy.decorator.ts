import { applyDecorators, SetMetadata } from '@nestjs/common';
import { STRATEGY_META_KEY } from '../types';

export const VECTOR_STORE_STRATEGY = 'VECTOR_STORE_STRATEGY';

export const VectorStoreStrategy = (provider: string) =>
  applyDecorators(
    SetMetadata(VECTOR_STORE_STRATEGY, provider),
    SetMetadata(STRATEGY_META_KEY, VECTOR_STORE_STRATEGY)
  );
