import { IPagination, TXpertWorkspaceAccessPurpose, TXpertWorkspaceVisibility } from '@xpert-ai/contracts'
import {
    CrudController,
    PaginationParams,
    ParseJsonPipe,
    TransformInterceptor,
    UserPublicDTO
} from '@xpert-ai/server-core'
import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Logger,
    Post,
    Query,
    UseGuards,
    UseInterceptors,
    Param,
    Put,
    Delete
} from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { XpertWorkspace } from './workspace.entity'
import { XpertWorkspaceCreateInput, XpertWorkspaceService, XpertWorkspaceUpdateInput } from './workspace.service'
import { WorkspaceAuthoringGuard } from './guards/workspace-authoring.guard'
import { WorkspaceOwnerGuard } from './guards/workspace-owner.guard'
import { WorkspacePublicDTO, XpertWorkspaceDTO } from './dto'

@ApiTags('XpertWorkspace')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertWorkspaceController extends CrudController<XpertWorkspace> {
    readonly #logger = new Logger(XpertWorkspaceController.name)
    constructor(
        private readonly service: XpertWorkspaceService,
        private readonly commandBus: CommandBus
    ) {
        super(service)
    }

    @Get()
    async findAllWorkspaces(@Query('data', ParseJsonPipe) options?: PaginationParams<XpertWorkspace>) {
        return this.service.findAllMy(options)
    }

    @Get('my')
    async findAllMy(
        @Query('data', ParseJsonPipe) options: PaginationParams<XpertWorkspace>,
        @Query('purpose') purpose?: TXpertWorkspaceAccessPurpose
    ) {
        return this.service.findAllMy(options, normalizeWorkspaceAccessPurpose(purpose))
    }

    @Get('count')
    async getCount(): Promise<number> {
        return (await this.service.findAllMy()).total
    }

    @Get('pagination')
    async paginationWorkspaces(
        @Query('data', ParseJsonPipe) options?: PaginationParams<XpertWorkspace>
    ): Promise<IPagination<WorkspacePublicDTO>> {
        const { items, total } = await this.service.findAllMyEntities(options)
        return {
            items: items.map((workspace) => new WorkspacePublicDTO(workspace)),
            total
        }
    }

    @Get('my/default')
    async findMyDefault(@Query('purpose') purpose?: TXpertWorkspaceAccessPurpose) {
        const workspace = await this.service.findMyDefault(normalizeWorkspaceAccessPurpose(purpose))
        return workspace ? new WorkspacePublicDTO(workspace) : null
    }

    @Post(':workspaceId/default')
    async setMyDefault(@Param('workspaceId') workspaceId: string) {
        return new WorkspacePublicDTO(await this.service.setMyDefault(workspaceId))
    }

    @ApiOperation({ summary: 'Create new record' })
    @ApiResponse({
        status: HttpStatus.CREATED,
        description: 'The record has been successfully created.' /*, type: T*/
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid input, The response body may contain clues as to what went wrong'
    })
    @HttpCode(HttpStatus.CREATED)
    @Post()
    async create(@Body() input: XpertWorkspaceCreateInput): Promise<XpertWorkspace> {
        return this.service.createWorkspace(input)
    }

    @UseGuards(WorkspaceAuthoringGuard)
    @Get(':workspaceId')
    async getOne(@Param('workspaceId') workspaceId: string) {
        const workspace = await this.service.findOne(workspaceId, { relations: ['owner'] })
        return new WorkspacePublicDTO(workspace)
    }

    @UseGuards(WorkspaceAuthoringGuard)
    @Get(':workspaceId/members')
    async getMembers(@Param('workspaceId') workspaceId: string) {
        const workspace = await this.service.findOne(workspaceId, { relations: ['members'] })
        return workspace.members?.map((member) => new UserPublicDTO(member)) ?? []
    }

    @UseGuards(WorkspaceOwnerGuard)
    @Put(':workspaceId')
    async update(@Param('workspaceId') id: string, @Body() entity: XpertWorkspaceUpdateInput) {
        return new WorkspacePublicDTO(await this.service.updateWorkspace(id, entity))
    }

    @UseGuards(WorkspaceOwnerGuard)
    @Put(':workspaceId/members')
    async updateMembers(@Param('workspaceId') id: string, @Body() members: string[]) {
        const workspace = await this.service.updateMembers(id, members)
        return new XpertWorkspaceDTO(workspace)
    }

    @UseGuards(WorkspaceOwnerGuard)
    @Put(':workspaceId/visibility')
    async updateVisibility(
        @Param('workspaceId') id: string,
        @Body('visibility') visibility: TXpertWorkspaceVisibility
    ) {
        const workspace = await this.service.updateVisibility(id, visibility)
        return new WorkspacePublicDTO(workspace)
    }

    @UseGuards(WorkspaceOwnerGuard)
    @Delete(':workspaceId')
    async delete(@Param('workspaceId') id: string) {
        return await this.service.deleteWorkspace(id)
    }

    @UseGuards(WorkspaceOwnerGuard)
    @Delete(':workspaceId/soft')
    async softRemove(@Param('workspaceId') id: string) {
        return this.service.softRemoveWorkspace(id)
    }

    @UseGuards(WorkspaceOwnerGuard)
    @Put(':workspaceId/recover')
    async softRecover(@Param('workspaceId') id: string) {
        return this.service.recoverWorkspace(id)
    }

    @UseGuards(WorkspaceOwnerGuard)
    @Post(':workspaceId/archive')
    async archive(@Param('workspaceId') id: string) {
        return await this.service.archiveWorkspace(id)
    }
}

function normalizeWorkspaceAccessPurpose(
    purpose?: TXpertWorkspaceAccessPurpose | string
): TXpertWorkspaceAccessPurpose {
    return purpose === 'authoring' ? 'authoring' : 'runtime'
}
