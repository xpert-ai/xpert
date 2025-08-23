import { CreateProjectToolsetHandler } from "./create-toolset.handler";
import { ExportProjectHandler } from "./export.handler";
import { GetVcsCredentialsHandler } from "./get-vcs-credentials.handler";

export const CommandHandlers = [
    CreateProjectToolsetHandler,
    ExportProjectHandler,
    GetVcsCredentialsHandler
]