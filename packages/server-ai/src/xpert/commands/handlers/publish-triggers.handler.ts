import { IWFNTrigger, IXpert, TXpertGraph, WorkflowNodeTypeEnum } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { HandoffMessage, IWorkflowTriggerStrategy, WorkflowTriggerRegistry } from '@xpert-ai/plugin-sdk'
import { HandoffQueueService } from '../../../handoff/message-queue.service'
import { XpertEnqueueTriggerDispatchCommand } from '../enqueue-trigger-dispatch.command'
import { XpertPublishTriggersCommand } from '../publish-triggers.command'

interface TriggerSnapshot {
	provider: string
	configHash: string
	trigger: IWFNTrigger
}

interface TriggerDelta {
	added: TriggerSnapshot[]
	removed: TriggerSnapshot[]
	changed: Array<{
		previous: TriggerSnapshot
		current: TriggerSnapshot
	}>
	unchanged: TriggerSnapshot[]
}

/**
 * Reconciles trigger publication using delta between previous and current graphs.
 *
 * If `previousGraph` is missing, all current triggers are treated as added.
 * If `previousGraph` exists, only removed/changed triggers are stopped, only added/changed triggers are published,
 * and unchanged triggers are skipped.
 *
 * Provider filtering is applied before diffing, so reconciliation only affects selected providers.
 * With `strict=true`, provider lookup/stop/publish failures throw immediately.
 * With `strict=false`, failures are logged and reconciliation continues.
 *
 * For changed triggers, reconciliation uses `stop -> publish`.
 * When changed publish fails, rollback (`publish` previous config) is attempted as best effort.
 * Trigger identity is provider name (`trigger.from`), which relies on upstream workflow validation
 * to keep one trigger node per provider.
 */
@CommandHandler(XpertPublishTriggersCommand)
export class XpertPublishTriggersHandler implements ICommandHandler<XpertPublishTriggersCommand> {
	readonly #logger = new Logger(XpertPublishTriggersHandler.name)

	constructor(
		private readonly triggerRegistry: WorkflowTriggerRegistry,
		private readonly commandBus: CommandBus,
		private readonly handoffQueue: HandoffQueueService
	) {}

	public async execute(command: XpertPublishTriggersCommand): Promise<void> {
		const { xpert, options } = command
		const strict = options?.strict ?? false
		const providers = options?.providers?.length ? new Set(options.providers) : null

		const previousSnapshots = this.buildTriggerSnapshotMap(options?.previousGraph, providers)
		const currentSnapshots = this.buildTriggerSnapshotMap(xpert.graph, providers)
		const delta = this.diffTriggers(previousSnapshots, currentSnapshots)

		this.#logger.log(
			`delta_summary xpertId="${xpert.id}" added=${delta.added.length} removed=${delta.removed.length} changed=${delta.changed.length} unchanged=${delta.unchanged.length}`
		)

