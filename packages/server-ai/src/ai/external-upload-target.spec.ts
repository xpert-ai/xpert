import { BadRequestException } from '@nestjs/common'
import { resolveExternalStorageUploadTarget } from './external-upload-target'

describe('resolveExternalStorageUploadTarget', () => {
    const defaults = { kind: 'storage' as const, directory: 'contexts', prefix: 'files' }

    it('returns only the server-owned storage target for an absent or matching hint', () => {
        expect(resolveExternalStorageUploadTarget(undefined, defaults)).toEqual(defaults)
        expect(
            resolveExternalStorageUploadTarget(
                JSON.stringify({ kind: 'storage', directory: 'contexts', prefix: 'files' }),
                defaults
            )
        ).toEqual(defaults)
    })

    it.each([
        { kind: 'volume', tenantId: 'victim-tenant', userId: 'victim-user', catalog: 'users' },
        { kind: 'sandbox', mode: 'mounted_workspace', workspacePath: '/tmp/victim' },
        { kind: 'storage', strategy: 'sandbox:mounted_workspace', workspacePath: '/tmp/victim' },
        { kind: 'storage', directory: 'other-directory' },
        { kind: 'storage', fileName: 'victim-key.txt' },
        { kind: 'storage', provider: 'client-selected-provider' }
    ])('rejects client-controlled upload authority: %j', (target) => {
        expect(() => resolveExternalStorageUploadTarget(JSON.stringify(target), defaults)).toThrow(BadRequestException)
    })
})
