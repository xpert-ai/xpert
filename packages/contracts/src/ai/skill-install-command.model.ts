export type ParsedGithubSkillInstallCommand = {
  repositoryUrl: string
  repositoryPath: string
  branch: string
  skills: string[]
  installAll: boolean
}

export type InstallGithubSkillPackagesInput = {
  url?: string
  command?: string
  path?: string
  branch?: string
  token?: string
  skills?: string[]
}

type ParsedGithubSource = {
  repositoryUrl: string
  repositoryPath: string
  branch: string
}

const IGNORED_BOOLEAN_FLAGS = new Set(['-y', '--yes', '-g', '--global', '--copy'])
const REJECTED_FLAGS = new Set(['--list', '-l'])

export function parseGithubSkillInstallCommand(input: string): ParsedGithubSkillInstallCommand {
  const tokens = tokenizeShellLike(input)
  if (!tokens.length) {
    throw new Error('GitHub skill install command is required')
  }

  let index = readCommandPrefix(tokens)
  let source: ParsedGithubSource | null = null
  let branch = ''
  let repositoryPath = ''
  const skills: string[] = []
  let installAll = false

  while (index < tokens.length) {
    const token = tokens[index]
    if (!token) {
      throw new Error('Empty arguments are not supported')
    }

    if (REJECTED_FLAGS.has(token)) {
      throw new Error(`${token} is not supported for workspace skill installation`)
    }

    if (IGNORED_BOOLEAN_FLAGS.has(token)) {
      index += 1
      continue
    }

    if (token === '-a' || token === '--agent' || token.startsWith('--agent=')) {
      const result = readFlagValue(tokens, index, token, '--agent')
      index = result.nextIndex
      continue
    }

    if (token === '-s' || token === '--skill' || token.startsWith('--skill=')) {
      const result = readFlagValue(tokens, index, token, '--skill')
      const skill = result.value.trim()
      if (!skill) {
        throw new Error('--skill requires a non-empty value')
      }
      skills.push(skill)
      index = result.nextIndex
      continue
    }

    if (token === '--branch' || token.startsWith('--branch=')) {
      const result = readFlagValue(tokens, index, token, '--branch')
      branch = normalizeNonEmptyFlagValue(result.value, '--branch')
      index = result.nextIndex
      continue
    }

    if (token === '--path' || token.startsWith('--path=')) {
      const result = readFlagValue(tokens, index, token, '--path')
      repositoryPath = normalizeRepositoryPath(result.value)
      if (!repositoryPath) {
        throw new Error('--path requires a non-empty value')
      }
      index = result.nextIndex
      continue
    }

    if (token === '--all') {
      installAll = true
      index += 1
      continue
    }

    if (token.startsWith('-')) {
      throw new Error(`Unsupported option "${token}"`)
    }

    if (source) {
      throw new Error(`Unexpected argument "${token}"`)
    }

    source = parseGithubSource(token)
    index += 1
  }

  if (!source) {
    throw new Error('GitHub repository source is required')
  }

  if (installAll && skills.length) {
    throw new Error('--all cannot be used with --skill')
  }

  if (source.branch && branch && source.branch !== branch) {
    throw new Error('GitHub tree URL branch conflicts with --branch')
  }

  if (source.repositoryPath && repositoryPath && source.repositoryPath !== repositoryPath) {
    throw new Error('GitHub tree URL path conflicts with --path')
  }

  return {
    repositoryUrl: source.repositoryUrl,
    repositoryPath: repositoryPath || source.repositoryPath,
    branch: branch || source.branch,
    skills,
    installAll
  }
}

function tokenizeShellLike(input: string) {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw) {
    return []
  }

  const tokens: string[] = []
  let token = ''
  let tokenStarted = false
  let quote: '"' | "'" | null = null

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]

    if (quote) {
      if (char === quote) {
        quote = null
        tokenStarted = true
        continue
      }

      if (quote === '"' && char === '\\' && index + 1 < raw.length) {
        index += 1
        token += raw[index]
        tokenStarted = true
        continue
      }

      token += char
      tokenStarted = true
      continue
    }

    if (/\s/.test(char)) {
      if (tokenStarted) {
        tokens.push(token)
        token = ''
        tokenStarted = false
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      tokenStarted = true
      continue
    }

    if (char === '\\' && index + 1 < raw.length) {
      index += 1
      token += raw[index]
      tokenStarted = true
      continue
    }

    token += char
    tokenStarted = true
  }

  if (quote) {
    throw new Error('Unclosed quote in install command')
  }

  if (tokenStarted) {
    tokens.push(token)
  }

  return tokens
}

