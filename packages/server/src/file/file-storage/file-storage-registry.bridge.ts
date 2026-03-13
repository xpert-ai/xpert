import { Injectable, OnModuleInit } from '@nestjs/common'
import { FileStorageProviderRegistry } from '@xpert-ai/plugin-sdk'

@Injectable()
export class FileStorageRegistryBridge implements OnModuleInit {
	private static registry?: FileStorageProviderRegistry

	constructor(private readonly fileStorageProviderRegistry: FileStorageProviderRegistry) {}

	onModuleInit() {
		FileStorageRegistryBridge.registry = this.fileStorageProviderRegistry
	}

	static getRegistry() {
		return this.registry
	}
}
