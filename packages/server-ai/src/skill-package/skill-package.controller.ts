import { IShareSkillPackageInput, InstallGithubSkillPackagesInput } from '@xpert-ai/contracts'
import { PaginationParams, ParseJsonPipe, TransformInterceptor } from '@xpert-ai/server-core'
import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Query,
    Res,
    UploadedFile,
    UseGuards,
    UseInterceptors
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { getErrorMessage } from '@xpert-ai/server-common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { FileInterceptor } from '@nestjs/platform-express'
import { createReadStream } from 'fs'
import type { Response } from 'express'
import archiver from 'archiver'
import { SkillPackage } from './skill-package.entity'
import { SkillPackageService } from './skill-package.service'
import { WorkspaceAuthoringGuard } from '../xpert-workspace'
import { SimpleSkillPackageDTO } from './dto'

type SkillPackageDownloadTarget = {
    absolutePath: string
    fileName: string
    mimeType: string
    type: 'file' | 'directory'
}

@ApiTags('Skill Package')
@UseInterceptors(TransformInterceptor)
@Controller('skill-package')
export class SkillPackageController {
    constructor(private readonly service: SkillPackageService) {}

    private async sendSkillPackageDownload(file: SkillPackageDownloadTarget, res: Response) {
        const encodedFilename = encodeURIComponent(file.fileName)
        res.setHeader('Content-Type', file.mimeType)
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
        )

        if (file.type === 'directory') {
            const archive = archiver('zip', { zlib: { level: 9 } })
            archive.on('error', (error) => {
                res.destroy(error)
            })
            archive.pipe(res)
            archive.directory(file.absolutePath, false)
            await archive.finalize()
            return
        }

