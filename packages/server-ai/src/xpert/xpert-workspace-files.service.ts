import { Injectable } from '@nestjs/common'
import { AssistantFilesService } from './assistant-files/assistant-files.service'

/** Studio compatibility facade. Runtime routes must use AssistantFilesService.forRuntime(). */
@Injectable()
export class XpertWorkspaceFilesService {
    constructor(private readonly files: AssistantFilesService) {}

    list(id: string, path?: string, deepth?: number) {
        return this.files.forAuthoring(id).list(path, deepth)
    }

    read(id: string, path: string) {
        return this.files.forAuthoring(id).read(path)
    }

    download(id: string, path: string) {
        return this.files.forAuthoring(id).download(path)
    }

    save(id: string, path: string, content: string) {
        return this.files.forAuthoring(id).save(path, content)
    }

    saveBinary(id: string, path: string, content: Buffer) {
        return this.files.forAuthoring(id).saveBinary(path, content)
    }

    uploadToFolder(id: string, path: string, file: { originalname: string; buffer: Buffer; mimetype?: string }) {
        return this.files.forAuthoring(id).uploadToFolder(path, file)
    }

    delete(id: string, path: string) {
        return this.files.forAuthoring(id).delete(path)
    }

    upload(id: string, file: Express.Multer.File) {
        return this.files.forAuthoring(id).upload(file)
    }
}
