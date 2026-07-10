import { usesOrganizationCredentials } from './utils'

describe('usesOrganizationCredentials', () => {
    it('recognizes validated credentials owned by the current organization', () => {
        expect(
            usesOrganizationCredentials(
                {
                    modelProvider: {
                        organizationId: 'org-1',
                        credentials: { token: 'configured' }
                    }
                },
                'org-1'
            )
        ).toBe(true)
    })

    it.each([
        {
            label: 'another organization owns the credentials',
            provider: { organizationId: 'org-2', credentials: { token: 'configured' } }
        },
        {
            label: 'credentials are empty',
            provider: { organizationId: 'org-1', credentials: {} }
        },
        {
            label: 'credentials are invalid',
            provider: { organizationId: 'org-1', credentials: { token: 'configured' }, isValid: false }
        }
    ])('returns false when $label', ({ provider }) => {
        expect(usesOrganizationCredentials({ modelProvider: provider }, 'org-1')).toBe(false)
    })
})
