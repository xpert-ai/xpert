import { KnowledgeProviderEnum } from '@metad/contracts';
import { SetMetadata } from '@nestjs/common';

export const KNOWLEDGE_STRATEGY = 'KNOWLEDGE_STRATEGY';

export const KnowledgeStrategyKey = (provider: KnowledgeProviderEnum) =>
  SetMetadata(KNOWLEDGE_STRATEGY, provider);