import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TXpertTemplate, XpertTypeEnum } from '@xpert-ai/contracts'
import { bosiTemplate, BOSI_BASE_TEMPLATE_ID, BOSI_TEMPLATE_ID, BOSI_WELCOME_PROMPT } from './bosi-template'
import { parseCapabilityTemplateDraft } from './template-draft'
import { primaryAgent } from './capability-state'

it('derives the Desktop identity without losing the ClawXpert graph or changing the original template', () => {
    const base: TXpertTemplate = {
        id: BOSI_BASE_TEMPLATE_ID,
        name: 'ClawXpert',
        title: 'My ClawXpert',
        description: 'Personal assistant',
        type: XpertTypeEnum.Agent,
        category: 'Assistant',
        copyright: '',
        avatar: { url: '/claw.svg' },
        export_data: readFileSync(join(__dirname, '../templates/xpert-my-claw-xpert.yaml'), 'utf8'),
        promptWorkflows: [{ name: 'existing-workflow', template: 'Existing workflow prompt' }],
        dependencies: { plugins: [] },
        capabilities: [{ key: 'existing-capability', required: true }]
    }
    const baseSnapshot = structuredClone(base)
    const original = parseCapabilityTemplateDraft(base.export_data)
    const result = bosiTemplate(base)
    const draft = parseCapabilityTemplateDraft(result.export_data)
    expect(result.id).toBe(BOSI_TEMPLATE_ID)
    expect(result.requiresModelSelection).toBe(true)
    expect(draft.team.title).toBe('Bosi')
    expect(draft.team.avatar).toEqual({})
    expect(draft.team.features.opener.enabled).toBe(false)
    expect(draft.nodes.map(({ key }) => key)).toEqual(original.nodes.map(({ key }) => key))
    expect(draft.connections).toEqual(original.connections)
    expect(draft.nodes.filter(({ type }) => type !== 'agent')).toEqual(
        original.nodes.filter(({ type }) => type !== 'agent')
    )
    expect(primaryAgent(draft).entity.prompt).toContain(primaryAgent(original).entity.prompt)
    expect(primaryAgent(draft).entity.prompt).toContain(BOSI_WELCOME_PROMPT)
    expect(result.promptWorkflows).toEqual(base.promptWorkflows)
    expect(result.dependencies).toEqual(base.dependencies)
    expect(base).toEqual(baseSnapshot)
    expect(result.capabilities).toEqual([
        { key: 'existing-capability', required: true },
        { key: 'cloud-computer', required: false },
        { key: 'desktop-shell', required: false }
    ])
})
