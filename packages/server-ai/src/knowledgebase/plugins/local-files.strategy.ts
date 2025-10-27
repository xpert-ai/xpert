import { Document } from '@langchain/core/documents'
import {
	classificateDocumentCategory,
	DocumentSourceProviderCategoryEnum,
	I18nObject,
	IDocumentSourceProvider,
	IStorageFile,
	STATE_VARIABLE_HUMAN,
	TChatRequestHuman
} from '@metad/contracts'
import { GetStorageFileQuery } from '@metad/server-core'
import { Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { DocumentSourceStrategy, IDocumentSourceStrategy } from '@xpert-ai/plugin-sdk'

interface LocalFileConfig {
	fileExtensions: string[]
	[STATE_VARIABLE_HUMAN]: TChatRequestHuman
}

@DocumentSourceStrategy('local-file')
@Injectable()
export class LocalFileStrategy implements IDocumentSourceStrategy<LocalFileConfig> {
	readonly permissions = []
	readonly meta: IDocumentSourceProvider = {
		name: 'local-file',
		category: DocumentSourceProviderCategoryEnum.LocalFile,
		label: {
			en_US: 'Local File',
			zh_Hans: '本地文件'
		} as I18nObject,
		configSchema: {
			type: 'object',
			properties: {
				fileExtensions: {
					type: 'array',
					title: {
						en_US: `File Extensions`,
						zh_Hans: '文件扩展名'
					} as I18nObject,
					description: {
						en_US: `Specify the file extensions to be loaded from local files.`,
						zh_Hans: '指定要从本地文件加载的文件扩展名。'
					},
					enum: [
						'txt',
						'markdown',
						'mdx',
						'pdf',
						'html',
						'xlsx',
						'xls',
						'vtt',
						'properties',
						'doc',
						'docx',
						'csv',
						'eml',
						'msg',
						'pptx',
						'xml',
						'epub',
						'ppt',
						'md'
					]
				}
			},
			required: []
		},
		icon: {
			type: 'svg',
			value: `<svg class="svg-icon" style="vertical-align: middle;fill: currentColor;overflow: hidden;" viewBox="0 0 1180 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M60.25582 1004.286107a39.382889 39.382889 0 0 1-39.382889-37.019915V56.733808a39.382889 39.382889 0 0 1 39.382889-37.019915h270.954273a30.324824 30.324824 0 0 1 26.386535 14.965497L393.828886 104.780932a54.742215 54.742215 0 0 0 48.440953 28.749509h521.429445a39.382889 39.382889 0 0 1 39.382889 37.019915v796.715836a39.382889 39.382889 0 0 1-39.382889 37.019915z" fill="#FFD876" /><path d="M331.210093 39.405337a9.058064 9.058064 0 0 1 8.664236 4.332118l37.413744 70.101541a73.252173 73.252173 0 0 0 65.769424 39.382889h520.641787a19.691444 19.691444 0 0 1 20.872931 17.328471v796.715836a19.691444 19.691444 0 0 1-20.872931 17.328471H60.25582a19.691444 19.691444 0 0 1-20.872931-17.328471V56.733808A19.691444 19.691444 0 0 1 60.25582 39.405337h270.954273m0-39.382889H60.25582A58.680504 58.680504 0 0 0 0 56.733808v910.532384A58.680504 58.680504 0 0 0 60.25582 1023.977552h903.443464A58.680504 58.680504 0 0 0 1023.955104 967.266192V170.550356a58.680504 58.680504 0 0 0-60.25582-56.71136H443.057497a35.4446 35.4446 0 0 1-31.112482-18.116128L374.925099 25.227497A49.62244 49.62244 0 0 0 331.210093 0.022448z" fill="#C29C20" /><path d="M71.676857 1004.286107a36.626086 36.626086 0 0 1-29.143337-14.177839 35.838429 35.838429 0 0 1-7.08892-31.506311L179.585972 332.807857a37.019915 37.019915 0 0 1 36.232258-28.749509h905.806437a36.626086 36.626086 0 0 1 29.143338 14.17784 39.382889 39.382889 0 0 1 7.08892 31.506311l-142.959886 625.7941a37.019915 37.019915 0 0 1-36.232257 28.749508z" fill="#FFD800" /><path d="M1123.199983 323.749793a18.116129 18.116129 0 0 1 13.784011 6.695091 17.328471 17.328471 0 0 1 3.150631 14.965497l-144.535201 625.7941a16.934642 16.934642 0 0 1-16.934642 13.390182h-905.806438a17.7223 17.7223 0 0 1-13.784011-6.695091 16.934642 16.934642 0 0 1-3.54446-14.571669L198.883587 337.533804a17.328471 17.328471 0 0 1 16.934643-13.784011h905.806437m0-39.382889h-905.806437a57.499017 57.499017 0 0 0-55.529873 44.108835L16.146984 954.269839A56.71136 56.71136 0 0 0 71.676857 1023.977552h905.806438a56.71136 56.71136 0 0 0 55.529873-44.108835L1178.729856 354.468446a57.105188 57.105188 0 0 0-55.529873-69.707713z" fill="#C29C20" /></svg>`,
			color: '#4CAF50'
		}
	}

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	async validateConfig(config: LocalFileConfig): Promise<void> {
		//
	}

	async test(config: LocalFileConfig) {
		//
	}

	async loadDocuments(config: LocalFileConfig): Promise<Document[]> {
		const human = config[STATE_VARIABLE_HUMAN]
		if (human?.files) {
			const storageFiles = await this.queryBus.execute<GetStorageFileQuery, IStorageFile[]>(
				new GetStorageFileQuery(human.files.map((file) => file.id))
			)
			// const fileProvider = new FileStorage().getProvider()
			return storageFiles.map((file) => {
				// const fullPath = fileProvider.path(file.file)
				return new Document({
					pageContent: '',
					metadata: {
						source: 'file-system',
						// filePath: fullPath,
						fileUrl: file.fileUrl,
						size: file.size,
						originalName: file.originalName,
						mimetype: file.mimetype,
						category: classificateDocumentCategory({
							type: file.originalName.split('.').pop().toLowerCase()
						})
					}
				})
			})
		}

		return []
	}
}
