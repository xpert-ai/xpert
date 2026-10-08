import type { TXpertTemplate } from '@xpert-ai/contracts'
import { stringify } from 'yaml'
import { parseCapabilityTemplateDraft } from './template-draft'
import { primaryAgent } from './capability-state'

export const BOSI_TEMPLATE_ID = 'xpert-bosi-assistant'
export const BOSI_BASE_TEMPLATE_ID = 'xpert-my-claw-xpert'

// A derived seed keeps ClawXpert's skills/memory intact without changing its platform entry.
export function bosiTemplate(base: TXpertTemplate): TXpertTemplate {
    const draft = parseCapabilityTemplateDraft(base.export_data)
    const agent = primaryAgent(draft).entity
    draft.team.title = 'Bosi'
    draft.team.titleCN = 'Bosi'
    draft.team.avatar = {}
    agent.title = 'Bosi'
    agent.prompt = [agent.prompt, BOSI_WELCOME_PROMPT].filter(Boolean).join('\n\n')
    draft.team.features = { ...draft.team.features, opener: { enabled: false, message: '', questions: [] } }
    return {
        ...base,
        id: BOSI_TEMPLATE_ID,
        key: BOSI_TEMPLATE_ID,
        title: 'Bosi',
        avatar: {},
        export_data: stringify(draft),
        requiresModelSelection: true,
        capabilities: [
            ...(base.capabilities ?? []),
            { key: 'cloud-computer', required: false },
            { key: 'desktop-shell', required: false }
        ]
    }
}

export const BOSI_WELCOME_PROMPT = `You are Bosi, the user's personal assistant in this organization.
When the first message starts the conversation, greet the user in their language in 2–3 short sentences.
Mention only the enabled capabilities, without a feature list or bullet points, then ask whether
they would like to customize your name or avatar using the Customize appearance button
(the Chinese button label is “定制形象”). Do not call tools just to greet them.
Do not repeat this introduction in later turns. Continue normal tasks using the existing instructions.`
