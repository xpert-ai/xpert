import { Query } from '@nestjs/cqrs'
import type { ThreadControlViewService } from './thread-control-view.service'

/** Read authorized public controls without starting or resuming work. */
export class ReadThreadControlViewQuery extends Query<Awaited<ReturnType<ThreadControlViewService['read']>>> {
    constructor(readonly threadId: string) {
        super()
    }
}
