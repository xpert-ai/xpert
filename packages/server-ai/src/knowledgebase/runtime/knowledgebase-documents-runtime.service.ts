import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
    KnowledgebaseDocumentsRuntimeCapability,
    type KnowledgebaseDocumentsApi,
    KnowledgebaseCreateDocumentsInput,
    KnowledgebaseCreateDocumentsResult,
    KnowledgebaseCreateFolderInput,
    KnowledgebaseCreateFolderResult,
    KnowledgebaseDeleteDocumentsInput,
    KnowledgebaseDeleteDocumentsResult,
    KnowledgebaseDocumentStatusInput,
    KnowledgebaseDocumentStatusResult,
    KnowledgebaseImportArchiveInput,
    KnowledgebaseImportArchiveResult,
    KnowledgebaseListDocumentsInput,
    KnowledgebaseListDocumentsResult,
    KnowledgebaseMoveDocumentInput,
    KnowledgebaseMoveDocumentResult,
    KnowledgebaseReadImageInput,
    KnowledgebaseReadImageResult,
    KnowledgebaseReprocessDocumentsInput,
    KnowledgebaseStartProcessingInput,
    KnowledgebaseUploadFileInput,
    KnowledgebaseUploadedFile
} from '@xpert-ai/plugin-sdk'
import {
    CreateKnowledgebaseFolderCommand,
    CreateKnowledgebaseDocumentsCommand,
    DeleteKnowledgebaseDocumentsCommand,
    GetKnowledgebaseDocumentStatusCommand,
    ImportKnowledgebaseArchiveCommand,
    ListKnowledgebaseDocumentsCommand,
    MoveKnowledgebaseDocumentCommand,
    ReadKnowledgebaseDocumentImageCommand,
    ReprocessKnowledgebaseDocumentsCommand,
    StartKnowledgebaseDocumentsProcessingCommand,
    UploadKnowledgebaseDocumentFileCommand
} from '../commands'
import { RuntimeCapabilityProvider } from '../../shared/runtime/runtime-capability-provider.decorator'

@Injectable()
@RuntimeCapabilityProvider(KnowledgebaseDocumentsRuntimeCapability)
export class KnowledgebaseDocumentsRuntimeService implements KnowledgebaseDocumentsApi {
    constructor(private readonly commandBus: CommandBus) {}

    async uploadFile(input: KnowledgebaseUploadFileInput): Promise<KnowledgebaseUploadedFile> {
        return this.commandBus.execute(new UploadKnowledgebaseDocumentFileCommand(input))
    }

    async listDocuments(input: KnowledgebaseListDocumentsInput): Promise<KnowledgebaseListDocumentsResult> {
        return this.commandBus.execute(new ListKnowledgebaseDocumentsCommand(input))
    }

    async createFolder(input: KnowledgebaseCreateFolderInput): Promise<KnowledgebaseCreateFolderResult> {
        return this.commandBus.execute(new CreateKnowledgebaseFolderCommand(input))
    }

    async moveDocument(input: KnowledgebaseMoveDocumentInput): Promise<KnowledgebaseMoveDocumentResult> {
        return this.commandBus.execute(new MoveKnowledgebaseDocumentCommand(input))
    }

    async importArchive(input: KnowledgebaseImportArchiveInput): Promise<KnowledgebaseImportArchiveResult> {
        return this.commandBus.execute(new ImportKnowledgebaseArchiveCommand(input))
    }

    async createDocuments(input: KnowledgebaseCreateDocumentsInput): Promise<KnowledgebaseCreateDocumentsResult> {
        return this.commandBus.execute(new CreateKnowledgebaseDocumentsCommand(input))
    }

    async startProcessing(input: KnowledgebaseStartProcessingInput): Promise<KnowledgebaseDocumentStatusResult> {
        return this.commandBus.execute(new StartKnowledgebaseDocumentsProcessingCommand(input))
    }

    async reprocessDocuments(input: KnowledgebaseReprocessDocumentsInput): Promise<KnowledgebaseDocumentStatusResult> {
        return this.commandBus.execute(new ReprocessKnowledgebaseDocumentsCommand(input))
    }

    async getDocumentStatus(input: KnowledgebaseDocumentStatusInput): Promise<KnowledgebaseDocumentStatusResult> {
        return this.commandBus.execute(new GetKnowledgebaseDocumentStatusCommand(input))
    }

    async deleteDocuments(input: KnowledgebaseDeleteDocumentsInput): Promise<KnowledgebaseDeleteDocumentsResult> {
        return this.commandBus.execute(new DeleteKnowledgebaseDocumentsCommand(input))
    }

    async readImage(input: KnowledgebaseReadImageInput): Promise<KnowledgebaseReadImageResult> {
        return this.commandBus.execute(new ReadKnowledgebaseDocumentImageCommand(input))
    }
}
