import { BaseToolkit, StructuredTool, StructuredToolInterface } from "@langchain/core/tools"
import { I18nObject, TStateVariable, TToolsetParams } from "@metad/contracts"
import { z } from 'zod'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ZodObjectAny = z.ZodObject<any, any, any, any>;

/**
 * Base ability for all toolsets
 */
export abstract class _BaseToolset<T extends StructuredToolInterface = StructuredToolInterface> extends BaseToolkit {
	abstract providerName: string
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
	 * Get ID of the toolset
	 */
	abstract getId(): string
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
	 * Get title of tool
	 */
	abstract getToolTitle(name: string): string | I18nObject

	/**
     * Close all (connections).
     */
    async close(): Promise<void> {
		//
	}
}

export abstract class BaseTool<T extends ZodObjectAny = ZodObjectAny> extends StructuredTool<T> {
	schema: any = z
		.object({ input: z.string().optional() })
		.transform((obj) => obj.input)
}