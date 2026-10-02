import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { AgentInvocation, AgentInvocationScope, TaskWaitRequest } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import {
    parseInvocationTaskWait,
    parseInvocationWaitScope,
    parsePersistedInvocationWait
} from './invocation-task-wait.schema'
import { AgentInvocationWaitEntity } from './invocation.entity'
import { invocationError } from './invocation-runtime'
import { HOST_TASK_WAIT_POLICY } from '../runtime-task/task-wait-policy'

@Injectable()
export class AgentInvocationWaitStore {
    constructor(@InjectRepository(AgentInvocationWaitEntity) readonly records: Repository<AgentInvocationWaitEntity>) {}

    async register(invocation: AgentInvocation) {
        return this.registerTasks(
            { callId: invocation.request.callId, taskIds: [invocation.id], mode: 'all' },
            invocation.scope,
            invocation.id
        )
    }

    id(request: TaskWaitRequest, scope: AgentInvocationScope) {
        const hash = createHash('sha256')
            .update(
                JSON.stringify([
                    scope.tenantId,
                    scope.organizationId,
                    scope.userId,
                    scope.parentExecutionId,
                    scope.callerAgentKey,
                    request.callId
                ])
            )
            .digest('hex')
        return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
    }

    async read(id: string, scope: AgentInvocationScope) {
        const row = await this.records.findOneBy({
            id,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            ownerId: scope.userId
        })
        if (row?.request) {
            row.request = parsePersistedInvocationWait(row.request)
            if (!isDeepStrictEqual(row.request.scope, parseInvocationWaitScope(scope)))
                throw invocationError('NotFound')
        }
        return row
    }

    async registerTasks(request: TaskWaitRequest, scope: AgentInvocationScope, id = this.id(request, scope)) {
        request = parseInvocationTaskWait(request)
        scope = parseInvocationWaitScope(scope)
        const config = AsyncLocalStorageProviderSingleton.getRunnableConfig()?.configurable
        const threadId: unknown = config?.thread_id
        if (typeof threadId !== 'string' || !threadId.trim()) throw invocationError('InvalidScope')
        await this.records
            .createQueryBuilder()
            .insert()
            .values({
                id,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                ownerId: scope.userId,
                threadId,
                checkpointNamespace: '',
                request: { ...request, scope },
                state: 'waiting',
                nextCheckAt: new Date(),
                deadlineAt: new Date(Date.now() + HOST_TASK_WAIT_POLICY.maxWaitMs)
            })
            .orIgnore()
            .execute()
        const row = await this.read(id, scope)
        if (
            !row ||
            row.threadId !== threadId ||
            (row.request &&
                (row.request.mode !== request.mode ||
                    JSON.stringify(row.request.taskIds) !== JSON.stringify(request.taskIds)))
        )
            throw invocationError('CallConflict')
        return id
    }
}
