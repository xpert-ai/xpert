import { ChecklistItem, TWorkflowTriggerMeta } from '@metad/contracts'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
	INTEGRATION_PERMISSION_SERVICE_TOKEN,
	IntegrationPermissionService,
	IWorkflowTriggerStrategy,
	PluginContext,
	RequestContext,
	TWorkflowTriggerParams,
	WorkflowTriggerStrategy
} from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { LarkChatDispatchService } from '../handoff'
import { ChatLarkMessage } from '../message'
import { LARK_PLUGIN_CONTEXT } from '../tokens'
import { iconImage } from '../types'
import { LarkTriggerBindingEntity } from '../entities/lark-trigger-binding.entity'
import { LarkTrigger, TLarkTriggerConfig } from './lark-trigger.types'

@Injectable()
@WorkflowTriggerStrategy(LarkTrigger)
export class LarkTriggerStrategy implements IWorkflowTriggerStrategy<TLarkTriggerConfig> {
	private readonly logger = new Logger(LarkTriggerStrategy.name)
	private readonly callbacks = new Map<string, (payload: any) => void>()
	private _integrationPermissionService: IntegrationPermissionService

	readonly meta: TWorkflowTriggerMeta = {
		name: LarkTrigger,
		label: {
			en_US: 'Lark Trigger',
			zh_Hans: '飞书触发器'
		},
		icon: {
			type: 'image',
			value: iconImage
		},
		configSchema: {
			type: 'object',
			properties: {
				enabled: {
					type: 'boolean',
					title: {
						en_US: 'Enabled',
						zh_Hans: '启用'
					},
					default: true
				},
				integrationId: {
					type: 'string',
					title: {
						en_US: 'Lark Integration',
						zh_Hans: '飞书集成'
					},
					'x-ui': {
						component: 'remoteSelect',
						selectUrl: '/api/integration/select-options?provider=lark'
					} as any
				}
			},
			required: ['enabled', 'integrationId']
		}
	}

	readonly bootstrap = {
		mode: 'skip' as const,
		critical: false
	}

	constructor(
		private readonly dispatchService: LarkChatDispatchService,
		@InjectRepository(LarkTriggerBindingEntity)
		private readonly bindingRepository: Repository<LarkTriggerBindingEntity>,
		@Inject(LARK_PLUGIN_CONTEXT)
		private readonly pluginContext: PluginContext
	) {}

	private get integrationPermissionService(): IntegrationPermissionService {
		if (!this._integrationPermissionService) {
			this._integrationPermissionService = this.pluginContext.resolve(
				INTEGRATION_PERMISSION_SERVICE_TOKEN
			)
		}
		return this._integrationPermissionService
	}

	async validate(payload: TWorkflowTriggerParams<TLarkTriggerConfig>) {
		const { xpertId, node, config } = payload
		const items: ChecklistItem[] = []
		const nodeKey = node?.key

		if (!config?.integrationId) {
			items.push({
				node: nodeKey,
				ruleCode: 'TRIGGER_LARK_INTEGRATION_REQUIRED',
				field: 'integrationId',
				value: '',
				message: {
					en_US: 'Lark integration is required',
					zh_Hans: '需要选择飞书集成'
				},
				level: 'error'
			})
			return items
		}

		try {
			const integration = await this.integrationPermissionService.read(config.integrationId)
			if (!integration) {
				items.push({
					node: nodeKey,
					ruleCode: 'TRIGGER_LARK_INTEGRATION_NOT_FOUND',
					field: 'integrationId',
					value: config.integrationId,
					message: {
						en_US: `Lark integration "${config.integrationId}" not found`,
						zh_Hans: `飞书集成 "${config.integrationId}" 不存在`
					},
					level: 'error'
				})
			}
		} catch (error) {
			this.logger.warn(
				`Validate integration "${config.integrationId}" failed: ${
					error instanceof Error ? error.message : String(error)
				}`
			)
		}

		if (!config.enabled) {
			return items
		}

		const existingXpertId = await this.getBoundXpertId(config.integrationId)
		if (existingXpertId && existingXpertId !== xpertId) {
			items.push({
				node: nodeKey,
				ruleCode: 'TRIGGER_LARK_INTEGRATION_CONFLICT',
				field: 'integrationId',
				value: config.integrationId,
				message: {
					en_US: `Integration "${config.integrationId}" is already bound to another xpert`,
					zh_Hans: `飞书集成 "${config.integrationId}" 已绑定到其他专家`
				},
				level: 'error'
			})
		}

		return items
	}

