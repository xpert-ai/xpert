import { IWFNTrigger, WorkflowNodeTypeEnum } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { RedisLockService } from '@metad/server-core'
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import {
	IWorkflowTriggerStrategy,
	TWorkflowTriggerBootstrapConfig,
	WorkflowTriggerRegistry
} from '@xpert-ai/plugin-sdk'
import { IsNull, Not, Repository } from 'typeorm'
import { XpertPublishTriggersCommand } from '../commands'
import { Xpert } from '../xpert.entity'

type TRecoveryCounters = {
	scanned_xperts: number
	replayed: number
	skipped: number
	failed: number
}

type TResolvedBootstrap = {
	missing: boolean
	bootstrap: TWorkflowTriggerBootstrapConfig
}

const DEFAULT_BOOTSTRAP: TWorkflowTriggerBootstrapConfig = {
	mode: 'replay_publish',
	critical: false
}

@Injectable()
export class XpertTriggerBootstrapRecoveryService implements OnApplicationBootstrap {
	readonly #logger = new Logger(XpertTriggerBootstrapRecoveryService.name)
	readonly #batchSize = 50
	readonly #providerBootstrapCache = new Map<string, TResolvedBootstrap>()

	constructor(
		@InjectRepository(Xpert)
		private readonly repository: Repository<Xpert>,
		private readonly commandBus: CommandBus,
		private readonly triggerRegistry: WorkflowTriggerRegistry,
		private readonly redisLockService: RedisLockService
	) {}

	async onApplicationBootstrap() {
		const counters: TRecoveryCounters = {
			scanned_xperts: 0,
			replayed: 0,
			skipped: 0,
			failed: 0
		}

		let page = 0
		while (true) {
			const items = await this.repository.find({
				where: {
					latest: true,
					publishAt: Not(IsNull())
				},
				order: {
					createdAt: 'ASC'
				},
				skip: page * this.#batchSize,
				take: this.#batchSize
			})
			if (!items.length) {
				break
			}

			for (const xpert of items) {
				counters.scanned_xperts += 1
				await this.recoverXpert(xpert, counters)
			}

			if (items.length < this.#batchSize) {
				break
			}
			page += 1
		}

		this.#logger.log(
			JSON.stringify({
				phase: 'bootstrap_recovery_summary',
				...counters
			})
		)
	}

	private async recoverXpert(xpert: Xpert, counters: TRecoveryCounters) {
		const providers = this.listTriggerProviders(xpert)
		if (!providers.length) {
			return
		}

		const replayProviders: string[] = []
		for (const providerName of providers) {
			const resolved = this.resolveBootstrap(providerName)
			if (resolved.missing) {
				counters.failed += 1
				this.logEvent('warn', {
					xpertId: xpert.id,
					provider: providerName,
					result: 'failed',
					error: `Trigger provider "${providerName}" not found`
				})
				continue
			}

			if (resolved.bootstrap.mode === 'skip') {
				counters.skipped += 1
				this.logEvent('log', {
					xpertId: xpert.id,
					provider: providerName,
					result: 'skipped'
				})
				continue
			}

			replayProviders.push(providerName)
		}

		if (!replayProviders.length) {
			return
		}

		const lockKey = 'job:trigger:' + xpert.id
		const lockId = await this.redisLockService.acquireLock(lockKey, 10000)
		if (!lockId) {
			counters.skipped += replayProviders.length
			for (const provider of replayProviders) {
				this.logEvent('warn', {
					xpertId: xpert.id,
					provider,
					result: 'skipped',
					error: 'Lock not acquired'
				})
			}
			return
		}

		try {
			await this.commandBus.execute(
				new XpertPublishTriggersCommand(xpert, {
					strict: false,
					providers: replayProviders
				})
			)

			counters.replayed += replayProviders.length
			for (const provider of replayProviders) {
				this.logEvent('log', {
					xpertId: xpert.id,
					provider,
					result: 'replayed'
				})
			}
		} catch (error) {
			counters.failed += replayProviders.length
			for (const provider of replayProviders) {
				this.logEvent('error', {
					xpertId: xpert.id,
					provider,
					result: 'failed',
					error: getErrorMessage(error)
				})
			}
		} finally {
			try {
				await this.redisLockService.releaseLock(lockKey, lockId)
			} catch (error) {
				this.logEvent('warn', {
					xpertId: xpert.id,
					provider: replayProviders.join(','),
					result: 'failed',
					error: `Release lock failed: ${getErrorMessage(error)}`
				})
			}
		}
	}

	private resolveBootstrap(providerName: string): TResolvedBootstrap {
		if (this.#providerBootstrapCache.has(providerName)) {
			return this.#providerBootstrapCache.get(providerName)!
		}

		let resolved: TResolvedBootstrap = {
			missing: false,
			bootstrap: DEFAULT_BOOTSTRAP
		}

		try {
			const provider = this.triggerRegistry.get(providerName)
			resolved = {
				missing: false,
				bootstrap: this.normalizeBootstrap(provider)
			}
		} catch {
			resolved = {
				missing: true,
				bootstrap: DEFAULT_BOOTSTRAP
			}
		}

		this.#providerBootstrapCache.set(providerName, resolved)
		return resolved
	}

	private normalizeBootstrap(
		provider: IWorkflowTriggerStrategy<any>
	): TWorkflowTriggerBootstrapConfig {
		if (!provider.bootstrap) {
			return DEFAULT_BOOTSTRAP
		}
		return {
			mode: provider.bootstrap.mode ?? 'replay_publish',
			critical: provider.bootstrap.critical ?? false
		}
	}

	private listTriggerProviders(xpert: Xpert): string[] {
		const providers = new Set<string>()
		for (const node of xpert.graph?.nodes ?? []) {
			if (node.type !== 'workflow') {
				continue
			}
			if (node.entity.type !== WorkflowNodeTypeEnum.TRIGGER) {
				continue
			}
			const trigger = node.entity as IWFNTrigger
			if (!trigger.from || trigger.from === 'chat') {
				continue
			}
			providers.add(trigger.from)
		}
		return Array.from(providers.values())
	}

	private logEvent(level: 'log' | 'warn' | 'error', payload: Record<string, string>) {
		const message = JSON.stringify({
			phase: 'bootstrap_recovery',
			...payload
		})
		if (level === 'error') {
			this.#logger.error(message)
		} else if (level === 'warn') {
			this.#logger.warn(message)
		} else {
			this.#logger.log(message)
		}
	}
}
