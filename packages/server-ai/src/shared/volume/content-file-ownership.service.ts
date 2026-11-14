import { ConflictException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Not, Repository } from 'typeorm'
import { t } from 'i18next'
import { posix } from 'node:path'
import { ContentResourceEntry } from '../../content-resource/catalog/content-entry.entity'
import { contentSnapshotSchema } from '../../content-resource/catalog/catalog.schema'
import { ContentDocument } from '../../content-resource/documents/entities'

/** Invariants: generic mutations cannot bypass native publication or provider-owned persistence.
 * Retained metadata only restricts writes; it never grants source access or offline reading. */
@Injectable()
export class ContentFileOwnershipService {
    constructor(
        @InjectRepository(ContentDocument) private readonly documents: Repository<ContentDocument>,
        @InjectRepository(ContentResourceEntry) private readonly entries: Repository<ContentResourceEntry>
    ) {}
    async assertUnmanaged(tenantId: string, projectId: string | undefined, path: string, recursive = false) {
        if (!projectId) return
        path = canonicalPath(path)
        await this.assertUnmanagedDocument(tenantId, projectId, path, recursive)
        // Use retained catalog declarations even when a provider is unavailable or its resource is trashed;
        // both must keep their recoverable files protected. Registration/reconciliation populates this metadata.
        const entries = await this.entries.find({ where: { tenantId, projectId }, select: { offlineSnapshot: true } })
        for (const entry of entries) {
            if (!entry.offlineSnapshot) continue
            const parsed = contentSnapshotSchema.safeParse(entry.offlineSnapshot)
            // Corrupt metadata cannot safely identify an unaffected path; reject the mutation for this Project.
            if (!parsed.success || parsed.data.projectId !== projectId)
                throw new ConflictException(t('server-ai:Error.ContentEditorWriteRequired'))
            const snapshot = parsed.data
            if (snapshot.writeOwnership !== 'provider') continue
            const paths = [...(snapshot.containedPaths ?? [])]
            if (snapshot.source.kind === 'file') paths.push({ path: snapshot.source.path, recursive: false })
            if (snapshot.source.kind === 'bundle') paths.push({ path: snapshot.source.rootPath, recursive: true })
            if (paths.some((owned) => overlaps(owned.path, path, owned.recursive, recursive)))
                throw new ConflictException(t('server-ai:Error.ContentEditorWriteRequired'))
        }
    }
    /** Trusted provider writers call this after their own domain authorization.
     * Platform ContentDocuments still require their publication API, even for provider writes. */
    async assertUnmanagedDocument(tenantId: string, projectId: string | undefined, path: string, recursive = false) {
        if (!projectId) return
        path = canonicalPath(path)
        const managed = await this.documents.find({
            where: { tenantId, projectId, status: Not('deleted') },
            select: { path: true }
        })
        if (managed.some((document) => overlaps(canonicalPath(document.path), path, false, recursive)))
            throw new ConflictException(t('server-ai:Error.ContentEditorWriteRequired'))
    }
}

// Volume callers accept equivalent filesystem paths. Match that identity before checking path boundaries;
// containment and symlink checks remain with VolumeHandle rather than becoming an access grant here.
function canonicalPath(path: string) {
    const normalized = posix.normalize(path.replace(/\\/g, '/').replace(/^\/+/, '')).replace(/\/$/, '')
    return normalized === '.' ? '' : normalized
}
function overlaps(owned: string, target: string, ownsChildren: boolean, recursive: boolean) {
    return (
        owned === target ||
        (ownsChildren && target.startsWith(`${owned}/`)) ||
        (recursive && (!target || owned.startsWith(`${target}/`)))
    )
}
