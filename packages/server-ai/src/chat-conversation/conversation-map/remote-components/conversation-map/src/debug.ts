let enabled = false
export function configureDebug(config?: { enabled: boolean }) {
    enabled = config?.enabled === true
}

/** A closed metadata shape prevents message bodies, scope IDs or credentials from entering diagnostics. */
export function debug(event: 'initialized' | 'request' | 'response' | 'context-changed' | 'closed', pendingCount = 0) {
    if (enabled) console.debug('[conversation-map]', event, { pendingCount })
}
