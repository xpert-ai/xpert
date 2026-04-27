import { TAcpTargetKind } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { IAcpBackend } from './acp-backend.types'
import { RemoteXpertAcpBackend } from './remote-xpert-acp.backend'

@Injectable()
export class AcpBackendRegistry {
  constructor(private readonly remoteXpertBackend: RemoteXpertAcpBackend) {}

  get(kind: TAcpTargetKind): IAcpBackend {
    if (kind === 'remote_xpert_acp') {
      return this.remoteXpertBackend
    }
    throw new Error(`Unsupported Codexpert ACP target kind: ${kind}`)
  }
}
