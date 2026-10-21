import { IntegrationEnum, TIntegrationProvider } from '../integration.model'

export * from './github'
export * from './lark'

/** @deprecated Discover providers through the host integration registry/API. */
export const INTEGRATION_PROVIDERS: Partial<Record<IntegrationEnum, TIntegrationProvider>> = {}
