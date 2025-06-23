import { DeployWebappHandler } from "./deploy-webapp.handler";
import { StorageFileCreateHandler } from "./storage-file-create.handler";
import { StorageFileDeleteHandler } from "./storage-file-delete.handler";
import { StorageFileUpdateHandler } from "./storage-file-update.handler";


export const CommandHandlers = [
    StorageFileCreateHandler,
    StorageFileUpdateHandler,
    StorageFileDeleteHandler,
    DeployWebappHandler
];