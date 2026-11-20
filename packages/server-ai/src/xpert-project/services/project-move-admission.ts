import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { AssertProjectConversationAdmissionQuery } from '../queries/assert-project-conversation-admission.query'
import { resumeTargetDenied } from '../../chat-conversation/resolve-resume-target'
import { ConflictException } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

/** Project runs cannot restore a personal checkpoint or overtake the confirmed continuation. */
export async function assertProjectMoveAdmission(
    manager: EntityManager,
    conversationId: string,
    target?: { executionId?: string; aiMessageId?: string }
) {
    const [boundary] = await manager.query(
        `
        SELECT NOT EXISTS (SELECT 1 FROM xpert_agent_execution WHERE id=r.execution_id) AS pending,
            EXISTS (SELECT 1 FROM xpert_agent_execution e WHERE e.id=COALESCE($2::uuid,
                (SELECT m."executionId" FROM chat_message m WHERE m.id=$3::uuid))
                AND e."createdAt" <= r.moved_at AND e.id<>r.execution_id) AS historical
        FROM conversation_project_move r WHERE r.conversation_id=$1 AND r.bound LIMIT 1`,
        [conversationId, target?.executionId ?? null, target?.aiMessageId ?? null]
    )
    if (boundary?.historical)
        throw new ConflictException('This execution belongs to the conversation before it moved to the project')
    if (boundary?.pending)
        throw new ConflictException('Continue the confirmed project request before starting another run')
}

@QueryHandler(AssertProjectConversationAdmissionQuery)
export class ProjectMoveAdmissionHandler implements IQueryHandler<AssertProjectConversationAdmissionQuery> {
    async execute({ manager, scope, sourceMessageId, target }: AssertProjectConversationAdmissionQuery) {
        if (!sourceMessageId) return assertProjectMoveAdmission(manager, scope.conversationId, target)
        const [pending] = await manager.query(
            `
            SELECT 1 FROM conversation_project_move r
            JOIN chat_message head ON head.id=$2 AND head."executionId"=r.source_execution_id
            WHERE r.execution_id=$1 AND r.bound AND r.thread_id=$3 AND r.conversation_id=$4
              AND r.source_message_id=$5 AND r.target_id=$6 FOR SHARE OF r`,
            [
                scope.executionId,
                scope.headMessageId,
                scope.threadId,
                scope.conversationId,
                sourceMessageId,
                scope.projectId
            ]
        )
        if (!pending) throw resumeTargetDenied()
    }
}
