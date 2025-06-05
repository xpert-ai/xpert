import { _BaseToolset, BaseTool } from "../../shared";

export abstract class SandboxBaseTool extends BaseTool {
    constructor(protected toolset: _BaseToolset) {
		super()

		this.verboseParsingErrors = true
	}
}
