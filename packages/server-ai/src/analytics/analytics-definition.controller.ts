import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { UUIDValidationPipe, ZodValidationPipe } from '@xpert-ai/server-core'
import { z } from 'zod/v3'
import { AnalyticsDefinitionService } from './analytics-definition.service'
import {
    createDefinitionSchema,
    publishDefinitionSchema,
    definitionPageSchema,
    definitionStatusSchema
} from './analytics-definition.schema'
import { definitionError } from './analytics-definition.errors'
const invalid = () => definitionError('invalid')
@Controller('analytics/definitions')
export class AnalyticsDefinitionController {
    constructor(private readonly service: AnalyticsDefinitionService) {}
    @Get('providers') catalog() {
        return this.service.catalog()
    }
    @Get() list(
        @Query(new ZodValidationPipe(definitionPageSchema, invalid)) input: z.output<typeof definitionPageSchema>
    ) {
        return this.service.list(input.page, input.pageSize)
    }
    @Post('validate') validate(
        @Body(new ZodValidationPipe(createDefinitionSchema, invalid)) input: z.output<typeof createDefinitionSchema>
    ) {
        return this.service.validateInput(input)
    }
    @Post() create(
        @Body(new ZodValidationPipe(createDefinitionSchema, invalid)) input: z.output<typeof createDefinitionSchema>
    ) {
        return this.service.create(input)
    }
    @Get(':id') get(@Param('id', UUIDValidationPipe) id: string) {
        return this.service.get(id)
    }
    @Get(':id/versions') history(
        @Param('id', UUIDValidationPipe) id: string,
        @Query(new ZodValidationPipe(definitionPageSchema, invalid)) input: z.output<typeof definitionPageSchema>
    ) {
        return this.service.history(id, input.page, input.pageSize)
    }
    @Get(':id/versions/:versionId') version(
        @Param('id', UUIDValidationPipe) id: string,
        @Param('versionId', UUIDValidationPipe) versionId: string
    ) {
        return this.service.version(id, versionId)
    }
    @Post(':id/versions') publish(
        @Param('id', UUIDValidationPipe) id: string,
        @Body(new ZodValidationPipe(publishDefinitionSchema, invalid)) input: z.output<typeof publishDefinitionSchema>
    ) {
        return this.service.publish(id, input)
    }
    @Patch(':id') status(
        @Param('id', UUIDValidationPipe) id: string,
        @Body(new ZodValidationPipe(definitionStatusSchema, invalid)) input: z.output<typeof definitionStatusSchema>
    ) {
        return this.service.status(id, input.status)
    }
}
