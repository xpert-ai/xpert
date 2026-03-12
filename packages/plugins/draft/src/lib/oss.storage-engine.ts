import { Request } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import { StorageEngine } from 'multer'
import { ParsedQs } from 'qs'

const ERROR_NO_CLIENT = new Error('oss client undefined')

export class OSSStorageEngine implements StorageEngine {
  constructor(
    private readonly client: any,
    private readonly getFilename: (
      req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>,
      file: Express.Multer.File
    ) => string
  ) {}

  async _handleFile(
    req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>,
    file: Express.Multer.File,
    cb: (error?: any, info?: Partial<Express.Multer.File> & { url: string; key: string }) => void
  ) {
    if (!this.client) {
      return cb(ERROR_NO_CLIENT)
    }

    const filename = this.getFilename(req, file)
    let size = 0

    file.stream.on('data', (chunk) => {
      size += Buffer.byteLength(chunk)
    })

    try {
      const result = await this.client.putStream(filename, file.stream)
      const { url, name } = result
      const lastSlashIndex = name.lastIndexOf('/')
      const directory = name.substring(0, lastSlashIndex)
      cb(null, {
        destination: directory,
        filename: name.substring(lastSlashIndex + 1),
        path: directory,
        size,
        url: url.replace(/^http:\/\//g, 'https://'),
        key: filename
      })
    } catch (error) {
      cb(error)
    }
  }

  _removeFile(
    _req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>,
    file: Express.Multer.File,
    cb: (error: Error, result?: any) => void
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
