import { FileStorageOption, FileStorageProviderEnum, UploadedFile } from '@metad/contracts'
import { isNotEmpty } from '@metad/server-common'
import { environment } from '@metad/server-config'
import OSS from 'ali-oss'
import moment from 'moment'
import { StorageEngine } from 'multer'
import { basename, join } from 'path'
import { v4 as uuid } from 'uuid'
import { RequestContext } from '../../context'
import { StorageEngineOSS } from '../multers/aliyun-oss'
import { Provider } from './provider'

export interface IOSSConfig {
	rootPath: string
	aliyun_access_key_id: string
	aliyun_access_key_secret: string
	aliyun_default_region: string
	aliyun_bucket: string
	aliyun_endpoint: string
}

export class OSSProvider extends Provider<OSSProvider> {
	static instance: OSSProvider

    name: FileStorageProviderEnum = FileStorageProviderEnum.OSS

	public readonly storage: StorageEngine

	config: IOSSConfig
	defaultConfig: IOSSConfig

	constructor() {
		super()
		this.config = this.defaultConfig = {
			rootPath: '',
			aliyun_access_key_id: environment.aliyunConfig.accessKeyId,
			aliyun_access_key_secret: environment.aliyunConfig.accessKeySecret,
			aliyun_default_region: environment.aliyunConfig.region,
			aliyun_bucket: environment.aliyunConfig.oss.bucket,
			aliyun_endpoint: environment.aliyunConfig.oss.endpoint
		}
	}

	getInstance() {
		if (!OSSProvider.instance) {
			OSSProvider.instance = new OSSProvider()
		}
		this.setAwsDetails()
		return OSSProvider.instance
	}

	url(key: string) {
		const url = this.getS3Instance().signatureUrl(key)
		return url
	}

	setAwsDetails() {
		const request = RequestContext.currentRequest()
		if (request) {
			const settings = request['tenantSettings']
			if (
				settings &&
				settings.aliyun_access_key_id &&
				isNotEmpty(settings.aliyun_access_key_id.trim()) &&
				settings.aliyun_access_key_secret &&
				isNotEmpty(settings.aliyun_access_key_secret.trim())
			) {
				this.config = {
					...this.defaultConfig,
					aliyun_access_key_id: settings.aliyun_access_key_id,
					aliyun_access_key_secret: settings.aliyun_access_key_secret,
					aliyun_default_region: settings.aliyun_default_region,
					aliyun_bucket: settings.aliyun_bucket
				}
			}
		} else {
			this.config = {
				...this.defaultConfig
			}
		}
	}

	path(filePath: string) {
		return filePath ? this.config.rootPath + '/' + filePath : null
	}

	handler({ dest, filename, prefix }: FileStorageOption): StorageEngine {
		return new StorageEngineOSS(this.getS3Instance(), (_req, file) => {
			let fileNameString = ''
			const ext = file.originalname.split('.').pop()
			if (filename) {
				if (typeof filename === 'string') {
					fileNameString = filename
				} else {
					fileNameString = filename(file, ext)
				}
			} else {
				if (!prefix) {
					prefix = 'file'
				}
				fileNameString = `metad-${prefix}-${moment().unix()}-${parseInt('' + Math.random() * 1000, 10)}.${ext}`
			}
			let dir
			if (dest instanceof Function) {
				dir = dest(file)
			} else {
				dir = dest
			}
			const user = RequestContext.currentUser()
			const key = join(this.config.rootPath, dir, user ? user.tenantId : uuid(), fileNameString)
			return key
		})
	}

    async getFile(key: string): Promise<Buffer> {
		const oss = this.getS3Instance();
		const data = await oss.get(key);
		return data.content as Buffer;
	}

	async putFile(fileContent: string, key = ''): Promise<any> {
		const fileName = basename(key);
        const oss = this.getS3Instance();

        const object = await oss.put(key, fileContent)

        const file = {
            originalname: fileName, // orignal file name
            size: object.res.size, // files in bytes
            filename: fileName,
            path: key, // Full path of the file
            key: key // Full path of the file
        };
        
        return this.mapUploadedFile(file)
	}

	async deleteFile(key: string): Promise<void> {
		const oss = this.getS3Instance();
        await oss.delete(key)
	}

	private getS3Instance() {
		this.setAwsDetails()
		return new OSS({
			region: this.config.aliyun_default_region,
			accessKeyId: this.config.aliyun_access_key_id,
			accessKeySecret: this.config.aliyun_access_key_secret,
			bucket: this.config.aliyun_bucket,
			endpoint: this.config.aliyun_endpoint || undefined
		})
	}

	getS3Bucket() {
		this.setAwsDetails()
		return this.config.aliyun_bucket
	}
    
	mapUploadedFile(file): UploadedFile {
		file.filename = file.originalname;
		// file.url = file.path || this.url(file.key); // file.location;
		return file;
	}
}
