import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { RunnableConfig } from '@langchain/core/runnables'
import { BaseToolkit, StructuredToolInterface, Tool, tool, ToolParams } from '@langchain/core/tools'
import {
	AiProviderRole,
	IBuiltinTool,
	ICopilot,
	IUser,
	IXpertTool,
	IXpertToolset,
	ToolProviderCredentials,
	TToolParameter,
	XpertToolContext,
	XpertToolsetCategoryEnum
} from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { CommandBus } from '@nestjs/cqrs'
import { jsonSchemaToZod } from 'json-schema-to-zod'
import { z } from 'zod'
import { createLLM, ProviderRolePriority } from '../copilot'
import { CopilotTokenRecordCommand } from '../copilot-user'
import { IToolRuntime, ToolProviderIdentity } from './types'
import { XpertToolsetService } from './xpert-toolset.service'

export abstract class BaseToolset<T extends StructuredToolInterface = Tool> extends BaseToolkit {
	abstract providerType: XpertToolsetCategoryEnum
	// For langchain
	tools: T[]

	identity?: ToolProviderIdentity
	credentialsSchema?: { [key: string]: ToolProviderCredentials }

	constructor(protected toolset?: IXpertToolset) {
		super()
	}

	getTools() {
		return this.tools
	}

	getTool(toolName: string) {
		return this.getTools().find((tool) => tool.name === toolName)
	}

	getCredentialsSchema(): { [key: string]: ToolProviderCredentials } {
		return { ...this.credentialsSchema }
	}

	// getParameters(toolName: string): ToolParameter[] {
	//     const tool = this.getTools().find(tool => tool.identity.name === toolName);
	//     if (!tool) {
	//         throw new ToolNotFoundError(`tool ${toolName} not found`);
	//     }
	//     return tool.parameters;
	// }

	// validateParameters(toolId: number, toolName: string, toolParameters: { [key: string]: any }): void {
	//     const toolParametersSchema = this.getParameters(toolName);

	//     const toolParametersNeedToValidate: { [key: string]: ToolParameter } = {};
	//     for (const parameter of toolParametersSchema) {
	//         toolParametersNeedToValidate[parameter.name] = parameter;
	//     }

	//     for (const parameter in toolParameters) {
	//         if (!(parameter in toolParametersNeedToValidate)) {
	//             throw new ToolParameterValidationError(`parameter ${parameter} not found in tool ${toolName}`);
	//         }

	//         const parameterSchema = toolParametersNeedToValidate[parameter];
	//         if (parameterSchema.type === ToolParameter.ToolParameterType.STRING) {
	//             if (typeof toolParameters[parameter] !== 'string') {
	//                 throw new ToolParameterValidationError(`parameter ${parameter} should be string`);
	//             }
	//         } else if (parameterSchema.type === ToolParameter.ToolParameterType.NUMBER) {
	//             if (typeof toolParameters[parameter] !== 'number') {
	//                 throw new ToolParameterValidationError(`parameter ${parameter} should be number`);
	//             }

	//             if (parameterSchema.min !== undefined && toolParameters[parameter] < parameterSchema.min) {
	//                 throw new ToolParameterValidationError(`parameter ${parameter} should be greater than ${parameterSchema.min}`);
	//             }

	//             if (parameterSchema.max !== undefined && toolParameters[parameter] > parameterSchema.max) {
	//                 throw new ToolParameterValidationError(`parameter ${parameter} should be less than ${parameterSchema.max}`);
	//             }
	//         } else if (parameterSchema.type === ToolParameter.ToolParameterType.BOOLEAN) {
	//             if (typeof toolParameters[parameter] !== 'boolean') {
	//                 throw new ToolParameterValidationError(`parameter ${parameter} should be boolean`);
	//             }
	//         } else if (parameterSchema.type === ToolParameter.ToolParameterType.SELECT) {
	//             if (typeof toolParameters[parameter] !== 'string') {
	//                 throw new ToolParameterValidationError(`parameter ${parameter} should be string`);
	//             }

