import { ICopilot } from "@metad/contracts";
import { Command } from "@nestjs/cqrs";
import { PGMemberVectorStore } from "../vector-store";

/**
 * Create a vector store for a specific collection (model dimension or model cube)
 */
export class CreateVectorStoreCommand extends Command<{
    vectorStore: PGMemberVectorStore | null,
    copilot: ICopilot | null
}> {
    static readonly type = '[Dimension Member] Create vector store';

    constructor(public readonly collectionName: string) {
        super()
    }
}
