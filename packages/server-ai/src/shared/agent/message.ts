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
	vision: TXpertAgentOptions['vision']
) {
	const { human } = state
	const { input } = human
	if (!vision?.enabled) {
		return new HumanMessage(typeof input === 'string' ? input : JSON.stringify(input ?? ''))
	}
	let files: Array<_TFile> = []
	if (vision.variable) {
		files = get(state, vision.variable, []) as Array<_TFile>
	} else if (human.files?.length) {
		const storageFiles = await queryBus.execute<GetStorageFileQuery, IStorageFile[]>(
			new GetStorageFileQuery(human.files.map((file) => file.id))
		)
		files = await Promise.all(
			storageFiles.map(async (file) => {
				const provider = new FileStorage().getProvider(file.storageProvider)
				return {
					id: file.id,
					filePath: provider.path(file.file),
					fileUrl: provider.url(file.file),
					mimeType: file.mimetype
				}
			})
		)
	}

	if (files?.length) {
		return new HumanMessage({
			content: [
				...(await Promise.all(
					files.map(async (file) => {
						if (file.mimeType?.startsWith('image')) {
							let imageData = await fs.promises.readFile(file.filePath)
							if (vision?.resolution === 'low') {
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
						const docs = await commandBus.execute<LoadFileCommand, Document[]>(new LoadFileCommand(file))
						return {
							type: 'text',
							text: `File: ${file.filePath}\n<file_content>\n${docs?.map((doc) => doc.pageContent).join('\n') || 'No text recognized!'}\n</file_content>`
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
