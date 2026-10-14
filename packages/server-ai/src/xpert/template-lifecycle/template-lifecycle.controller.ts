import { t } from 'i18next'
import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common'
import { z } from 'zod'
import { ZodValidationPipe } from '@xpert-ai/server-core'
import { I18nLang } from 'nestjs-i18n'
import {
    LanguagesEnum,
    LanguagesMap,
    templatePublicationInputSchema,
    TemplatePublicationInput,
    templateUpgradeInputSchema,
    TemplateUpgradeInput,
    templateUpgradeActionSchema,
    TemplateUpgradeAction
} from '@xpert-ai/contracts'
import { TemplatePublicationService } from './template-publication.service'
import { TemplateUpgradeService } from './template-upgrade.service'

@Controller(':id/template-lifecycle')
export class TemplateLifecycleController {
    constructor(
        private readonly publications: TemplatePublicationService,
        private readonly upgrades: TemplateUpgradeService
    ) {}
    @Get('publication') preview(@Param('id') id: string) {
        return this.publications.preview(id)
    }
    @Post('publication') publish(
        @Param('id') id: string,
        @Body(
            new ZodValidationPipe(
                templatePublicationInputSchema,
                () => new BadRequestException(t('server-ai:Error.TemplateLifecycleInvalid'))
            )
        )
        input: TemplatePublicationInput
    ) {
        return this.publications.publish(id, input)
    }
    @Delete('publication') revoke(@Param('id') id: string) {
        return this.publications.revoke(id)
    }
    @Get('upgrade/sources') sources(@Param('id') id: string, @I18nLang() language: LanguagesEnum) {
        return this.upgrades.sources(id, LanguagesMap[language] ?? language)
    }
    @Get('upgrade') upgrade(
        @Param('id') id: string,
        @I18nLang() language: LanguagesEnum,
        @Query(
            new ZodValidationPipe(
                z.object({ targetTemplateId: z.string().trim().min(1).max(500).optional() }).strict(),
                () => new BadRequestException(t('server-ai:Error.TemplateLifecycleInvalid'))
            )
        )
        query: { targetTemplateId?: string }
    ) {
        return this.upgrades.preview(id, LanguagesMap[language] ?? language, query.targetTemplateId)
    }
    @Post('upgrade') apply(
        @Param('id') id: string,
        @I18nLang() language: LanguagesEnum,
        @Body(
            new ZodValidationPipe(
                templateUpgradeInputSchema,
                () => new BadRequestException(t('server-ai:Error.TemplateLifecycleInvalid'))
            )
        )
        input: TemplateUpgradeInput
    ) {
        return this.upgrades.apply(id, LanguagesMap[language] ?? language, input)
    }
    @Post('upgrade/resume') resume(
        @Param('id') id: string,
        @Body(
            new ZodValidationPipe(
                templateUpgradeActionSchema,
                () => new BadRequestException(t('server-ai:Error.TemplateLifecycleInvalid'))
            )
        )
        input: TemplateUpgradeAction
    ) {
        return this.upgrades.resume(id, input.operationId)
    }
    @Post('upgrade/rollback') rollback(
        @Param('id') id: string,
        @Body(
            new ZodValidationPipe(
                templateUpgradeActionSchema,
                () => new BadRequestException(t('server-ai:Error.TemplateLifecycleInvalid'))
            )
        )
        input: TemplateUpgradeAction
    ) {
        return this.upgrades.rollback(id, input.operationId)
    }
}
