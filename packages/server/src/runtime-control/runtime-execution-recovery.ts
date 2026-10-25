/** Only finite reads and exact-target stop/pause reach normal auth while plugin admission is closed.
 * Resume, input continuations and new runs retain their business admission checks. Drain still rejects all traffic.
 */
import { z } from 'zod/v3'
import { MCP_EXECUTION_CONTROL_METHOD, mcpExecutionControlRequestSchema } from '@xpert-ai/contracts'

const mcpRequest = z.object({ method: z.string(), params: z.unknown().optional() })

export function isExecutionControlRecovery(method: string, path: string, body?: unknown): boolean {
	const segment = '[A-Za-z0-9_-]+'
	if (method === 'POST') {
		if (
			new RegExp(`^/ai/threads/${segment}/runs/${segment}/(cancel|pause)$`).test(path) ||
			new RegExp(`^/agent-invocations/${segment}/cancel$`).test(path)
		)
			return true
		if (!new RegExp(`^/mcp/p/${segment}$`).test(path)) return false
		const request = mcpRequest.safeParse(body)
		if (!request.success) return false
		if (['server/discover', 'initialize', 'notifications/initialized'].includes(request.data.method)) return true
		return (
			request.data.method === MCP_EXECUTION_CONTROL_METHOD &&
			mcpExecutionControlRequestSchema.extend({ _meta: z.unknown().optional() }).safeParse(request.data.params)
				.success
		)
	}
	if (method !== 'GET') return false
	return (
		new RegExp(`^/ai/threads/${segment}/(control-view|capabilities|runs/${segment})$`).test(path) ||
		new RegExp(`^/agent-invocations/${segment}$`).test(path)
	)
}
