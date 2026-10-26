// Capabilities belong to one boot and expire. They authorize admission, never completion or takeover.
import { getConfig } from '@xpert-ai/server-config'
import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import {
	executionControlProtocols,
	type ControlledHandlerCapability,
	type ExecutionControlCapabilities,
	type ExecutionControlCapability
} from '@xpert-ai/contracts'
import { InstanceRegistryService } from '../managed-connection/instance-registry.service'
import {
	controlAdmissionUnavailable,
	controlSchemaReady,
	requireControlSchema,
	taskControlSchema,
	type ControlSchemaRequirement
} from './control-schema'

@Injectable()
export class ControlRuntimeAdmissionService {
	private readonly requirements = new Map<ExecutionControlCapability, readonly ControlSchemaRequirement[]>([
		['taskControl', taskControlSchema]
	])
	private queuePools: ExecutionControlCapabilities['queuePools'] = []
	private handlers: () => ControlledHandlerCapability[] = () => []
	constructor(
		private readonly database: DataSource,
		private readonly instances: InstanceRegistryService
	) {}

	register(capability: ExecutionControlCapability, requirements: readonly ControlSchemaRequirement[]) {
		this.requirements.set(capability, requirements)
	}
	registerManagedQueue(
		pools: ExecutionControlCapabilities['queuePools'],
		handlers: () => ControlledHandlerCapability[]
	) {
		this.register('managedQueue', taskControlSchema)
		this.queuePools = pools
		this.handlers = handlers
	}
	async refresh() {
		const started = Date.now()
		const protocols: ExecutionControlCapabilities['protocols'] = {}
		for (const [capability, requirements] of this.requirements) {
			try {
				if (await controlSchemaReady(this.database.manager, requirements))
					Object.assign(protocols, { [capability]: executionControlProtocols[capability] })
			} catch {
				/* Keep this capability absent until the schema can be verified again. */
			}
		}
		await this.instances.reportExecutionControl({
			version: 1,
			validUntil: started + 5000,
			protocols,
			queuePrefix: getConfig().managedQueueOptions?.prefix ?? 'xpert:managed-queue',
			queuePools: this.queuePools,
			handlers: this.handlers()
		})
	}
	async requireLocal(capability: ExecutionControlCapability, necessaryContinuation = false) {
		const requirements = this.requirements.get(capability)
		if (!requirements) throw controlAdmissionUnavailable('protocol')
		await requireControlSchema(this.database.manager, requirements)
		if (!this.instances.canAdmitControlledWork(necessaryContinuation)) throw controlAdmissionUnavailable('worker')
	}
	async requireQueueWorker(
		input: ControlledHandlerCapability,
		pool: 'default' | 'sandbox-browser',
		necessaryContinuation = false
	) {
		// Publication may be completing an already admitted parent while its boot is being withdrawn.
		await requireControlSchema(this.database.manager, taskControlSchema)
		try {
			if (
				(
					await this.instances.findControlledQueueWorkers(
						input,
						pool,
						getConfig().managedQueueOptions?.prefix ?? 'xpert:managed-queue',
						necessaryContinuation
					)
				).length
			)
				return
		} catch {
			/* Unavailable registration data cannot authorize a new launch. */
		}
		throw controlAdmissionUnavailable('worker')
	}
}
