import { z } from 'zod/v3'

const oid = z.string().regex(/^[a-f0-9]{40}$/)
const refSchema = z.object({ object: z.object({ sha: oid }) })
const pullSchema = z.object({ html_url: z.string().url(), state: z.enum(['open', 'closed']), merged_at: z.string().nullable(),
  head: z.object({ sha: oid, ref: z.string(), repo: z.object({ full_name: z.string() }).nullable() }),
  base: z.object({ ref: z.string() }) })

export function githubRepository(remote: string) {
  const url = new URL(remote)
  const match = /^\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(url.pathname)
  if (url.protocol !== 'https:' || url.host !== 'github.com' || url.username || url.password || url.search || url.hash || !match)
    throw new Error('CODING_GIT_GITHUB_URL_REQUIRED')
  return { owner: match[1], name: match[2], fullName: `${match[1]}/${match[2]}` }
}

export class GitHubDeliveryClient {
  constructor(private readonly token: string, private readonly repository: ReturnType<typeof githubRepository>,
    private readonly request: typeof fetch = fetch) {}

  private async call(path: string, body?: object, allowMissing = false): Promise<unknown> {
    let response: Response
    try {
      response = await this.request(`https://api.github.com/repos/${this.repository.fullName}/${path}`, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
    } catch { throw new Error('CODING_GIT_REQUEST_FAILED') }
    if (allowMissing && response.status === 404) return null
    if (!response.ok) throw new Error(`CODING_GIT_HTTP_${response.status}`)
    return response.json()
  }
  async head(branch: string) {
    const value = await this.call(`git/ref/heads/${encodeURIComponent(branch)}`, undefined, true)
    return value === null ? null : refSchema.parse(value).object.sha
  }
  async pull(branch: string, baseBranch: string, commit: string) {
    const query = new URLSearchParams({ state: 'all', head: `${this.repository.owner}:${branch}`, base: baseBranch, per_page: '100' })
    const pulls = z.array(pullSchema).parse(await this.call(`pulls?${query}`))
    const matching = pulls.filter(p => p.head.ref === branch && p.base.ref === baseBranch &&
      p.head.repo?.full_name.toLowerCase() === this.repository.fullName.toLowerCase())
    if (matching.length > 1) throw new Error('CODING_GIT_AMBIGUOUS_PR')
    const pull = matching[0]
    if (!pull) return null
    if (pull.head.sha !== commit || (pull.state === 'closed' && !pull.merged_at)) throw new Error('CODING_GIT_PR_CONFLICT')
    const url = new URL(pull.html_url)
    if (url.origin !== 'https://github.com' || !url.pathname.startsWith(`/${this.repository.fullName}/pull/`) || url.search || url.hash)
      throw new Error('CODING_GIT_PR_CONFLICT')
    return pull.html_url
  }
  async createPull(branch: string, baseBranch: string, commit: string, title: string, body: string) {
    try { await this.call('pulls', { head: branch, base: baseBranch, title, body }) }
    catch (error) {
      // A lost POST acknowledgement must reconcile the remote PR before any retry writes.
      const existing = await this.pull(branch, baseBranch, commit)
      if (existing) return existing
      throw error
    }
    const result = await this.pull(branch, baseBranch, commit)
    if (!result) throw new Error('CODING_GIT_PR_NOT_OBSERVED')
    return result
  }
}
