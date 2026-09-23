import { t } from 'i18next'
import {
    BadRequestException,
    Body,
    Inject,
    Controller,
    Get,
    Param,
    Post,
    Put,
    UploadedFile,
    UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { z } from 'zod/v3'
import type { AgentPluginService } from './agent-plugin.service'
import type { RuntimeResourceBindingInput } from '@xpert-ai/contracts'
import { jsonValue } from './agent-plugin-parser'
import { agentPluginConnectorsSchema } from './agent-plugin-connector.schema'

const bindingSchema = z
    .object({
        replacesBindingId: z.string().uuid().optional(),
        title: z.string().trim().min(1).max(200),
        description: z.string().max(2000).optional(),
        workspaceIds: z.array(z.string().uuid()).min(1).max(100),
        definition: z.discriminatedUnion('kind', [
            z
                .object({
                    kind: z.literal('agent_plugin'),
                    packageId: z.string().uuid(),
                    experts: z.record(z.string().uuid()).default({}),
                    oauthServers: z.array(z.string()).optional(),
                    connectorServers: agentPluginConnectorsSchema.optional()
                })
                .strict(),
            z
                .object({
                    kind: z.literal('middleware'),
                    provider: z.string().min(1),
                    options: z.record(jsonValue).default({})
                })
                .strict(),
            z.object({ kind: z.literal('external_xpert'), xpertId: z.string().uuid() }).strict()
        ])
    })
    .strict()

export function parseResourceInput<T>(schema: z.ZodType<T>, input: unknown): T {
    const result = schema.safeParse(input)
    if (!result.success) throw new BadRequestException(result.error.flatten())
    return result.data
}

@Controller('agent-plugins')
export class AgentPluginController {
    constructor(@Inject('XpertAgentPluginService') private readonly service: AgentPluginService) {}
    @Get('options') options() {
        return this.service.options()
    }
    @Get() list() {
        return this.service.list()
    }
    @Post('git') importGit(@Body() input: unknown) {
        return this.service.importGit(
            parseResourceInput(
                z
                    .object({ url: z.string().url(), ref: z.string().min(1), subdirectory: z.string().optional() })
                    .strict(),
                input
            ) as { url: string; ref: string; subdirectory?: string }
        )
    }
    @Post('zip')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024, files: 1 } }))
    importZip(@UploadedFile() file?: { buffer: Buffer }) {
        if (!file?.buffer) throw new BadRequestException(t('server-ai:Error.AgentPluginZipRequired'))
        return this.service.importZip(file.buffer)
    }
    @Post('bindings') bind(@Body() input: unknown) {
        return this.service.createBinding(parseResourceInput(bindingSchema, input) as RuntimeResourceBindingInput)
    }
    @Put('bindings/:id') setEnabled(@Param('id') id: string, @Body() input: unknown) {
        return this.service.setEnabled(
            id,
            parseResourceInput(z.object({ enabled: z.boolean() }).strict(), input).enabled
        )
    }
}
