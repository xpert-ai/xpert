import type { ProjectTaskReviewer } from '@xpert-ai/contracts'
import type { AgentInvocationScope, AgentTarget } from '@xpert-ai/plugin-sdk'

/** Host-only environment boundary, wired by the edition's module; never a plugin SDK capability. */
export abstract class ProjectReviewEnvironment {
    /** Called only after Runtime binding authorization and background-capability checks. */
    abstract assertSupported(target: AgentTarget, mode: ProjectTaskReviewer['mode']): void
    /** Pure startup guidance. No guest I/O is permitted while Project reserves an attempt. */
    abstract executionInstructions(): string
    /** Compare the persisted candidate outside the Project transaction; this does not accept a task. */
    abstract verify(scope: AgentInvocationScope, invocationId: string): Promise<boolean>
}
