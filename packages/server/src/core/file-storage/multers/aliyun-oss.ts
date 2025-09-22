import { Request } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import { StorageEngine } from 'multer'
import { ParsedQs } from 'qs'

const ERROR_NO_CLIENT = new Error('oss client undefined')

export class StorageEngineOSS implements StorageEngine {
	constructor(private client: any, private getFilename) {
	}

	async _handleFile(
		req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>,
		file: Express.Multer.File,
		cb: (error?: any, info?: Partial<Express.Multer.File> & { url: string, key: string }) => void
	) {
		if (!this.client) {
			return cb(ERROR_NO_CLIENT)
		}

		const filename = this.getFilename(req, file)
		let size = 0

		// add listener here because if put in upper scope,
		// the uploaded file will be 0 byte (very weird!).
		file.stream.on('data', (chunk) => {
			size += Buffer.byteLength(chunk)
		})
		
		try {
			const result = await this.client.putStream(filename, file.stream)
			const { url, name } = result
			const lastSlashIndex = name.lastIndexOf('/')
			const path = name.substr(0, lastSlashIndex)
			cb(null, {
				destination: path,
				filename: name.substr(lastSlashIndex + 1),
				path,
				size,
				url: url.replace(/^http:\/\//g, 'https://'),
				key: filename
			})
		} catch(err) {
			cb(err)
		}
	}

	_removeFile(
		req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>,
		file: Express.Multer.File,
		cb: (error: Error, result?) => void
	): void {
		if (!this.client) {
			return cb(ERROR_NO_CLIENT)
		}
		this.client
			.delete(file.filename)
			.then((result) => cb(null, result))
			.catch(cb)
	}
}
