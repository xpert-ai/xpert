import { Injectable } from '@nestjs/common'
import type { ProjectTaskReviewer } from '@xpert-ai/contracts'
import type { AgentInvocationScope, AgentTarget } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { invocationError } from '../../agent-invocation/invocation-runtime'
import { ProjectReviewEnvironment } from './project-review.environment'

@Injectable()
export class DefaultProjectReviewEnvironment extends ProjectReviewEnvironment {
    assertSupported(target: AgentTarget, mode: ProjectTaskReviewer['mode']): void {
        // Preserve the existing evidence-only confinement. OS has no execution-review verifier.
        // Configuration cannot declare new support; only the installed host implementation can.
        if (mode !== 'evidence_only' || target.provider !== 'opencode' ||
            !z.object({ type: z.literal('computer') }).safeParse(target.configuration.executionEnvironment).success)
            throw invocationError('Unsupported')
    }

    executionInstructions(): string { throw invocationError('Unsupported') }

    async verify(_scope: AgentInvocationScope, _invocationId: string): Promise<boolean> {
        throw invocationError('Unsupported')
    }
}
