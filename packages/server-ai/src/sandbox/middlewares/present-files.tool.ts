import { tool } from '@langchain/core/tools'
import { TAgentRunnableConfigurable } from '@xpert-ai/contracts'
import { resolveSandboxBackend, type IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { z } from 'zod/v3'
import { FileActivityStorage } from './file-activity-storage.service'
import { getToolCallId, withToolMessage } from './tool-message.utils'
import { MAX_PRESENT_FILES, presentFiles } from './present-files'

export const presentFilesSchema = z
    .object({
        paths: z
            .array(z.string().min(1).max(1024))
            .min(1)
            .max(MAX_PRESENT_FILES)
            .describe(
                'Workspace-relative paths of the files to show as deliverable cards. Select final files the user requested; omit drafts and QA files unless requested. Existing unchanged files are allowed. Maximum 20 files, 25 MiB each and 64 MiB total.'
            )
    })
    .strict()

export function createPresentFilesTool(
    storage: Pick<FileActivityStorage, 'persist'>,
    context: IAgentMiddlewareContext
) {
    return tool(
        async ({ paths }, config) => {
            const toolCallId = getToolCallId(config)
            return withToolMessage(
                toolCallId,
                'present_files',
                t('server-ai:Tools.PresentFiles'),
                { paths },
                async () => {
                    const configurable = config?.configurable as TAgentRunnableConfigurable | undefined
                    const backend = resolveSandboxBackend(configurable?.sandbox)
                    if (!backend) throw new Error(t('server-ai:Error.FilePresentationSandbox'))
                    return JSON.stringify(await presentFiles(storage, context, backend, toolCallId, paths))
                }
            )
        },
        {
            name: 'present_files',
            description:
                'Present selected workspace files as private, version-pinned output cards in this conversation. Call after generating and verifying the requested final deliverables, before the final reply. Writing or editing a file alone does not present it. Can also present existing unchanged files. Later edits need a new call; earlier messages keep their saved versions. Repeated content reuses its saved version. This does not share files publicly or modify workspace bytes.',
            schema: presentFilesSchema,
            verboseParsingErrors: true,
            metadata: { toolName: { en_US: 'Present files', zh_Hans: '交付文件' } }
        }
    )
}
