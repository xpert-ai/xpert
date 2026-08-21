import { IXpertProjectAsset } from '@xpert-ai/contracts'
import { PaginationParams, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { XpertProjectAsset } from '../entities/project-asset.entity'

@Injectable()
export class XpertProjectAssetService extends TenantOrganizationAwareCrudService<XpertProjectAsset> {
    constructor(@InjectRepository(XpertProjectAsset) repository: Repository<XpertProjectAsset>) {
        super(repository)
    }

    list(
        projectId: string,
        parentId?: string,
        kind?: IXpertProjectAsset['kind'],
        options: Partial<Pick<PaginationParams<XpertProjectAsset>, 'skip' | 'take'>> = {}
    ) {
        const take = Math.min(Math.max(options.take ?? 100, 1), 200)
        return this.findAll({
            where: { projectId, parentId: parentId ? parentId : IsNull(), ...(kind ? { kind } : {}) },
            order: { kind: 'DESC', name: 'ASC' },
            skip: Math.max(options.skip ?? 0, 0),
            take
        })
    }

    countProjectAssets(projectId: string) {
        return this.repository.count({ where: { projectId } })
    }

    tree(projectId: string) {
        return this.findAll({ where: { projectId }, order: { path: 'ASC' } })
    }

    async createAsset(projectId: string, input: Partial<IXpertProjectAsset>) {
        const path = input.path || input.name?.trim() || ''
        const existing = await this.repository.findOne({
            where: { projectId, path },
            withDeleted: true
        })
        if (existing) {
            const wasDeleted = Boolean(existing.deletedAt)
            Object.assign(existing, {
                name: input.name?.trim() || existing.name || 'Untitled asset',
                path,
                parentId: input.parentId,
                kind: input.kind ?? existing.kind ?? 'file',
                mimeType: input.mimeType,
                size: input.size,
                source: input.source ?? existing.source ?? 'upload',
                taskId: input.taskId,
                conversationId: input.conversationId,
                status: input.status ?? 'available',
                deletedAt: undefined,
                projectId
            })
            if (wasDeleted) await this.repository.recover(existing)
            return this.repository.save(existing)
        }
        return this.create({
            projectId,
            name: input.name?.trim() || 'Untitled asset',
            path,
            parentId: input.parentId,
            kind: input.kind ?? 'file',
            mimeType: input.mimeType,
            size: input.size,
            source: input.source ?? 'upload',
            taskId: input.taskId,
            conversationId: input.conversationId,
            status: input.status ?? 'available'
        })
    }

    async updateAsset(projectId: string, assetId: string, input: Partial<IXpertProjectAsset>) {
        const asset = await this.findOne({ where: { id: assetId, projectId } })
        if (!asset) throw new NotFoundException('Project asset not found')
        Object.assign(asset, input, { projectId })
        return this.save(asset)
    }

    async removeAsset(projectId: string, assetId: string) {
        const asset = await this.findOne({ where: { id: assetId, projectId } })
        if (!asset) throw new NotFoundException('Project asset not found')
        await this.repository.softRemove(asset)
    }
}
