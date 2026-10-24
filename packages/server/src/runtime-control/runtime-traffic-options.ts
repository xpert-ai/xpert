/** The default ingress contract needs at least 5s; longer propagation must fit the restart deadline. */
import { z } from 'zod'
import { TRAFFIC_WITHDRAWAL_MS } from './runtime-traffic-withdrawal'

export const RUNTIME_TRAFFIC_OPTIONS = Symbol('RUNTIME_TRAFFIC_OPTIONS')

export interface RuntimeTrafficOptions {
	withdrawalMs: number
}

const trafficEnvironmentSchema = z.object({
	RUNTIME_TRAFFIC_WITHDRAWAL_MS: z
		.string()
		.regex(/^\d+$/)
		.transform(Number)
		.pipe(z.number().int().min(TRAFFIC_WITHDRAWAL_MS).max(60_000))
		.default(String(TRAFFIC_WITHDRAWAL_MS))
})

export function readRuntimeTrafficOptions(
	environment: { RUNTIME_TRAFFIC_WITHDRAWAL_MS?: string } = {
		RUNTIME_TRAFFIC_WITHDRAWAL_MS: process.env.RUNTIME_TRAFFIC_WITHDRAWAL_MS
	}
): RuntimeTrafficOptions {
	const parsed = trafficEnvironmentSchema.parse(environment)
	return { withdrawalMs: parsed.RUNTIME_TRAFFIC_WITHDRAWAL_MS }
}
