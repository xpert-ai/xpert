import type { ModelExecutionLimits } from '@xpert-ai/contracts'

export const defaultExecutionLimits: ModelExecutionLimits = {
    maxConcurrentRequests: 4,
    requestsPerMinute: 60,
    requestIdleSeconds: 600,
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

/** Omitted business budgets are unbounded; operational guards remain required. */
export function executionBudget(...values: Array<number | undefined>): number | undefined {
    const configured = values.filter((value): value is number => value !== undefined)
    return configured.length ? Math.min(...configured) : undefined
}

export function tightenExecutionLimits(snapshot: ModelExecutionLimits, current: ModelExecutionLimits) {
    for (const key of Object.keys(current) as Array<keyof ModelExecutionLimits>) {
        const value = current[key]
        if (value !== undefined) snapshot[key] = Math.min(snapshot[key] ?? Infinity, value)
    }
}
