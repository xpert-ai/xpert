import type { TChatThreadRunControl } from '@xpert-ai/contracts'

export type PublicRunControl = Pick<TChatThreadRunControl, 'executionId' | 'state' | 'pauseId'>

/** Keep old SDK control handles, never serialize checkpoints, input nodes or pending business results. */
export function publicRunControl(control?: TChatThreadRunControl | null): PublicRunControl | null {
    return control
        ? {
              executionId: control.executionId,
              state: control.state,
              ...(control.pauseId ? { pauseId: control.pauseId } : {})
          }
        : null
}
