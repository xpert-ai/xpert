import { ICommand } from '@nestjs/cqrs';

/**
 * Create a vector store for a specific collection (model dimension or model cube)
 */
export class CreateVectorStoreCommand implements ICommand {
    static readonly type = '[Dimension Member] Create vector store';

    constructor(
        public readonly collectionName: string,
    ) {}
}
