import { SandboxManagedServiceErrorCode } from '@xpert-ai/contracts'

export class SandboxManagedServiceError extends Error {
    constructor(
        public readonly code: SandboxManagedServiceErrorCode,
        message: string,
        public readonly statusCode: number = 400
    ) {
        super(message)
    }
}
