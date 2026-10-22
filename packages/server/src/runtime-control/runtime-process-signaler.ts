/** rolling-self-signal execution only; its supervisor replaces the process, not an arbitrary deployment. */
export interface RuntimeProcessSignaler {
	signal(signal: 'SIGTERM'): void
}

export const RUNTIME_PROCESS_SIGNALER = Symbol('RUNTIME_PROCESS_SIGNALER')
