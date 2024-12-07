import { RunCreateStreamHandler } from './run-create-stream.handler'
import { ThreadCreateHandler } from './thread-create.handler'
import { ThreadDeleteHandler } from './thread-delete.handler'

export const CommandHandlers = [
    ThreadCreateHandler,
    ThreadDeleteHandler,
    RunCreateStreamHandler,
]
