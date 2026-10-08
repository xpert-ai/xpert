import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common'
import { t } from 'i18next'
import { ZodValidationPipe } from '@xpert-ai/server-core'
import { BosiBootstrapService } from './bosi-bootstrap.service'
import { BosiSelection, BosiSetupQuery, bosiSelectionSchema, bosiSetupQuerySchema } from './bosi-bootstrap.schema'
import {
    BosiOnboardingChoiceInput,
    BosiOnboardingConnectionInput,
    BosiOnboardingConnectionScope,
    bosiOnboardingChoiceSchema,
    bosiOnboardingConnectionSchema,
    bosiOnboardingConnectionScopeSchema
} from './bosi-onboarding.schema'
const invalid = () => new BadRequestException(t('server-ai:Error.BosiInvalidInput'))

@Controller('bosi')
export class BosiBootstrapController {
    constructor(private readonly bosi: BosiBootstrapService) {}

    @Get('setup')
    setup(@Query(new ZodValidationPipe(bosiSetupQuerySchema, invalid)) query: BosiSetupQuery) {
        return this.bosi.setup(query.capabilities)
    }

    @Post('bootstrap')
    create(@Body(new ZodValidationPipe(bosiSelectionSchema, invalid)) input: BosiSelection) {
        return this.bosi.create(input)
    }

    @Post('welcome')
    welcome() {
        return this.bosi.welcome()
    }

    @Post('workspace')
    workspace() {
        return this.bosi.prepareWorkspace()
    }

    @Post('onboarding')
    onboarding() {
        return this.bosi.onboardingCatalog()
    }

    @Post('onboarding/choice')
    choose(@Body(new ZodValidationPipe(bosiOnboardingChoiceSchema, invalid)) input: BosiOnboardingChoiceInput) {
        return this.bosi.chooseOnboarding(input)
    }

    @Post('onboarding/connection')
    connection(
        @Body(new ZodValidationPipe(bosiOnboardingConnectionSchema, invalid)) input: BosiOnboardingConnectionInput
    ) {
        return this.bosi.onboardingConnection(input.provider)
    }

    @Post('onboarding/connection/resolve')
    resolveConnection(
        @Body(new ZodValidationPipe(bosiOnboardingConnectionScopeSchema, invalid)) input: BosiOnboardingConnectionScope
    ) {
        return this.bosi.resolveOnboardingConnection(input)
    }
}
