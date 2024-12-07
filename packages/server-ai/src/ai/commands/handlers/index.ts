import { RunCreateStreamHandler } from './run-create-stream.handler'
import { ThreadCreateHandler } from './thread-create.handler'

export const CommandHandlers = [
    ThreadCreateHandler,
    RunCreateStreamHandler
]
