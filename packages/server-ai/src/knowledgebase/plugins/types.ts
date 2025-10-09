import { IKnowledgeDocument, TXpertParameter, XpertParameterTypeEnum } from '@metad/contracts'
import { instanceToPlain } from 'class-transformer'
import { DocumentVariableDTO } from '../../knowledge-document/dto'

export const ERROR_CHANNEL_NAME = 'error'
export const DOCUMENTS_CHANNEL_NAME = 'documents'

export function createDocumentsParameter(name = DOCUMENTS_CHANNEL_NAME): TXpertParameter {
	return {
		type: XpertParameterTypeEnum.ARRAY_DOCUMENT,
		name: name,
		title: 'Documents',
		description: {
			en_US: 'Documents',
			zh_Hans: '文档'
		},
		item: [
			{
				type: XpertParameterTypeEnum.STRING,
				name: 'id',
				title: 'Document ID',
				description: {
					en_US: 'Document ID',
					zh_Hans: '文档 ID'
				}
			},
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
	}
}

export function serializeDocuments(documents: any[]) {
	return instanceToPlain(documents.map((doc) => new DocumentVariableDTO(doc)))
}