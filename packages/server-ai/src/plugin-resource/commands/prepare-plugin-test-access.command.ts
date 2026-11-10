import { Command } from '@nestjs/cqrs'

export interface PluginTestRuntimeIdentity {
  scopeKey: string
  runtimeRevision: string
  packageVersion: string
  sha256: string
}

/** Host-only bounded test access after approval and exact loaded-package verification. Never expose its secret in Agent output. */
export class PreparePluginTestAccessCommand extends Command<{
  endpoint: string; publicationId: string; expiresAt: string; secret: string
}> {
  constructor(readonly pluginName: string, readonly componentKey: string, readonly operationId: string,
    readonly expected: PluginTestRuntimeIdentity) { super() }
}
