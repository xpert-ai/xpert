import {
    AIPermissionsEnum,
    IKnowledgebase,
    IKnowledgebaseTask,
    IPagination,
    KnowledgebasePermission,
    KnowledgeFilterSources,
    KnowledgeDocumentProcessingMode,
    TKBRetrievalSettings
} from '@xpert-ai/contracts'
import {
    CrudController,
    PaginationParams,
    ParseJsonPipe,
    PermissionGuard,
    Permissions,
    RequestContext,
    TransformInterceptor,
    UploadFileCommand,
    UUIDValidationPipe,
    getFileAssetDestination,
    transformWhere
} from '@xpert-ai/server-core'
import { getErrorMessage, normalizeUploadedFileName } from '@xpert-ai/server-common'
import {
    Body,
    BadRequestException,
    Controller,
    Get,
    HttpStatus,
    Logger,
    Param,
    Post,
    Query,
    UseGuards,
    UseInterceptors,
    InternalServerErrorException,
    UploadedFile,
    Inject
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { FindOptionsWhere, In, Not } from 'typeorm'
import { Knowledgebase } from './knowledgebase.entity'
import { KnowledgebaseService } from './knowledgebase.service'
import { StatisticsKnowledgebasesQuery } from './queries'
import { WorkspaceAuthoringGuard } from '../xpert-workspace'
import { KnowledgebaseDetailDTO, KnowledgebasePublicDTO } from './dto'
import { FileInterceptor } from '@nestjs/platform-express'
import path from 'node:path'
import { buildLogicalFolderPath, KnowledgeDocumentService } from '../knowledge-document'
import { KnowledgebaseTask } from './task/task.entity'
import { KnowledgeRetrievalLog, KnowledgeRetrievalLogService } from './logs'
import moment from 'moment'
import { KnowledgeWorkAreaResolver } from '../shared'

@ApiTags('Knowledgebase')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class KnowledgebaseController extends CrudController<Knowledgebase> {
    readonly #logger = new Logger(KnowledgebaseController.name)

    @Inject(KnowledgeDocumentService)
    private readonly documentService: KnowledgeDocumentService

    @Inject(KnowledgeRetrievalLogService)
    private readonly retrievalLogService: KnowledgeRetrievalLogService

    @Inject(KnowledgeWorkAreaResolver)
    private readonly knowledgeWorkAreaResolver: KnowledgeWorkAreaResolver

    constructor(
        private readonly service: KnowledgebaseService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {
        super(service)
    }

    @ApiOperation({ summary: 'find all' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Found records'
    })
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.KNOWLEDGEBASE_EDIT)
    @Get()
    async findAll(
        @Query('data', ParseJsonPipe) data: PaginationParams<Knowledgebase>
    ): Promise<IPagination<Knowledgebase>> {
        return this.findAllAccessible(data)
    }

    @ApiOperation({ summary: 'Get total accessible record count' })
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.KNOWLEDGEBASE_EDIT)
    @Get('count')
    async getCount(@Query('$where', ParseJsonPipe) where?: FindOptionsWhere<Knowledgebase>): Promise<number> {
        return (await this.findAllAccessible({ where, take: 1, skip: 0, order: {}, withDeleted: false })).total
    }

    @ApiOperation({ summary: 'Find accessible records using pagination' })
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.KNOWLEDGEBASE_EDIT)
    @Get('pagination')
    async pagination(
        @Query('data', ParseJsonPipe) data?: PaginationParams<Knowledgebase>
    ): Promise<IPagination<Knowledgebase>> {
        return this.findAllAccessible(data)
    }

    private findAllAccessible(data?: PaginationParams<Knowledgebase>): Promise<IPagination<Knowledgebase>> {
        const { where, relations, ...rest } = data ?? {}
        const requestedWhere = Array.isArray(where) && where.length ? where : [where ?? {}]
        return this.service.findAll({
            ...rest,
            relations: this.service.getSafeReadRelations(relations),
            where: requestedWhere.flatMap((condition) => [
                {
                    ...condition,
                    createdById: RequestContext.currentUserId()
                },
                {
                    ...condition,
                    createdById: Not(RequestContext.currentUserId()),
                    permission: In([KnowledgebasePermission.Organization])
                }
            ])
        })
    }

    @UseGuards(WorkspaceAuthoringGuard)
    @Get('by-workspace/:workspaceId')
    async getAllByWorkspace(
        @Param('workspaceId') workspaceId: string,
        @Query('data', ParseJsonPipe) data: PaginationParams<Knowledgebase>,
        @Query('published') published?: boolean
    ) {
        const result = await this.service.getAllByWorkspace(
            workspaceId,
            {
                ...data,
                relations: this.service.getSafeReadRelations(data.relations)
            },
            published,
            RequestContext.currentUser()
        )
        return {
            ...result,
            items: result.items.map((item) => new KnowledgebasePublicDTO(item))
        }
    }

    @ApiOperation({ summary: 'find all' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Found records' /* type: IPagination<T> */
    })
    @Get('my')
    async findAllByMe(
        @Query('data', ParseJsonPipe) data: PaginationParams<Knowledgebase>
    ): Promise<IPagination<Knowledgebase>> {
        const { where, relations, ...rest } = data ?? {}
        return this.service.findAll({
            ...rest,
            relations: this.service.getSafeReadRelations(relations),
            where: {
                ...(where ?? {}),
                createdById: RequestContext.currentUserId()
            }
        })
    }

    @ApiOperation({ summary: 'find all' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Found records' /* type: IPagination<T> */
    })
    @Get('public')
    async findAllByPublic(
        @Query('data', ParseJsonPipe) data: PaginationParams<Knowledgebase>
    ): Promise<IPagination<Knowledgebase>> {
        const { where, relations, ...rest } = data ?? {}
        return this.service.findAll({
            ...rest,
            relations: this.service.getSafeReadRelations(relations),
            where: {
                ...(where ?? {}),
                permission: In([KnowledgebasePermission.Organization, KnowledgebasePermission.Public]),
                createdById: Not(RequestContext.currentUserId())
            }
        })
    }

    @Post('external')
    async createExternal(@Body() body: Partial<IKnowledgebase>) {
        return this.service.createExternal(body)
    }

    @Get('detail/:id')
    async findOneDetail(@Param('id', UUIDValidationPipe) id: string): Promise<KnowledgebaseDetailDTO> {
        return this.service.findOneDetail(id)
    }

    @Get(':id')
    async findById(
        @Param('id', UUIDValidationPipe) id: string,
        @Query('$relations', ParseJsonPipe) relations?: PaginationParams<Knowledgebase>['relations'],
        @Query('$select', ParseJsonPipe) select?: PaginationParams<Knowledgebase>['select']
    ): Promise<Knowledgebase> {
        return this.service.findOneByIdString(id, {
            select,
            relations: this.service.getSafeReadRelations(relations)
        })
    }

    @Get('text-splitter/strategies')
    async getTextSplitterStrategies() {
        return this.service.getTextSplitterStrategies()
    }

    @Get('transformer/strategies')
    async getDocumentTransformerStrategies() {
        return this.service.getDocumentTransformerStrategies()
    }

    @Get('understanding/strategies')
    async getUnderstandingStrategies() {
        return this.service.getUnderstandingStrategies()
    }

    @Get('source/strategies')
    async getDocumentSourceStrategies() {
        return this.service.getDocumentSourceStrategies()
    }

    @Post(':id/test')
    async test(
        @Param('id') id: string,
        @Body()
        body: {
            query: string
            k: number
            score: number
            filters?: KnowledgeFilterSources
            variables?: Record<string, unknown>
            retrieval?: TKBRetrievalSettings
        }
    ) {
        return await this.service.test(id, body)
    }

    @Post(':id/pipeline')
    async createPipeline(@Param('id') id: string) {
        try {
            return await this.service.createPipeline(id)
        } catch (err) {
            throw new InternalServerErrorException(getErrorMessage(err))
        }
    }

    @Post(':id/rebuild-embedding')
    async rebuildEmbedding(@Param('id') id: string) {
        try {
            return await this.service.startEmbeddingRebuild(id)
        } catch (err) {
            throw new BadRequestException(getErrorMessage(err))
        }
    }

    @Post(':id/cancel-pending-embedding-model')
    async cancelPendingEmbeddingModel(@Param('id') id: string) {
        try {
            return await this.service.cancelPendingEmbeddingModel(id)
        } catch (err) {
            throw new BadRequestException(getErrorMessage(err))
        }
    }

    /**
     * Create a new task for a knowledgebase.
     *
     * @param id Knowledgebase ID
     * @param body Partial task entity
     * @returns
     */
    @Post(':id/task')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.KNOWLEDGEBASE_EDIT)
    async createTask(@Param('id') id: string, @Body() body: Partial<IKnowledgebaseTask>) {
        return this.service.createTask(id, body)
    }

    @Get(':id/task/:taskId')
    async getTask(
        @Param('id') id: string,
        @Param('taskId') taskId: string,
        @Query('data', ParseJsonPipe) params: PaginationParams<KnowledgebaseTask>
    ) {
        return this.service.getTask(id, taskId, params)
    }

    @Post(':id/task/:taskId/process')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.KNOWLEDGEBASE_EDIT)
    async processTask(
        @Param('id') id: string,
        @Param('taskId') taskId: string,
        @Body()
        body: {
            sources?: { [key: string]: { documents: string[] } }
            stage: 'preview' | 'prod'
            mode?: KnowledgeDocumentProcessingMode
            options?: any
        }
    ) {
        return this.service.processTask(id, taskId, body)
    }

    /**
     * Upload a file to the kb volume.
     * @param parentId The document ID of the parent folder.
     */
    @Post(':id/file')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.KNOWLEDGEBASE_EDIT)
    @UseInterceptors(FileInterceptor('file'))
    async uploadFile(
        @Param('id') id: string,
        @Body('parentId') parentId: string,
        @Body('path') subpath: string,
        @UploadedFile() file: Express.Multer.File
    ) {
        await this.service.assertKnowledgebaseTaskWriteAccess(id)
        await this.service.assertNotRebuilding(id)
        let parentFolder = ''
        if (parentId) {
            const parents = await this.service.resolveKnowledgebaseFolderAncestors(id, parentId)
            parentFolder = buildLogicalFolderPath(parents)
        }

        await this.knowledgeWorkAreaResolver.resolve({
            tenantId: RequestContext.currentTenantId(),
            userId: RequestContext.currentUserId(),
            knowledgebaseId: id
        })
        const targetFolder = this.knowledgeWorkAreaResolver.getFilesPath(
            path.posix.join(parentFolder || '', subpath || '')
        )

        // Filename
        let originalname = ''
        try {
            originalname = normalizeUploadedFileName(file.originalname)
        } catch {
            throw new BadRequestException('File name is required')
        }
        let fileNameString = ''
        const fileNameParts = originalname.split('.')
        const ext = fileNameParts.length > 1 ? fileNameParts.pop() : ''
        fileNameString = `${fileNameParts.join('.')}-${moment().unix()}-${parseInt('' + Math.random() * 1000, 10)}`
        if (ext) {
            fileNameString += `.${ext}`
        }

        const asset = await this.commandBus.execute(
            new UploadFileCommand({
                source: {
                    kind: 'multipart',
                    file
                },
                targets: [
                    {
                        kind: 'volume',
                        catalog: 'knowledges',
                        knowledgeId: id,
                        folder: targetFolder,
                        fileName: fileNameString
                    }
                ]
            })
        )
        const destination = getFileAssetDestination(asset, 'volume')
        if (!destination || destination.status !== 'success') {
            throw new InternalServerErrorException(destination?.error || 'Failed to upload knowledgebase file')
        }

        return {
            url: destination.url,
            filePath: destination.path,
            fileUrl: destination.url,
            mimeType: file.mimetype
        }
    }

    @Get(':id/file/:name/preview')
    async previewFile(@Param('id') id: string, @Param('name') name: string) {
        return this.service.previewFile(id, decodeURIComponent(name))
    }

    // Statistics

    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.KNOWLEDGEBASE_EDIT)
    @Get('statistics/knowledgebases')
    async getStatisticsKnowledgebases(@Query('start') start: string, @Query('end') end: string) {
        return await this.queryBus.execute(new StatisticsKnowledgebasesQuery(start, end))
    }

    // Logs
    @Get(':id/logs')
    async getLogs(
        @Param('id') id: string,
        @Query('data', ParseJsonPipe) params: PaginationParams<KnowledgeRetrievalLog>
    ) {
        // Resolve through the scoped knowledgebase service before exposing its audit trail.
        await this.service.findOneByIdString(id)
        return this.retrievalLogService.findAll({
            ...(params ?? {}),
            where: {
                ...(transformWhere(params?.where) ?? {}),
                knowledgebaseId: id
            }
        })
    }
}