	//             const options = parameterSchema.options;
	//             if (!Array.isArray(options)) {
	//                 throw new ToolParameterValidationError(`parameter ${parameter} options should be list`);
	//             }

	//             if (!options.map(option => option.value).includes(toolParameters[parameter])) {
	//                 throw new ToolParameterValidationError(`parameter ${parameter} should be one of ${options}`);
	//             }
	//         }

	//         delete toolParametersNeedToValidate[parameter];
	//     }

	//     for (const parameter in toolParametersNeedToValidate) {
	//         const parameterSchema = toolParametersNeedToValidate[parameter];
	//         if (parameterSchema.required) {
	//             throw new ToolParameterValidationError(`parameter ${parameter} is required`);
	//         }

	//         if (parameterSchema.default !== undefined) {
	//             toolParameters[parameter] = ToolParameterConverter.castParameterByType(parameterSchema.default, parameterSchema.type);
	//         }
	//     }
	// }

	// validateCredentialsFormat(credentials: { [key: string]: any }): void {
	//     const credentialsSchema = this.credentialsSchema;
	//     if (!credentialsSchema) {
	//         return;
	//     }

	//     const credentialsNeedToValidate: { [key: string]: ToolProviderCredentials } = {};
	//     for (const credentialName in credentialsSchema) {
	//         credentialsNeedToValidate[credentialName] = credentialsSchema[credentialName];
	//     }

	//     for (const credentialName in credentials) {
	//         if (!(credentialName in credentialsNeedToValidate)) {
	//             throw new ToolProviderCredentialValidationError(`credential ${credentialName} not found in provider ${this.identity.name}`);
	//         }

	//         const credentialSchema = credentialsNeedToValidate[credentialName];
	//         if (!credentialSchema.required && credentials[credentialName] === null) {
	//             continue;
	//         }

	//         if ([ToolProviderCredentials.CredentialsType.SECRET_INPUT, ToolProviderCredentials.CredentialsType.TEXT_INPUT].includes(credentialSchema.type)) {
	//             if (typeof credentials[credentialName] !== 'string') {
	//                 throw new ToolProviderCredentialValidationError(`credential ${credentialName} should be string`);
	//             }
	//         } else if (credentialSchema.type === ToolProviderCredentials.CredentialsType.SELECT) {
	//             if (typeof credentials[credentialName] !== 'string') {
	//                 throw new ToolProviderCredentialValidationError(`credential ${credentialName} should be string`);
	//             }

	//             const options = credentialSchema.options;
	//             if (!Array.isArray(options)) {
	//                 throw new ToolProviderCredentialValidationError(`credential ${credentialName} options should be list`);
	//             }

	//             if (!options.map(option => option.value).includes(credentials[credentialName])) {
	//                 throw new ToolProviderCredentialValidationError(`credential ${credentialName} should be one of ${options}`);
	//             }
	//         }

	//         delete credentialsNeedToValidate[credentialName];
	//     }

	//     for (const credentialName in credentialsNeedToValidate) {
	//         const credentialSchema = credentialsNeedToValidate[credentialName];
	//         if (credentialSchema.required) {
	//             throw new ToolProviderCredentialValidationError(`credential ${credentialName} is required`);
	//         }

	//         if (credentialSchema.default !== undefined) {
	//             let defaultValue = credentialSchema.default;
	//             if ([ToolProviderCredentials.CredentialsType.SECRET_INPUT, ToolProviderCredentials.CredentialsType.TEXT_INPUT, ToolProviderCredentials.CredentialsType.SELECT].includes(credentialSchema.type)) {
	//                 defaultValue = String(defaultValue);
	//             }

	//             credentials[credentialName] = defaultValue;
	//         }
	//     }
	// }
}

export interface IBaseTool extends IBuiltinTool {
	runtime: IToolRuntime
}

export abstract class BaseTool extends Tool {
	name: string
	description: string
	// protected toolset?: IXpertToolset
}

// export class CommandToolset extends BaseToolset<Tool> {
// 	providerType = XpertToolsetCategoryEnum.BUILTIN

