import { Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
    KnowledgebaseConnectAgentInput,
    KnowledgebaseConnectAgentResult,
    KnowledgebaseCreateDocumentsInput,
    KnowledgebaseCreateDocumentsResult,
    KnowledgebaseCreateFolderInput,
    KnowledgebaseCreateFolderResult,
    KnowledgebaseDeleteChunksInput,
    KnowledgebaseDeleteChunksResult,
    KnowledgebaseDeleteDocumentsInput,
    KnowledgebaseDeleteDocumentsResult,
    KnowledgebaseDocumentStatusInput,
    KnowledgebaseDocumentStatusResult,
    KnowledgebaseEnsureInput,
    KnowledgebaseEnsureResult,
    KnowledgebaseImportArchiveInput,
    KnowledgebaseImportArchiveResult,
    KnowledgebaseListDocumentsInput,
    KnowledgebaseListDocumentsResult,
    KnowledgebaseListInput,
    KnowledgebaseListItem,
    KnowledgebaseMoveDocumentInput,
    KnowledgebaseMoveDocumentResult,
    KnowledgebaseReadImageInput,
    KnowledgebaseReadImageResult,
    KnowledgebaseReprocessDocumentsInput,
    KnowledgebaseSearchInput,
    KnowledgebaseSearchResult,
    KnowledgebaseStartProcessingInput,
    KnowledgebaseUploadFileInput,
    KnowledgebaseUploadedFile,
    KnowledgebaseWriteChunkInput,
    KnowledgebaseWriteChunkResult,
    ProjectEnsureInput,
    ProjectEnsureResult,
    RequestContext
} from '@xpert-ai/plugin-sdk'
import {
    CreateKnowledgebaseFolderCommand,
    CreateKnowledgebaseDocumentsCommand,
    DeleteAgentKnowledgeChunksCommand,
    DeleteKnowledgebaseDocumentsCommand,
    EnsureKnowledgebasesCommand,
    GetKnowledgebaseDocumentStatusCommand,
    ImportKnowledgebaseArchiveCommand,
    ListKnowledgebaseDocumentsCommand,
    MoveKnowledgebaseDocumentCommand,
    ReadKnowledgebaseDocumentImageCommand,
    ReprocessKnowledgebaseDocumentsCommand,
    StartKnowledgebaseDocumentsProcessingCommand,
    UploadKnowledgebaseDocumentFileCommand,
    WriteAgentKnowledgeChunkCommand
} from '../../../knowledgebase/commands'
import { KnowledgeSearchQuery, ListWorkspaceKnowledgebasesQuery } from '../../../knowledgebase/queries'
import { ConnectAgentKnowledgebasesCommand } from '../../../xpert-agent/commands'
import { EnsureXpertProjectCommand } from '../../../xpert-project/commands'
import { normalizeOptionalString } from './utils'

@Injectable()
export class AgentMiddlewareKnowledgeRuntimeService {
    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {}

    async listKnowledgebases(input: KnowledgebaseListInput = {}): Promise<KnowledgebaseListItem[]> {
        const workspaceId = normalizeOptionalString(input.workspaceId)
        if (!workspaceId) {
            return []
        }

        return this.queryBus.execute(
            new ListWorkspaceKnowledgebasesQuery({
                workspaceId,
                published: input.published,
                limit: input.limit
            })
        )
    }

    async ensureKnowledgebases(input: KnowledgebaseEnsureInput): Promise<KnowledgebaseEnsureResult> {
        return this.commandBus.execute(new EnsureKnowledgebasesCommand(input))
    }

    /** Expose idempotent Chat Project provisioning through the plugin runtime. */
    async ensureProject(input: ProjectEnsureInput): Promise<ProjectEnsureResult> {
        return this.commandBus.execute(new EnsureXpertProjectCommand(input))
    }

    async connectAgentKnowledgebases(input: KnowledgebaseConnectAgentInput): Promise<KnowledgebaseConnectAgentResult> {
        return this.commandBus.execute(new ConnectAgentKnowledgebasesCommand(input))
    }

