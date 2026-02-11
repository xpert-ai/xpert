/**
 * 结构化消息类型（建议格式）：
 * - channel.{provider}.{action}.v{number}
 * - agent.{action}.v{number}
 * - system.{action}.v{number}
 * - plugin.{domain}.{action}.v{number}
 *
 * 注意：运行时仍允许任意字符串 type，方便插件动态扩展。
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
 * 统一构造 channel 类型消息，避免手写字符串出错。
 * 示例：channel.lark.inbound.v1
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
 * 统一构造 agent 类型消息。
 * 示例：agent.handoff.v1
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
 * 统一构造 system 类型消息。
 * 示例：system.cancel.v1
 */
export function defineSystemMessageType(
	action: string,
	version: number
): StructuredHandoffMessageType {
	assertSegment(action, 'action')
	if (!Number.isInteger(version) || version <= 0) {
		throw new Error(`Invalid version: "${version}"`)
	}
	return `system.${action}.v${version}`
}

/**
 * 判断是否符合结构化命名规范（仅做格式校验，不做语义校验）。
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

