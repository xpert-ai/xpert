import { SandboxAcquireBackendHandler } from './acquire-backend.handler'
import { SandboxCopyFileHandler } from './sandbox.copy-file.handler'
import { SandboxVMHandler } from './vm.handler'

export const CommandHandlers = [
    SandboxVMHandler,
    SandboxAcquireBackendHandler,
    SandboxCopyFileHandler
]