    async searchKnowledgebase(input: KnowledgebaseSearchInput): Promise<KnowledgebaseSearchResult> {
        return this.queryBus.execute(
            new KnowledgeSearchQuery({
                tenantId: input.tenantId ?? RequestContext.currentTenantId(),
                organizationId: input.organizationId ?? RequestContext.getOrganizationId(),
                knowledgebases: input.knowledgebaseIds,
                query: input.query,
                k: input.k,
                score: input.score,
                filters: { request: input.filter },
                retrieval: input.retrieval,
                source: input.source,
                id: input.requestId
            })
        )
    }

    async writeKnowledgeChunk(input: KnowledgebaseWriteChunkInput): Promise<KnowledgebaseWriteChunkResult> {
        return this.commandBus.execute(new WriteAgentKnowledgeChunkCommand(input))
    }

    async deleteKnowledgeChunks(input: KnowledgebaseDeleteChunksInput): Promise<KnowledgebaseDeleteChunksResult> {
        return this.commandBus.execute(new DeleteAgentKnowledgeChunksCommand(input))
    }

    async uploadKnowledgebaseDocumentFile(input: KnowledgebaseUploadFileInput): Promise<KnowledgebaseUploadedFile> {
        return this.commandBus.execute(new UploadKnowledgebaseDocumentFileCommand(input))
    }

    async listKnowledgebaseDocuments(
        input: KnowledgebaseListDocumentsInput
    ): Promise<KnowledgebaseListDocumentsResult> {
        return this.commandBus.execute(new ListKnowledgebaseDocumentsCommand(input))
    }

    async createKnowledgebaseFolder(input: KnowledgebaseCreateFolderInput): Promise<KnowledgebaseCreateFolderResult> {
        return this.commandBus.execute(new CreateKnowledgebaseFolderCommand(input))
    }

    async moveKnowledgebaseDocument(input: KnowledgebaseMoveDocumentInput): Promise<KnowledgebaseMoveDocumentResult> {
        return this.commandBus.execute(new MoveKnowledgebaseDocumentCommand(input))
    }

    async importKnowledgebaseArchive(
        input: KnowledgebaseImportArchiveInput
    ): Promise<KnowledgebaseImportArchiveResult> {
        return this.commandBus.execute(new ImportKnowledgebaseArchiveCommand(input))
    }

    async createKnowledgebaseDocuments(
        input: KnowledgebaseCreateDocumentsInput
    ): Promise<KnowledgebaseCreateDocumentsResult> {
        return this.commandBus.execute(new CreateKnowledgebaseDocumentsCommand(input))
    }

    async startKnowledgebaseDocumentsProcessing(
        input: KnowledgebaseStartProcessingInput
    ): Promise<KnowledgebaseDocumentStatusResult> {
        return this.commandBus.execute(new StartKnowledgebaseDocumentsProcessingCommand(input))
    }

    /** Dispatches a scope-checked full reprocess without exposing storage paths. */
    async reprocessKnowledgebaseDocuments(
        input: KnowledgebaseReprocessDocumentsInput
    ): Promise<KnowledgebaseDocumentStatusResult> {
        return this.commandBus.execute(new ReprocessKnowledgebaseDocumentsCommand(input))
    }

    async getKnowledgebaseDocumentStatus(
        input: KnowledgebaseDocumentStatusInput
    ): Promise<KnowledgebaseDocumentStatusResult> {
        return this.commandBus.execute(new GetKnowledgebaseDocumentStatusCommand(input))
    }

    async deleteKnowledgebaseDocuments(
        input: KnowledgebaseDeleteDocumentsInput
    ): Promise<KnowledgebaseDeleteDocumentsResult> {
        return this.commandBus.execute(new DeleteKnowledgebaseDocumentsCommand(input))
    }

    /** Delegates scoped image reads to the Knowledge command boundary; never exposes storage paths directly. */
    async readKnowledgebaseDocumentImage(input: KnowledgebaseReadImageInput): Promise<KnowledgebaseReadImageResult> {
        return this.commandBus.execute(new ReadKnowledgebaseDocumentImageCommand(input))
    }
}
