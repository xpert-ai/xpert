import { CreateFileToolsetHandler } from "./create-file-toolset.handler";
import { CreateProjectToolsetHandler } from "./create-toolset.handler";
import { DeleteProjectFileHandler } from "./delete-file.handler";
import { UpsertProjectFileHandler } from "./upsert-file.handler";

export const CommandHandlers = [
    CreateProjectToolsetHandler,
    CreateFileToolsetHandler,
    UpsertProjectFileHandler,
    DeleteProjectFileHandler
]