        createReadStream(file.absolutePath).pipe(res)
    }

    @UseGuards(WorkspaceAuthoringGuard)
    @Get('by-workspace/:workspaceId')
    async getAllByWorkspace(
        @Param('workspaceId') workspaceId: string,
        @Query('data', ParseJsonPipe) data: PaginationParams<SkillPackage>,
        @Query('published') published?: boolean
    ) {
        const result = await this.service.getAllByWorkspace(workspaceId, data, published, RequestContext.currentUser())
        return {
            ...result,
            items: result.items.map((item) => new SimpleSkillPackageDTO(item))
        }
    }

    @Post('install')
    async installSkillPackage(@Body() body: { workspaceId: string; indexId: string }) {
        try {
            return await this.service.installSkillPackage(body.workspaceId, body.indexId)
        } catch (error) {
            throw new BadRequestException(`Failed to install skill package: ${getErrorMessage(error)}`)
        }
    }

    @UseGuards(WorkspaceAuthoringGuard)
    @Post('workspace/:workspaceId/install')
    async installSkillPackageInWorkspace(@Param('workspaceId') workspaceId: string, @Body() body: { indexId: string }) {
        try {
            return await this.service.installSkillPackage(workspaceId, body.indexId)
        } catch (error) {
            throw new BadRequestException(`Failed to install skill package: ${getErrorMessage(error)}`)
        }
    }

    @Delete('uninstall')
    async uninstallSkillPackage(@Body() body: string[]) {
        await Promise.all(body.map((id) => this.service.uninstallSkillPackage(id)))
    }

    @UseGuards(WorkspaceAuthoringGuard)
    @Delete('workspace/:workspaceId/:id')
    async uninstallSkillPackageInWorkspace(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
        await this.service.uninstallSkillPackageInWorkspace(workspaceId, id)
    }

    @UseGuards(WorkspaceAuthoringGuard)
    @Post('workspace/:workspaceId/upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadSkillPackage(@Param('workspaceId') workspaceId: string, @UploadedFile() file: Express.Multer.File) {
        try {
            return await this.service.uploadSkillPackagesFromFile(workspaceId, file)
        } catch (error) {
            throw new BadRequestException(`Failed to upload skill package: ${getErrorMessage(error)}`)
        }
    }

    @UseGuards(WorkspaceAuthoringGuard)
    @Post('workspace/:workspaceId/install-repository/:repositoryId')
    async installRepositorySkillPackages(
        @Param('workspaceId') workspaceId: string,
        @Param('repositoryId') repositoryId: string
    ) {
        return this.service.installRepositorySkillPackages(workspaceId, repositoryId)
    }

    @UseGuards(WorkspaceAuthoringGuard)
    @Post('workspace/:workspaceId/install-github')
    async installGithubSkillPackages(
        @Param('workspaceId') workspaceId: string,
        @Body() body: InstallGithubSkillPackagesInput
    ) {
        try {
            return await this.service.installGithubSkillPackages(workspaceId, body)
        } catch (error) {
            throw new BadRequestException(`Failed to install GitHub skill package: ${getErrorMessage(error)}`)
        }
    }

    @UseGuards(WorkspaceAuthoringGuard)
    @Post('workspace/:workspaceId/:id/share')
    async shareSkillPackage(
        @Param('workspaceId') workspaceId: string,
        @Param('id') id: string,
        @Body() body: IShareSkillPackageInput
    ) {
        try {
            return await this.service.shareSkillPackage(workspaceId, id, body)
        } catch (error) {
            throw new BadRequestException(`Failed to share skill package: ${getErrorMessage(error)}`)
        }
    }

    @UseGuards(WorkspaceAuthoringGuard)
    @Get('workspace/:workspaceId/:id/files')
    async getSkillPackageFiles(
        @Param('workspaceId') workspaceId: string,
        @Param('id') id: string,
        @Query('path') path?: string,
        @Query('deepth') deepth?: string
    ) {
        return this.service.getSkillPackageFiles(workspaceId, id, path, deepth ? Number(deepth) : undefined)
    }

    @UseGuards(WorkspaceAuthoringGuard)
    @Get('workspace/:workspaceId/:id/file')
    async getSkillPackageFile(
        @Param('workspaceId') workspaceId: string,
        @Param('id') id: string,
        @Query('path') path: string
    ) {
        return this.service.readSkillPackageFile(workspaceId, id, path)
    }

    @UseGuards(WorkspaceAuthoringGuard)
    @Post('workspace/:workspaceId/:id/file/upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadSkillPackageFile(
        @Param('workspaceId') workspaceId: string,
        @Param('id') id: string,
        @Body('path') path: string,
        @UploadedFile() file: Express.Multer.File
    ) {
        return this.service.uploadSkillPackageFile(workspaceId, id, path, file)
    }

    @UseGuards(WorkspaceAuthoringGuard)
    @Get('workspace/:workspaceId/:id/download')
    async downloadSkillPackage(
        @Param('workspaceId') workspaceId: string,
        @Param('id') id: string,
        @Res() res: Response
    ) {
        const file = await this.service.getSkillPackageRootDownload(workspaceId, id)
        await this.sendSkillPackageDownload(file, res)
    }

    @UseGuards(WorkspaceAuthoringGuard)
    @Get('workspace/:workspaceId/:id/file/download')
    async downloadSkillPackageFile(
        @Param('workspaceId') workspaceId: string,
        @Param('id') id: string,
        @Query('path') path: string,
        @Res() res: Response
    ) {
        const file = await this.service.getSkillPackageFileDownload(workspaceId, id, path)
        await this.sendSkillPackageDownload(file, res)
    }

    @UseGuards(WorkspaceAuthoringGuard)
    @Put('workspace/:workspaceId/:id/file')
    async saveSkillPackageFile(
        @Param('workspaceId') workspaceId: string,
        @Param('id') id: string,
        @Body() body: { path: string; content: string }
    ) {
        return this.service.saveSkillPackageFile(workspaceId, id, body?.path, body?.content)
    }

    @UseGuards(WorkspaceAuthoringGuard)
    @Delete('workspace/:workspaceId/:id/file')
    async deleteSkillPackageFile(
        @Param('workspaceId') workspaceId: string,
        @Param('id') id: string,
        @Query('path') path: string
    ) {
        return this.service.deleteSkillPackageFile(workspaceId, id, path)
    }
}
