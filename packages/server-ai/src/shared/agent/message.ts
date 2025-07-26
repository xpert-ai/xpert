import { HumanMessage } from '@langchain/core/messages'
import { TChatRequestHuman, TXpertAgentOptions } from '@metad/contracts'
import { FileStorage, GetStorageFileQuery } from '@metad/server-core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Document } from 'langchain/document'
import sharp from 'sharp'
import { LoadStorageFileCommand } from '../commands'

/**
 * Create human message using input string and image (or othter types) files
 *
 * @param state
 * @returns
 */
export async function createHumanMessage(
	commandBus: CommandBus,
	queryBus: QueryBus,
	state: TChatRequestHuman,
	vision: TXpertAgentOptions['vision']
) {
	const { input, files } = state

	if (files?.length) {
		return new HumanMessage({
			content: [
				...(await Promise.all(
					files.map(async (_) => {
						const file = await queryBus.execute(new GetStorageFileQuery(_.id))
						if (file.mimetype?.startsWith('image')) {
							const provider = new FileStorage().getProvider(file.storageProvider)
							let imageData = null
							if (vision?.resolution === 'low') {
								imageData = await provider.getFile(file.file)
								imageData = await sharp(imageData).resize(1024).toBuffer()
							} else {
								imageData = await provider.getFile(file.file)
							}
							return {
								type: 'image_url',
								image_url: {
									url: `data:${file.mimetype};base64,${imageData.toString('base64')}`
								}
							}
						}

						if (file.mimetype?.startsWith('video')) {
							// Process video files
							const provider = new FileStorage().getProvider(file.storageProvider)
							const videoData = await provider.getFile(file.file)
							return {
								type: 'video_url',
								video_url: {
									url: `data:${file.mimetype};base64,${videoData.toString('base64')}`
								}
							}
						}

						if (file.mimetype?.startsWith('audio')) {
							throw new Error('Audio files are not supported yet')
						}

						// Process other files as text
						const docs = await commandBus.execute<LoadStorageFileCommand, Document[]>(
										new LoadStorageFileCommand(file.id)
									)
						return {
							type: 'text',
							text: `File: ${file.originalName}\n\n<file_content>\n${docs[0].pageContent}\n</file_content>`,
						}
					})
				)),
				{
					type: 'text',
					text: input
				},
			]
		})
	}

	return new HumanMessage(input ?? '')
}
