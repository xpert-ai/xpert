/// <reference types="multer" />

import { BadRequestException } from '@nestjs/common'
import { FileUploadController } from './file-upload.controller'

describe('FileUploadController', () => {
	it('rejects an external Volume target before dispatching any upload command', async () => {
		const commandBus = { execute: jest.fn() }
		const controller = new FileUploadController(commandBus as never)
		const file = {
			originalname: 'private.txt',
			mimetype: 'text/plain',
			size: 7,
			buffer: Buffer.from('private')
		} as never

		await expect(
			controller.upload(
				file,
				JSON.stringify([{ kind: 'volume', catalog: 'projects', projectId: 'project-victim' }])
			)
		).rejects.toBeInstanceOf(BadRequestException)

		expect(commandBus.execute).not.toHaveBeenCalled()
	})

	it('rejects a client-selected storage strategy before dispatch', async () => {
		const commandBus = { execute: jest.fn() }
		const controller = new FileUploadController(commandBus as never)

		await expect(
			controller.upload(
				{ originalname: 'a.txt', buffer: Buffer.from('a') } as never,
				JSON.stringify([{ kind: 'storage', strategy: 'volume' }])
			)
		).rejects.toThrow('server-managed storage target')
		expect(commandBus.execute).not.toHaveBeenCalled()
	})

	it('rejects a client-selected storage locator before dispatch', async () => {
		const commandBus = { execute: jest.fn() }
		const controller = new FileUploadController(commandBus as never)

		await expect(
			controller.upload(
				{ originalname: 'a.txt', buffer: Buffer.from('a') } as never,
				JSON.stringify([{ kind: 'storage', directory: 'known', fileName: 'existing.txt' }])
			)
		).rejects.toThrow('without a client-selected locator')
		expect(commandBus.execute).not.toHaveBeenCalled()
	})

	it('dispatches a legal server-managed cloud storage upload', async () => {
		const asset = { status: 'success', destinations: [] }
		const commandBus = { execute: jest.fn().mockResolvedValue(asset) }
		const controller = new FileUploadController(commandBus as never)

		await expect(
			controller.upload(
				{ originalname: 'a.txt', buffer: Buffer.from('a') } as never,
				JSON.stringify([{ kind: 'storage' }])
			)
		).resolves.toBe(asset)
		expect(commandBus.execute.mock.calls[0][0].input.targets).toEqual([{ kind: 'storage' }])
	})
})
