import { XpertParameterTypeEnum } from '@metad/contracts'

export const CONFIG_KEY_CREDENTIALS = 'xp:credentials'

export const ARRAY_FILE_ITEMS = [
	{
		name: 'name',
		type: XpertParameterTypeEnum.STRING,
		description: {
			en_US: 'File name',
			zh_Hans: '文件名'
		}
	},
	{
		name: 'fileUrl',
		type: XpertParameterTypeEnum.STRING,
		description: {
			en_US: 'File URL',
			zh_Hans: '文件 URL'
		}
	},
	{
		name: 'filePath',
		type: XpertParameterTypeEnum.STRING,
		description: {
			en_US: 'File path',
			zh_Hans: '文件路径'
		}
	},
	{
		name: 'size',
		type: XpertParameterTypeEnum.NUMBER,
		description: {
			en_US: 'File size (in bytes)',
			zh_Hans: '文件大小（字节）'
		}
	},
	{
		name: 'mimeType',
		type: XpertParameterTypeEnum.STRING,
		description: {
			en_US: 'File MIME type',
			zh_Hans: '文件 MIME 类型'
		}
	},
	{
		name: 'extension',
		type: XpertParameterTypeEnum.STRING,
		description: {
			en_US: 'File extension',
			zh_Hans: '文件扩展名'
		}
	}
]
