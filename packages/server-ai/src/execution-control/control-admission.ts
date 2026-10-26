import { Injectable } from '@nestjs/common'
import { ControlRuntimeAdmissionService, taskControlSchema, type ControlSchemaRequirement } from '@xpert-ai/server-core'

export const threadControlSchema: readonly ControlSchemaRequirement[] = [
    ...taskControlSchema,
    {
        table: 'execution_control',
        columns: [
            'id',
            'createdAt',
            'updatedAt',
            'createdById',
            'updatedById',
            'executionId',
            'tenantId',
            'organizationId',
            'threadId',
            'rootExecutionId',
            'ownership',
            'ancestors',
            'desired',
            'revision',
            'graphEnded',
            'work'
        ]
    },
    {
        table: 'chat_conversation_thread',
        columns: ['threadId', 'runControl', 'metadata', 'operation', 'encryptedRunContext']
    },
    {
        table: 'chat_thread_control_projection',
        columns: [
            'id',
            'createdAt',
            'updatedAt',
            'createdById',
            'updatedById',
            'threadId',
            'tenantId',
            'organizationId',
            'revision',
            'fingerprint'
        ]
    }
]
export const mcpControlSchema: readonly ControlSchemaRequirement[] = [
    ...taskControlSchema,
    { table: 'mcp_task', columns: ['taskId', 'control', 'nextControlAt', 'requestPayload'] },
    {
        table: 'mcp_remote_operation',
        columns: [
            'id',
            'createdAt',
            'updatedAt',
            'createdById',
            'updatedById',
            'tenantId',
            'organizationId',
            'operationKey',
            'targetId',
            'generation',
            'record',
            'nextControlAt'
        ]
    }
]
export const sandboxControlSchema: readonly ControlSchemaRequirement[] = [
    ...taskControlSchema,
    {
        table: 'sandbox_job',
        columns: ['id', 'generation', 'control', 'nextControlAt', 'capacityHeld', 'cleanupPending']
    }
]

/** API-owned schema declarations feed the existing boot registry; no DDL runs during admission. */
@Injectable()
export class ExecutionControlAdmissionRegistration {
    constructor(admission: ControlRuntimeAdmissionService) {
        admission.register('threadControlView', threadControlSchema)
        admission.register('mcpControl', mcpControlSchema)
        admission.register('sandboxControl', sandboxControlSchema)
        admission.register('invocationEvidence', [
            ...taskControlSchema,
            {
                table: 'agent_invocation',
                columns: ['id', 'invocation', 'providerSource', 'revision', 'nextObservationAt']
            }
        ])
    }
}
