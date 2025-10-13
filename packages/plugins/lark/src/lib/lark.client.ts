import * as lark from '@larksuiteoapi/node-sdk'
import { IIntegration } from '@metad/contracts'
import { AxiosError } from 'axios'
import { formatLarkErrorToMarkdown, LarkError, LarkFile } from './types'

export class LarkClient {
  private client: lark.Client
  constructor(private readonly integration: IIntegration) {
    this.client = new lark.Client({
      appId: integration.options.appId,
      appSecret: integration.options.appSecret,
      appType: lark.AppType.SelfBuild,
      domain: integration.options.isLark ? lark.Domain.Lark : lark.Domain.Feishu,
      loggerLevel: lark.LoggerLevel.debug
    })
  }

  async getBotInfo() {
    const res = await this.client.request({
      method: 'GET',
      url: '/open-apis/bot/v3/info',
      data: {},
      params: {}
    })

    return res.bot
  }

  // Online Documents

  /**
   * 获取根目录 Token
   */
  async getRootFolderToken(): Promise<string> {
    
    const res = await this.client.request({
      url: '/open-apis/drive/explorer/v2/root_folder/meta',
      method: 'GET'
    })

    if (res.code !== 0) {
      throw new Error(`Get root folder failed: ${res.msg}`)
    }

    return res.data.token
  }

  /**
   * 获取文件夹下的子文件/文件夹
   */
  async listDriveFiles(folderToken: string): Promise<LarkFile[]> {
    try {
      const res = await this.client.drive.file.list({params: {folder_token: folderToken}})

      if (res.code !== 0) {
        throw new Error(`Get folder children failed: ${res.msg}`)
      }

      return res.data.files
    } catch (error: unknown) {
      throw formatLarkErrorToMarkdown(getLarkError(error))
    }
  }

  /**
   * 获取文档内容
   */
  async getDocumentContent(docToken: string): Promise<string> {
    try {
      const res = await this.client.docx.document.rawContent({
        params: {
          lang: 1,
        },
        path: {
          document_id: docToken
        }
      })

      if (res.code !== 0) {
        throw new Error(`Get document content failed: ${res.msg}`)
      }

      return res.data.content
    } catch (error: unknown) {
      throw formatLarkErrorToMarkdown(getLarkError(error))
    }
  }

  /**
   * 递归获取文件夹下所有文档
   */
  async getAllDocsInFolder(folderToken: string): Promise<LarkFile[]> {
    let result: LarkFile[] = []
    const children = await this.listDriveFiles(folderToken)

    for (const child of children) {
      if (child.type === 'folder') {
        // 递归进入子文件夹
        const subDocs = await this.getAllDocsInFolder(child.token)
        result = result.concat(subDocs)
      } else if (child.type === 'docx') {
        result.push(child)
      }
    }

    return result
  }
}

function getLarkError(error: unknown) {
  const axiosError = error as AxiosError
  console.error(error)
  return axiosError.response?.data as LarkError
}