	async publish(
		payload: TWorkflowTriggerParams<TLarkTriggerConfig>,
		callback: (payload: any) => void
	): Promise<void> {
		const { xpertId, config } = payload
		if (!config?.enabled || !config.integrationId) {
			return
		}

		const integrationId = config.integrationId
		const existingXpertId = await this.getBoundXpertId(integrationId)
		if (existingXpertId && existingXpertId !== xpertId) {
			throw new Error(
				`Lark trigger integration "${integrationId}" is already bound to xpert "${existingXpertId}"`
			)
		}

		const context = await this.resolveBindingContext(integrationId)
		await this.bindingRepository.upsert(
			{
				integrationId,
				xpertId,
				tenantId: context.tenantId ?? null,
				organizationId: context.organizationId ?? null,
				createdById: context.createdById ?? null,
				updatedById: context.updatedById ?? null
			},
			['integrationId']
		)

		// Keep only runtime callback in memory; integration/xpert binding source of truth is DB.
		this.callbacks.set(integrationId, callback)
	}

	async stop(payload: TWorkflowTriggerParams<TLarkTriggerConfig>): Promise<void> {
		const { xpertId, config } = payload
		const integrationId = config?.integrationId
		if (integrationId) {
			this.callbacks.delete(integrationId)
			await this.removeBindingFromStore(integrationId, xpertId)
			return
		}

		const persistedBindings = await this.bindingRepository.find({
			where: {
				xpertId
			}
		})
		for (const binding of persistedBindings) {
			this.callbacks.delete(binding.integrationId)
		}
		await this.removeBindingsByXpertId(xpertId)
	}

	async getBoundXpertId(integrationId: string): Promise<string | null> {
		if (!integrationId) {
			return null
		}
		const binding = await this.bindingRepository.findOne({
			where: {
				integrationId
			}
		})
		return binding?.xpertId ?? null
	}

	async handleInboundMessage(params: {
		integrationId: string
		input?: string
		larkMessage: ChatLarkMessage
		options?: {
			confirm?: boolean
			reject?: boolean
		}
	}): Promise<boolean> {
		const binding = await this.bindingRepository.findOne({
			where: {
				integrationId: params.integrationId
			}
		})
		if (!binding?.xpertId) {
			return false
		}

		const callback = this.callbacks.get(params.integrationId)
		if (!callback) {
			// Persisted binding must continue to work after process restart even without in-memory callback.
			await this.dispatchService.enqueueDispatch({
				xpertId: binding.xpertId,
				input: params.input,
				larkMessage: params.larkMessage,
				options: params.options
			})
			return true
		}

		const handoffMessage = await this.dispatchService.buildDispatchMessage({
			xpertId: binding.xpertId,
			input: params.input,
			larkMessage: params.larkMessage,
			options: params.options
		})
		await Promise.resolve(
			callback({
				from: LarkTrigger,
				xpertId: binding.xpertId,
				handoffMessage
			})
		)
		return true
	}

	private async resolveBindingContext(integrationId: string): Promise<{
		tenantId: string | null
		organizationId: string | null
		createdById: string | null
		updatedById: string | null
	}> {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const userId = RequestContext.currentUserId()

		if (tenantId && organizationId) {
			return {
				tenantId,
				organizationId,
				createdById: userId,
				updatedById: userId
			}
		}

		const integration = await this.integrationPermissionService.read<any>(integrationId)
		return {
			tenantId: tenantId ?? integration?.tenantId ?? null,
			organizationId: organizationId ?? integration?.organizationId ?? null,
			createdById: userId ?? integration?.createdById ?? null,
			updatedById: userId ?? integration?.updatedById ?? userId ?? null
		}
	}

	private async removeBindingFromStore(integrationId: string, expectedXpertId?: string): Promise<void> {
		if (!integrationId) {
			return
		}

		if (expectedXpertId) {
			await this.bindingRepository.delete({
				integrationId,
				xpertId: expectedXpertId
			})
			return
		}

		await this.bindingRepository.delete({
			integrationId
		})
	}

	private async removeBindingsByXpertId(xpertId: string): Promise<void> {
		if (!xpertId) {
			return
		}
		await this.bindingRepository.delete({
			xpertId
		})
	}
}
