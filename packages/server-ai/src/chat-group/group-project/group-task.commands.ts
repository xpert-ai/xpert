import { Command } from '@nestjs/cqrs'
import type {
    AgentInvocationScope,
    AgentTarget,
    AgentRuntimeContext,
    AgentRuntimeHandle,
    AgentRuntimeObservation,
    AgentRuntimeStart
} from '@xpert-ai/plugin-sdk'

export interface GroupTaskTargetItem {
    target: { type: 'group_member'; participantId: string }
    assigneeXpertId: string
    title: string
    provider: 'xpert-task'
    revision: string
}

/** Authorize a captured Project task caller in its shared member runtime; private callers remain owner-scoped. */
export class AuthorizeGroupTaskCallerCommand extends Command<void> {
    constructor(public readonly scope: AgentInvocationScope) {
        super()
    }
}

/** Resolve an active member in the caller's own group and recheck both Project bindings. */
export class ResolveGroupTaskTargetCommand extends Command<AgentTarget> {
    constructor(
        public readonly scope: AgentInvocationScope,
        public readonly participantId: string
    ) {
        super()
    }
}
export class ListGroupTaskTargetsCommand extends Command<GroupTaskTargetItem[]> {
    constructor(public readonly scope: AgentInvocationScope) {
        super()
    }
}
/** Native Assistant transport operations in a member's existing group runtime. */
export class ExecuteGroupTaskCommand extends Command<AgentRuntimeObservation> {
    constructor(
        public readonly operation:
            | { type: 'start'; request: AgentRuntimeStart }
            | { type: 'inspect' | 'cancel'; handle: AgentRuntimeHandle },
        public readonly context: AgentRuntimeContext
    ) {
        super()
    }
}

/** Resume a result already claimed by the common runtime inbox through the existing group queue. */
export class DeliverGroupTaskResultCommand extends Command<{
    state: 'pending' | 'processed' | 'blocked'
    error?: string
}> {
    constructor(
        public readonly invocationId: string,
        public readonly executionId: string
    ) {
        super()
    }
}
