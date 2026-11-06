import { environment } from '@xpert-ai/server-config'
import { decryptSecret, encryptSecret } from '../core/utils/crypto'

const ENCRYPTED_CONFIG_KEY = '__xpert_plugin_encrypted__'

type TPluginConfigEnvelope = {
	[ENCRYPTED_CONFIG_KEY]: string
}

function getEncryptionKey() {
	return environment.secretsEncryptionKey
}

function isPlainObject(value: unknown): value is Record<string, any> {
	return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function isEncryptedPluginConfig(value: unknown): value is TPluginConfigEnvelope {
	return isPlainObject(value) && typeof value[ENCRYPTED_CONFIG_KEY] === 'string'
}

export function serializePluginConfig(config?: Record<string, any> | null): Record<string, any> {
	if (!config || Object.keys(config).length === 0) {
		return {}
	}

	const payload = JSON.stringify(config)
	return {
		[ENCRYPTED_CONFIG_KEY]: encryptSecret(payload, getEncryptionKey())
	}
}

export function deserializePluginConfig(value: unknown): Record<string, any> {
	if (!value) {
		return {}
	}

	if (isEncryptedPluginConfig(value)) {
		try {
			const decrypted = decryptSecret(value[ENCRYPTED_CONFIG_KEY], getEncryptionKey())
			const parsed = JSON.parse(decrypted)
			return isPlainObject(parsed) ? parsed : {}
		} catch {
			return {}
		}
	}

	return isPlainObject(value) ? value : {}
}

/** Live reads must surface decryption failures instead of treating them as empty configuration. */
export function deserializePluginConfigStrict(value: unknown): object {
	if (value == null) return {}
	if (isEncryptedPluginConfig(value)) {
		const parsed: unknown = JSON.parse(decryptSecret(value[ENCRYPTED_CONFIG_KEY], getEncryptionKey()))
		if (isPlainObject(parsed)) return parsed
	} else if (isPlainObject(value)) {
		return value
	}
	throw new Error('Invalid persisted plugin configuration')
}
