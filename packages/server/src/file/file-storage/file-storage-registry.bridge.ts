import { FileStorageQuotaPolicy } from './file-storage-quota.policy'
import type { StorageBudgetOwner } from '../../shared/storage-budget.command'
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { IFileStorageProvider, FileStorageProviderRegistry } from '@xpert-ai/plugin-sdk'

@Injectable()
export class FileStorageRegistryBridge implements OnModuleInit, OnModuleDestroy {
	private static policy?: FileStorageQuotaPolicy
	private static registry?: FileStorageProviderRegistry

	constructor(
		private readonly fileStorageProviderRegistry: FileStorageProviderRegistry,
		private readonly policy: FileStorageQuotaPolicy
	) {}

	onModuleInit() {
		FileStorageRegistryBridge.registry = this.fileStorageProviderRegistry
		FileStorageRegistryBridge.policy = this.policy
	}

	onModuleDestroy() {
		if (FileStorageRegistryBridge.policy === this.policy) {
			FileStorageRegistryBridge.policy = undefined
			FileStorageRegistryBridge.registry = undefined
		}
	}
	static wrap(provider: IFileStorageProvider, owner?: StorageBudgetOwner) {
		return provider && this.policy ? this.policy.wrap(provider, owner) : provider
	}

	static getRegistry() {
		return this.registry
	}
}
