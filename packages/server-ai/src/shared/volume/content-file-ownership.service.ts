import { ConflictException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Not, Repository } from 'typeorm'
import { t } from 'i18next'
import { ContentDocument } from '../../content-resource/documents/entities'

/** Generic upload/write APIs must not bypass a collaborative document's publication chain. */
@Injectable()
export class ContentFileOwnershipService {
    constructor(@InjectRepository(ContentDocument) private readonly documents: Repository<ContentDocument>) {}
    async assertUnmanaged(tenantId: string, projectId: string | undefined, path: string, recursive = false) {
        if (!projectId) return
        const managed = await this.documents.find({
            where: { tenantId, projectId, status: Not('deleted') },
            select: { path: true }
        })
        if (managed.some((document) => document.path === path || (recursive && document.path.startsWith(`${path}/`))))
            throw new ConflictException(t('server-ai:Error.ContentEditorWriteRequired'))
    }
}
