import { constants as fsConstants } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { t } from 'i18next'
import { VolumeHandle } from './volume'

export class ProjectContentIntegrityError extends Error {
    constructor(
        readonly contentPath: string,
        readonly reason: string
    ) {
        super(
            t('server-ai:Error.ProjectContentIntegrityInvalid', {
                path: contentPath,
                defaultValue: 'Project Content failed its integrity check at {{path}}'
            })
        )
        this.name = 'ProjectContentIntegrityError'
    }
}

export async function assertProjectContentRootIntegrity(volumeRoot: string) {
    const projectFile = await openProjectContentEntry(volumeRoot, 'project.md')
    try {
        assertRegularSingleLinkFile(projectFile.fileStat, 'project.md')
    } finally {
        await projectFile.fileHandle.close()
    }

    const skillsRoot = await openProjectContentEntry(volumeRoot, 'skills', true)
    try {
        if (!skillsRoot.fileStat.isDirectory()) {
            throw new ProjectContentIntegrityError('skills', 'not_directory')
        }
    } finally {
        await skillsRoot.fileHandle.close()
    }
}

export async function findValidatedProjectSkillFiles(volumeRoot: string): Promise<string[]> {
    await assertProjectContentRootIntegrity(volumeRoot)
    const skillsRoot = await openProjectContentEntry(volumeRoot, 'skills', true)
    try {
        return await validateProjectSkillsDirectory(volumeRoot, skillsRoot, '')
    } finally {
        await skillsRoot.fileHandle.close()
    }
}

async function validateProjectSkillsDirectory(
    volumeRoot: string,
    openedDirectory: Awaited<ReturnType<typeof VolumeHandle.openExistingFile>>,
    relativeDirectory: string
): Promise<string[]> {
    const entries = await readdir(openedDirectory.descriptorPath, { withFileTypes: true })
    const skillFiles: string[] = []
    for (const entry of entries) {
        const relativePath = path.posix.join(relativeDirectory, entry.name)
        if (entry.isSymbolicLink()) {
            throw new ProjectContentIntegrityError(`skills/${relativePath}`, 'symbolic_link')
        }

        const openedEntry = await openProjectContentEntry(volumeRoot, `skills/${relativePath}`, entry.isDirectory())
        try {
            if (openedEntry.fileStat.isDirectory()) {
                skillFiles.push(...(await validateProjectSkillsDirectory(volumeRoot, openedEntry, relativePath)))
                continue
            }
            assertRegularSingleLinkFile(openedEntry.fileStat, `skills/${relativePath}`)
            if (entry.name === 'SKILL.md') {
                skillFiles.push(openedEntry.filePath)
            }
        } finally {
            await openedEntry.fileHandle.close()
        }
    }
    return skillFiles
}

async function openProjectContentEntry(volumeRoot: string, relativePath: string, directory = false) {
    try {
        const openedEntry = await VolumeHandle.openExistingFile(volumeRoot, relativePath, {
            boundaryRoot: volumeRoot,
            flags:
                fsConstants.O_RDONLY |
                (directory && typeof fsConstants.O_DIRECTORY === 'number' ? fsConstants.O_DIRECTORY : 0)
        })
        const expectedRelativePath = path.posix.normalize(relativePath.replace(/\\/g, '/').replace(/^\/+/, ''))
        if (openedEntry.volumeRelativePath !== expectedRelativePath) {
            await openedEntry.fileHandle.close()
            throw new ProjectContentIntegrityError(relativePath, 'path_alias')
        }
        return openedEntry
    } catch (error) {
        if (error instanceof ProjectContentIntegrityError) {
            throw error
        }
        throw new ProjectContentIntegrityError(relativePath, 'unavailable')
    }
}

function assertRegularSingleLinkFile(fileStat: { isFile(): boolean; nlink: number }, contentPath: string) {
    if (!fileStat.isFile()) {
        throw new ProjectContentIntegrityError(contentPath, 'not_regular_file')
    }
    if (fileStat.nlink !== 1) {
        throw new ProjectContentIntegrityError(contentPath, 'multiple_hard_links')
    }
}
