import { interrupt } from '@langchain/langgraph'
import { AgentInvocationApi, AgentJson, isAgentInvocationTerminal } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'

const json: z.ZodType<AgentJson> = z.lazy(() =>
    z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(json)])
)
const decision = z.object({ interactionId: z.string(), response: json }).strict()

/** Checkpoints the parent; never keeps a worker or an LLM polling loop alive. */
export async function awaitAgentInvocation(api: AgentInvocationApi, id: string) {
    for (;;) {
        const current = await api.inspect(id)
        if (isAgentInvocationTerminal(current.status) || current.status === 'unknown') return current
        const resumed: unknown = interrupt({
            type: 'agent_invocation',
            invocationId: id,
            status: current.status,
            ...(current.interaction ? { interaction: current.interaction } : {})
        })
        if (current.interaction) {
            const parsed = decision.safeParse(resumed)
            if (parsed.success && parsed.data.interactionId === current.interaction.id) {
                await api.respond(id, parsed.data.interactionId, parsed.data.response)
            }
        }
    }
}
