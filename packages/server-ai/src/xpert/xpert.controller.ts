import {
    AIPermissionsEnum,
    IChatConversation,
    IIntegration,
    IXpert,
    LanguagesEnum,
    LongTermMemoryTypeEnum,
    TChatApi,
    TChatApp,
    TChatOptions,
    TMemoryQA,
    TMemoryUserProfile,
    TChatRequest,
    TXpertCommandProfile,
    TXpertTeamDraft,
    SecretTokenBindingType,
    xpertLabel,
    resolveRuntimeXpert,
    XpertFrequentQuestionsRequest
} from '@xpert-ai/contracts'
import {
    CrudController,
    OptionParams,
    PaginationParams,
    ParseJsonPipe,
    PermissionGuard,
    Permissions,
    RequestContext,
    TransformInterceptor,
    UseValidationPipe,
    UUIDValidationPipe,
    Public,
    SecretTokenService,
    TimeZone,
    UserService,
    transformWhere
} from '@xpert-ai/server-core'
import {
    Body,
    Controller,
    Delete,
    Get,
    Header,
    HttpCode,
    HttpStatus,
    Logger,
    Param,
    Post,
    Put,
    Query,
    Sse,
    UseInterceptors,
    UseGuards,
    HttpException,
    ForbiddenException,
    InternalServerErrorException,
    Res,
    NotFoundException,
    BadRequestException,
    UploadedFile as NestUploadedFile
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { UploadedFile } from '@xpert-ai/contracts'
import { FileStorage, UploadedFileStorage } from '@xpert-ai/server-core'
import path from 'path'
import iconv from 'iconv-lite'
import * as XLSX from 'xlsx'
import fsPromises from 'fs/promises'
import { getErrorMessage, keepAlive, parseQueryBoolean, takeUntilClose, yaml } from '@xpert-ai/server-common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { instanceToPlain } from 'class-transformer'
import { Request, Response } from 'express'
import { Between, DeleteResult, IsNull, LessThanOrEqual, Like, Not } from 'typeorm'
import { I18nLang, I18nService } from 'nestjs-i18n'
import { v4 as uuidv4 } from 'uuid'
import { randomBytes } from 'crypto'
import { ChatConversation, XpertAgentExecution } from '../core/entities/internal'
import { FindExecutionsByXpertQuery } from '../xpert-agent-execution/queries'
import {
    XpertChatCommand,
    XpertDelIntegrationCommand,
    XpertDeleteExportedTemplateCommand,
    XpertExportCommand,
    XpertExportDiagramCommand,
    type XpertExportedDiagram,
    XpertExportTemplateCommand,
    XpertImportCommand,
    XpertPublishIntegrationCommand
} from './commands'
import { XpertDraftDslDTO, XpertPublicDTO } from './dto'
import { Xpert } from './xpert.entity'
import { XpertService } from './xpert.service'
import { WorkspaceAuthoringGuard } from '../xpert-workspace/'
import {
    SearchXpertMemoryQuery,
    StatisticsXpertConversationsQuery,
    StatisticsXpertIntegrationsQuery,
    StatisticsXpertMessagesQuery,
    StatisticsXpertsQuery,
    StatisticsXpertTokensQuery
} from './queries'
import { CopilotStoreService } from '../copilot-store/copilot-store.service'
import { XpertAgentVariablesQuery } from '../xpert-agent/queries'
import { AnonymousXpertAuthGuard } from './auth/anonymous-auth.guard'
import {
    ChatConversationDeleteCommand,
    ChatConversationLogsQuery,
    ChatConversationUpsertCommand,
    FindChatConversationQuery,
    GetChatConversationQuery,
    StatisticsAverageSessionInteractionsQuery,
    StatisticsDailyConvQuery,
    StatisticsDailyEndUsersQuery,
    StatisticsDailyMessagesQuery,
    StatisticsTokenCostQuery,
    StatisticsTokensPerSecondQuery,
    StatisticsUserSatisfactionRateQuery
} from '../chat-conversation'
import { FindMessageFeedbackQuery } from '../chat-message-feedback/queries'
import { XpertGuard } from './guards/xpert.guard'
import { ChatConversationPublicDTO } from '../chat-conversation/dto'
import { EnvironmentService } from '../environment'
import { XpertDeleteCommand } from './commands/delete.command'
import { AGENT_CHAT_DISPATCH_MESSAGE_TYPE, AgentChatDispatchPayload, HandoffMessage } from '@xpert-ai/plugin-sdk'
import { HandoffQueueService } from '../handoff/message-queue.service'
import { AgentChatRealtimeService } from '../handoff/agent-chat-realtime.service'
import { PromptWorkflowService } from '../prompt-workflow'
import { RUNTIME_CAPABILITY_XPERT_RELATIONS, RuntimeCapabilitiesService } from '../ai/runtime-capabilities.service'
import { XpertFrequentQuestionsService } from './xpert-frequent-questions.service'
import { XpertPrincipalService } from './xpert-principal.service'
import { parseXpertPublishMarketplaceInput } from './marketplace-profile.parser'

@ApiTags('Xpert')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertController extends CrudController<Xpert> {
    readonly #logger = new Logger(XpertController.name)
    constructor(
        private readonly service: XpertService,
        private readonly storeService: CopilotStoreService,
        private readonly environmentService: EnvironmentService,
        private readonly userService: UserService,
        private readonly secretTokenService: SecretTokenService,
        private readonly i18n: I18nService,
        private readonly promptWorkflowService: PromptWorkflowService,
        private readonly runtimeCapabilitiesService: RuntimeCapabilitiesService,
        private readonly handoffQueue: HandoffQueueService,
        private readonly agentChatRealtime: AgentChatRealtimeService,
        private readonly xpertPrincipalService: XpertPrincipalService,
        private readonly frequentQuestionsService: XpertFrequentQuestionsService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {
        super(service)
    }

    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.XPERT_EDIT)
    @Get()
    async getAll(
        @Query('data', ParseJsonPipe) params: Partial<PaginationParams<Xpert>>,
        @Query('published') published?: boolean
    ) {
        const { where, ...rest } = params
        if (published) {
            where.version = Not(IsNull())
        }

        const result = await this.service.findAll({ ...rest, where })
        return {
            ...result,
            items: result.items.map((item) => new XpertPublicDTO(item))
        }
    }

    @UseGuards(WorkspaceAuthoringGuard)
    @Get('by-workspace/:workspaceId')
    async getAllByWorkspace(
        @Param('workspaceId') workspaceId: string,
        @Query('data', ParseJsonPipe) data: PaginationParams<Xpert>,
        @Query('published') published?: boolean
    ) {
        const result = await this.service.getAllByWorkspace(workspaceId, data, published, RequestContext.currentUser())
        return {
            ...result,
            items: result.items.map((item) => new XpertPublicDTO(item))
        }
    }

    @Get('my')
    async getMyAll(
        @Query('data', ParseJsonPipe) params: PaginationParams<Xpert>,
        @Query('includeOrganizationWorkspacesInTenantScope') includeOrganizationWorkspacesInTenantScope?: string
    ) {
        return this.service.getMyAll(params, {
            includeOrganizationWorkspacesInTenantScope: includeOrganizationWorkspacesInTenantScope === 'true'
        })
    }

    @Get('validate')
    async validateName(@Query('name') name: string) {
        return this.service.validateName(name)
    }

    @UseValidationPipe({ transform: true })
    @Post('import')
    async importDSL(@Body() dsl: XpertDraftDslDTO) {
        try {
            return await this.commandBus.execute(new XpertImportCommand(dsl))
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR)
        }
    }

    /**
     * Imports a new xpert DSL through the managed normalization path so primary
     * and middleware LLM copilot models are resolved before persistence.
     */
    @UseValidationPipe({ transform: true })
    @Post('import/managed')
    async importManagedDSL(@Body() dsl: XpertDraftDslDTO) {
        return await this.commandBus.execute(new XpertImportCommand(dsl, { normalizeCopilotModels: true }))
    }

    /**
     * Imports a DSL into an existing xpert through the same managed normalization
     * path while preserving overwrite-protected fields on the target xpert.
     */
    @UseValidationPipe({ transform: true })
    @Post(':id/import/managed')
    async importManagedDSLIntoXpert(@Param('id') id: string, @Body() dsl: XpertDraftDslDTO) {
        return await this.commandBus.execute(
            new XpertImportCommand(dsl, {
                targetXpertId: id,
                normalizeCopilotModels: true
            })
        )
    }

    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.XPERT_EDIT)
    @Get('select-options')
    async getSelectOptions() {
        const { items } = await this.getAll({ where: { latest: true } }, true)
        return items.map((item) => ({
            value: item.id,
            label: xpertLabel(item)
        }))
    }

    @Get('triggers/providers')
    async getTriggerProviders() {
        return this.service.getTriggerProviders()
    }

    @Get('sandbox/providers')
    async getSandboxProviders() {
        return this.service.getSandboxProviders()
    }

    @Get('slug/:slug')
    async getOneBySlug(@Param('slug') slug: string) {
        const xpert = await this.service.findBySlug(slug, ['agent', 'agents'])
        return xpert ? new XpertPublicDTO(xpert) : null
    }

    @UseGuards(XpertGuard)
    @Get(':id/export')
    async exportDSL(
        @Param('id') xpertId: string,
        @Query('isDraft') isDraft: string,
        @Query('includeMemory') includeMemory: string,
        @Query('data', ParseJsonPipe) params: PaginationParams<Xpert>
    ) {
        try {
            const xpert = await this.commandBus.execute(
                new XpertExportCommand(xpertId, isDraft === 'true', includeMemory === 'true')
            )
            return {
                data: yaml.stringify(instanceToPlain(xpert))
            }
        } catch (err) {
            throw new InternalServerErrorException(err.message)
        }
    }

    @UseGuards(XpertGuard)
    @Post(':id/export/template')
    async exportDSLAsTemplate(
        @Param('id') xpertId: string,
        @Query('isDraft') isDraft: string,
        @Query('includeMemory') includeMemory: string
    ) {
        try {
            return await this.commandBus.execute(
                new XpertExportTemplateCommand(xpertId, isDraft === 'true', includeMemory === 'true')
            )
        } catch (err) {
            throw new InternalServerErrorException(err.message)
        }
    }

    @UseGuards(XpertGuard)
    @Delete(':id/export/template')
    async deleteExportedTemplate(@Param('id') xpertId: string) {
        try {
            await this.commandBus.execute(new XpertDeleteExportedTemplateCommand(xpertId))
        } catch (err) {
            throw new InternalServerErrorException(err.message)
        }
    }

    @UseGuards(XpertGuard)
    @Get(':id/team')
    async getTeam(@Param('id') id: string, @Query('data', ParseJsonPipe) data: OptionParams<Xpert>) {
        return this.service.getTeam(id, data)
    }

    @Get(':id/version')
    async allVersions(@Param('id') id: string) {
        return this.service.allVersions(id)
    }

    @Post(':id/latest')
    async setAsLatest(@Param('id') id: string) {
        return this.service.setAsLatest(id)
    }

    @UseGuards(XpertGuard)
    @Post(':id/draft')
    async saveDraft(@Param('id') id: string, @Body() draft: TXpertTeamDraft) {
        // todo Check if you have permission to edit this xpert role
        draft.savedAt = new Date()
        // Save draft
        return await this.service.saveDraft(id, draft)
    }

    @UseGuards(XpertGuard)
    @Put(':id/draft')
    async updateDraft(@Param('id') id: string, @Body() draft: Partial<TXpertTeamDraft>) {
        // todo Check if you have permission to edit this xpert role
        draft.savedAt = new Date()
        // Save draft
        return await this.service.updateDraft(id, draft)
    }

    @UseGuards(XpertGuard)
    @Get(':id/commands')
    async getCommandProfile(@Param('id') id: string) {
        const xpert = await this.service.findOne(id)
        const sourceProfile = xpert.draft?.team?.commandProfile ?? xpert.commandProfile
        const profile = sourceProfile ?? { version: 1, commands: [] }
        return {
            profile,
            runtime: await this.promptWorkflowService.resolveRuntimeCommandProfile({
                ...xpert,
                commandProfile: sourceProfile
            })
        }
    }

    @UseGuards(XpertGuard)
    @Get(':id/runtime-capabilities')
    @ApiQuery({ name: 'isDraft', required: false, type: Boolean })
    async getRuntimeCapabilities(@Param('id') id: string, @Query('isDraft') isDraft?: string | boolean | string[]) {
        const sourceXpert = await this.service.findOne(id, {
            relations: RUNTIME_CAPABILITY_XPERT_RELATIONS
        })
        const xpert = resolveRuntimeXpert(sourceXpert, parseQueryBoolean(isDraft))
        return this.runtimeCapabilitiesService.getRuntimeCapabilities(xpert, id)
    }

    @UseGuards(XpertGuard)
    @Put(':id/commands')
    async updateCommandProfile(@Param('id') id: string, @Body() body: TXpertCommandProfile) {
        const xpert = await this.service.findOne(id)
        const profile = await this.promptWorkflowService.validateCommandProfile(xpert.workspaceId, body)
        return this.service.updateDraft(id, {
            team: {
                commandProfile: profile
            }
        } as Partial<TXpertTeamDraft>)
    }

    @UseGuards(XpertGuard)
    @Post(':id/publish')
    async publish(
        @Param('id') id: string,
        @Query('newVersion') newVersion: string,
        @Body() body: { environmentId: string; releaseNotes: string; marketplace?: unknown }
    ) {
        const marketplace = parseXpertPublishMarketplaceInput(body.marketplace)
        return this.service.publish(id, newVersion === 'true', body.environmentId, body.releaseNotes, marketplace)
    }

    /**
     * @deprecated use workflow trigger instead
     */
    @UseGuards(XpertGuard)
    @Post(':id/publish/integration')
    async publishIntegration(@Param('id') id: string, @Body() integration: Partial<IIntegration>) {
        return this.commandBus.execute(new XpertPublishIntegrationCommand(id, integration))
    }

    /**
     * @deprecated use workflow trigger instead
     */
    @UseGuards(XpertGuard)
    @Delete(':id/publish/integration/:integration')
    async deleteIntegration(@Param('id') id: string, @Param('integration') integration: string) {
        return this.commandBus.execute(new XpertDelIntegrationCommand(id, integration))
    }

    @Get(':id/diagram')
    async getDiagram(
        @Res() res: Response,
        @Param('id') id: string,
        @Query('isDraft') isDraft: string,
        @Query('agentKey') agentKey: string
    ) {
        try {
            const imageData = await this.commandBus.execute<XpertExportDiagramCommand, XpertExportedDiagram>(
                new XpertExportDiagramCommand(id, isDraft === 'true', agentKey)
            )
            res.setHeader('Content-Type', imageData.contentType)
            res.send(imageData.data)
        } catch (err) {
            console.error(err)
            throw new InternalServerErrorException(err instanceof Error ? err.message : String(err))
        }
    }

    @Get(':id/executions')
    async getExecutions(
        @Param('id') id: string,
        @Query('$order', ParseJsonPipe) order?: PaginationParams<XpertAgentExecution>['order']
    ) {
        return this.queryBus.execute(new FindExecutionsByXpertQuery(id, { order }))
    }

    @Header('content-type', 'text/event-stream')
    @Header('Connection', 'keep-alive')
    @Header('Cache-Control', 'no-cache')
    @Post(':id/chat')
    @Sse()
    async chat(
        @Res() res: Response,
        @Param('id') id: string,
        @I18nLang() language: LanguagesEnum,
        @TimeZone() timeZone: string,
        @Body()
        body: {
            request: TChatRequest
            options: TChatOptions
        }
    ) {
        let environment = null
        const requestEnvironmentId =
            body.request && 'environmentId' in body.request ? body.request.environmentId : undefined
        if (requestEnvironmentId) {
            environment = await this.environmentService.findOne(requestEnvironmentId)
        }
        const observable = await this.enqueueXpertChatTask(body.request, {
            ...body.options,
            xpertId: id,
            environment,
            language,
            timeZone,
            from: 'debugger'
        })
        return observable.pipe(
            // Add an operator to send a comment event periodically (30s) to keep the connection alive
            keepAlive(30000),
            takeUntilClose(res)
        )
    }

    @ApiOperation({ summary: 'Delete record' })
    @ApiResponse({
        status: HttpStatus.NO_CONTENT,
        description: 'The record has been successfully deleted'
    })
    @ApiResponse({
        status: HttpStatus.NOT_FOUND,
        description: 'Record not found'
    })
    @HttpCode(HttpStatus.ACCEPTED)
    @UseGuards(XpertGuard)
    @Delete(':id')
    async delete(@Param('id', UUIDValidationPipe) id: string): Promise<Xpert | DeleteResult> {
        return this.commandBus.execute(new XpertDeleteCommand(id))
    }

    @UseGuards(XpertGuard)
    @Get(':id/user-groups')
    async getUserGroups(@Param('id') id: string, @Query('organizationId') organizationId?: string) {
        return this.service.getUserGroups(id, organizationId)
    }

    @UseGuards(XpertGuard)
    @Put(':id/user-groups')
    async updateUserGroups(
        @Param('id') id: string,
        @Body() ids: string[],
        @Query('organizationId') organizationId?: string
    ) {
        return this.service.updateUserGroups(id, ids, organizationId)
    }

    @Get(':id/memory')
    async getAllMemory(@Param('id') id: string, @Query('types') types: string) {
        const _types = types?.split(':').filter((_) => !!_)
        return this.service.findAllMemory(id, _types)
    }

    @UseGuards(XpertGuard)
    @Get(':id/memory/files')
    async getMemoryFiles(
        @Param('id', UUIDValidationPipe) id: string,
        @Query('deepth') deepth: number,
        @Query('path') path: string
    ) {
        return await this.service.getMemoryFiles(id, path, deepth)
    }

    @UseGuards(XpertGuard)
    @Get(':id/memory/file')
    async getMemoryFile(@Param('id', UUIDValidationPipe) id: string, @Query('path') path: string) {
        return await this.service.getMemoryFile(id, path)
    }

    @UseGuards(XpertGuard)
    @Put(':id/memory/file')
    async saveMemoryFile(
        @Param('id', UUIDValidationPipe) id: string,
        @Body()
        body: {
            path: string
            content: string
        }
    ) {
        return await this.service.saveMemoryFile(id, body?.path, body?.content ?? '')
    }

    @UseGuards(XpertGuard)
    @Post(':id/memory/file/upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadMemoryFile(
        @Param('id', UUIDValidationPipe) id: string,
        @Body('path') path: string,
        @NestUploadedFile() file: Express.Multer.File
    ) {
        return await this.service.uploadMemoryFile(id, path, file)
    }

    @UseGuards(XpertGuard)
    @Delete(':id/memory/file')
    async deleteMemoryFile(@Param('id', UUIDValidationPipe) id: string, @Query('path') path: string) {
        return await this.service.deleteMemoryFile(id, path)
    }

    @Post(':id/memory/bulk')
    async createBulkMemory(
        @Param('id') id: string,
        @Body()
        body: {
            type: LongTermMemoryTypeEnum
            memories: Array<TMemoryQA | TMemoryUserProfile>
        }
    ) {
        return this.service.createBulkMemories(id, body)
    }

    /**
     * @todo Refactoring is required
     */
    @Post(':id/memory/bulk/upload')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: new FileStorage().storage({
                dest: path.join('temp'), // Store in a temporary directory
                prefix: 'memory-csv-upload'
            })
        })
    )
    @ApiOperation({ summary: 'Upload and parse CSV file for bulk memory import' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Memories parsed from CSV file'
    })
    async uploadAndParseCsv(
        @Param('id') id: string,
        @Body() body: { type: LongTermMemoryTypeEnum },
        @UploadedFileStorage() file: UploadedFile
    ): Promise<Array<TMemoryQA | TMemoryUserProfile>> {
        const type = body.type
        if (!file) {
            throw new BadRequestException('No file uploaded')
        }

        const { path: filePath, mimetype, originalname } = file

        if (mimetype !== 'text/csv' && !originalname.endsWith('.csv')) {
            throw new BadRequestException('Only CSV files are supported')
        }

        try {
            // Read file buffer
            const buffer = await fsPromises.readFile(filePath)

            // Function to check if string contains valid Chinese characters
            const containsValidChinese = (str: string): boolean => {
                return /[\u4e00-\u9fa5]/.test(str)
            }

            // Function to detect if string looks like mis-decoded UTF-8
            const looksLikeMisDecoded = (str: string): boolean => {
                return /[´°µÄÂÈøò·¢]{3,}/.test(str)
            }

            // Function to check if decoding is likely correct
            const isValidDecoding = (decoded: string, encoding: string): boolean => {
                if (decoded.includes('\uFFFD')) {
                    return false
                }

                if (encoding === 'utf8' || encoding === 'utf-8') {
                    try {
                        Buffer.from(decoded, 'utf8')
                        return true
                    } catch {
                        return false
                    }
                }

                return true
            }

            // Try different encodings
            const encodingsToTry = ['utf8', 'gbk', 'gb18030', 'gb2312', 'big5']

            // Check for BOM
            let startOffset = 0
            if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
                startOffset = 3
            }

            const bufferToDecode = startOffset > 0 ? buffer.slice(startOffset) : buffer

            let content: string | null = null
            let lastError: Error | null = null

            for (const encoding of encodingsToTry) {
                try {
                    const decoded = iconv.decode(bufferToDecode, encoding)

                    if (!isValidDecoding(decoded, encoding)) {
                        continue
                    }

                    if (looksLikeMisDecoded(decoded)) {
                        continue
                    }

                    if (containsValidChinese(decoded)) {
                        content = decoded
                        break
                    }

                    if (encoding === 'utf8' && !content && decoded.length > 0) {
                        content = decoded
                    } else if (!content && decoded.length > 0 && !decoded.match(/[^\x00-\x7F]/)) {
                        content = decoded
                    }
                } catch (err) {
                    lastError = err
                }
            }

            if (!content) {
                try {
                    content = iconv.decode(bufferToDecode, 'utf8')
                } catch (err) {
                    throw new BadRequestException(
                        `Failed to decode CSV file. Tried encodings: ${encodingsToTry.join(', ')}. Error: ${lastError?.message || err.message}`
                    )
                }
            }

            if (!content) {
                throw new BadRequestException('Failed to decode CSV file with any known encoding')
            }

            // Parse CSV with XLSX
            const workbook = XLSX.read(content, {
                type: 'string',
                codepage: 65001 // UTF-8 codepage
            })

            type MemoryCsvRow = {
                question?: unknown
                问题?: unknown
                問題?: unknown
                answer?: unknown
                答案?: unknown
                profile?: unknown
                档案?: unknown
                檔案?: unknown
                context?: unknown
                上下文?: unknown
            }

            const readCsvText = (...values: unknown[]) => {
                for (const value of values) {
                    if (typeof value === 'string') {
                        return value
                    }

                    if (typeof value === 'number' || typeof value === 'boolean') {
                        return String(value)
                    }
                }

                return ''
            }

            const sheet = workbook.Sheets[workbook.SheetNames[0]]
            const jsonData = XLSX.utils.sheet_to_json<MemoryCsvRow>(sheet)

            // Map to memory format based on type
            const memories: Array<TMemoryQA | TMemoryUserProfile> = jsonData.map((row) => {
                if (type === LongTermMemoryTypeEnum.QA) {
                    return {
                        question: readCsvText(row.question, row.问题, row.問題),
                        answer: readCsvText(row.answer, row.答案)
                    }
                }

                if (type === LongTermMemoryTypeEnum.PROFILE) {
                    return {
                        profile: readCsvText(row.profile, row.档案, row.檔案),
                        context: readCsvText(row.context, row.上下文)
                    }
                }

                throw new BadRequestException(`Unsupported memory type: ${type}`)
            })

            // Clean up temporary file
            try {
                await fsPromises.unlink(filePath)
            } catch (err) {
                // Ignore cleanup errors
            }

            return memories
        } catch (error) {
            // Clean up temporary file on error
            try {
                await fsPromises.unlink(filePath)
            } catch (err) {
                // Ignore cleanup errors
            }
            throw new BadRequestException(`Failed to parse CSV file: ${error.message}`)
        }
    }

    @Post(':id/memory')
    async createMemory(
        @Param('id') id: string,
        @Body() body: { type: LongTermMemoryTypeEnum; value: TMemoryQA | TMemoryUserProfile }
    ) {
        return this.service.createMemory(id, body)
    }

    @Post(':id/memory/search')
    async searchMemory(
        @Param('id') id: string,
        @Body() body: { type: LongTermMemoryTypeEnum; text: string; isDraft?: boolean }
    ) {
        try {
            return await this.queryBus.execute(new SearchXpertMemoryQuery(id, body))
        } catch (err) {
            throw new HttpException(getErrorMessage(err), HttpStatus.INTERNAL_SERVER_ERROR)
        }
    }

    @Delete(':id/memory')
    async clearMemory(@Param('id') id: string) {
        try {
            return await this.storeService.delete({ prefix: Like(`${id}%`) })
        } catch (err) {
            throw new HttpException(getErrorMessage(err), HttpStatus.INTERNAL_SERVER_ERROR)
        }
    }

    @Get(':id/variables')
    async getVariables(
        @Param('id') id: string,
        @Query('environment') environmentId: string,
        @Query('inputs') inputs: string
    ) {
        try {
            const inputKeys = inputs
                ? inputs
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean)
                : undefined
            return await this.queryBus.execute(
                new XpertAgentVariablesQuery({ xpertId: id, isDraft: true, environmentId, inputs: inputKeys })
            )
        } catch (err) {
            throw new HttpException(getErrorMessage(err), HttpStatus.INTERNAL_SERVER_ERROR)
        }
    }

    @Get(':id/agent/:agent/variables')
    async getAgentVariables(
        @Param('id') id: string,
        @Param('agent') agentKey: string,
        @Query('environment') environmentId: string,
        @Query('isDraft') isDraft: string,
        @Query('type') type: 'input' | 'output',
        @Query('inputs') inputs: string
    ) {
        try {
            const inputKeys = inputs
                ? inputs
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean)
                : undefined
            return await this.queryBus.execute(
                new XpertAgentVariablesQuery({
                    xpertId: id,
                    type,
                    nodeKey: agentKey,
                    isDraft: !(isDraft === 'false'),
                    environmentId,
                    inputs: inputKeys
                })
            )
        } catch (err) {
            throw new HttpException(getErrorMessage(err), HttpStatus.INTERNAL_SERVER_ERROR)
        }
    }

    /**
     * Get available variables for a workflow node
     */
    @Get(':id/workflow/:key/variables')
    async getWorkflowVariables(
        @Param('id') id: string,
        @Param('key') nodeKey: string,
        @Query('environment') environmentId: string,
        @Query('type') type: 'input' | 'output',
        @Query('inputs') inputs: string
    ) {
        try {
            const inputKeys = inputs
                ? inputs
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean)
                : undefined
            return await this.queryBus.execute(
                new XpertAgentVariablesQuery({
                    xpertId: id,
                    type,
                    nodeKey,
                    isDraft: true,
                    environmentId,
                    inputs: inputKeys
                })
            )
        } catch (err) {
            throw new HttpException(getErrorMessage(err), HttpStatus.INTERNAL_SERVER_ERROR)
        }
    }

    @Put(':id/api')
    async updateChatApi(@Param('id') id: string, @Body() api: Partial<TChatApi>) {
        const xpert = await this.service.findOne(id)
        await this.service.update(id, { api: { ...(xpert.api ?? {}), ...api } })
        if (!api.disabled && !xpert.userId) {
            await this.xpertPrincipalService.ensurePrincipalUser(xpert)
        }
    }

    @Put(':id/app')
    async updateChatApp(@Param('id') id: string, @Body() app: Partial<TChatApp>) {
        const xpert = await this.service.findOne(id)
        await this.service.update(id, { app: { ...(xpert.app ?? {}), ...app } })
        if (app.enabled && !xpert.userId) {
            await this.xpertPrincipalService.ensurePrincipalUser(xpert)
        }
    }

    @Post(':id/principal-user')
    async ensurePrincipalUser(@Param('id') id: string) {
        const xpert = await this.service.findOne(id)
        const user = await this.xpertPrincipalService.ensurePrincipalUser(xpert)
        return {
            userId: user.id
        }
    }

    @Post(':id/duplicate')
    async duplicate(@Param('id') id: string, @Body() body: { basic: Partial<IXpert>; isDraft: boolean }) {
        try {
            const xpertDto = await this.commandBus.execute(new XpertExportCommand(id, body.isDraft, false))
            const dsl = instanceToPlain(xpertDto)
            return await this.commandBus.execute(
                new XpertImportCommand({ ...dsl, team: { ...dsl.team, ...body.basic } })
            )
        } catch (err) {
            throw new InternalServerErrorException(err.message)
        }
    }

    // Conversations

    @UseGuards(XpertGuard)
    @Get(':id/conversations')
    async getConversations(
        @Param('id') id: string,
        @Query('data', ParseJsonPipe) data: PaginationParams<ChatConversation>,
        @Query('start') start: string,
        @Query('end') end: string,
        @Query('search') search?: string
    ) {
        const { where } = data
        const result = await this.queryBus.execute(
            new ChatConversationLogsQuery(
                {
                    ...data,
                    where: {
                        ...(transformWhere(where ?? {}) ?? {}),
                        xpertId: id,
                        createdAt: start ? Between(new Date(start), new Date(end)) : LessThanOrEqual(new Date(end))
                    }
                },
                search
            )
        )
        return {
            ...result,
            items: result.items.map((item) => new ChatConversationPublicDTO(item))
        }
    }

    @UseGuards(XpertGuard)
    @Get(':id/frequent-questions')
    async getFrequentQuestions(
        @Param('id', UUIDValidationPipe) id: string,
        @Query('locale') locale?: string,
        @Query('windowDays') windowDays?: string,
        @Query('conversationLimit') conversationLimit?: string,
        @Query('questionCount') questionCount?: string,
        @Query('forceRefresh') forceRefresh?: string
    ) {
        const request: XpertFrequentQuestionsRequest = {
            locale,
            windowDays: this.parseOptionalPositiveInteger(windowDays),
            conversationLimit: this.parseOptionalPositiveInteger(conversationLimit),
            questionCount: this.parseOptionalPositiveInteger(questionCount),
            forceRefresh: parseQueryBoolean(forceRefresh)
        }
        return this.frequentQuestionsService.getFrequentQuestions(id, request)
    }

    // Public App

    @Public()
    @Post(':identifier/chatkit-session')
    async createPublicChatkitSession(
        @Param('identifier') identifier: string,
        @Body()
        body: {
            expires_after?: number
            currentClientSecret?: string
        },
        @Res({ passthrough: true }) res: Response
    ) {
        const xpert = await this.service.findPublicChatAppXpert(identifier)
        const anonymousId = this.getOrSetAnonymousId(res)
        const anonymousUser = await this.userService.ensureCommunicationUser({
            tenantId: xpert.tenantId,
            thirdPartyId: `public-xpert:${xpert.id}:anonymous:${anonymousId}`,
            username: `${xpert.slug || xpert.id}:${anonymousId}`
        })

        const token = `cs-x-${randomBytes(32).toString('hex')}`
        const expiresAfter = this.normalizeChatkitSessionExpiresAfter(body?.expires_after)
        const validUntil = new Date(Date.now() + 1000 * expiresAfter)

        await this.secretTokenService.create({
            entityId: xpert.id,
            type: SecretTokenBindingType.PUBLIC_XPERT,
            tenantId: xpert.tenantId,
            organizationId: xpert.organizationId ?? null,
            createdById: anonymousUser.id,
            token,
            validUntil
        })

        return {
            client_secret: token,
            expires_at: validUntil,
            expires_after: expiresAfter,
            xpertId: xpert.id,
            assistantId: xpert.id,
            organizationId: xpert.organizationId ?? null
        }
    }

    private getOrSetAnonymousId(res: Response) {
        const req = RequestContext.currentRequest() as unknown as Request
        const existing = req?.cookies?.['anonymous.id']
        if (typeof existing === 'string' && existing.trim()) {
            return existing.trim()
        }

        const anonymousId = uuidv4()
        const forwardedProto = req?.headers?.['x-forwarded-proto']
        const isSecure =
            req?.secure ||
            forwardedProto === 'https' ||
            (Array.isArray(forwardedProto) && forwardedProto.includes('https'))

        res.cookie('anonymous.id', anonymousId, {
            httpOnly: true,
            maxAge: 365 * 24 * 60 * 60 * 1000,
            sameSite: isSecure ? 'none' : 'lax',
            secure: Boolean(isSecure)
        })

        return anonymousId
    }

    private normalizeChatkitSessionExpiresAfter(value: unknown) {
        const parsed = typeof value === 'number' ? value : Number(value)
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return 600
        }

        return Math.min(Math.floor(parsed), 3600)
    }

    @Public()
    @UseGuards(AnonymousXpertAuthGuard)
    @Get(':name/app')
    async getChatApp(@Param('name') name: string) {
        const xpert = await this.service.findBySlug(name)
        if (!xpert) {
            throw new NotFoundException(`Not found xpert '${name}'`)
        }

        if (!xpert.app?.enabled) {
            throw new ForbiddenException(name)
        }

        return new XpertPublicDTO(xpert)
    }

    private getPublicUserCondition() {
        const userId = RequestContext.currentUserId()
        const fromEndUserId = (<Request>(<unknown>RequestContext.currentRequest())).cookies['anonymous.id']
        return userId
            ? fromEndUserId
                ? { createdById: userId, fromEndUserId }
                : { createdById: userId }
            : { fromEndUserId }
    }

    @Public()
    @UseGuards(AnonymousXpertAuthGuard)
    @Get(':name/conversation/:id')
    async getAppConversation(
        @Param('name') name: string,
        @Param('id') id: string,
        @Query('$relations', ParseJsonPipe) relations?: PaginationParams<ChatConversation>['relations'],
        @Query('$select', ParseJsonPipe) select?: PaginationParams<ChatConversation>['select']
    ) {
        const conversation = await this.queryBus.execute(
            new GetChatConversationQuery(
                {
                    id,
                    ...this.getPublicUserCondition()
                },
                relations
            )
        )
        return conversation
    }

    @Public()
    @UseGuards(AnonymousXpertAuthGuard)
    @Delete(':name/conversation/:id')
    async deleteAppConversation(@Param('name') slug: string, @Param('id') id: string) {
        await this.queryBus.execute(new GetChatConversationQuery({ id, ...this.getPublicUserCondition() }))
        await this.commandBus.execute(new ChatConversationDeleteCommand({ id, ...this.getPublicUserCondition() }))
    }

    @Public()
    @UseGuards(AnonymousXpertAuthGuard)
    @Get(':name/conversation')
    async getAppConversations(
        @Param('name') slug: string,
        @Query('data', ParseJsonPipe) paginationOptions?: PaginationParams<ChatConversation>
    ) {
        const xpert = await this.service.findBySlug(slug)
        const conversation = await this.queryBus.execute(
            new FindChatConversationQuery(
                {
                    ...(paginationOptions.where ?? {}),
                    ...this.getPublicUserCondition(),
                    xpertId: xpert.id
                },
                paginationOptions
            )
        )
        return conversation
    }

    @Public()
    @UseGuards(AnonymousXpertAuthGuard)
    @Put(':name/conversation/:id')
    async updateAppConversation(
        @Param('name') slug: string,
        @Param('id') id: string,
        @Body() entity: Partial<IChatConversation>
    ) {
        await this.queryBus.execute(new FindChatConversationQuery({ id, ...this.getPublicUserCondition() }))
        await this.commandBus.execute(
            new ChatConversationUpsertCommand({
                id,
                ...entity
            })
        )
    }

    @Public()
    @UseGuards(AnonymousXpertAuthGuard)
    @Get(':name/conversation/:id/feedbacks')
    async getAppFeedbacks(
        @Param('name') name: string,
        @Param('id') id: string,
        @Query('$relations', ParseJsonPipe) relations?: PaginationParams<ChatConversation>['relations'],
        @Query('$select', ParseJsonPipe) select?: PaginationParams<ChatConversation>['select']
    ) {
        const conversation = await this.queryBus.execute(
            new FindChatConversationQuery({ id, ...this.getPublicUserCondition() }, { relations })
        )
        return await this.queryBus.execute(new FindMessageFeedbackQuery({ conversationId: conversation.id }, relations))
    }

    @Public()
    @UseGuards(AnonymousXpertAuthGuard)
    @Header('content-type', 'text/event-stream')
    @Header('Connection', 'keep-alive')
    @Post(':name/chat-app')
    @Sse()
    async chatApp(
        @Res() res: Response,
        @Param('name') name: string,
        @I18nLang() language: LanguagesEnum,
        @TimeZone() timeZone: string,
        @Body() body: { request: TChatRequest; options: TChatOptions }
    ) {
        const xpert = await this.service.findBySlug(name)
        if (!xpert) {
            throw new NotFoundException(`Not found xpert '${name}'`)
        }

        let environment = null
        const requestEnvironmentId =
            body.request && 'environmentId' in body.request ? body.request.environmentId : undefined
        if (requestEnvironmentId) {
            environment = await this.environmentService.findOne(requestEnvironmentId)
        }

        const fromEndUserId = (<Request>(<unknown>RequestContext.currentRequest())).cookies['anonymous.id']
        const observable = await this.enqueueXpertChatTask(body.request, {
            ...body.options,
            xpertId: xpert.id,
            environment,
            language,
            timeZone,
            from: 'webapp',
            fromEndUserId
        })
        return observable.pipe(
            // Add an operator to send a comment event periodically (30s) to keep the connection alive
            keepAlive(30000),
            takeUntilClose(res)
        )
    }

    private async enqueueXpertChatTask(
        request: TChatRequest,
        options: NonNullable<ConstructorParameters<typeof XpertChatCommand>[1]>
    ) {
        const queueTaskId = `xpert-chat-${uuidv4()}`
        const sessionKey = request.conversationId ?? options.messageId ?? queueTaskId
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) {
            throw new Error(`Missing tenantId for xpert chat handoff task "${queueTaskId}"`)
        }

        const organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()
        const language = RequestContext.getLanguageCode() ?? options.language
        const now = Date.now()
        const message: HandoffMessage<AgentChatDispatchPayload> = {
            id: queueTaskId,
            type: AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
            version: 1,
            tenantId,
            sessionKey,
            businessKey: sessionKey,
            attempt: 1,
            maxAttempts: 1,
            enqueuedAt: now,
            traceId: options.messageId ?? queueTaskId,
            payload: {
                request,
                options,
                callback: {
                    transport: 'redis-pubsub'
                },
                ...(options.execution?.id ? { executionId: options.execution.id } : {})
            },
            headers: {
                ...(organizationId ? { organizationId } : {}),
                ...(userId ? { userId } : {}),
                ...(language ? { language } : {}),
                ...(request.conversationId ? { conversationId: request.conversationId } : {}),
                source: 'chat'
            }
        }

        return this.agentChatRealtime.createStream(queueTaskId, async () => {
            await this.handoffQueue.enqueue(message)
        })
    }

    private parseOptionalPositiveInteger(value?: string) {
        const trimmed = value?.trim()
        if (!trimmed) {
            return undefined
        }

        const parsed = Number.parseInt(trimmed, 10)
        if (!Number.isFinite(parsed)) {
            return undefined
        }

        return parsed
    }

    // Statistics

    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.XPERT_EDIT)
    @Get('statistics/xperts')
    async getStatisticsXperts(@Query('start') start: string, @Query('end') end: string) {
        return await this.queryBus.execute(new StatisticsXpertsQuery(start, end))
    }

    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.XPERT_EDIT)
    @Get('statistics/xpert-conversations')
    async getStatisticsXpertConversations(@Query('start') start: string, @Query('end') end: string) {
        return await this.queryBus.execute(new StatisticsXpertConversationsQuery(start, end))
    }

    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.XPERT_EDIT)
    @Get('statistics/xpert-messages')
    async getStatisticsXpertMessages(
        @Query('start') start: string,
        @Query('end') end: string,
        @Query('model') model: string,
        @Query('userId') userId: string
    ) {
        return await this.queryBus.execute(new StatisticsXpertMessagesQuery(start, end, { model, userId }))
    }

    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.XPERT_EDIT)
    @Get('statistics/xpert-tokens')
    async getStatisticsXpertTokens(
        @Query('start') start: string,
        @Query('end') end: string,
        @Query('model') model: string,
        @Query('userId') userId: string
    ) {
        return await this.queryBus.execute(new StatisticsXpertTokensQuery(start, end, { model, userId }))
    }

    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.XPERT_EDIT)
    @Get('statistics/xpert-integrations')
    async getStatisticsXpertIntegrations(@Query('start') start: string, @Query('end') end: string) {
        return await this.queryBus.execute(new StatisticsXpertIntegrationsQuery(start, end))
    }

    @UseGuards(XpertGuard)
    @Get(':id/statistics/daily-conversations')
    async getDailyConversations(@Param('id') id: string, @Query('start') start: string, @Query('end') end: string) {
        return await this.queryBus.execute(new StatisticsDailyConvQuery(start, end, id))
    }

    @UseGuards(XpertGuard)
    @Get(':id/statistics/daily-end-users')
    async getDailyEndUsers(@Param('id') id: string, @Query('start') start: string, @Query('end') end: string) {
        return await this.queryBus.execute(new StatisticsDailyEndUsersQuery(start, end, id))
    }

    @UseGuards(XpertGuard)
    @Get(':id/statistics/average-session-interactions')
    async getAverageSessionInteractions(
        @Param('id') id: string,
        @Query('start') start: string,
        @Query('end') end: string
    ) {
        return await this.queryBus.execute(new StatisticsAverageSessionInteractionsQuery(start, end, id))
    }

    @UseGuards(XpertGuard)
    @Get(':id/statistics/daily-messages')
    async getDailyMessages(
        @Param('id') id: string,
        @Query('start') start: string,
        @Query('end') end: string,
        @Query('currentUserOnly') currentUserOnly?: string
    ) {
        return await this.queryBus.execute(
            new StatisticsDailyMessagesQuery(start, end, id, currentUserOnly === 'true' || currentUserOnly === '1')
        )
    }

    @UseGuards(XpertGuard)
    @Get(':id/statistics/tokens-per-second')
    async getTokensPerSecond(@Param('id') id: string, @Query('start') start: string, @Query('end') end: string) {
        return await this.queryBus.execute(new StatisticsTokensPerSecondQuery(start, end, id))
    }

    @UseGuards(XpertGuard)
    @Get(':id/statistics/token-costs')
    async getTokenCost(@Param('id') id: string, @Query('start') start: string, @Query('end') end: string) {
        return await this.queryBus.execute(new StatisticsTokenCostQuery(start, end, id))
    }

    @UseGuards(XpertGuard)
    @Get(':id/statistics/user-satisfaction-rate')
    async getUserSatisfactionRate(@Param('id') id: string, @Query('start') start: string, @Query('end') end: string) {
        return await this.queryBus.execute(new StatisticsUserSatisfactionRateQuery(start, end, id))
    }
}
