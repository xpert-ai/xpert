import type { Request, Response } from 'express'
import type { McpPrincipal } from '@xpert-ai/contracts'
import { MCP_EXECUTION_CONTROL_METHOD } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { McpPublication } from '../entities'
import { McpTaskService } from '../mcp-task.service'
import { McpPublicationService } from '../mcp-publication.service'
import { McpTaskProtocolError } from '../mcp-task.types'
import * as protocol from '../mcp-runtime-protocol'
import { controlProtocolRequest } from './mcp-control.protocol'

export async function handleMcpTaskProtocol(
    tasks: McpTaskService,
    publications: McpPublicationService,
    publication: McpPublication,
    principal: McpPrincipal,
    request: Request,
    response: Response,
    body: unknown
) {
    const controlMethod =
        typeof body === 'object' && body !== null && Reflect.get(body, 'method') === MCP_EXECUTION_CONTROL_METHOD
    const method = protocol.taskProtocolMethod(body)
    if (!method && !controlMethod) return false
    const id = protocol.jsonRpcId(body)
    try {
        protocol.assertModernTaskExtensionRequest(request, body)
        if (controlMethod) {
            const control = controlProtocolRequest(body)
            if (
                protocol.firstHeader(request.headers['mcp-method']) !== MCP_EXECUTION_CONTROL_METHOD ||
                protocol.firstHeader(request.headers['mcp-name']) !== control.operationId
            )
                throw protocol.invalidTaskProtocolRequest()
            const capabilities = await publications.resolveRuntimeCapabilities(publication)
            const capability = capabilities.find(
                (item) =>
                    item.publicName === control.toolName &&
                    protocol.canExposeCapability(principal, item) &&
                    protocol.isTaskToolCapability(item)
            )
            if (!capability) throw protocol.invalidTaskProtocolRequest()
            const result = await tasks.controlOperation(publication, principal, capability, control)
            response.status(200).json({ jsonrpc: '2.0', id, result: protocol.withMcpServerInfo(result, publication) })
            return true
        }
        const params = protocol.taskProtocolParams(body)
        if (!params) throw protocol.invalidTaskProtocolRequest()
        protocol.assertTaskRoutingHeaders(request, method, params.taskId)
        const result =
            method === 'tasks/get'
                ? await tasks.get(publication, principal, params.taskId)
                : method === 'tasks/update'
                  ? await tasks.update(publication, principal, params.taskId, params.inputResponses)
                  : await tasks.cancel(publication, principal, params.taskId)
        response.status(200).json({
            jsonrpc: '2.0',
            id,
            result: protocol.withMcpServerInfo(result, publication)
        })
    } catch (error) {
        const protocolError =
            error instanceof McpTaskProtocolError
                ? error
                : new McpTaskProtocolError(
                      -32603,
                      t('server-ai:Error.McpTaskRequestFailed', {
                          defaultValue: 'The MCP task request failed.'
                      })
                  )
        response.status(200).json({
            jsonrpc: '2.0',
            id,
            error: {
                code: protocolError.code,
                message: protocolError.message,
                ...(protocolError.data === undefined ? {} : { data: protocolError.data })
            }
        })
    }
    return true
}
