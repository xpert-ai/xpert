import { SetMetadata } from '@nestjs/common';

export const VECTOR_STORE_STRATEGY = 'VECTOR_STORE_STRATEGY';

export const VectorStoreStrategy = (provider: string) =>
  SetMetadata(VECTOR_STORE_STRATEGY, provider);
