jest.mock('@cloud/app/@core/state', () => ({
  API_PREFIX: '/api',
  OrganizationBaseCrudService: class OrganizationBaseCrudService {}
}))

import { of } from 'rxjs'
import { ChatConversationService } from './chat-conversation.service'

describe('conversation binary save adapter', () => {
  it.each([
    ['presentations/review/deck.pptx', 'presentations/review', 'deck.pptx'],
    ['deck.pptx', '', 'deck.pptx']
  ])('preserves the exact destination and organization for %s', (path, folder, name) => {
    const service = new ChatConversationService()
    const upload = jest.spyOn(service, 'uploadFile').mockReturnValue(of({ filePath: path }))
    const file = new Blob(['binary-presentation'], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    })
    service.saveBinaryFile('conversation', path, file, 'organization')
    expect(upload).toHaveBeenCalledTimes(1)
    const [id, saved, directory, organization] = upload.mock.calls[0]
    expect([id, directory, organization]).toEqual(['conversation', folder, 'organization'])
    expect(saved.name).toBe(name)
    expect(saved.size).toBe(file.size)
    expect(saved.type).toBe(file.type)
  })
})
