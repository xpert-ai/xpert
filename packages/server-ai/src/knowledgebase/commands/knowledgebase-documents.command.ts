import {
    AgentMiddlewareKnowledgebaseCreateDocumentsInput,
    AgentMiddlewareKnowledgebaseDeleteDocumentsInput,
    AgentMiddlewareKnowledgebaseDocumentStatusInput,
    AgentMiddlewareKnowledgebaseImportArchiveInput,
    AgentMiddlewareKnowledgebaseStartProcessingInput,
    AgentMiddlewareKnowledgebaseUploadFileInput
} from '@xpert-ai/plugin-sdk'

export class UploadKnowledgebaseDocumentFileCommand {
    constructor(public readonly input: AgentMiddlewareKnowledgebaseUploadFileInput) {}
}

export class ImportKnowledgebaseArchiveCommand {
    constructor(public readonly input: AgentMiddlewareKnowledgebaseImportArchiveInput) {}
}

export class CreateKnowledgebaseDocumentsCommand {
    constructor(public readonly input: AgentMiddlewareKnowledgebaseCreateDocumentsInput) {}
}

export class StartKnowledgebaseDocumentsProcessingCommand {
    constructor(public readonly input: AgentMiddlewareKnowledgebaseStartProcessingInput) {}
}

export class GetKnowledgebaseDocumentStatusCommand {
    constructor(public readonly input: AgentMiddlewareKnowledgebaseDocumentStatusInput) {}
}

export class DeleteKnowledgebaseDocumentsCommand {
    constructor(public readonly input: AgentMiddlewareKnowledgebaseDeleteDocumentsInput) {}
}
