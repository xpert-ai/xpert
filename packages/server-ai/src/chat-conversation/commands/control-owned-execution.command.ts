import { Command } from '@nestjs/cqrs'

/** Reconcile the persisted control of one host-owned execution; never accepts a caller-supplied action. */
export class ControlOwnedExecutionCommand extends Command<void> {
    constructor(readonly targetId: string) {
        super()
    }
}
