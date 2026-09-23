import { Body, Inject, Controller, Get, Param, Post, Put, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import {
    AllowClientSecretBindings,
    ApiKeyOrClientSecretAuthGuard,
    Public,
    TransformInterceptor
} from '@xpert-ai/server-core'
import { SecretTokenBindingType, RuntimeResourcesSelection } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import type { RuntimeResourceService } from './runtime-resource.service'
import { runtimeResourcesSchema } from './runtime-resource-selection'
import { parseResourceInput } from './agent-plugin.controller'

@Public()
@AllowClientSecretBindings(SecretTokenBindingType.ENTERPRISE_XPERT)
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@UseInterceptors(TransformInterceptor)
@Controller()
export class RuntimeResourceController {
    constructor(@Inject('XpertRuntimeResourceService') private readonly service: RuntimeResourceService) {}
    @Get('assistants/:id/resources') catalog(@Param('id') id: string, @Query() query: unknown) {
        return this.service.catalog(
            id,
            parseResourceInput(
                z
                    .object({
                        projectId: z.string().uuid().optional(),
                        search: z.string().max(200).optional(),
                        kind: z.enum(['agent_plugin', 'middleware', 'external_xpert']).optional(),
                        offset: z.coerce.number().int().min(0).default(0),
                        limit: z.coerce.number().int().min(1).max(100).default(50)
                    })
                    .strict(),
                query
            )
        )
    }
    @Post('assistants/:id/resources/validate') async validate(@Param('id') id: string, @Body() body: unknown) {
        const input = parseResourceInput(
            z.object({ runtimeResources: runtimeResourcesSchema, projectId: z.string().uuid().optional() }).strict(),
            body
        )
        const resolved = await this.service.resolve(
            id,
            input.runtimeResources as RuntimeResourcesSelection,
            input.projectId
        )
        return resolved.selection
    }
    @Get('conversations/:id/runtime-resources') read(@Param('id') id: string) {
        return this.service.read(id)
    }
    @Post('assistants/:id/resources/authorize') authorize(@Param('id') id: string, @Body() input: unknown) {
        return this.service.authorize(
            id,
            parseResourceInput(
                z
                    .object({
                        bindingId: z.string().uuid(),
                        version: z.string(),
                        serverName: z.string(),
                        projectId: z.string().uuid().optional()
                    })
                    .strict(),
                input
            ) as { bindingId: string; version: string; serverName: string; projectId?: string }
        )
    }
    @Put('conversations/:id/runtime-resources') update(@Param('id') id: string, @Body() input: unknown) {
        return this.service.update(id, parseResourceInput(runtimeResourcesSchema, input) as RuntimeResourcesSelection)
    }
}
