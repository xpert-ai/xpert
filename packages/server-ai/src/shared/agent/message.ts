import { HumanMessage } from '@langchain/core/messages'
import { IStorageFile, TXpertAgentOptions } from '@metad/contracts'
import { FileStorage } from '@metad/server-core'
import sharp from 'sharp'

/**
 * Create human message using input string and image (or othter types) files
 *
 * @param state
 * @returns
 */
export async function createHumanMessage(
	state: { input: string; files: IStorageFile[] },
	vision: TXpertAgentOptions['vision']
) {
	const { input, files } = state

	if (files?.length) {
		return new HumanMessage({
			content: [
				{
					type: 'text',
					text: input
				},
				...(await Promise.all(
					files.map(async (file) => {
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
									url: `data:image/jpeg;base64,${imageData.toString('base64')}`
								}
							}
						}
						return {
							type: 'text',
							text: ''
						}
					})
				))
			]
		})
	}

	return new HumanMessage(input)
}
