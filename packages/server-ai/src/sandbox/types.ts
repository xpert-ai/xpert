import { CommandBus } from '@nestjs/cqrs'

export type TSandboxParams = {
    commandBus: CommandBus
    sandboxUrl: string
    volume?: string
    tenantId?: string
    projectId?: string
    userId: string
    conversationId: string
}


/**
 * Base parameters for files system operations.
 */
export type TFilesBaseParams = {
  workspace_id: string
}

export type TFileBaseReq = TFilesBaseParams & {
    file_path: string
}

export type TCreateFileReq = TFileBaseReq & {
    file_contents?: string
    file_description?: string
    permissions?: string
}

export type TCreateFileResp = {
	message: string
}

export type TListFilesReq = TFilesBaseParams & {
	path?: string
	depth?: number
	limit?: number
}

export type TListFilesResponse = {
    files: {
        name: string
        extension: string
        size: number
        created_date: string
    }[]
}

export type TReadFileReq = TFileBaseReq & {
    line_from?: number
    line_to?: number
}

export interface FilesSystem {
    createFile(body: TCreateFileReq, options: { signal: AbortSignal }): Promise<TCreateFileResp>
    listFiles(body: TListFilesReq, options: { signal: AbortSignal }): Promise<TListFilesResponse>
    readFile(body: TReadFileReq, options?: { signal: AbortSignal }): Promise<string>
    deleteFile(body: TFileBaseReq, options?: { signal: AbortSignal }): Promise<void>
}