import type { StorageBudgetOwner } from '../../shared/storage-budget.command'
import { FileStorageOption, FileStorageProviderEnum } from '@xpert-ai/contracts'
import { IFileStorageProvider, RequestContext } from '@xpert-ai/plugin-sdk'
import { environment } from '@xpert-ai/server-config'
import { isEmpty, isNotEmpty } from '@xpert-ai/server-common'
import { FileStorageRegistryBridge } from './file-storage-registry.bridge'
import { LocalProvider } from './providers'
import type { StorageEngine } from 'multer'
import type { Request } from 'express'

const FALLBACK_PROVIDER_TYPES = [LocalProvider]

export class FileStorage {
	private static fallbackProviders: { [key: string]: IFileStorageProvider } = {}
	providers: { [key: string]: IFileStorageProvider } = {}
	config: FileStorageOption = {
		dest: ''
	}

	constructor(
		option?: FileStorageOption,
		private readonly owner?: StorageBudgetOwner
	) {
		this.initProvider()
		this.setConfig(option)
	}

	setConfig(config: Partial<FileStorageOption> = {}) {
		this.config = {
			...this.config,
			...config
		}
		return this
	}

	setProvider(providerName?: string) {
		if (isEmpty(providerName)) {
			const request = RequestContext.currentRequest()
			if (request && isNotEmpty(request['tenantSettings'])) {
				const provider = request['tenantSettings']['fileStorageProvider'] as string
				this.config.provider = this.normalizeConfiguredProvider(provider)
			} else {
				this.config.provider = this.normalizeConfiguredProvider(environment.fileSystem.name)
			}
		} else {
			this.config.provider = this.normalizeConfiguredProvider(providerName)
		}
		return this
	}

	getProvider(providerName?: string) {
		this.setProvider(providerName)
		return this.getProviderInstance()
	}

	storage(option?: FileStorageOption): StorageEngine {
		const config = { ...this.config, ...option }
		const engines = new WeakMap<Request, StorageEngine>()
		// Controllers construct Multer decorators before plugin providers are registered.
		// Resolve per upload, then retain that engine for cleanup even if request scope changes.
		return {
			_handleFile: (request, file, callback) => {
				let engine = engines.get(request)
				try {
					if (!engine) {
						const storage = new FileStorage(config, this.owner)
						const provider = storage.getProvider(config.provider)
						if (!provider) throw new Error(`Provider "${storage.config.provider}" is not registered`)
						engine = provider.handler(storage.config)
						engines.set(request, engine)
					}
				} catch (error) {
					callback(error instanceof Error ? error : new Error('Unable to resolve file storage'))
					return
				}
				engine._handleFile(request, file, callback)
			},
			_removeFile: (request, file, callback) => {
				const engine = engines.get(request)
				if (!engine) return callback(new Error('Upload storage engine is unavailable'))
				engine._removeFile(request, file, callback)
			}
		}
	}

	getProviderInstance(): IFileStorageProvider {
		if (!this.config.provider) {
			this.setProvider()
		}

		const registry = FileStorageRegistryBridge.getRegistry()
		if (registry) {
			try {
				return FileStorageRegistryBridge.wrap(registry.get(`${this.config.provider}`), this.owner)
			} catch (error) {
				// Fall back to built-in providers so bootstrap/tests without Nest context keep working.
			}
		}

		return FileStorageRegistryBridge.wrap(this.providers[this.config.provider], this.owner)
	}

	initProvider() {
		if (!Object.keys(FileStorage.fallbackProviders).length) {
			for (const ProviderType of FALLBACK_PROVIDER_TYPES) {
				const instance = ProviderType.instance ?? new ProviderType()
				if (!ProviderType.instance) {
					ProviderType.instance = instance
				}
				FileStorage.fallbackProviders[instance.name] =
					typeof instance.getInstance === 'function' ? instance.getInstance() : instance
			}
		}

		this.providers = FileStorage.fallbackProviders
	}

	private normalizeConfiguredProvider(provider?: string) {
		if (isEmpty(provider)) {
			return FileStorageProviderEnum.LOCAL
		}

		return `${provider}`.toUpperCase()
	}
}
