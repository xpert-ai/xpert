import {
    KnowledgebaseCreateDocumentsInput,
    KnowledgebaseCreateFolderInput,
    KnowledgebaseDeleteDocumentsInput,
    KnowledgebaseDocumentStatusInput,
    KnowledgebaseImportArchiveInput,
    KnowledgebaseListDocumentsInput,
    KnowledgebaseMoveDocumentInput,
    KnowledgebaseStartProcessingInput,
    KnowledgebaseUploadFileInput
} from '@xpert-ai/plugin-sdk'

export class ListKnowledgebaseDocumentsCommand {
    constructor(public readonly input: KnowledgebaseListDocumentsInput) {}
}

export class CreateKnowledgebaseFolderCommand {
    constructor(public readonly input: KnowledgebaseCreateFolderInput) {}
}

export class MoveKnowledgebaseDocumentCommand {
    constructor(public readonly input: KnowledgebaseMoveDocumentInput) {}
}

export class UploadKnowledgebaseDocumentFileCommand {
    constructor(public readonly input: KnowledgebaseUploadFileInput) {}
}

export class ImportKnowledgebaseArchiveCommand {
    constructor(public readonly input: KnowledgebaseImportArchiveInput) {}
}

export class CreateKnowledgebaseDocumentsCommand {
    constructor(public readonly input: KnowledgebaseCreateDocumentsInput) {}
}

export class StartKnowledgebaseDocumentsProcessingCommand {
    constructor(public readonly input: KnowledgebaseStartProcessingInput) {}
}

export class GetKnowledgebaseDocumentStatusCommand {
    constructor(public readonly input: KnowledgebaseDocumentStatusInput) {}
}

export class DeleteKnowledgebaseDocumentsCommand {
    constructor(public readonly input: KnowledgebaseDeleteDocumentsInput) {}
}
