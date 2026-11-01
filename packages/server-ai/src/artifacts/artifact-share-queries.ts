// Owner-scoped share queries remain with Artifact persistence. Callers supply trusted identity and typed source filters.
import { Injectable, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import type { ArtifactAccessMode } from '@xpert-ai/contracts'
import { ArtifactsService } from './artifacts.service'
import { ArtifactLink, ArtifactVersion } from './entities'

export type ArtifactShareOwner = { tenantId: string; userId: string }
export type ArtifactShareFilter = { pluginName: string; resourceType: string; shareKey: string; resourceId?: string }
export type ArtifactSharePageInput = { limit: number; offset: number; search: string; before?: string }
export type OwnedArtifactShare = {
    id: string
    slug: string
    publicUrl?: string
    accessMode: ArtifactAccessMode
    organizationId: string
    createdAt: Date
    expiresAt: Date | null
    title: string
    status: 'active' | 'expired' | 'unavailable'
}

@Injectable()
export class ArtifactShareQueries {
    constructor(
        private readonly data: DataSource,
        private readonly artifacts: ArtifactsService
    ) {}

    async readSharedContent(slug: string, filter: ArtifactShareFilter, principal?: ArtifactShareOwner) {
        const row = await this.data
            .getRepository(ArtifactLink)
            .findOne({ where: { slug }, relations: { artifact: true } })
        if (
            !row?.artifact ||
            row.artifact.pluginName !== filter.pluginName ||
            row.artifact.resourceType !== filter.resourceType ||
            row.shareKey !== filter.shareKey ||
            (filter.resourceId && row.artifact.resourceId !== filter.resourceId)
        )
            throw new NotFoundException('Artifact share was not found')
        return this.artifacts.resolveForPublicAccess({ slug, principal })
    }

    async listForSource(owner: ArtifactShareOwner, filter: ArtifactShareFilter): Promise<OwnedArtifactShare[]> {
        const rows = await this.owned(owner, filter).andWhere('link.expiresAt > :now', { now: new Date() }).getMany()
        return Promise.all(rows.map((row) => this.describe(row)))
    }

    async list(owner: ArtifactShareOwner, filter: ArtifactShareFilter, input: ArtifactSharePageInput) {
        const asOf = new Date(Math.min(input.before ? Date.parse(input.before) : Date.now(), Date.now()))
        const query = this.owned(owner, filter).andWhere('link.createdAt <= :asOf', { asOf })
        const totalAll = await query.getCount()
        if (input.search)
            query.andWhere('version.title ILIKE :search', { search: `%${input.search.replace(/[\\%_]/g, '\\$&')}%` })
        const total = input.search ? await query.getCount() : totalAll
        const { entities, raw } = await query
            .addSelect('version.title', 'share_title')
            .orderBy('link.createdAt', 'DESC')
            .addOrderBy('link.id', 'DESC')
            .skip(input.offset)
            .take(input.limit)
            .getRawAndEntities<{ share_title: unknown }>()
        const items = await Promise.all(entities.map((row, index) => this.describe(row, raw[index]?.share_title)))
        return { items, total, totalAll, asOf: asOf.toISOString() }
    }

    async findOwned(owner: ArtifactShareOwner, filter: ArtifactShareFilter, id: string) {
        const row = await this.owned(owner, filter).andWhere('link.id = :id', { id }).getOne()
        return row ? this.describe(row) : null
    }

    async revokeOwned(owner: ArtifactShareOwner, filter: ArtifactShareFilter, id: string) {
        const row = await this.owned(owner, filter).andWhere('link.id = :id', { id }).getOne()
        if (row) await this.revoke(row, owner)
    }

    async revokeAllOwned(owner: ArtifactShareOwner, filter: ArtifactShareFilter, before: string) {
        const rows = await this.owned(owner, filter)
            .andWhere('link.createdAt <= :before', { before: new Date(Math.min(Date.parse(before), Date.now())) })
            .getMany()
        for (const row of rows) await this.revoke(row, owner)
        return { revoked: rows.length }
    }

    private owned(owner: ArtifactShareOwner, filter: ArtifactShareFilter) {
        const query = this.data
            .getRepository(ArtifactLink)
            .createQueryBuilder('link')
            .innerJoinAndSelect('link.artifact', 'artifact')
            .leftJoin(
                ArtifactVersion,
                'version',
                'version.id = link.artifactVersionId AND version.artifactId = artifact.id'
            )
            // PostgreSQL must infer UUID creator and varchar owner parameters independently.
            .where(
                'link.tenantId = :tenantId AND link.createdById = :createdById AND link.userId = :userId AND artifact.userId = :userId AND artifact.tenantId = :tenantId',
                { ...owner, createdById: owner.userId }
            )
            .andWhere('artifact.pluginName = :pluginName AND artifact.resourceType = :resourceType', {
                pluginName: filter.pluginName,
                resourceType: filter.resourceType
            })
            .andWhere('link.shareKey = :shareKey AND link.status != :revoked', {
                shareKey: filter.shareKey,
                revoked: 'revoked'
            })
        if (filter.resourceId) query.andWhere('artifact.resourceId = :resourceId', { resourceId: filter.resourceId })
        return query
    }

    private revoke(row: ArtifactLink, owner: ArtifactShareOwner) {
        return this.artifacts
            .createScopedApi({ ...owner, organizationId: row.organizationId })
            .revokeArtifactLink(row.id)
    }

    private async describe(row: ArtifactLink, title?: unknown): Promise<OwnedArtifactShare> {
        const available = await this.artifacts.isShareAvailableToOwner(row)
        return {
            id: row.id,
            slug: row.slug,
            ...(available ? { publicUrl: row.publicUrl } : {}),
            accessMode: row.accessMode,
            organizationId: row.organizationId,
            createdAt: row.createdAt,
            expiresAt: row.expiresAt ?? null,
            title: typeof title === 'string' ? title : '',
            status:
                row.expiresAt && row.expiresAt.getTime() <= Date.now()
                    ? 'expired'
                    : available
                      ? 'active'
                      : 'unavailable'
        }
    }
}
