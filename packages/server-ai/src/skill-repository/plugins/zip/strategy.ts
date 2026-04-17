import { ISkillRepository, ISkillRepositoryIndex, TSkillSourceMeta } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { ISkillSourceProvider, SkillSourceProviderStrategy } from '@xpert-ai/plugin-sdk'
import { rm } from 'fs/promises'
import { cleanupExtractedSkillArchive, extractSkillsFromZip, installUploadedSkills, IUploadedSkill } from './archive'

export const FILE_SKILL_SOURCE_PROVIDER = 'file'

@Injectable()
@SkillSourceProviderStrategy(FILE_SKILL_SOURCE_PROVIDER)
export class ZipSkillSourceProvider implements ISkillSourceProvider {
	readonly type = 'file'
	readonly meta: TSkillSourceMeta = {
		name: FILE_SKILL_SOURCE_PROVIDER,
		label: {
			en_US: 'Upload Zip',
			zh_Hans: '上传 Zip'
		},
		icon: { type: 'svg', value: 'Upload' },
		configSchema: {
			type: 'object',
			properties: {}
		},
		credentialSchema: {
			type: 'object',
			properties: {}
		}
	}

	canHandle(sourceType: string): boolean {
		return sourceType === FILE_SKILL_SOURCE_PROVIDER || sourceType === 'zip'
	}

	async listSkills(_: ISkillRepository): Promise<ISkillRepositoryIndex[]> {
		return []
	}

	async installSkillPackage(): Promise<string> {
		throw new Error('File upload installs skills directly without repository index')
	}

	/**
	 * Extract skills from a zip buffer and copy them into installDir.
	 */
	async installFromZip(buffer: Buffer, installDir: string): Promise<IUploadedSkill[]> {
		const { skills, tempDir } = await extractSkillsFromZip(buffer)
		try {
			return await installUploadedSkills(skills, installDir)
		} finally {
			await cleanupExtractedSkillArchive(tempDir)
		}
	}

	async uninstallSkillPackage(path: string) {
		if (!path) {
			return
		}
		await rm(path, { recursive: true, force: true })
	}
}
