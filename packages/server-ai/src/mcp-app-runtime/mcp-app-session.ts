import type { MiddlewareAppSource } from './middleware-app-source'

export function mcpAppSessionTtl(source?: MiddlewareAppSource) {
    // Paused native forms retain their scoped continuation across overnight pauses.
    return source?.interruptAfter ? 7 * 24 * 60 * 60 * 1000 : 30 * 60 * 1000
}
