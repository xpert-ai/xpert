import { SetMetadata } from '@nestjs/common';

export const TEXT_SPLITTER_STRATEGY = 'TEXT_SPLITTER_STRATEGY';

export const TextSplitterStrategy = (provider: string) =>
  SetMetadata(TEXT_SPLITTER_STRATEGY, provider);
