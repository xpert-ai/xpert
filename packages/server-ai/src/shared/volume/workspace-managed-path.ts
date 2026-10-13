import { ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'

/** Reserved anywhere in the tree, including canonical symlink targets and archives. */
export function isManagedWorkspacePath(value: string): boolean {
    return value
        .replace(/\\/g, '/')
        .toLowerCase()
        .split('/')
        .some((part) => part === '.apps' || (part.startsWith('.workspace-write-') && part.endsWith('.tmp')))
}

export function assertPublicWorkspacePath(value: string, stat?: { nlink: number; isFile?: () => boolean }) {
    if (isManagedWorkspacePath(value) || (stat && stat.nlink > 1 && (!stat.isFile || stat.isFile()))) {
        throw new ForbiddenException(
            t('server-ai:Error.WorkspaceManagedDataProtected', {
                defaultValue: 'Managed application data is accessible only through the application storage API.'
            })
        )
    }
}
