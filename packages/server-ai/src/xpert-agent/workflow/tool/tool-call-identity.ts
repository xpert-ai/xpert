import type { RunnableConfig } from '@langchain/core/runnables'
import { createHash } from 'node:crypto'
import { t } from 'i18next'

/** A checkpoint replay resumes the same graph task; loops and new turns get different task IDs.
 * Random IDs here create a second remote operation when an input interrupt re-enters this node.
 */
export function workflowToolCallId(nodeKey: string, config: RunnableConfig): string {
    const threadId = config.configurable?.thread_id
    const taskId = config.configurable?.__pregel_task_id
    const checkpointNs = config.configurable?.checkpoint_ns
    const identity = typeof taskId === 'string' && taskId ? taskId : checkpointNs
    if (typeof threadId !== 'string' || !threadId || typeof identity !== 'string' || !identity)
        throw new Error(
            t('server-ai:Error.McpOperationIdentityRequired', {
                defaultValue: 'A stable operation key is required for this MCP call.'
            })
        )
    return createHash('sha256')
        .update(JSON.stringify([threadId, nodeKey, identity]))
        .digest('hex')
}
