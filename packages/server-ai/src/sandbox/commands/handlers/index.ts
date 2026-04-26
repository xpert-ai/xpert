import { SandboxAcquireBackendHandler } from './acquire-backend.handler'
import { SandboxGetManagedServiceLogsHandler } from './get-managed-service-logs.handler'
import { SandboxListManagedServicesHandler } from './list-managed-services.handler'
import { SandboxRestartManagedServiceHandler } from './restart-managed-service.handler'
import { SandboxCopyFileHandler } from './sandbox.copy-file.handler'
import { SandboxStartManagedServiceHandler } from './start-managed-service.handler'
import { SandboxStopManagedServiceHandler } from './stop-managed-service.handler'
import { SandboxVMHandler } from './vm.handler'

export const CommandHandlers = [
    SandboxVMHandler,
    SandboxAcquireBackendHandler,
    SandboxCopyFileHandler,
    SandboxStartManagedServiceHandler,
    SandboxListManagedServicesHandler,
    SandboxGetManagedServiceLogsHandler,
    SandboxStopManagedServiceHandler,
    SandboxRestartManagedServiceHandler
]
