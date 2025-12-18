import { applyDecorators, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '../../types';

export const SKILL_SOURCE_PROVIDER = 'SKILL_SOURCE_PROVIDER'

export const SkillSourceProviderStrategy = (provider: string) => 
    applyDecorators(
        SetMetadata(SKILL_SOURCE_PROVIDER, provider),
        SetMetadata(STRATEGY_META_KEY, SKILL_SOURCE_PROVIDER),
    );
