// A symbol on server-created command options cannot be supplied by a JSON client or restored from a checkpoint.
export const EVENT_RUN_ORIGIN = Symbol('event-run-origin')

/** Identity and conversation boundaries that must still match when a wake delegates to another agent. */
interface EventRunScope {
    tenantId: string
    organizationId?: string | null
    userId: string
    xpertId: string
    workspaceId?: string
    projectId?: string | null
    conversationId?: string
    threadId?: string
}

/** Host-only provenance for this invocation. Child agents receive it only while the caller remains in scope. */
export interface EventRunOptions {
    [EVENT_RUN_ORIGIN]?: EventRunScope & { receiptId: string }
}

export function eventOriginForRun(
    options: EventRunOptions,
    scope: EventRunScope
): EventRunOptions[typeof EVENT_RUN_ORIGIN] {
    const origin = options[EVENT_RUN_ORIGIN]
    if (
        origin &&
        origin.tenantId === scope.tenantId &&
        origin.organizationId === scope.organizationId &&
        origin.workspaceId === scope.workspaceId &&
        origin.userId === scope.userId &&
        origin.xpertId === scope.xpertId &&
        (origin.projectId ?? null) === (scope.projectId ?? null) &&
        origin.conversationId === scope.conversationId &&
        origin.threadId === scope.threadId
    ) {
        return origin
    }
}
