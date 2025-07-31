import { ClearEmbeddingMembersHandler } from "./clear-embedding.handler";
import { CreateVectorStoreHandler } from "./create-vector-store.handler";
import { EmbeddingMembersHandler } from "./embedding.handler";
import { GetDimensionMembersHandler } from "./get-dimension-members.handler";

export const CommandHandlers = [
    GetDimensionMembersHandler,
    CreateVectorStoreHandler,
    EmbeddingMembersHandler,
    ClearEmbeddingMembersHandler
]
