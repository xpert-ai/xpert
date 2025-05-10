import { HumanMessage } from '@langchain/core/messages'
import { IStorageFile } from '@metad/contracts'
import { FileStorage } from '@metad/server-core'

export async function createHumanMessage(state: { input: string; files: IStorageFile[] }) {
	const { input, files } = state

	if (files?.length) {
		return new HumanMessage({
			content: [
				{
					type: 'text',
					text: input
				},
                ...(await Promise.all(files.map(async (file) => {
                    if (file.mimetype?.startsWith('image')) {
                        const provider = new FileStorage().getProvider(file.storageProvider);
                        const imageData = await provider.getFile(file.file)
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
                })))
			]
		})
	}

    return new HumanMessage(input)
}
