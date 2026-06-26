import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { ManagedConnectionRegistryService } from './managed-connection-registry.service'

@Injectable()
export class ManagedConnectionCleanupService {
	private readonly logger = new Logger(ManagedConnectionCleanupService.name)

	constructor(private readonly registry: ManagedConnectionRegistryService) {}

	@Interval(30_000)
	async cleanupExpiredLeases(): Promise<void> {
		try {
			await this.registry.markExpiredConnectionsStale()
		} catch (error) {
			this.logger.warn(`Failed to cleanup managed connection leases: ${this.describeError(error)}`)
		}
	}

	private describeError(error: unknown): string {
		return error instanceof Error ? error.message : String(error)
	}
}
