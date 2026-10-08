jest.mock('../../skill-repository/skill-repository.service', () => ({
    SkillRepositoryService: class {}
}))
jest.mock('../../skill-repository/repository-index/skill-repository-index.service', () => ({
    SkillRepositoryIndexService: class {}
}))
jest.mock('@xpert-ai/server-config', () => ({ ConfigService: class {} }))
jest.mock('@xpert-ai/server-core', () => ({
    LOADED_PLUGINS: 'XPERT_LOADED_PLUGINS',
    TenantBaseEntity: class {},
    TenantAwareCrudService: class {},
    RequestContext: { getLanguageCode: () => 'en-US' }
}))

import { QueryBus } from '@nestjs/cqrs'
import { LanguagesEnum } from '@xpert-ai/contracts'
import { AssistantCapabilityProviderRegistry, IAssistantCapabilityProvider } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Repository } from 'typeorm'
import { XpertTemplate } from '../xpert-template.entity'
import { XpertTemplateService } from '../xpert-template.service'
import { AssistantCapabilityService } from './assistant-capability.service'
import { BOSI_BASE_TEMPLATE_ID, BOSI_TEMPLATE_ID, BOSI_WELCOME_PROMPT } from './bosi-template'
import { primaryAgent } from './capability-state'
import { capabilityTemplateId } from './template-capability-reference'
import { parseCapabilityTemplateDraft } from './template-draft'

describe('Bosi template resolution', () => {
    const base = {
        id: BOSI_BASE_TEMPLATE_ID,
        title: 'My ClawXpert',
        export_data: readFileSync(join(__dirname, '../templates/xpert-my-claw-xpert.yaml'), 'utf8')
    }
    const providers: IAssistantCapabilityProvider[] = []
    let service: XpertTemplateService

    beforeEach(() => {
        providers.splice(0)
        service = new XpertTemplateService({} as Repository<XpertTemplate>)
        Object.defineProperties(service, {
            configService: { value: { assetOptions: { serverRoot: join(__dirname, '../../../../..') } } },
            capabilities: {
                value: new AssistantCapabilityService(
                    { list: () => providers } as unknown as AssistantCapabilityProviderRegistry,
                    {} as QueryBus
                )
            }
        })
        jest.spyOn(service, 'readTemplatesFile').mockResolvedValue({
            templates: {},
            details: { [base.id]: base }
        })
    })

    it('resolves Bosi in OSS without Computer providers and keeps the ClawXpert source unchanged', async () => {
        const result = await service.getTemplateDetail(BOSI_TEMPLATE_ID, LanguagesEnum.English)
        const draft = parseCapabilityTemplateDraft(result.export_data)
        expect(result).toMatchObject({ id: BOSI_TEMPLATE_ID, requiresModelSelection: true, enabledCapabilities: [] })
        expect(draft.team.title).toBe('Bosi')
        expect(primaryAgent(draft).entity.prompt).toContain(BOSI_WELCOME_PROMPT)

        const original = await service.getTemplateDetail(BOSI_BASE_TEMPLATE_ID, LanguagesEnum.English)
        expect(original.title).toBe(base.title)
        expect(original.export_data).toBe(base.export_data)
    })

    it('composes selected capabilities from the serving distribution', async () => {
        providers.push({
            key: 'cloud-computer',
            label: 'Cloud computer',
            description: 'Cloud computer',
            check: async () => ({ available: true }),
            apply: async ({ draft }) => {
                draft.team.description = 'Computer capability applied'
            }
        })
        const id = capabilityTemplateId(BOSI_TEMPLATE_ID, ['cloud-computer'])
        const result = await service.getTemplateDetail(id, LanguagesEnum.English)
        expect(result.enabledCapabilities).toEqual(['cloud-computer'])
        const draft = parseCapabilityTemplateDraft(result.export_data)
        expect(draft.team.description).toBe('Computer capability applied')
        expect(primaryAgent(draft).entity.prompt).toContain(BOSI_WELCOME_PROMPT)
    })

    it('rejects a requested capability when its provider is absent', async () => {
        const id = capabilityTemplateId(BOSI_TEMPLATE_ID, ['cloud-computer'])
        await expect(service.getTemplateDetail(id, LanguagesEnum.English)).rejects.toThrow()
    })
})
