// Extensions refine runtime paths; storage identity remains owned by Volume Core.
// Authorization failures must propagate, and passive resolution must not create files.
import { Injectable } from '@nestjs/common'
import { t } from 'i18next'
import { LOCAL_SHELL_SANDBOX_PROVIDER_TYPE } from './volume'
import type { XpertRuntimeWorkArea, XpertRuntimeWorkAreaInput, XpertWorkAreaResolveOptions } from './work-area'

/**
 * Refines paths for a runtime provider while preserving the volume identity and server paths.
 * Return null when inapplicable; throw on denied access instead of falling back to a different mount.
 */
export interface XpertWorkAreaExtension {
    resolve(
        input: XpertRuntimeWorkAreaInput,
        area: XpertRuntimeWorkArea,
        options: XpertWorkAreaResolveOptions
    ): Promise<XpertRuntimeWorkArea | null>
}

/** Host modules register at most one extension per provider, without provider imports in shared callers. */
@Injectable()
export class XpertWorkAreaExtensionRegistry {
    private readonly extensions = new Map<string, { extension: XpertWorkAreaExtension }>()

    /** Register once per provider; the disposer cannot remove a subsequent module registration. */
    register(provider: string, extension: XpertWorkAreaExtension): () => void {
        if (this.extensions.has(provider)) {
            throw new Error(t('server-ai:Error.XpertWorkAreaExtensionAlreadyRegistered', { provider }))
        }
        const registration = { extension }
        this.extensions.set(provider, registration)
        return () => {
            if (this.extensions.get(provider) === registration) this.extensions.delete(provider)
        }
    }

    /** Keep the base area when no extension applies; propagate errors and passive lookup options unchanged. */
    async resolve(
        input: XpertRuntimeWorkAreaInput,
        area: XpertRuntimeWorkArea,
        options: XpertWorkAreaResolveOptions
    ): Promise<XpertRuntimeWorkArea> {
        const extension = this.extensions.get(input.provider ?? LOCAL_SHELL_SANDBOX_PROVIDER_TYPE)?.extension
        return (await extension?.resolve(input, area, options)) ?? area
    }
}
