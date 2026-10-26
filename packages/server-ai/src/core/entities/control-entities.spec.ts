import { ALL_AI_ENTITIES } from '.'
import { ThreadControlProjection } from '../../chat-conversation/control-view/thread-control-projection.entity'
import { McpRemoteOperation } from '../../mcp-consumer/execution/mcp-operation.entity'
import { ExecutionControl } from '../../execution-control/execution-control.entity'

// schema-sync uses this explicit catalog; exporting an entity alone does not create its table.
it('includes runtime control persistence in the formal schema bootstrap catalog', () => {
    for (const entity of [ExecutionControl, McpRemoteOperation, ThreadControlProjection]) {
        expect(ALL_AI_ENTITIES.filter((registered) => registered === entity)).toHaveLength(1)
    }
})
