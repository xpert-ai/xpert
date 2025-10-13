import { IIntegration } from '@metad/contracts'
import { LarkClient } from './lark.client'
import { TLarkIntegrationConfig } from './types'
import * as dotenv from 'dotenv';
dotenv.config();

describe('lark', () => {
  let larkClient: LarkClient
  let folderToken: string = null
  beforeAll(() => {
    folderToken = 'Xep6f70NhlvXJzdgnaecoyiXnLf' // Replace with your actual root folder token
    larkClient = new LarkClient({
      options: {
        appId: process.env['LARK_APP_ID'],
        appSecret: process.env['LARK_APP_SECRET'],
        isLark: false
      }
    } as IIntegration<TLarkIntegrationConfig>)
  })
  it('should work', () => {
    expect(larkClient).not.toBeUndefined()
  })

  it('Get a list of files in a folder should work', async () => {
    const files = await larkClient.listDriveFiles(folderToken)
    console.log(files)
    await expect(files).resolves.not.toBeUndefined()
  })

  it('Get document raw content should work', async () => {
    const document_id = 'D9iadRdMUodB9KxDSJbct8trn9d'
    const content = await larkClient.getDocumentContent(document_id)
    expect(content).not.toBeUndefined()
    console.log(content)
  })
})
