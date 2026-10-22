/** Admission owns its lifecycle; replacing the restart executor must not stop safety validation. */
import type { FactoryProvider } from '@nestjs/common'
import { REDIS_CLIENT } from '../core/redis/types'
import { InstanceRegistryService } from '../managed-connection/instance-registry.service'
import { PluginRuntimeGenerationStore } from './plugin-runtime-generation.store'
import { RuntimeAdmissionMonitor } from './runtime-admission-monitor'
import { RuntimeLifecycleService } from './runtime-lifecycle.service'
import { RuntimePluginAdmission, RestartRegistry } from './runtime-plugin-admission'
import { ACTIVE_RESTART_KEY, readRestartMetadata } from './runtime-restart-metadata'
import { RuntimeRestartTargetStore } from './runtime-restart-target.store'
import type { RuntimeRestartRedisClient } from './runtime-restart.types'
import { replacementAdmission } from './runtime-rollout-policy'

export const runtimePluginAdmissionProvider: FactoryProvider<RuntimePluginAdmission> = {
	provide: RuntimePluginAdmission,
	inject: [InstanceRegistryService, RuntimeLifecycleService],
	useFactory: (registry: RestartRegistry, lifecycle: RuntimeLifecycleService) =>
		new RuntimePluginAdmission(registry, lifecycle)
}

export const runtimeAdmissionMonitorProvider: FactoryProvider<RuntimeAdmissionMonitor> = {
	provide: RuntimeAdmissionMonitor,
	inject: [REDIS_CLIENT, InstanceRegistryService, RuntimePluginAdmission],
	useFactory: (redis: RuntimeRestartRedisClient, registry: RestartRegistry, admission: RuntimePluginAdmission) => {
		const targets = new RuntimeRestartTargetStore(redis)
		return new RuntimeAdmissionMonitor(admission, new PluginRuntimeGenerationStore(redis), async () => {
			const id = await redis.get(ACTIVE_RESTART_KEY)
			const metadata = id ? await readRestartMetadata(redis, id) : null
			return replacementAdmission(
				metadata,
				metadata ? await targets.read(metadata.restartId) : [],
				registry.instanceId,
				registry.bootId
			)
		})
	}
}
