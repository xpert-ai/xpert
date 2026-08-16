import { validateOriginalFileResponse } from './original-file-preview'

describe('validateOriginalFileResponse', () => {
  it('rejects an API JSON error returned for a non-JSON document', async () => {
    const response = new Blob([JSON.stringify({ message: 'Original file is missing' })], {
      type: 'application/json'
    })

    await expect(
      validateOriginalFileResponse(response, {
        name: 'source.pdf',
        type: 'pdf'
      })
    ).rejects.toThrow('Original file is missing')
  })

  it('keeps a JSON response when JSON is the original document type', async () => {
    const response = new Blob([JSON.stringify({ value: 1 })], { type: 'application/json' })

    await expect(
      validateOriginalFileResponse(response, {
        name: 'source.json',
        type: 'json'
      })
    ).resolves.toBe(response)
  })

  it('keeps a normal binary original file response', async () => {
    const response = new Blob(['pdf'], { type: 'application/pdf' })

    await expect(
      validateOriginalFileResponse(response, {
        name: 'source.pdf',
        type: 'pdf'
      })
    ).resolves.toBe(response)
  })
})
