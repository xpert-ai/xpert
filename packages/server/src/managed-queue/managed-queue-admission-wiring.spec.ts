import { MODULE_METADATA } from '@nestjs/common/constants'
import type { Provider } from '@nestjs/common'
import { ManagedQueueModule } from './managed-queue.module'
import { AdmittedManagedQueueProcessor, AdmittedBrowserManagedQueueProcessor } from './admitted-queue.processor'
import {
	ControlledManagedQueueProcessor,
	ControlledBrowserManagedQueueProcessor,
	managedQueuePoolAutorun
} from './managed-queue.processor'

describe('controlled queue consumer registration', () => {
	it('registers the new consumers by role without taking over contract-less v2 jobs', () => {
		const providers: Provider[] = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ManagedQueueModule)
		expect(providers).not.toContain(ControlledManagedQueueProcessor)
		expect(providers).not.toContain(ControlledBrowserManagedQueueProcessor)
		expect(providers.includes(AdmittedManagedQueueProcessor)).toBe(managedQueuePoolAutorun('default'))
		expect(providers.includes(AdmittedBrowserManagedQueueProcessor)).toBe(
			managedQueuePoolAutorun('sandbox-browser')
		)
	})
})
