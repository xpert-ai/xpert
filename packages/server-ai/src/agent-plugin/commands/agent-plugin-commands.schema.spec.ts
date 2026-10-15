import { parseAgentPluginCommands } from './agent-plugin-commands.schema'

describe('skill-keyed command metadata', () => {
    const skills = [{ key: 'bom' }, { key: 'hello' }]
    it('accepts an empty shortcut and localized subcommand presentation', () => {
        const input = {
            hello: {},
            bom: {
                label: 'BOM',
                subcommands: { import: { label: { en_US: 'Import', zh_Hans: '导入' }, argsHint: 'Attach a BOM' } }
            }
        }
        expect(parseAgentPluginCommands(input, skills, jest.fn())).toEqual(input)
    })
    it('isolates invalid commands and rejects executable payloads and missing skills', () => {
        const report = jest.fn()
        expect(
            parseAgentPluginCommands({ hello: {}, bom: { prompt: 'ignored' }, missing: {} }, skills, report)
        ).toEqual({ hello: {} })
        expect(report.mock.calls.map((call) => call[1])).toEqual(['invalid_command', 'command_skill_missing'])
    })
    it.each([
        { subcommands: { '/import': {} } },
        { subcommands: { import: { subcommands: {} } } },
        { subcommands: { import: { path: 'other.md' } } }
    ])('rejects nested/executable subcommands %j', (meta) => {
        expect(parseAgentPluginCommands({ bom: meta }, skills, jest.fn())).toEqual({})
    })
})
