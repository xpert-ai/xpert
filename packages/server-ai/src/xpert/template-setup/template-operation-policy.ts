// Invariants: policy is compiled from the published Assistant, never request context.
// The gate surrounds actual execution for interactive and scheduled runs alike.
import { ToolMessage } from '@langchain/core/messages'
import { interrupt } from '@langchain/langgraph'
import { assistantOperationPolicySchema, type AssistantOperationPolicy } from '@xpert-ai/contracts'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { z } from 'zod'

const responseSchema = z
    .object({
        decisions: z
            .array(z.object({ type: z.enum(['approve', 'reject']), message: z.string().max(2000).optional() }).strict())
            .length(1)
    })
    .strict()

export function createTemplateOperationPolicy(declared: AssistantOperationPolicy): AgentMiddleware {
    const policy = assistantOperationPolicySchema.parse(declared)
    return {
        name: 'AssistantOperationPolicy',
        wrapToolCall: async (request, handler) => {
            const call = request.toolCall
            const rule = policy.rules.find((item) => item.tool === call.name)
            const decision = rule?.decision ?? policy.default
            if (decision === 'allow') return handler(request)
            const denied = () =>
                new ToolMessage({
                    name: call.name,
                    tool_call_id: call.id,
                    status: 'error',
                    content: t('server-ai:Error.TemplateOperationDenied')
                })
            if (decision === 'deny') return denied()
            const response = responseSchema.parse(
                await interrupt({
                    actionRequests: [
                        {
                            name: call.name,
                            args: call.args,
                            description: rule?.reason ?? t('server-ai:TemplateSetup.ApprovalRequired')
                        }
                    ],
                    reviewConfigs: [{ actionName: call.name, allowedDecisions: ['approve', 'reject'] }]
                })
            )
            return response.decisions[0].type === 'approve' ? handler(request) : denied()
        }
    }
}
