import { Document } from '@langchain/core/documents'
import { HumanMessage } from '@langchain/core/messages'
import { _TFile, IStorageFile, TXpertAgentOptions } from '@metad/contracts'
import { FileStorage, GetStorageFileQuery } from '@metad/server-core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import fs from 'fs'
import { get } from 'lodash'
import sharp from 'sharp'
import { LoadFileCommand } from '../commands'
import { AgentStateAnnotation } from './state'

/**
 * Create human message using input string and image (or othter types) files
 *
 * @param state
 * @returns
 */
export async function createHumanMessage(
	commandBus: CommandBus,
	queryBus: QueryBus,
	state: Partial<typeof AgentStateAnnotation.State>,
	attachment?: TXpertAgentOptions['attachment'] | TXpertAgentOptions['vision']
) {
	const { human } = state
	const { input } = human
	if (!attachment?.enabled) {
		return new HumanMessage(typeof input === 'string' ? input : JSON.stringify(input ?? ''))
	}
	let _files = [] as Array<_TFile & {id?: string}>
	if (attachment.variable) {
		_files = get(state, attachment.variable, []) as Array<_TFile>
	} else if (human.files?.length) {
		_files = human.files as Array<_TFile & {id?: string}>
	}
	const files: Array<_TFile> = await Promise.all(
		_files.map(async (file) => {
			if (file.id) {
				const storageFiles = await queryBus.execute(new GetStorageFileQuery([file.id]))
				const _file = storageFiles[0] as IStorageFile
				const provider = new FileStorage().getProvider(_file.storageProvider)
				return {
					id: _file.id,
					filePath: provider.path(_file.file),
					fileUrl: provider.url(_file.file),
					mimeType: _file.mimetype
				}
			}

			return file
		})
	)

	if (files?.length) {
		return new HumanMessage({
			content: [
				...(await Promise.all(
					files.map(async (file) => {
						if (file.mimeType?.startsWith('image')) {
							let imageData = await fs.promises.readFile(file.filePath)
							if (attachment?.resolution === 'low') {
								imageData = await sharp(imageData).resize(1024).toBuffer()
							}
							return {
								type: 'image_url',
								image_url: {
									url: `data:${file.mimeType};base64,${imageData.toString('base64')}`
								}
							}
						}

						if (file.mimeType?.startsWith('video')) {
							// Process video files
							const videoData = await fs.promises.readFile(file.filePath)
							return {
								type: 'video_url',
								video_url: {
									url: `data:${file.mimeType};base64,${videoData.toString('base64')}`
								}
							}
						}

						if (file.mimeType?.startsWith('audio')) {
							throw new Error('Audio files are not supported yet')
						}

						// Process other files as text
						const docs = await commandBus.execute(new LoadFileCommand(file))
						return {
							type: 'text',
							text: `Attachment File: ${file.filePath}\n<file_content>\n${docs?.map((doc) => doc.pageContent).join('\n') || 'No text recognized!'}\n</file_content>`
						}
					})
				)),
				{
					type: 'text',
					text: input
				}
			]
		})
	}

	return new HumanMessage(typeof input === 'string' ? input : JSON.stringify(input ?? ''))
}
