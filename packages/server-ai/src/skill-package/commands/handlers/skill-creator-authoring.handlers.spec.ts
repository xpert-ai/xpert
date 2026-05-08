jest.mock('@xpert-ai/plugin-sdk', () => ({
	RequestContext: {
		currentUser: jest.fn(() => ({ id: 'user-1' }))
	}
}))

jest.mock('../../skill-package.service', () => ({
	SkillPackageService: class SkillPackageService {}
}))

import {
	CreateWorkspaceSkillCommand,
	DeleteWorkspaceSkillCommand,
	GetWorkspaceSkillForEditQuery,
	UpdateWorkspaceSkillCommand
} from '../../authoring/skill-creator-cqrs'
import { CreateWorkspaceSkillHandler } from './create-workspace-skill.handler'
import { DeleteWorkspaceSkillHandler } from './delete-workspace-skill.handler'
import { UpdateWorkspaceSkillHandler } from './update-workspace-skill.handler'
import { GetWorkspaceSkillForEditHandler } from '../../queries/handlers/get-workspace-skill-for-edit.handler'

describe('skill creator authoring handlers', () => {
	const workspaceSkill = {
		id: 'skill-1',
		workspaceId: 'workspace-1',
		name: 'image-editor',
		visibility: 'private',
		packagePath: 'image-editor',
		skillIndexId: null,
		metadata: {
			name: 'image-editor',
			displayName: { en_US: 'Image Editor' },
			description: { en_US: 'Edit images.' },
			version: '1.0.0',
			skillMdPath: '/workspace/skills/image-editor/SKILL.md'
		}
	}

	let service: {
		createWorkspaceSkillPackage: jest.Mock
		getAllByWorkspace: jest.Mock
		readSkillPackageFile: jest.Mock
		saveWorkspaceSkillMarkdown: jest.Mock
		uninstallSkillPackageInWorkspace: jest.Mock
	}

	beforeEach(() => {
		service = {
			createWorkspaceSkillPackage: jest.fn().mockResolvedValue({
				skillPackage: workspaceSkill,
				packagePath: 'image-editor',
				files: [{ path: 'SKILL.md', size: 67 }]
			}),
			getAllByWorkspace: jest.fn().mockResolvedValue({ items: [workspaceSkill] }),
			readSkillPackageFile: jest.fn().mockResolvedValue({
				contents: '---\nname: image-editor\ndescription: Edit images.\n---\n# Image Editor\n'
			}),
			saveWorkspaceSkillMarkdown: jest.fn().mockResolvedValue({
				skillPackage: workspaceSkill,
				file: {
					contents: '---\nname: image-editor\ndescription: Edit images safely.\n---\n# Image Editor\n'
				}
			}),
			uninstallSkillPackageInWorkspace: jest.fn().mockResolvedValue(undefined)
		}
	})

	it('creates workspace skills with strict Codex-style frontmatter validation enabled', async () => {
		const result = await new CreateWorkspaceSkillHandler(service as any).execute(
			new CreateWorkspaceSkillCommand('workspace-1', {
				userIntent: 'Create image editor skill',
				skillMarkdown: '---\nname: image-editor\ndescription: Edit images.\n---\n# Image Editor\n',
				files: [
					{
						path: 'references/workflows.md',
						content: '# Workflows\n'
					}
				]
			})
		)

		expect(result.status).toBe('applied')
		expect(result.packagePath).toBe('image-editor')
		expect(result.files).toEqual([{ path: 'SKILL.md', size: 67 }])
		expect(service.createWorkspaceSkillPackage).toHaveBeenCalledWith(
			'workspace-1',
			expect.objectContaining({
				files: [
					{
						path: 'references/workflows.md',
						content: '# Workflows\n'
					}
				],
				strictFrontmatter: true
			})
		)
	})

	it('reads one metadata-matched workspace skill for editing', async () => {
		const result = await new GetWorkspaceSkillForEditHandler(service as any).execute(
			new GetWorkspaceSkillForEditQuery('workspace-1', {
				skillRef: { packagePath: 'image-editor' }
			})
		)

		expect(result.status).toBe('found')
		expect(result.skillMarkdown).toContain('# Image Editor')
		expect(service.readSkillPackageFile).toHaveBeenCalledWith('workspace-1', 'skill-1', 'SKILL.md')
	})

	it('returns candidates without updating when metadata ref is ambiguous', async () => {
		service.getAllByWorkspace.mockResolvedValue({
			items: [
				workspaceSkill,
				{
					...workspaceSkill,
					id: 'skill-2',
					packagePath: 'image-editor-2'
				}
			]
		})

		const result = await new UpdateWorkspaceSkillHandler(service as any).execute(
			new UpdateWorkspaceSkillCommand('workspace-1', {
				skillRef: { name: 'image-editor' },
				skillMarkdown: '---\nname: image-editor\ndescription: Edit images safely.\n---\n# Image Editor\n'
			})
		)

		expect(result.status).toBe('ambiguous')
		expect(result.candidates).toHaveLength(2)
		expect(service.saveWorkspaceSkillMarkdown).not.toHaveBeenCalled()
	})

	it('rejects update when strict frontmatter validation fails', async () => {
		service.saveWorkspaceSkillMarkdown.mockRejectedValue(new Error('SKILL.md frontmatter may only include name, description'))

		const result = await new UpdateWorkspaceSkillHandler(service as any).execute(
			new UpdateWorkspaceSkillCommand('workspace-1', {
				skillRef: { id: 'skill-1' },
				skillMarkdown: '---\nname: image-editor\ndescription: Edit images.\nversion: 1.0.0\n---\n# Image Editor\n'
			})
		)

		expect(result.status).toBe('rejected')
		expect(result.summary).toContain('frontmatter may only include')
	})

	it('deletes only a uniquely matched workspace-authored skill', async () => {
		const result = await new DeleteWorkspaceSkillHandler(service as any).execute(
			new DeleteWorkspaceSkillCommand('workspace-1', {
				skillRef: { displayName: 'Image Editor' }
			})
		)

		expect(result.status).toBe('applied')
		expect(service.uninstallSkillPackageInWorkspace).toHaveBeenCalledWith('workspace-1', 'skill-1')
	})
})
