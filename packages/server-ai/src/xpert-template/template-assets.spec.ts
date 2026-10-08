import { Logger } from '@nestjs/common'
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    cleanupTemplateFixtures,
    createService,
    createTempDir,
    readJson,
    seedBuiltinTemplates,
    writeJson
} from './testing/template-test-harness'
import { getTemplateRoots } from './utils/template-paths'

afterEach(cleanupTemplateFixtures)
it('uses /var/lib/xpert/data/xpert-template when env is not configured', () => {
    const workspaceRoot = createTempDir()
    const { configService } = createService({
        serverRoot: workspaceRoot,
        dataPath: '/var/lib/xpert/data/'
    })

    expect(getTemplateRoots(configService).externalRoot).toBe('/var/lib/xpert/data/xpert-template')
})

it('prefers XPERT_TEMPLATE_DIR when it is configured', () => {
    const workspaceRoot = createTempDir()
    const { configService } = createService({
        serverRoot: workspaceRoot,
        dataPath: '/var/lib/xpert/data/',
        env: {
            XPERT_TEMPLATE_DIR: '/tmp/custom-xpert-template'
        }
    })

    expect(getTemplateRoots(configService).externalRoot).toBe('/tmp/custom-xpert-template')
})

it('resolves relative XPERT_TEMPLATE_DIR from the server root', () => {
    const workspaceRoot = createTempDir()
    const { configService } = createService({
        serverRoot: workspaceRoot,
        dataPath: '/var/lib/xpert/data/',
        env: {
            XPERT_TEMPLATE_DIR: './runtime/xpert-template'
        }
    })

    expect(getTemplateRoots(configService).externalRoot).toBe(join(workspaceRoot, 'runtime', 'xpert-template'))
})

it('falls back to the data template directory when XPERT_TEMPLATE_DIR points at built-in templates', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    const loggerSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const { configService, initializer } = createService({
        serverRoot: workspaceRoot,
        dataPath: dataRoot,
        env: {
            XPERT_TEMPLATE_DIR: './packages/server-ai/src/xpert-template'
        }
    })

    seedBuiltinTemplates(workspaceRoot)
    await initializer.execute()
    expect(getTemplateRoots(configService).externalRoot).toBe(join(dataRoot, 'xpert-template'))
    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Ignoring XPERT_TEMPLATE_DIR'))
})

it('initializes the external template directory without overwriting existing files', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    const externalRoot = join(dataRoot, 'custom-template-root')
    const builtinRoot = seedBuiltinTemplates(workspaceRoot)

    mkdirSync(join(externalRoot, 'templates'), { recursive: true })
    writeJson(join(externalRoot, 'templates.json'), {
        templates: {
            'en-US': {
                categories: ['custom'],
                recommendedApps: [{ id: 'template-1', name: 'External Template' }]
            }
        },
        details: {}
    })
    writeFileSync(join(externalRoot, 'templates', 'template-1.yaml'), 'source: external-template\n', 'utf8')

    const { service } = createService({
        serverRoot: workspaceRoot,
        dataPath: join(dataRoot, 'fallback-data'),
        env: {
            XPERT_TEMPLATE_DIR: externalRoot
        }
    })

    await service.onApplicationBootstrap()

    expect(readJson(join(externalRoot, 'templates.json'))).toEqual({
        templates: {
            'en-US': {
                categories: ['custom'],
                recommendedApps: [{ id: 'template-1', name: 'External Template' }]
            }
        },
        details: {}
    })
    expect(readFileSync(join(externalRoot, 'templates', 'template-1.yaml'), 'utf8')).toBe('source: external-template\n')
    expect(readJson(join(externalRoot, 'mcp-templates.json'))).toEqual(
        readJson(join(builtinRoot, 'mcp-templates.json'))
    )
    expect(readJson(join(externalRoot, 'knowledge-pipelines.json'))).toEqual(
        readJson(join(builtinRoot, 'knowledge-pipelines.json'))
    )
    expect(readFileSync(join(externalRoot, 'skills-market.yaml'), 'utf8')).toBe(
        readFileSync(join(builtinRoot, 'skills-market.yaml'), 'utf8')
    )
    expect(readFileSync(join(externalRoot, 'skill-repositories.yaml'), 'utf8')).toBe(
        readFileSync(join(builtinRoot, 'skill-repositories.yaml'), 'utf8')
    )
    expect(readFileSync(join(externalRoot, 'workspace-defaults.yaml'), 'utf8')).toBe(
        readFileSync(join(builtinRoot, 'workspace-defaults.yaml'), 'utf8')
    )
    expect(readFileSync(join(externalRoot, 'pipelines', 'pipeline-1.yaml'), 'utf8')).toBe(
        readFileSync(join(builtinRoot, 'pipelines', 'pipeline-1.yaml'), 'utf8')
    )
})

it('throws a clear error when an external template file is missing after initialization', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    const externalRoot = join(dataRoot, 'external-templates')

    seedBuiltinTemplates(workspaceRoot)

    const { service } = createService({
        serverRoot: workspaceRoot,
        dataPath: join(dataRoot, 'fallback-data'),
        env: {
            XPERT_TEMPLATE_DIR: externalRoot
        }
    })

    await service.onApplicationBootstrap()
    unlinkSync(join(externalRoot, 'templates.json'))

    await expect(service.readTemplatesFile()).rejects.toThrow(externalRoot)
    await expect(service.readTemplatesFile()).rejects.toThrow('templates.json')
})

it('does not block module init when the builtin template source is missing', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const { service } = createService({
        serverRoot: workspaceRoot,
        dataPath: dataRoot
    })

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined()
    await expect(service.readTemplatesFile()).rejects.toThrow('Built-in xpert template source')
    await expect(service.readTemplatesFile()).rejects.toThrow(workspaceRoot)
    expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skip xpert template bootstrap during module init:'),
        expect.any(String)
    )
})

it('updates the template asset fingerprint when yaml or bundled skill files change', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    const externalRoot = join(dataRoot, 'external-templates')
    seedBuiltinTemplates(workspaceRoot)

    const { service } = createService({
        serverRoot: workspaceRoot,
        dataPath: join(dataRoot, 'fallback-data'),
        env: {
            XPERT_TEMPLATE_DIR: externalRoot
        }
    })

    await service.onApplicationBootstrap()
    const initialFingerprint = await service.calculateSkillAssetFingerprint()

    writeFileSync(
        join(externalRoot, 'workspace-defaults.yaml'),
        [
            'userDefault:',
            '  skills:',
            '    - provider: github',
            '      repositoryName: anthropics/skills',
            '      skillId: skills/claude-api'
        ].join('\n'),
        'utf8'
    )
    const updatedYamlFingerprint = await service.calculateSkillAssetFingerprint()

    mkdirSync(join(externalRoot, 'skill-packages', 'bundle-a'), { recursive: true })
    writeFileSync(
        join(externalRoot, 'skill-packages', 'bundle-a', 'SKILL.md'),
        '---\nname: Bundle A\ndescription: Example bundle.\n---\n# Bundle A\n',
        'utf8'
    )
    const updatedBundleFingerprint = await service.calculateSkillAssetFingerprint()

    expect(updatedYamlFingerprint).not.toBe(initialFingerprint)
    expect(updatedBundleFingerprint).not.toBe(updatedYamlFingerprint)
})
