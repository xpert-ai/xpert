import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { z } from 'zod/v3'
import type { McpAppToolApprovalService } from './mcp-app-tool-approval.service'
import type { McpAppInstance } from '../xpert-toolset/provider/mcp/app-support'
import { jsonRpcError, jsonRpcResult, type JsonRpcRequest } from './mcp-app-request'

const invocation = z
    .object({
        viewId: z.string().min(1).max(128),
        name: z.string().min(1).max(128),
        arguments: z.record(z.unknown()),
        approvalId: z.string().uuid().optional()
    })
    .strict()

/** Authorize host-initiated calls into App views after the RPC layer checks instance access.
 * Every call needs single-use consent bound to its purpose, actor, instance, view and arguments.
 * ChatKit owns the live-view/tool check and execution; this endpoint never executes server tools.
 */
export async function authorizeMcpAppViewTool(
    instance: Pick<McpAppInstance, 'id'> & { toolset: Pick<McpAppInstance['toolset'], 'tenantId' | 'workspaceId'> },
    request: JsonRpcRequest,
    approvals: Pick<McpAppToolApprovalService, 'request' | 'consume'>
) {
    if (Buffer.byteLength(JSON.stringify(request.params) ?? '') > 64 * 1024)
        throw new BadRequestException(
            t('server-ai:Error.McpAppViewToolArgumentsTooLarge', {
                defaultValue: 'MCP App tool arguments exceed the host limit.'
            })
        )
    const parsed = invocation.safeParse(request.params)
    if (!parsed.success)
        throw new BadRequestException(
            t('server-ai:Error.McpAppViewToolInvocationInvalid', {
                defaultValue: 'Invalid MCP App view tool invocation.'
            })
        )
    const { approvalId, ...args } = parsed.data
    const toolName = `app:${args.name}`
    if (!approvalId) {
        const approval = await approvals.request({
            appInstanceId: instance.id,
            tenantId: instance.toolset.tenantId,
            workspaceId: instance.toolset.workspaceId,
            toolName,
            purpose: 'view-tool',
            arguments: args,
            risk: 'write'
        })
        return jsonRpcError(request.id ?? null, {
            code: -32001,
            message: t('server-ai:Error.McpAppViewToolConfirmationRequired', {
                defaultValue: 'MCP App view tool requires user confirmation.'
            }),
            data: approval
        })
    }
    await approvals.consume({ approvalId, appInstanceId: instance.id, toolName, arguments: args, purpose: 'view-tool' })
    return jsonRpcResult(request.id ?? null, {})
}
