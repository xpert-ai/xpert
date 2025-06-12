import { CreateFileToolsetHandler } from "./create-file-toolset.handler";
import { CreateProjectToolsetHandler } from "./create-toolset.handler";
import { DeleteProjectFileHandler } from "./delete-file.handler";
import { ListProjectFilesHandler } from "./list-files.handler";
import { ReadProjectFileHandler } from "./read-file.handler";
import { UpsertProjectFileHandler } from "./upsert-file.handler";

export const CommandHandlers = [
    CreateProjectToolsetHandler,
    CreateFileToolsetHandler,
    UpsertProjectFileHandler,
    DeleteProjectFileHandler,
    ReadProjectFileHandler,
    ListProjectFilesHandler
]