import { BadRequestException } from '@nestjs/common'
import {
  WorkflowNodeTypeEnum,
  type IWFNMiddleware,
  type TXpertTeamDraft,
  type TXpertTeamNode
} from '@xpert-ai/contracts'

function middleware(node: TXpertTeamNode): node is TXpertTeamNode<'workflow'> & { entity: IWFNMiddleware } {
  return node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE
}
export function hasAssistantMiddleware(draft: TXpertTeamDraft, provider: string) {
  return draft.nodes.some(
    (node) =>
      middleware(node) &&
      node.entity.provider === provider &&
      draft.connections.some(
        (edge) => edge.type === 'workflow' && edge.from === draft.team.agent?.key && edge.to.split('/')[0] === node.key
      )
  )
}
/** Compose only the draft graph. The platform records the contribution for safe removal.
 * No Project, permission, external resource or implicit replacement is created here. */
export function applyAssistantMiddleware(
  draft: TXpertTeamDraft,
  input: { provider: string; key: string; title: string; instructions: string }
) {
  const agent = draft.nodes.find((node) => node.type === 'agent' && node.key === draft.team.agent?.key)
  if (agent?.type !== 'agent') throw new BadRequestException('assistant.invalid_draft')
  if (!hasAssistantMiddleware(draft, input.provider)) {
    let key = input.key
    for (
      let suffix = 2;
      draft.nodes.some((node) => node.key === key) ||
      draft.connections.some((edge) => edge.key === `${agent.key}/${key}`);
      suffix++
    )
      key = `${input.key}_${suffix}`
    const entity: IWFNMiddleware = {
      id: key,
      key,
      type: WorkflowNodeTypeEnum.MIDDLEWARE,
      title: input.title,
      provider: input.provider,
      required: true,
      options: {}
    }
    draft.nodes.push({ type: 'workflow', key, position: { x: 620, y: 160 * (draft.nodes.length - 1) }, entity })
    draft.connections.push({ key: `${agent.key}/${key}`, type: 'workflow', from: agent.key, to: key, required: true })
    agent.entity.options = {
      ...agent.entity.options,
      parallelToolCalls: false,
      middlewares: {
        ...agent.entity.options?.middlewares,
        order: [...(agent.entity.options?.middlewares?.order ?? []), key]
      }
    }
  }
  if (!agent.entity.prompt?.includes(input.instructions))
    agent.entity.prompt = [agent.entity.prompt, input.instructions].filter(Boolean).join('\n\n')
}
