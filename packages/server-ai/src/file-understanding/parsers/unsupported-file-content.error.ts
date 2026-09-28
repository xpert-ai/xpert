import { t } from 'i18next'

/** Only unsupported content is eligible for a reference-only attachment fallback. */
export class UnsupportedFileContentError extends Error {
    constructor() {
        super(
            t('server-ai:Error.FileContentNotReadable', {
                defaultValue:
                    'This file cannot be read directly as text. Use a parser or tool that supports its format.'
            })
        )
        this.name = 'UnsupportedFileContentError'
    }
}
