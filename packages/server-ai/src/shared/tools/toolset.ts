import { BaseToolkit, StructuredToolInterface } from "@langchain/core/tools"
import { TStateVariable, TToolsetParams } from "@metad/contracts"

/**
 * Base ability for all toolsets
 */
export abstract class _BaseToolset<T extends StructuredToolInterface = StructuredToolInterface> extends BaseToolkit {
	// For Langchain
	tools: T[]
	// For Langgraph
	stateVariables: TStateVariable[]

	constructor(protected params?: TToolsetParams) {
		super()
	}

	/**
	 * Async init tools
	 *
	 * @returns
	 */
	async initTools() {
		return this.tools
	}

	/**
	 * Get name of the toolset
	 */
	abstract getName(): string

	/**
	 * Get one tool
	 *
	 * @param toolName
	 * @returns
	 */
	getTool(toolName: string) {
		return this.getTools().find((tool) => tool.name === toolName)
	}

	/**
	 * Get state variables config
	 *
	 * @returns State variables
	 */
	async getVariables(): Promise<TStateVariable[]> {
		return null
	}

	/**
     * Close all (connections).
     */
    async close(): Promise<void> {
		//
	}
}