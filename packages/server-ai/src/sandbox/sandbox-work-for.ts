import type { SandboxProviderCreateOptions } from '@xpert-ai/plugin-sdk'

/** Validated execution identifiers used to select a sandbox binding, independently of file storage. */
export type SandboxWorkForInput = {
    /** An explicitly selected environment takes precedence even when the files belong to a project. */
    environmentId?: string | null
    projectId?: string | null
    /** Authenticated actor; also the fallback binding when no environment or project is selected. */
    userId: string
}

/**
 * Shared selection policy for Agent invocation and active/passive conversation access:
 * explicit environment, otherwise project, otherwise user. Pure selection does not
 * authorize resources, resolve/create an environment or change the work area's volume.
 */
export function resolveSandboxWorkFor(input: SandboxWorkForInput): SandboxProviderCreateOptions['workFor'] {
    if (input.environmentId) return { type: 'environment', id: input.environmentId }
    if (input.projectId) return { type: 'project', id: input.projectId }
    return { type: 'user', id: input.userId }
}
