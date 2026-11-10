import { Command } from '@nestjs/cqrs'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import type { GroupMapPage, GroupMapQuery } from '../group-map.schema'

/**
 * Read public group discussion from a server-resolved Assistant View context.
 * Returns null for ordinary conversations. Rechecks live membership on every page;
 * does not authorize private execution history, branching or conversation mutations.
 */
export class ReadGroupMapCommand extends Command<GroupMapPage | null> {
    constructor(
        readonly context: XpertResolvedViewHostContext,
        readonly query: GroupMapQuery
    ) {
        super()
    }
}
