import { applyDecorators, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '../types';

export const SANDBOX_PROVIDER = 'SANDBOX_PROVIDER'

export const SandboxProviderStrategy = (provider: string) => 
    applyDecorators(
        SetMetadata(SANDBOX_PROVIDER, provider),
        SetMetadata(STRATEGY_META_KEY, SANDBOX_PROVIDER),
    );
