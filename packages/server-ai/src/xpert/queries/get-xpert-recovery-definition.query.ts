import type { IQuery } from '@nestjs/cqrs'
import type { IXpert, TXpertGraph } from '@xpert-ai/contracts'

export type XpertRecoveryDefinition = { graph: TXpertGraph; team?: Partial<IXpert> }

/** Read the published graph fingerprint inputs with the same runtime access policy as workflow loading. */
export class GetXpertRecoveryDefinitionQuery implements IQuery {
    constructor(public readonly id: string) {}
}
