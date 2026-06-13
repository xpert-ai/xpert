import {
    AiModelTypeEnum,
    LanguagesEnum,
    LanguagesMap,
    TAvatar,
    TCopilotModel,
    TemplateSkillSyncMode
} from '@xpert-ai/contracts'
import { PaginationParams, ParseJsonPipe, TransformInterceptor } from '@xpert-ai/server-core'
import { BadRequestException, Body, Controller, Get, Logger, Param, Post, Query, UseInterceptors } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { I18nLang } from 'nestjs-i18n'
import { TemplateSkillSyncService } from './template-skill-sync.service'
import { XpertTemplateService } from './xpert-template.service'
import { XpertTemplate } from './xpert-template.entity'
import {
    PluginTemplateInstallCommand,
    PluginTemplateInstallBasic
} from '../plugin-resource/commands/install-template.command'

@ApiTags('XpertTemplate')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertTemplateController {
    readonly #logger = new Logger(XpertTemplateController.name)

    constructor(
        private readonly service: XpertTemplateService,
        private readonly templateSkillSyncService: TemplateSkillSyncService,
        private readonly commandBus: CommandBus
    ) {}

    @Get()
    async getAll(
        @I18nLang() language: LanguagesEnum,
        @Query('targetApp') targetApp?: string,
        @Query('templateType') templateType?: string
    ) {
        return this.service.getAll(LanguagesMap[language] ?? language, { targetApp, templateType })
    }

    @Get('mcps')
    async getMCPTemplates(
        @I18nLang() language: LanguagesEnum,
        @Query('data', ParseJsonPipe) paginationParams: PaginationParams<XpertTemplate>
    ) {
        return await this.service.getMCPTemplates(LanguagesMap[language] ?? language, paginationParams)
    }

    @Get('mcps/:key')
    async getMCPTemplate(@I18nLang() language: LanguagesEnum, @Param('key') key: string) {
        return await this.service.getMCPTemplate(LanguagesMap[language] ?? language, key)
    }

    @Get('pipelines')
    async getKnowledgePipelines(
        @I18nLang() language: LanguagesEnum,
        @Query('data', ParseJsonPipe) paginationParams: PaginationParams<XpertTemplate>
    ) {
        return await this.service.getKnowledgePipelines(LanguagesMap[language] ?? language, paginationParams)
    }

    @Get('pipelines/:id')
    async getKnowledgePipeline(@I18nLang() language: LanguagesEnum, @Param('id') id: string) {
        return await this.service.getKnowledgePipeline(LanguagesMap[language] ?? language, id)
    }

    @Get('skills-market')
    async getSkillsMarket(@I18nLang() language: LanguagesEnum) {
        return await this.service.getSkillsMarket(LanguagesMap[language] ?? language)
    }

    @Post('sync-skill-assets')
    async syncSkillAssets(
        @Body()
        body?: {
            mode?: TemplateSkillSyncMode
            validateOnly?: boolean
        }
    ) {
        return this.templateSkillSyncService.syncSkillAssets({
            mode: body?.mode,
            validateOnly: body?.validateOnly
        })
    }

    @Post(':id/install')
    async installTemplate(@I18nLang() language: LanguagesEnum, @Param('id') id: string, @Body() body: unknown) {
        const input = parseTemplateInstallInput(body)
        return this.commandBus.execute(
            new PluginTemplateInstallCommand(id, input.workspaceId, LanguagesMap[language] ?? language, input.basic)
        )
    }

    @Get(':id')
    async getTemplate(
        @I18nLang() language: LanguagesEnum,
        @Param('id') id: string,
        @Query('targetApp') targetApp?: string,
        @Query('templateType') templateType?: string
    ) {
        return await this.service.getTemplateDetail(id, LanguagesMap[language] ?? language, { targetApp, templateType })
    }
}

function parseTemplateInstallInput(value: unknown): { workspaceId: string; basic?: PluginTemplateInstallBasic } {
    if (!isObjectValue(value)) {
        throw new BadRequestException('Request body is required')
    }
    const workspaceId = readStringField(value, 'workspaceId')
    if (!workspaceId) {
        throw new BadRequestException('workspaceId is required')
    }

    const basicValue = Reflect.get(value, 'basic')
    const basic = isObjectValue(basicValue) ? parseTemplateInstallBasic(basicValue) : undefined
    return {
        workspaceId,
        ...(basic ? { basic } : {})
    }
}

function parseTemplateInstallBasic(value: object): PluginTemplateInstallBasic | undefined {
    const name = readStringField(value, 'name')
    const title = readStringField(value, 'title')
    const description = readStringField(value, 'description')
    const avatar = parseAvatar(Reflect.get(value, 'avatar'))
    const copilotModel = parseCopilotModel(Reflect.get(value, 'copilotModel'))
    const basic: PluginTemplateInstallBasic = {
        ...(name ? { name } : {}),
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(avatar ? { avatar } : {}),
        ...(copilotModel ? { copilotModel } : {})
    }
    return Object.keys(basic).length ? basic : undefined
}

function parseAvatar(value: unknown): TAvatar | undefined {
    if (!isObjectValue(value)) {
        return undefined
    }
    const url = readStringField(value, 'url')
    const background = readStringField(value, 'background')
    const useNotoColor = Reflect.get(value, 'useNotoColor')
    const emojiValue = Reflect.get(value, 'emoji')
    const emoji = isObjectValue(emojiValue) ? parseAvatarEmoji(emojiValue) : undefined
    if (!url && !background && !emoji && typeof useNotoColor !== 'boolean') {
        return undefined
    }
    return {
        ...(url ? { url } : {}),
        ...(background ? { background } : {}),
        ...(typeof useNotoColor === 'boolean' ? { useNotoColor } : {}),
        ...(emoji ? { emoji } : {})
    }
}

function parseAvatarEmoji(value: object): TAvatar['emoji'] | undefined {
    const id = readStringField(value, 'id')
    if (!id) {
        return undefined
    }
    const set = readStringField(value, 'set')
    const colons = readStringField(value, 'colons')
    const unified = readStringField(value, 'unified')
    return {
        id,
        ...(set === '' || set === 'apple' || set === 'google' || set === 'twitter' || set === 'facebook'
            ? { set }
            : {}),
        ...(colons ? { colons } : {}),
        ...(unified ? { unified } : {})
    }
}

function parseCopilotModel(value: unknown): TCopilotModel | undefined {
    if (!isObjectValue(value)) {
        return undefined
    }
    const model = readStringField(value, 'model')
    const modelType = parseAiModelType(readStringField(value, 'modelType'))
    const copilotId = readStringField(value, 'copilotId')
    if (!model && !modelType && !copilotId) {
        return undefined
    }
    return {
        ...(model ? { model } : {}),
        ...(modelType ? { modelType } : {}),
        ...(copilotId ? { copilotId } : {})
    }
}

function parseAiModelType(value: string | undefined): AiModelTypeEnum | undefined {
    if (
        value === AiModelTypeEnum.LLM ||
        value === AiModelTypeEnum.TEXT_EMBEDDING ||
        value === AiModelTypeEnum.RERANK ||
        value === AiModelTypeEnum.SPEECH2TEXT ||
        value === AiModelTypeEnum.MODERATION ||
        value === AiModelTypeEnum.TTS ||
        value === AiModelTypeEnum.TEXT2IMG
    ) {
        return value
    }
    return undefined
}

function isObjectValue(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringField(value: object, key: string): string | undefined {
    const field = Reflect.get(value, key)
    return typeof field === 'string' && field.trim() ? field.trim() : undefined
}
