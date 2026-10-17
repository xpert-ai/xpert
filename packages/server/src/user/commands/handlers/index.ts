import { ResolveRuntimeUserHandler } from './resolve-runtime-user.handler'
import { UserBulkCreateHandler } from './user.bulk.create.handler'
import { UserCreateHandler } from './user.create.handler'
import { UserDeleteHandler } from './user.delete.handler'

export const CommandHandlers = [ResolveRuntimeUserHandler, UserCreateHandler, UserDeleteHandler, UserBulkCreateHandler]
