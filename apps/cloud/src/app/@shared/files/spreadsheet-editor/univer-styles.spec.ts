import { ensureUniverStylesheet } from './univer-styles'

describe('Univer styles', () => {
  afterEach(() => {
    document.getElementById('xp-univer-stylesheet')?.remove()
  })

  it('loads the lazy stylesheet once for concurrent callers', async () => {
    const firstLoad = ensureUniverStylesheet(document)
    const secondLoad = ensureUniverStylesheet(document)
    const links = document.head.querySelectorAll<HTMLLinkElement>('#xp-univer-stylesheet')

    expect(links).toHaveLength(1)
    expect(links[0].href).toBe(new URL('univer.css', document.baseURI).href)

    links[0].dispatchEvent(new Event('load'))
    await expect(Promise.all([firstLoad, secondLoad])).resolves.toEqual([undefined, undefined])
  })

  it('removes a failed stylesheet so a later call can retry', async () => {
    const failedLoad = ensureUniverStylesheet(document)
    const failedLink = document.getElementById('xp-univer-stylesheet') as HTMLLinkElement

    failedLink.dispatchEvent(new Event('error'))
    await expect(failedLoad).rejects.toThrow('Failed to load Univer styles')
    expect(document.getElementById('xp-univer-stylesheet')).toBeNull()

    const retryLoad = ensureUniverStylesheet(document)
    const retryLink = document.getElementById('xp-univer-stylesheet') as HTMLLinkElement
    expect(retryLink).not.toBe(failedLink)

    retryLink.dispatchEvent(new Event('load'))
    await expect(retryLoad).resolves.toBeUndefined()
  })
})
