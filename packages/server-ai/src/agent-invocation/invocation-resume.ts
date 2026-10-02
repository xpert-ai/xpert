// Recheck both the durable lease and checkpoint after the caller acquires the thread's run claim.
import type { CheckpointTuple } from '@langchain/langgraph-checkpoint'
import { BadRequestException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { t } from 'i18next'
import { CopilotCheckpointGetTupleQuery } from '../copilot-checkpoint/queries/get-tuple.query'
import { AgentInvocationResumeFence, matchesInvocationResume } from './invocation-continuation'
import { CheckTaskWaitClaimQuery } from './task-wait-control'

export async function assertInvocationResume(
    queries: Pick<QueryBus, 'execute'>,
    threadId: string,
    action: string,
    fence: AgentInvocationResumeFence
) {
    const tuple = await queries.execute<CopilotCheckpointGetTupleQuery, CheckpointTuple | undefined>(
        new CopilotCheckpointGetTupleQuery({ thread_id: threadId, checkpoint_ns: fence.checkpointNamespace })
    )
    const claimValid =
        !fence.waitLeaseToken ||
        (await queries.execute(new CheckTaskWaitClaimQuery(fence.invocationId, fence.waitLeaseToken, threadId)))
    if (!claimValid || action !== 'resume' || !matchesInvocationResume(tuple, fence)) {
        throw new BadRequestException(
            t('server-ai:Error.AgentInvocationContinuationStale', {
                defaultValue: 'Agent invocation continuation is no longer current'
            })
        )
    }
}
