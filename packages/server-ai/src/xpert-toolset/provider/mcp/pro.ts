import { IXpertToolset, TMCPSchema } from '@xpert-ai/contracts'
import { CommandBus } from '@nestjs/cqrs'
import type { TBuiltinToolsetParams } from '../../../shared'

export async function createProMCPClient(
    toolset: Partial<IXpertToolset>,
    signal: AbortSignal,
    commandBus: CommandBus,
    schema: TMCPSchema,
    envState: Record<string, unknown>,
    xpertId?: string,
    _runtimeContext: Partial<TBuiltinToolsetParams> = {}
) {
    void _runtimeContext
    // PRO
    return { client: null, destroy: null, logs: null }
}
