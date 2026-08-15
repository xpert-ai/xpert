export type CopilotModelUsageRecordingScope = {
    tenantId: string
    organizationId?: string | null
    userId?: string | null
    originExecutionId?: string | null
    copilotId: string
    providerScopeId: string
    provider: string
}
