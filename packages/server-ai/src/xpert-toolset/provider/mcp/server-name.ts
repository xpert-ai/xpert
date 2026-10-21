/** Persist the same server identity that the MCP client uses for unnamed entries. */
export function resolveMcpServerName(serverName: string, toolsetName?: string): string {
    return serverName || toolsetName || 'default'
}
