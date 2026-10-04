import type { ModelExecutionLimits } from '@xpert-ai/contracts'

export const defaultExecutionLimits: ModelExecutionLimits = {
    tokenBudget: 2_000_000,
    userTokenBudget: 10_000_000,
    maxInputTokens: 128_000,
    maxOutputTokens: 16_384,
    maxConcurrentRequests: 4,
    requestsPerMinute: 60,
    leaseSeconds: 120,
    maxDurationSeconds: 3600
}

/** The guest cannot reach the API through its own loopback interface. */
export function defaultExecutionGatewayUrl(): string {
    const url = new URL(process.env.API_BASE_URL || 'http://localhost:3000')
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) url.hostname = 'host.docker.internal'
    const prefix = url.pathname.replace(/\/$/, '')
    url.pathname = `${prefix.endsWith('/api') ? prefix : `${prefix}/api`}/model-execution/openai/v1`
    return url.href
}
