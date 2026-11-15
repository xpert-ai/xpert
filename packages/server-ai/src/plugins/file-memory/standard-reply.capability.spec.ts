import { BadRequestException } from '@nestjs/common'
import { LanguagesEnum, type TXpertTeamNode } from '@xpert-ai/contracts'
import i18next from 'i18next'
import en from '../../i18n/en.json'
import { blankAssistantTemplate } from '../../xpert-template/capabilities/blank-assistant-template'
import { parseCapabilityTemplateDraft } from '../../xpert-template/capabilities/template-draft'
import { StandardReplyCapability, validateStandardReplyDraft } from './standard-reply.capability'

const capability = new StandardReplyCapability()
beforeAll(async () => {
    await i18next.init({ lng: 'en', resources: { en: { 'server-ai': en } } })
})

function fixture() {
    const template = blankAssistantTemplate([capability])
    const draft = parseCapabilityTemplateDraft(template.export_data)
    const primary = draft.nodes.find((node) => node.type === 'agent')
    if (primary?.type !== 'agent') throw new Error('Missing primary agent')
    const context = { template, draft, language: LanguagesEnum.English, loadTemplate: jest.fn() }
    return { context, draft, primary }
}

it('keeps Standard replies unavailable when structured output is configured first', async () => {
    const { context, draft, primary } = fixture()
    primary.entity.options = { structuredOutputMethod: 'functionCalling' }
    expect(await capability.check(context)).toMatchObject({
        available: false,
        reason: expect.stringContaining(primary.entity.title)
    })
    await expect(capability.apply(context)).rejects.toThrow(BadRequestException)
    expect(capability.isEnabled(draft)).toBe(false)
})

it('rejects a schema added after Standard replies and accepts switching back to text', async () => {
    const { context, draft, primary } = fixture()
    await capability.apply(context)
    expect(() => validateStandardReplyDraft(draft)).not.toThrow()
    primary.entity.options.structuredOutputMethod = 'jsonMode'
    expect(() => validateStandardReplyDraft(draft)).toThrow(/Standard replies/)
    delete primary.entity.options.structuredOutputMethod
    expect(() => validateStandardReplyDraft(draft)).not.toThrow()
})

it('checks the agent connected to the middleware, including a manually wired child agent', async () => {
    const { context, draft } = fixture()
    const child: TXpertTeamNode<'agent'> = {
        type: 'agent',
        key: 'report',
        position: { x: 0, y: 0 },
        entity: { key: 'report', options: { structuredOutputMethod: 'jsonSchema' } }
    }
    draft.nodes.push(child)
    expect((await capability.check(context)).available).toBe(true)
    await capability.apply(context)
    expect(() => validateStandardReplyDraft(draft)).not.toThrow()
    const edge = draft.connections[0]
    draft.connections.push({ ...edge, key: 'manual', from: child.key, to: edge.to + '/input' })
    expect(() => validateStandardReplyDraft(draft)).toThrow(/report/)
    draft.connections.pop()
    expect(() => validateStandardReplyDraft(draft)).not.toThrow()
})
