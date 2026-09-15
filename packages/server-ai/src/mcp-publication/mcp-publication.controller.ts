import { Public } from '@xpert-ai/server-core'
import { All, Body, Controller, Param, Req, Res } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { McpPublicationRuntimeService } from './mcp-publication-runtime.service'

@ApiTags('MCP Publication runtime')
@Public()
@Controller('mcp/p')
export class McpPublicationController {
    constructor(private readonly runtime: McpPublicationRuntimeService) {}

    @All(':slug')
    handle(@Param('slug') slug: string, @Req() request: Request, @Res() response: Response, @Body() body: unknown) {
        return this.runtime.handle(slug, request, response, body)
    }
}
