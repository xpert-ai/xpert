import { Permissions } from '@xpert-ai/server-core'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'
import { appUserRuntimeAssistant } from '../xpert/runtime-dto'
import {
    AssistantBindingScope,
    AssistantCode,
    IAssistantBindingUserPreferenceUpsertInput,
    IAssistantBindingUpsertInput
} from '@xpert-ai/contracts'
import { TransformInterceptor } from '@xpert-ai/server-core'
import { Body, Controller, Delete, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AssistantBindingService } from './assistant-binding.service'
import { AssistantBindingXpertDTO } from './dto/assistant-binding-xpert.dto'

@ApiTags('AssistantBinding')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
@Permissions(AIPermissionsEnum.XPERT_EDIT)
export class AssistantBindingController {
    constructor(private readonly service: AssistantBindingService) {}

    @Get()
    async getScopedBindings(@Query('scope') scope: AssistantBindingScope = AssistantBindingScope.ORGANIZATION) {
        return this.service.getScopedBindings(scope)
    }

    @Get('workspace/availability')
    @Permissions(AIPermissionsEnum.CHAT_VIEW, AIPermissionsEnum.XPERT_VIEW, AIPermissionsEnum.XPERT_EDIT)
    async getWorkspaceAvailability(): Promise<{ available: boolean }> {
        const binding = await this.service.getEffectiveBinding(AssistantCode.XPERT_SHARED)
        return { available: !!(binding.enabled && binding.assistantId) }
    }

    @Get('effective/:code')
    async getEffectiveBinding(@Param('code') code: AssistantCode) {
        return this.service.getEffectiveBinding(code)
    }

    @Get('xperts')
    @Permissions(AIPermissionsEnum.CHAT_VIEW)
    async getAvailableXperts(
        @Query('scope') scope: AssistantBindingScope = AssistantBindingScope.ORGANIZATION,
        @Query('code') code: AssistantCode
    ) {
        const appUser = !RequestContext.hasPermission(AIPermissionsEnum.XPERT_VIEW)
        if (appUser && scope !== AssistantBindingScope.USER)
            throw new ForbiddenException(t('server-ai:Error.ApplicationAuthoringDenied'))
        const assistants = await this.service.getAvailableXperts(scope, code)
        return appUser
            ? assistants.map(appUserRuntimeAssistant)
            : assistants.map((assistant) => new AssistantBindingXpertDTO(assistant))
    }

    @Get(':code/preference')
    async getBindingPreference(
        @Param('code') code: AssistantCode,
        @Query('scope') scope: AssistantBindingScope = AssistantBindingScope.USER
    ) {
        return this.service.getBindingPreference(code, scope)
    }

    @Get(':code')
    async getBinding(
        @Param('code') code: AssistantCode,
        @Query('scope') scope: AssistantBindingScope = AssistantBindingScope.ORGANIZATION
    ) {
        return this.service.getBinding(code, scope)
    }

    @Post()
    async upsertBinding(@Body() input: IAssistantBindingUpsertInput) {
        return this.service.upsertBinding(input)
    }

    @Post(':code/preference')
    async upsertBindingPreference(
        @Param('code') code: AssistantCode,
        @Body() input: IAssistantBindingUserPreferenceUpsertInput
    ) {
        return this.service.upsertBindingPreference(code, input)
    }

    @Delete(':code')
    async deleteBinding(
        @Param('code') code: AssistantCode,
        @Query('scope') scope: AssistantBindingScope = AssistantBindingScope.ORGANIZATION
    ) {
        return this.service.deleteBinding(code, scope)
    }
}
