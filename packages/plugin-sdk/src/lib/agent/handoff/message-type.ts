/**
 * Structured message types (suggested format):
 * - channel.{provider}.{action}.v{number}
 * - agent.{action}.v{number}
 * - system.{action}.v{number}
 * - plugin.{domain}.{action}.v{number}
 *
 * Note: At runtime, any string type is still allowed, facilitating dynamic extension by plugins.
 */
export type StructuredHandoffMessageType =
	| `channel.${string}.${string}.v${number}`
	| `agent.${string}.v${number}`
	| `system.${string}.v${number}`
	| `plugin.${string}.${string}.v${number}`

const SEGMENT_PATTERN = /^[a-z][a-z0-9_-]*$/i
const VERSION_PATTERN = /^v[1-9][0-9]*$/

function assertSegment(input: string, name: string) {
	if (!SEGMENT_PATTERN.test(input)) {
		throw new Error(`Invalid ${name} segment: "${input}"`)
	}
}

/**
 * Unified construction of channel message types to avoid manual string errors.
 * Example: channel.lark.inbound.v1
 */
export function defineChannelMessageType(
	provider: string,
	action: string,
	version: number
): StructuredHandoffMessageType {
	assertSegment(provider, 'provider')
	assertSegment(action, 'action')
	if (!Number.isInteger(version) || version <= 0) {
		throw new Error(`Invalid version: "${version}"`)
	}
	return `channel.${provider}.${action}.v${version}`
}

/**
 * Unified construction of agent message types.
 * Example: agent.handoff.v1
 */
export function defineAgentMessageType(
	action: string,
	version: number
): StructuredHandoffMessageType {
	assertSegment(action, 'action')
	if (!Number.isInteger(version) || version <= 0) {
		throw new Error(`Invalid version: "${version}"`)
	}
	return `agent.${action}.v${version}`
}

/**
 * Check if a type conforms to the structured naming convention (format only, no semantic validation).
 */
export function isStructuredMessageType(type: string): boolean {
	const parts = type.split('.')
	if (parts.length < 3) {
		return false
	}
	const version = parts[parts.length - 1]
	if (!VERSION_PATTERN.test(version)) {
		return false
	}
	return parts.slice(0, -1).every((part) => SEGMENT_PATTERN.test(part))
}
