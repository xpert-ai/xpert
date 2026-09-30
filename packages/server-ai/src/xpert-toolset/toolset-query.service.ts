import { IUser } from '@xpert-ai/contracts'
import { PaginationParams } from '@xpert-ai/server-core'
import { FindManyOptions, FindOneOptions, FindOptionsWhere, Repository } from 'typeorm'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { XpertWorkspaceBaseService } from '../xpert-workspace/workspace-base.service'
import { XpertToolset } from './xpert-toolset.entity'

// Toolset writes must not override recursive ORM signatures; queries reuse existing workspace access rules.
export class ToolsetQueryService {
    private readonly queries: XpertWorkspaceBaseService<XpertToolset>

    constructor(
        protected readonly repository: Repository<XpertToolset>,
        protected readonly workspaceAccessService: XpertWorkspaceAccessService
    ) {
        this.queries = new XpertWorkspaceBaseService(repository, workspaceAccessService)
    }

    protected assertWorkspaceAuthoringAccess(workspaceId: string) {
        return this.workspaceAccessService.assertCanAuthor(workspaceId)
    }

    count(options?: FindManyOptions<XpertToolset>) {
        return this.queries.count(options)
    }

    countBy(where?: FindOptionsWhere<XpertToolset>) {
        return this.queries.countBy(where)
    }

    findAll(options?: FindManyOptions<XpertToolset>) {
        return this.queries.findAll(options)
    }

    findMyAll(options?: FindManyOptions<XpertToolset>) {
        return this.queries.findMyAll(options)
    }

    paginate(options?: FindManyOptions<XpertToolset>) {
        return this.queries.paginate(options)
    }

    findOne(id: string | number | FindOneOptions<XpertToolset>, options?: FindOneOptions<XpertToolset>) {
        return this.queries.findOne(id, options)
    }

    findOneForRuntime(id: string | number | FindOneOptions<XpertToolset>, options?: FindOneOptions<XpertToolset>) {
        return this.queries.findOneForRuntime(id, options)
    }

    findOneByIdString(id: string, options?: FindOneOptions<XpertToolset>) {
        return this.queries.findOneByIdString(id, options)
    }

    findOneOrFailByIdString(id: string, options?: FindOneOptions<XpertToolset>) {
        return this.queries.findOneOrFailByIdString(id, options)
    }

    findOneByOptions(options: FindOneOptions<XpertToolset>) {
        return this.queries.findOneByOptions(options)
    }

    findOneByWhereOptions(where: FindOptionsWhere<XpertToolset>) {
        return this.queries.findOneByWhereOptions(where)
    }

    findOneOrFailByOptions(options: FindOneOptions<XpertToolset>) {
        return this.queries.findOneOrFailByOptions(options)
    }

    findOneOrFailByWhereOptions(where: FindOptionsWhere<XpertToolset>) {
        return this.queries.findOneOrFailByWhereOptions(where)
    }

    getAllByWorkspace(workspaceId: string, data: PaginationParams<XpertToolset>, published: boolean, user: IUser) {
        return this.queries.getAllByWorkspace(workspaceId, data, published, user)
    }

    getAllByWorkspaceForRuntime(
        workspaceId: string,
        data: PaginationParams<XpertToolset>,
        published: boolean,
        user: IUser
    ) {
        return this.queries.getAllByWorkspaceForRuntime(workspaceId, data, published, user)
    }
}