// 	constructor(
// 		toolset: IXpertToolset,
// 		private tenantId: string,
// 		private organizationId: string,
// 		private toolsetService: XpertToolsetService,
// 		private readonly commandBus: CommandBus,
// 		private readonly user: IUser,
// 		private readonly copilots: ICopilot[],
// 		private readonly chatModel: BaseChatModel
// 	) {
// 		super(toolset)

// 		this.tools = this.toolset.tools.map((item) => {
// 			let zodSchema: z.AnyZodObject = null
// 			try {
// 				zodSchema = eval(jsonSchemaToZod(item.schema, { module: 'cjs' }))
// 			} catch (err) {
// 				throw new Error(`Invalid input schema for tool: ${item.name}`)
// 			}
// 			// Copilot
// 			let chatModel = this.chatModel
// 			if (item.aiProviderRole || toolset.aiProviderRole) {
// 				const copilot = this.findCopilot(item.aiProviderRole || toolset.aiProviderRole)
// 				chatModel = this.createLLM(copilot)
// 			}

// 			// Default args values in copilot role for tool function
// 			// const defaultArgs = role?.options?.toolsets?.[toolset.id]?.[item.name]?.defaultArgs

// 			return tool(
// 				async (args, config) => {
// 					try {
// 						return await this.toolsetService.executeCommand(
// 							item.name,
// 							{
// 								...args
// 							},
// 							config,
// 							// <XpertToolContext>{
// 							// 	tenantId: this.tenantId,
// 							// 	organizationId: this.organizationId,
// 							// 	user: this.user,
// 							// 	chatModel,
// 							// 	// role,
// 							// 	roleContext: this.toolset.options
// 							// }
// 						)
// 					} catch (error) {
// 						return `Error: ${getErrorMessage(error)}`
// 					}
// 				},
// 				{
// 					name: item.name,
// 					description: item.description,
// 					schema: zodSchema
// 				}
// 			) as unknown as Tool
// 		})
// 	}

// 	findCopilot(role: AiProviderRole) {
// 		const copilots = this.copilots
// 		let copilot: ICopilot = null
// 		for (const priorityRole of ProviderRolePriority.slice(ProviderRolePriority.indexOf(role))) {
// 			copilot = copilots.find((item) => item.role === priorityRole && item.enabled)
// 			if (copilot) {
// 				break
// 			}
// 		}

// 		if (!copilot) {
// 			throw new Error('copilot not found')
// 		}
// 		return copilot
// 	}

// 	createLLM(copilot: ICopilot) {
// 		return createLLM<BaseChatModel>(copilot, {}, async (input) => {
// 			try {
// 				await this.commandBus.execute(
// 					new CopilotTokenRecordCommand({
// 						...input,
// 						tenantId: this.tenantId,
// 						organizationId: this.organizationId,
// 						userId: this.user.id,
// 						copilot: copilot
// 					})
// 				)
// 			} catch (err) {
// 				// if (this.abortController && !this.abortController.signal.aborted) {
// 				// 	try {
// 				// 		this.abortController.abort(err.message)
// 				// 	} catch(err) {
// 				// 		//
// 				// 	}
// 				// }
// 			}
// 		})
// 	}
// }

// /**
//  * @deprecated use BaseToolset class
//  */
// export function createToolset(
// 	toolset: IXpertToolset,
// 	context?: {
// 		tenantId: string
// 		organizationId: string
// 		toolsetService: XpertToolsetService
// 		commandBus: CommandBus
// 		user: IUser
// 		copilots: ICopilot[]
// 		chatModel: BaseChatModel
// 	}
// ) {
// 	switch (toolset.type) {
// 		// case 'DuckDuckGo':
// 		// 	return new DuckDuckGoToolset(toolset)
// 		// case 'TavilySearch':
// 		// 	return new TavilySearchToolset(toolset)
// 		default: {
// 			if (toolset.category === 'command') {
// 				return new CommandToolset(
// 					toolset,
// 					context.tenantId,
// 					context.organizationId,
// 					context.toolsetService,
// 					context.commandBus,
// 					context.user,
// 					context.copilots,
// 					context.chatModel
// 				)
// 			}
// 			return null
// 		}
// 	}
// }