function readCommandPrefix(tokens: string[]) {
  if (tokens[0] === 'npx') {
    let index = 1
    while (tokens[index] === '-y' || tokens[index] === '--yes') {
      index += 1
    }
    if (tokens[index] !== 'skills' || tokens[index + 1] !== 'add') {
      throw new Error('Use "npx skills add <github-source>" to install workspace skills')
    }
    return index + 2
  }

  if (tokens[0] === 'skills') {
    if (tokens[1] !== 'add') {
      throw new Error('Use "skills add <github-source>" to install workspace skills')
    }
    return 2
  }

  return 0
}

function readFlagValue(tokens: string[], index: number, token: string, flagName: string) {
  const equalsIndex = token.indexOf('=')
  if (equalsIndex > -1) {
    return {
      value: token.slice(equalsIndex + 1),
      nextIndex: index + 1
    }
  }

  const value = tokens[index + 1]
  if (!value || value.startsWith('-')) {
    throw new Error(`${flagName} requires a value`)
  }

  return {
    value,
    nextIndex: index + 2
  }
}

function normalizeNonEmptyFlagValue(value: string, flagName: string) {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`${flagName} requires a non-empty value`)
  }
  return normalized
}

function parseGithubSource(source: string): ParsedGithubSource {
  const raw = source.trim()
  if (!raw) {
    throw new Error('GitHub repository source is required')
  }

  if (isLocalPath(raw)) {
    throw new Error('Local paths are not supported for workspace skill installation')
  }

  if (/^git@/i.test(raw)) {
    throw new Error('SSH Git URLs are not supported for workspace skill installation')
  }

  if (/^https?:\/\//i.test(raw) || /^github\.com\//i.test(raw)) {
    return parseGithubUrl(raw)
  }

  if (/^[^/\s]+\/[^/\s]+$/.test(raw)) {
    const [owner, repoSegment] = raw.split('/')
    const repo = repoSegment.replace(/\.git$/i, '')
    if (!repo) {
      throw new Error('GitHub repository source must include owner and repository name')
    }
    return {
      repositoryUrl: `https://github.com/${owner}/${repo}`,
      repositoryPath: '',
      branch: ''
    }
  }

  throw new Error('Only GitHub repository URLs or owner/repo sources are supported')
}

function parseGithubUrl(raw: string): ParsedGithubSource {
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new Error('GitHub repository URL is invalid')
  }

  if (url.hostname.toLowerCase() !== 'github.com') {
    throw new Error('Only github.com repository URLs are supported')
  }

  const segments = url.pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
  const owner = segments[0]?.trim()
  const repo = segments[1]?.replace(/\.git$/i, '').trim()
  if (!owner || !repo) {
    throw new Error('GitHub repository URL must include owner and repository name')
  }

  if (segments.length > 2 && segments[2] !== 'tree') {
    throw new Error('Only GitHub repository and tree URLs are supported')
  }

  const treeBranch = segments[2] === 'tree' ? (segments[3]?.trim() ?? '') : ''
  const treePath = segments[2] === 'tree' ? normalizeRepositoryPath(segments.slice(4).join('/')) : ''

  return {
    repositoryUrl: `https://github.com/${owner}/${repo}`,
    repositoryPath: treePath,
    branch: treeBranch
  }
}

function normalizeRepositoryPath(value: string) {
  return value.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
}

function isLocalPath(value: string) {
  return (
    value.startsWith('.') ||
    value.startsWith('/') ||
    value.startsWith('~') ||
    /^file:/i.test(value) ||
    /^[a-z]:[\\/]/i.test(value)
  )
}
