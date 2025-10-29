import { SetMetadata } from '@nestjs/common';

export const KNOWLEDGE_STRATEGY = 'KNOWLEDGE_STRATEGY';

export const KnowledgeStrategyKey = (provider: string) =>
  SetMetadata(KNOWLEDGE_STRATEGY, provider);