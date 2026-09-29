import { TXpertTeamDraft, TXpertTemplate, XpertTypeEnum } from '@xpert-ai/contracts'
import { stringify } from 'yaml'

export const BLANK_ASSISTANT_TEMPLATE_ID = 'xpert-blank-assistant'

/** A virtual built-in seed; no marketplace entry, organization bindings or pre-enabled tools. */
export function blankAssistantTemplate(capabilities: { key: string }[]): TXpertTemplate {
    const draft: TXpertTeamDraft = {
        team: {
            name: 'blank-assistant',
            title: 'New digital expert',
            type: XpertTypeEnum.Agent,
            version: '1',
            agent: { key: 'Agent_Assistant' },
            copilotModel: null,
            knowledgebases: [],
            toolsets: [],
            tags: []
        },
        nodes: [
            {
                type: 'agent',
                key: 'Agent_Assistant',
                position: { x: 300, y: 20 },
                entity: {
                    key: 'Agent_Assistant',
                    name: 'assistant',
                    title: 'New digital expert',
                    prompt: '',
                    copilotModel: null,
                    leaderKey: null,
                    toolsetIds: [],
                    knowledgebaseIds: []
                }
            }
        ],
        connections: []
    }
    return {
        id: BLANK_ASSISTANT_TEMPLATE_ID,
        key: BLANK_ASSISTANT_TEMPLATE_ID,
        name: 'blank-assistant',
        title: 'New digital expert',
        description: '',
        type: XpertTypeEnum.Agent,
        avatar: {},
        source: 'builtin',
        category: '',
        copyright: '',
        requiresModelSelection: true,
        capabilities: capabilities.map(({ key }) => ({ key, required: false })),
        export_data: stringify(draft)
    }
}
