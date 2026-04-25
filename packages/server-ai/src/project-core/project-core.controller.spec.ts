import { BadRequestException } from '@nestjs/common'
import { Readable } from 'stream'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { VolumeClient, VolumeHandle } from '../shared/volume/volume'
jest.mock('../xpert/published-xpert-access.service', () => ({
	PublishedXpertAccessService: class PublishedXpertAccessService {}
}))
import { ProjectCoreController } from './project-core.controller'
import { ProjectCoreService } from './project-core.service'

describe('ProjectCoreController file endpoints', () => {
	let controller: ProjectCoreController
	let rootPath: string
	let projectCoreService: {
		findOne: jest.Mock
	}
	let volumeClient: {
		resolve: jest.Mock
	}

	beforeEach(async () => {
		rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'project-core-files-'))
		projectCoreService = {
			findOne: jest.fn(async () => ({
				id: 'project-1',
				tenantId: 'tenant-1',
				createdById: 'user-1',
				name: 'Project',
				goal: 'Goal',
				status: 'active',
				mainAssistantId: 'assistant-1'
			}))
		}
		volumeClient = {
			resolve: jest.fn(() =>
				new VolumeHandle(
					{
						tenantId: 'tenant-1',
						catalog: 'projects',
						projectId: 'project-1',
						userId: 'user-1'
					},
					rootPath,
					rootPath,
					'http://localhost/api/sandbox/volume/project/project-1'
				)
			)
		}

		controller = new ProjectCoreController(
			projectCoreService as unknown as ProjectCoreService,
			volumeClient as unknown as VolumeClient
		)
	})

	afterEach(async () => {
		await fs.rm(rootPath, { recursive: true, force: true })
	})

	it('lists and reads files from the project volume', async () => {
		await fs.mkdir(path.join(rootPath, 'docs'), { recursive: true })
		await fs.writeFile(path.join(rootPath, 'docs', 'readme.md'), '# Readme\n')

		const files = await controller.getFiles('project-1', 'docs', '1')
		const file = await controller.getFile('project-1', 'docs/readme.md')

		expect(files).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					filePath: 'readme.md',
					fullPath: 'docs/readme.md',
					hasChildren: false
				})
			])
		)
		expect(file).toEqual(
			expect.objectContaining({
				filePath: 'docs/readme.md',
				contents: '# Readme\n',
				fileUrl: 'http://localhost/api/sandbox/volume/project/project-1/docs/readme.md'
			})
		)
	})

	it('saves, uploads, and deletes project files', async () => {
		await fs.mkdir(path.join(rootPath, 'docs'), { recursive: true })
		await fs.writeFile(path.join(rootPath, 'docs', 'readme.md'), '# Readme\n')

		const saved = await controller.saveFile('project-1', {
			path: 'docs/readme.md',
			content: '# Updated\n'
		})
		const uploaded = await controller.uploadFile('project-1', 'docs', createUploadFile('upload.txt', 'Uploaded\n'))

		await controller.deleteFile('project-1', 'docs/readme.md')

		expect(saved.contents).toBe('# Updated\n')
		expect(uploaded).toEqual(
			expect.objectContaining({
				filePath: 'docs/upload.txt',
				contents: 'Uploaded\n'
			})
		)
		await expect(fs.stat(path.join(rootPath, 'docs', 'readme.md'))).rejects.toMatchObject({
			code: 'ENOENT'
		})
	})

	it('rejects paths outside the project volume', async () => {
		await expect(controller.getFile('project-1', '../outside.md')).rejects.toBeInstanceOf(BadRequestException)
	})
})

function createUploadFile(originalname: string, content: string): Express.Multer.File {
	const buffer = Buffer.from(content)
	return {
		fieldname: 'file',
		originalname,
		encoding: '7bit',
		mimetype: 'text/plain',
		size: buffer.length,
		stream: Readable.from([]),
		destination: '',
		filename: originalname,
		path: '',
		buffer
	}
}
