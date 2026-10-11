import { ForbiddenException } from '@nestjs/common'
import type { TFile } from '@xpert-ai/contracts'

/** Call only after read authorization; a failed write check must not hide readable content. */
export async function workspaceFileCapabilities(
    authorizeWrite: () => Promise<unknown>
): Promise<NonNullable<TFile['capabilities']>> {
    try {
        await authorizeWrite()
        return { canRead: true, canWrite: true }
    } catch (error) {
        if (!(error instanceof ForbiddenException)) throw error
        return { canRead: true, canWrite: false }
    }
}
