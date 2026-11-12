import { GitHubDeliveryClient, githubRepository } from './git-github'

describe('fixed GitHub delivery API', () => {
  const commit = 'a'.repeat(40), branch = 'coding-delivery/test/v1'
  const pull = { html_url: 'https://github.com/example/plugins/pull/1', state: 'open', merged_at: null,
    head: { sha: commit, ref: branch, repo: { full_name: 'example/plugins' } }, base: { ref: 'main' } }
  const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status })
  it.each(['http://github.com/example/plugins', 'https://user:secret@github.com/example/plugins',
    'https://evil.test/example/plugins', 'https://github.com/example/plugins?token=x', 'https://github.com/example/plugins/extra'])(
    'rejects an unauthorized remote URL %s', url => { expect(() => githubRepository(url)).toThrow() })
  it('resolves github.com repositories with or without .git', () => {
    expect(githubRepository('https://github.com/example/plugins.git')).toEqual(githubRepository('https://github.com/example/plugins'))
  })
  it('reuses an existing exact PR after a lost create acknowledgement', async () => {
    const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockRejectedValueOnce(new Error('lost acknowledgement'))
      .mockResolvedValueOnce(response([pull]))
    const client = new GitHubDeliveryClient('secret', githubRepository('https://github.com/example/plugins'), request)
    expect(await client.createPull(branch, 'main', commit, 'Feature', 'Description')).toBe(pull.html_url)
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[0][1]).toMatchObject({ method: 'POST', redirect: 'error' })
    expect(request.mock.calls[1][1]).toMatchObject({ method: 'GET' })
  })
  it.each([{ ...pull, head: { ...pull.head, sha: 'b'.repeat(40) } }, { ...pull, state: 'closed' }])(
    'rejects a changed or abandoned PR', async changed => {
      const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(response([changed]))
      const client = new GitHubDeliveryClient('secret', githubRepository('https://github.com/example/plugins'), request)
      await expect(client.pull(branch, 'main', commit)).rejects.toThrow('CODING_GIT_PR_CONFLICT')
    })
  it('never includes authentication or server error bodies in a failed request', async () => {
    const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(response({ message: 'secret' }, 403))
    const client = new GitHubDeliveryClient('secret', githubRepository('https://github.com/example/plugins'), request)
    await expect(client.head(branch)).rejects.toThrow('CODING_GIT_HTTP_403')
  })
})
