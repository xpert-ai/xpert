import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import type { TaskControlContext, TaskControlRef } from '@xpert-ai/plugin-sdk'
import { TaskControlStore } from './task-control.store'
import { withTaskControl } from './task-control.context'

/** Only the actual handler's return settles a claim. Cancellation never races away its promise. */
@Injectable()
export class TaskControlRunner implements OnModuleDestroy {
	private readonly active = new Map<string, AbortController>()
	private readonly logger = new Logger(TaskControlRunner.name)
	private readonly timer: ReturnType<typeof setInterval>
	private polling = false
	private readonly receipts = new Map<string, { claim: string; outcome: 'succeeded' | 'failed' }>()
	constructor(private readonly store: TaskControlStore) {
		this.timer = setInterval(() => void this.reconcile(), 1000)
		this.timer.unref()
	}
	onModuleDestroy() {
		clearInterval(this.timer)
	}

	async run<T>(reference: TaskControlRef, work: (control: TaskControlContext) => Promise<T>): Promise<T> {
		if (reference.version !== 2) throw new Error('Unsupported task control protocol')
		const claim = await this.store.claim(reference.targetId)
		const controller = new AbortController()
		this.active.set(reference.targetId, controller)
		const control: TaskControlContext = {
			reference,
			signal: controller.signal,
			desired: () => this.store.desired(reference.targetId)
		}
		let outcome: 'succeeded' | 'failed' = 'failed'
		try {
			if ((await control.desired()) === 'terminated') controller.abort()
			controller.signal.throwIfAborted()
			const result = await withTaskControl(reference, () => work(control))
			outcome = 'succeeded'
			return result
		} finally {
			// If receipt persistence fails, keep the durable claim: another worker must not replay the body.
			this.active.delete(reference.targetId)
			this.receipts.set(reference.targetId, { claim, outcome })
			await this.flushReceipt(reference.targetId)
		}
	}

	private async flushReceipt(id: string) {
		const receipt = this.receipts.get(id)
		if (!receipt) return
		try {
			await this.store.finishClaim(id, receipt.claim, receipt.outcome)
			this.receipts.delete(id)
		} catch {
			this.logger.warn('Actual handler exit receipt persistence remains pending')
		}
	}

	async reconcile() {
		if (this.polling) return
		this.polling = true
		try {
			for (const id of this.receipts.keys()) await this.flushReceipt(id)
			for (const [id, controller] of this.active) {
				try {
					if ((await this.store.desired(id)) === 'terminated') controller.abort()
				} catch {
					this.logger.warn('Task control unavailable; retaining the execution claim')
				}
			}
		} finally {
			this.polling = false
		}
	}
}
