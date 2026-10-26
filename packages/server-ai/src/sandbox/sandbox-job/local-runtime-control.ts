import { randomUUID } from 'node:crypto'
import { sandboxEvidence, sandboxTargetsEqual, type SandboxRuntimeTarget } from '@xpert-ai/contracts'
import type { SandboxRuntimeDestroyOptions } from '@xpert-ai/plugin-sdk'

interface ControlledInstance {
    terminate(): void
    exitProven: boolean
    executionUnknown: boolean
}

/** Only this original provider boot may produce local process receipts. */
export class LocalRuntimeControl {
    constructor(
        private readonly provider: string,
        private readonly instances: Map<string, ControlledInstance>
    ) {}
    private readonly hostId = randomUUID()
    readonly controls = new Map<
        string,
        { target: SandboxRuntimeTarget; sealed: boolean; creating: boolean; exited: boolean }
    >()

    async prepare(options: SandboxRuntimeDestroyOptions & { generation: string }): Promise<SandboxRuntimeTarget> {
        const target: SandboxRuntimeTarget = {
            version: 1,
            kind: 'host',
            provider: this.provider,
            runtimeProfile: options.runtimeProfile,
            generation: options.generation,
            environmentId: this.hostId,
            runtimeRef: `local-${options.generation}`
        }
        if (!this.controls.has(target.runtimeRef))
            this.controls.set(target.runtimeRef, { target, sealed: false, creating: false, exited: false })
        return target
    }

    async control(target: SandboxRuntimeTarget, action: 'inspect' | 'stop') {
        const owned = this.controls.get(target.runtimeRef)
        if (!owned || !sandboxTargetsEqual(owned.target, target)) return sandboxEvidence(target, 'unknown')
        if (action === 'stop') owned.sealed = true
        const instance = this.instances.get(target.runtimeRef)
        if (action === 'stop') instance?.terminate()
        if (owned.exited || instance?.exitProven) return sandboxEvidence(target, 'exited')
        if (!instance) return sandboxEvidence(target, owned.creating ? 'unknown' : 'not_started')
        return sandboxEvidence(target, instance.executionUnknown ? 'unknown' : 'running')
    }
}
