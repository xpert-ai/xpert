import { BadRequestException, ConflictException } from '@nestjs/common'
import type { CommandBus } from '@nestjs/cqrs'
import {
    assistantTemplateSetupStateSchema,
    templateSetupUpdateSchema,
    type AssistantTemplateSetup,
    type AssistantTemplateMetadata,
    type IXpert,
    type TemplateSetupUpdate
} from '@xpert-ai/contracts'
import { t } from 'i18next'
import path from 'node:path'
import { VolumeHandle } from '../../shared/volume/volume'
import type { XpertRuntimeWorkArea } from '../../shared/volume/work-area'
import { VolumeWorkspaceStorage } from '../../shared/volume/workspace-storage'
import { initializeTemplateFiles } from '../../shared/volume/initialize-template-files'
import { ResolveTemplateConnectorsCommand } from '../../connector/template-connectors.command'

/** Each invocation owns its initial files and preferences; access is still the caller's authorized volume. */
export async function createTemplateTaskContext(
    area: XpertRuntimeWorkArea,
    invocationId: string,
    owner: IXpert,
    manifest: AssistantTemplateMetadata['manifest'],
    commands: CommandBus,
    authorize: () => Promise<void>
) {
    await authorize()
    const relative = path.posix.join(area.defaultPath.relativePath, 'agent-tasks', invocationId)
    await VolumeHandle.ensureDirectory(area.volume.serverRoot, relative, area.volume.serverRoot, true)
    const volume = new VolumeHandle(
        area.volume.scope,
        path.join(area.volume.serverRoot, relative),
        path.join(area.volume.hostRoot, relative),
        `${area.volume.publicBaseUrl}/${relative}`,
        area.volume.serverRoot
    )
    if (manifest?.files) await initializeTemplateFiles(volume, manifest.files)
    const storage = new VolumeWorkspaceStorage(async () => {
        await authorize()
        return volume
    }, 'platform_template_task')
    const taskSetup = (update?: TemplateSetupUpdate): Promise<AssistantTemplateSetup> =>
        storage.withLock('setup', async () => {
            let state: AssistantTemplateSetup['state'] = { revision: 0, preferences: {}, connectors: {} }
            try {
                state = assistantTemplateSetupStateSchema.parse(
                    JSON.parse((await storage.read('setup.json')).toString('utf8'))
                )
            } catch (error) {
                if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error
            }
            if (update) {
                const parsed = templateSetupUpdateSchema.parse(update)
                if (parsed.revision !== state.revision)
                    throw new ConflictException(t('server-ai:Error.TemplateSetupChanged'))
                if (
                    parsed.connector ||
                    Object.keys(parsed.preferences ?? {}).some(
                        (key) => !manifest?.onboarding?.preferences.includes(key)
                    )
                )
                    throw new BadRequestException(t('server-ai:Error.TemplateSetupInvalid'))
                state.preferences = { ...state.preferences, ...parsed.preferences }
                if (parsed.firstResult) {
                    if (
                        !manifest?.onboarding ||
                        manifest.onboarding.preferences.some((key) => !state.preferences[key]?.trim())
                    )
                        throw new BadRequestException(t('server-ai:Error.TemplateSetupInvalid'))
                    state.firstResult = parsed.firstResult
                    state.completedAt ??= new Date().toISOString()
                }
                state.revision++
            }
            const requirements = manifest?.connectors ?? []
            let connections = await commands.execute(
                new ResolveTemplateConnectorsCommand(owner.id, requirements, state.connectors)
            )
            // Select only an unambiguous existing connection; this never grants authorization.
            for (const connector of connections.connectors) {
                if (!state.connectors[connector.key] && connector.options.length === 1)
                    state.connectors[connector.key] = { choice: 'binding', bindingId: connector.options[0].bindingId }
            }
            if (requirements.length)
                connections = await commands.execute(
                    new ResolveTemplateConnectorsCommand(owner.id, requirements, state.connectors)
                )
            await storage.write('setup.json', JSON.stringify(state))
            return { assistantId: owner.id, state, onboarding: manifest?.onboarding, ...connections, routines: [] }
        })
    return { taskSetup, workingDirectory: path.posix.join(area.workspaceRoot, relative), volume }
}
