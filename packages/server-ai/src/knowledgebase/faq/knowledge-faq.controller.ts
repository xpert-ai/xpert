import { UUIDValidationPipe } from '@xpert-ai/server-core'
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
    StreamableFile,
    UploadedFile,
    UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { t } from 'i18next'
import { validate as validateUUID } from 'uuid'
import { CreateKnowledgeFAQDTO, UpdateKnowledgeFAQDTO } from '../dto'
import { KnowledgeFAQService } from './knowledge-faq.service'

const KNOWLEDGE_FAQ_IMPORT_MAX_BYTES = 10 * 1024 * 1024

function parseOptionalBoolean(value: string | undefined) {
    if (value === undefined || value === '') return undefined
    if (value === 'true') return true
    if (value === 'false') return false
    throw new BadRequestException(
        t('server-ai:Error.KnowledgeFAQEnabledFilterInvalid', {
            defaultValue: 'enabled must be true or false'
        })
    )
}

function parseOptionalInteger(value: string | undefined, field: 'skip' | 'take') {
    if (value === undefined || value === '') return undefined
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 0 || (field === 'take' && parsed === 0)) {
        throw new BadRequestException(
            t('server-ai:Error.KnowledgeFAQPaginationInvalid', {
                field,
                defaultValue: `${field} must be a positive integer`
            })
        )
    }
    return parsed
}

function parseVersion(value: string | number | undefined) {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new BadRequestException(
            t('server-ai:Error.KnowledgeFAQVersionRequired', {
                defaultValue: 'version is required'
            })
        )
    }
    return parsed
}

function parseExportFormat(value: string | undefined) {
    if (!value || value === 'csv') return 'csv' as const
    if (value === 'json') return 'json' as const
    throw new BadRequestException(
        t('server-ai:Error.KnowledgeFAQExportFormatInvalid', {
            defaultValue: 'FAQ export format must be csv or json.'
        })
    )
}

function parseImportMode(value: string | undefined) {
    if (!value || value === 'append') return 'append' as const
    if (value === 'replace') return 'replace' as const
    throw new BadRequestException(
        t('server-ai:Error.KnowledgeFAQImportModeInvalid', {
            defaultValue: 'FAQ import mode must be append or replace.'
        })
    )
}

function parseExportIds(value: string | string[] | undefined) {
    if (value === undefined) return undefined
    const ids = (Array.isArray(value) ? value : [value])
        .flatMap((item) => item.split(','))
        .map((item) => item.trim())
        .filter(Boolean)
    const uniqueIds = [...new Set(ids)]
    if (!uniqueIds.length || uniqueIds.some((id) => !validateUUID(id))) {
        throw new BadRequestException(
            t('server-ai:Error.KnowledgeFAQExportIdsInvalid', {
                defaultValue: 'FAQ export ids must be valid UUIDs.'
            })
        )
    }
    return uniqueIds
}

function writeDownload(response: Response, file: { content: Buffer; contentType: string; fileName: string }) {
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`)
    return new StreamableFile(file.content, {
        type: file.contentType,
        length: file.content.length
    })
}

@ApiTags('KnowledgeFAQ')
@ApiBearerAuth()
@Controller(':knowledgebaseId/faqs')
export class KnowledgeFAQController {
    constructor(private readonly service: KnowledgeFAQService) {}

    @Get()
    findAll(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @Query('search') search?: string,
        @Query('enabled') enabled?: string,
        @Query('skip') skip?: string,
        @Query('take') take?: string
    ) {
        return this.service.findAll(knowledgebaseId, {
            search: search?.trim() || undefined,
            enabled: parseOptionalBoolean(enabled),
            skip: parseOptionalInteger(skip, 'skip'),
            take: parseOptionalInteger(take, 'take')
        })
    }

    @Get('export')
    async exportFile(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @Query('format') format: string | undefined,
        @Query('ids') ids: string | string[] | undefined,
        @Res({ passthrough: true }) response: Response
    ) {
        const file = await this.service.exportFile(knowledgebaseId, parseExportFormat(format), parseExportIds(ids))
        return writeDownload(response, file)
    }

    @Get('import-template')
    async exportImportTemplate(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @Res({ passthrough: true }) response: Response
    ) {
        return writeDownload(response, await this.service.exportImportTemplate(knowledgebaseId))
    }

    @Get(':faqId')
    findOne(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @Param('faqId', UUIDValidationPipe) faqId: string
    ) {
        return this.service.findOne(knowledgebaseId, faqId)
    }

    @Post()
    create(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @Body() input: CreateKnowledgeFAQDTO
    ) {
        return this.service.create(knowledgebaseId, input)
    }

    @Post('import')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: KNOWLEDGE_FAQ_IMPORT_MAX_BYTES } }))
    importFile(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @Body('mode') mode: string | undefined,
        @UploadedFile() file?: Express.Multer.File
    ) {
        if (!file) {
            throw new BadRequestException(
                t('server-ai:Error.KnowledgeFAQImportFileRequired', {
                    defaultValue: 'Select an FAQ file to import.'
                })
            )
        }
        return this.service.importFile(knowledgebaseId, file, parseImportMode(mode))
    }

    @Post('import/preview')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: KNOWLEDGE_FAQ_IMPORT_MAX_BYTES } }))
    previewImportFile(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @UploadedFile() file?: Express.Multer.File
    ) {
        if (!file) {
            throw new BadRequestException(
                t('server-ai:Error.KnowledgeFAQImportFileRequired', {
                    defaultValue: 'Select an FAQ file to import.'
                })
            )
        }
        return this.service.previewImportFile(knowledgebaseId, file)
    }

    @Put(':faqId')
    update(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @Param('faqId', UUIDValidationPipe) faqId: string,
        @Body() input: UpdateKnowledgeFAQDTO
    ) {
        return this.service.update(knowledgebaseId, faqId, input)
    }

    @Delete(':faqId')
    async delete(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @Param('faqId', UUIDValidationPipe) faqId: string,
        @Query('version') version?: string
    ) {
        await this.service.delete(knowledgebaseId, faqId, parseVersion(version))
        return { success: true }
    }
}
