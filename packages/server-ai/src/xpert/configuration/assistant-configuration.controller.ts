import { AssistantConfigurationInput, LanguagesEnum, LanguagesMap } from '@xpert-ai/contracts'
import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { I18nLang } from 'nestjs-i18n'
import { t } from 'i18next'
import { parseTemplateCapabilities } from '../../xpert-template/capabilities/template-capability-reference'
import { AssistantConfigurationService } from './assistant-configuration.service'

@Controller()
export class AssistantConfigurationController {
    constructor(private readonly configuration: AssistantConfigurationService) {}

    @Get(':id/configuration')
    get(@Param('id') id: string, @I18nLang() language: LanguagesEnum, @Query('capabilities') selected?: string) {
        return this.configuration.get(
            id,
            LanguagesMap[language] ?? language,
            selected === undefined ? undefined : parseTemplateCapabilities(selected ? selected.split(',') : [])
        )
    }

    @Post(':id/configuration')
    save(@Param('id') id: string, @I18nLang() language: LanguagesEnum, @Body() body: unknown) {
        return this.configuration.save(id, LanguagesMap[language] ?? language, parseAssistantConfiguration(body))
    }
}

export function parseAssistantConfiguration(value: unknown): AssistantConfigurationInput {
    if (
        !value ||
        typeof value !== 'object' ||
        !('revision' in value) ||
        typeof value.revision !== 'string' ||
        !/^[a-f0-9]{64}$/.test(value.revision) ||
        !('prompt' in value) ||
        typeof value.prompt !== 'string' ||
        value.prompt.length > 32000 ||
        !('modelId' in value) ||
        typeof value.modelId !== 'string' ||
        !value.modelId ||
        value.modelId.length > 1000 ||
        !('capabilities' in value) ||
        !Array.isArray(value.capabilities)
    )
        throw new BadRequestException(t('server-ai:Error.AssistantConfigurationInvalid'))
    return {
        revision: value.revision,
        prompt: value.prompt,
        modelId: value.modelId,
        capabilities: parseTemplateCapabilities(value.capabilities)
    }
}