		for (const removed of delta.removed) {
			const provider = this.resolveProvider(removed.provider, xpert.id, strict)
			if (!provider) {
				continue
			}

			try {
				await this.stopTriggerWithProvider(provider, xpert.id, removed.trigger)
			} catch (error) {
				if (strict) {
					throw error
				}
				this.#logger.warn(
					`Stop trigger "${removed.provider}" failed for xpert "${xpert.id}": ${getErrorMessage(error)}`
				)
			}
		}

		for (const changed of delta.changed) {
			const provider = this.resolveProvider(changed.current.provider, xpert.id, strict)
			if (!provider) {
				continue
			}

			try {
				await this.stopTriggerWithProvider(provider, xpert.id, changed.previous.trigger)
			} catch (error) {
				if (strict) {
					throw error
				}
				this.#logger.warn(
					`Stop trigger "${changed.current.provider}" failed for xpert "${xpert.id}": ${getErrorMessage(error)}`
				)
				continue
			}

			try {
				await this.publishTriggerWithProvider(provider, xpert, changed.current.trigger)
			} catch (error) {
				let rollbackError: unknown
				try {
					await this.publishTriggerWithProvider(provider, xpert, changed.previous.trigger)
				} catch (innerError) {
					rollbackError = innerError
					this.#logger.error(
						`changed_rollback_failed xpertId="${xpert.id}" provider="${changed.current.provider}" error="${getErrorMessage(innerError)}"`
					)
				}

				if (strict) {
					throw error
				}

				const rollbackStatus = rollbackError
					? `rollback="${getErrorMessage(rollbackError)}"`
					: 'rollback="ok"'
				this.#logger.error(
					`Publish changed trigger "${changed.current.provider}" failed for xpert "${xpert.id}": ${getErrorMessage(error)} (${rollbackStatus})`
				)
			}
		}

		for (const added of delta.added) {
			const provider = this.resolveProvider(added.provider, xpert.id, strict)
			if (!provider) {
				continue
			}

			try {
				await this.publishTriggerWithProvider(provider, xpert, added.trigger)
			} catch (error) {
				if (strict) {
					throw error
				}
				this.#logger.error(
					`Publish trigger "${added.provider}" failed for xpert "${xpert.id}": ${getErrorMessage(error)}`
				)
			}
		}
	}

	private async handleTriggerPayload(xpert: IXpert, trigger: IWFNTrigger, payload: any) {
		if (!payload) {
			this.#logger.warn(`Trigger "${trigger.from}" returned empty payload for xpert "${xpert.id}"`)
			return
		}

		if (payload.handoffMessage) {
			await this.handoffQueue.enqueue(payload.handoffMessage as HandoffMessage)
			return
		}

		if (!payload.state) {
			this.#logger.warn(`Trigger "${trigger.from}" payload has no state for xpert "${xpert.id}"`)
			return
		}

		await this.commandBus.execute(
			new XpertEnqueueTriggerDispatchCommand(xpert.id, null, payload.state, {
				isDraft: false,
				from: payload.from,
				executionId: payload.executionId
			})
		)
	}

	private resolveProvider(
		providerName: string,
		xpertId: string,
		strict: boolean
	): IWorkflowTriggerStrategy<any> | null {
		try {
			return this.triggerRegistry.get(providerName)
		} catch (error) {
			if (strict) {
				throw error
			}
			this.#logger.warn(
				`Trigger provider "${providerName}" not found for xpert "${xpertId}", skip reconcile`
			)
			return null
		}
	}

	private async stopTriggerWithProvider(
		provider: IWorkflowTriggerStrategy<any>,
		xpertId: string,
		trigger: IWFNTrigger
	): Promise<void> {
		await Promise.resolve(
			provider.stop({
				xpertId,
				config: trigger.config
			})
		)
	}

	private async publishTriggerWithProvider(
		provider: IWorkflowTriggerStrategy<any>,
		xpert: IXpert,
		trigger: IWFNTrigger
	): Promise<void> {
		await Promise.resolve(
			provider.publish(
				{
					xpertId: xpert.id,
					config: trigger.config
				},
				(payload) => {
					this.handleTriggerPayload(xpert, trigger, payload).catch((error) => {
						this.#logger.error(
							`Trigger "${trigger.from}" callback failed for xpert "${xpert.id}": ${getErrorMessage(error)}`
						)
					})
				}
			)
		)
	}

	private buildTriggerSnapshotMap(
		graph?: TXpertGraph,
		providers?: Set<string> | null
	): Map<string, TriggerSnapshot> {
		const snapshots = new Map<string, TriggerSnapshot>()
		for (const trigger of this.listPublishedTriggers(graph, providers)) {
			const provider = trigger.from as string
			snapshots.set(provider, {
				provider,
				configHash: this.stableSerialize(trigger.config),
				trigger
			})
		}
		return snapshots
	}

	private diffTriggers(
		previousSnapshots: Map<string, TriggerSnapshot>,
		currentSnapshots: Map<string, TriggerSnapshot>
	): TriggerDelta {
		const delta: TriggerDelta = {
			added: [],
			removed: [],
			changed: [],
			unchanged: []
		}

		for (const [provider, previous] of previousSnapshots.entries()) {
			const current = currentSnapshots.get(provider)
			if (!current) {
				delta.removed.push(previous)
				continue
			}

			if (previous.configHash === current.configHash) {
				delta.unchanged.push(current)
				continue
			}

			delta.changed.push({ previous, current })
		}

		for (const [provider, current] of currentSnapshots.entries()) {
			if (!previousSnapshots.has(provider)) {
				delta.added.push(current)
			}
		}

		return delta
	}

	private stableSerialize(value: unknown): string {
		if (value === undefined) {
			return 'undefined'
		}
		if (value === null) {
			return 'null'
		}
		if (typeof value !== 'object') {
			return JSON.stringify(value)
		}
		if (Array.isArray(value)) {
			return `[${value.map((item) => this.stableSerialize(item)).join(',')}]`
		}

		const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
			a.localeCompare(b)
		)
		return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${this.stableSerialize(nested)}`).join(',')}}`
	}

	private listPublishedTriggers(graph?: TXpertGraph, providers?: Set<string> | null): IWFNTrigger[] {
		return (
			graph?.nodes
				?.filter((node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.TRIGGER)
				.map((node) => node.entity as IWFNTrigger)
				.filter((node) => node.from && node.from !== 'chat')
				.filter((node) => !providers || providers.has(node.from)) ?? []
		)
	}
}
