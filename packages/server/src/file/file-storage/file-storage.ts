import { FileStorageOption, FileStorageProviderEnum } from '@metad/contracts'
import { IFileStorageProvider } from '@xpert-ai/plugin-sdk'
import { environment } from '@metad/server-config'
import { isEmpty, isNotEmpty } from '@metad/server-common'
import { RequestContext } from '../../core/context'
import { FileStorageRegistryBridge } from './file-storage-registry.bridge'
import { LocalProvider } from './providers'

const FALLBACK_PROVIDER_TYPES = [LocalProvider]

export class FileStorage {
	private static fallbackProviders: { [key: string]: IFileStorageProvider } = {}
	providers: { [key: string]: IFileStorageProvider } = {}
	config: FileStorageOption = {
		dest: ''
	}

	constructor(option?: FileStorageOption) {
		this.initProvider()
		this.setConfig(option)
	}

	setConfig(config: Partial<FileStorageOption> = {}) {
		this.config = {
			...this.config,
			...config
		}
		if (isEmpty(config.provider)) {
			this.getProvider()
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

	storage(option?: FileStorageOption) {
		this.setConfig(option)
		const provider = this.getProviderInstance()
		if (provider) {
			return provider.handler(this.config)
		} else {
			throw new Error(`Provider "${this.config.provider}" is not registered`)
		}
	}

	getProviderInstance(): IFileStorageProvider {
		if (!this.config.provider) {
			return undefined
		}

		const registry = FileStorageRegistryBridge.getRegistry()
		if (registry) {
			try {
				return registry.get(`${this.config.provider}`)
			} catch (error) {
				// Fall back to built-in providers so bootstrap/tests without Nest context keep working.
			}
		}

		return this.providers[this.config.provider]
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
