import { IXpertToolset, TMCPSchema } from "@metad/contracts";
import { CommandBus } from '@nestjs/cqrs'

export async function createProMCPClient(
	toolset: Partial<IXpertToolset>,
	signal: AbortSignal,
	commandBus: CommandBus,
	schema: TMCPSchema
) {
    // PRO
    return {client: null, destroy: null}
}