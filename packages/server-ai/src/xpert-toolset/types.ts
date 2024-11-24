import { I18nObject, ToolProviderCredentials, ToolTagEnum } from '@metad/contracts'

export const ToolsetFolderPath = 'packages/server-ai/src/xpert-toolset/provider/builtin/'

export interface IToolRuntime {
	/**
	 * Meta data of a tool call processing
	 */
	tenantId?: string
	toolId?: string
	invokeFrom?: InvokeFrom
	toolInvokeFrom?: ToolInvokeFrom
	credentials?: Record<string, any>
	runtimeParameters?: Record<string, any>
}

export enum InvokeFrom {
	/**
	 * Invoke From.
	 */
	SERVICE_API = 'service-api',
	WEB_APP = 'web-app',
	EXPLORE = 'explore',
	DEBUGGER = 'debugger'
}

export enum ToolInvokeFrom {
	/**
	 * Enum class for tool invoke
	 */
	WORKFLOW = 'workflow',
	AGENT = 'agent'
}

export interface ToolProviderIdentity {
    author: string;
    name: string;
    description: I18nObject;
    icon: string;
    label: I18nObject;
    tags: ToolTagEnum[];
}

export type TBaseToolsetOptions = TToolsetProviderSchema

export type TToolsetProviderSchema = {
	identity?: ToolProviderIdentity;
    credentials_for_provider?: { [key: string]: ToolProviderCredentials };
}