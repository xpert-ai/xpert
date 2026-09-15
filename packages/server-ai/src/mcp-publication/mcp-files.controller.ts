import { Public } from '@xpert-ai/server-core'
import {
    CanActivate,
    Controller,
    ExecutionContext,
    Get,
    Injectable,
    Post,
    Query,
    Req,
    Res,
    UploadedFile,
    UseGuards,
    UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Request, Response } from 'express'
import { MCP_FILE_MAX_BYTES, McpFilesService } from './mcp-files.service'

@Injectable()
export class McpFilesGuard implements CanActivate {
    constructor(private readonly files: McpFilesService) {}

    async canActivate(context: ExecutionContext) {
        await this.files.authorize(context.switchToHttp().getRequest<Request>())
        return true
    }
}

@Public()
@Controller('mcp/p')
@UseGuards(McpFilesGuard)
export class McpFilesController {
    constructor(private readonly files: McpFilesService) {}

    @Post(':slug/files')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MCP_FILE_MAX_BYTES, files: 1, fields: 0 } }))
    upload(@Req() request: Request, @UploadedFile() file: Express.Multer.File) {
        return this.files.upload(request, file)
    }

    @Get(':slug/files')
    async download(@Req() request: Request, @Query('filePath') filePath: string, @Res() response: Response) {
        const file = await this.files.download(request, filePath)
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('X-Content-Type-Options', 'nosniff')
        response.setHeader('Content-Type', 'application/octet-stream')
        response.attachment(file.name || 'download')
        response.send(file.buffer)
    }
}
