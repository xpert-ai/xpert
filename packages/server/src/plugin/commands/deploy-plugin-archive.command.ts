import { Command } from '@nestjs/cqrs'
import type { IPluginArchiveDeploymentStatus } from '@xpert-ai/contracts'

/** Host-only verified archive install/inspection. Callers own approval binding; this command enforces current publisher rights. */
export class DeployPluginArchiveCommand extends Command<IPluginArchiveDeploymentStatus> {
  constructor(readonly input: {
    buffer: Buffer; fileName: string; packageName: string; packageVersion: string; sha256: string
    allowReplace: boolean; allowRestart: boolean; action: 'install' | 'inspect'
  }) { super() }
}
