import { Command } from '@nestjs/cqrs'
import type { ExecutionActorRef, ResolvedExecutionIdentity } from './execution-identity'

/** Restore current execution identity from a trusted persisted actor reference; resource authorization remains mandatory. */
export class ResolveExecutionIdentityCommand extends Command<ResolvedExecutionIdentity> {
	constructor(readonly actor: ExecutionActorRef) {
		super()
	}
}
