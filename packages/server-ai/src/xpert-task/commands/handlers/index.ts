import { CreateXpertTaskHandler } from "./create.handler";
import { DeleteXpertTaskHandler } from "./delete.handler";
import { QueryXpertTaskHandler } from "./query.handler";

export const CommandHandlers = [
  CreateXpertTaskHandler,
  QueryXpertTaskHandler,
  DeleteXpertTaskHandler
]