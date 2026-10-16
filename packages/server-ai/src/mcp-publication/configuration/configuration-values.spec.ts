import { MCP_CONFIGURATION_SECRET_MASK, type JsonSchemaObjectType } from '@xpert-ai/contracts'
import { maskConfiguration, restoreConfigurationSecrets } from './configuration-values'

const accountsSchema: JsonSchemaObjectType = {
    type: 'object',
    properties: {
        accounts: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    password: { type: 'string', 'x-ui': { component: 'secretInput' } },
                    apiKey: { type: 'string', 'x-ui': { component: 'password' } }
                }
            }
        }
    }
}

it('retains the correct secret after deleting or moving array entries', () => {
    const current = {
        accounts: [
            { name: 'a', password: 'password-a' },
            { name: 'b', password: 'password-b' }
        ]
    }
    const masked = maskConfiguration(accountsSchema, current)
    const rows = masked.accounts
    if (!Array.isArray(rows)) throw new Error('Expected array form values')
    expect(restoreConfigurationSecrets(accountsSchema, { accounts: rows.slice(1) }, current)).toEqual({
        accounts: [current.accounts[1]]
    })
    expect(restoreConfigurationSecrets(accountsSchema, { accounts: [...rows].reverse() }, current)).toEqual({
        accounts: [...current.accounts].reverse()
    })
    expect(
        restoreConfigurationSecrets(accountsSchema, { accounts: [{ name: 'new', password: 'new' }, ...rows] }, current)
    ).toEqual({
        accounts: [{ name: 'new', password: 'new' }, ...current.accounts]
    })
})

it('rejects ambiguous legacy array masks and references outside their declared secret field', () => {
    const current = { accounts: [{ name: 'a', password: 'password-a', apiKey: 'key-a' }] }
    const masked = maskConfiguration(accountsSchema, current)
    const rows = masked.accounts
    const row = Array.isArray(rows) ? rows[0] : undefined
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Expected account form value')
    for (const password of [MCP_CONFIGURATION_SECRET_MASK, `${MCP_CONFIGURATION_SECRET_MASK}:missing`, row.apiKey]) {
        expect(() =>
            restoreConfigurationSecrets(accountsSchema, { accounts: [{ name: 'a', password }] }, current)
        ).toThrow()
    }
})

it('masks and restores declared nested/array secrets while retaining null, false and empty strings', () => {
    const schema: JsonSchemaObjectType = {
        type: 'object',
        properties: {
            nested: { type: 'object', properties: { password: { type: 'string', 'x-ui': { component: 'password' } } } },
            rows: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: { token: { type: 'string', 'x-ui': { component: 'secretInput' } } }
                }
            },
            enabled: { type: 'boolean' },
            empty: { type: 'string' },
            optional: { type: 'string' }
        }
    }
    const values = { nested: { password: 'one' }, rows: [{ token: 'two' }], enabled: false, empty: '', optional: null }
    const masked = maskConfiguration(schema, values)
    expect(masked).toEqual({
        nested: { password: MCP_CONFIGURATION_SECRET_MASK },
        rows: [{ token: expect.stringMatching(new RegExp(`^${MCP_CONFIGURATION_SECRET_MASK}:`)) }],
        enabled: false,
        empty: '',
        optional: null
    })
    expect(restoreConfigurationSecrets(schema, masked, values)).toEqual(values)
})
