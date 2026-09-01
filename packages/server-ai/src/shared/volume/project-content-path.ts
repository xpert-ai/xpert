import path from 'node:path'

/** Paths authored through Project Content and protected from generic runtime/file writes. */
export function isProjectGovernedContentPath(filePath: string) {
    const normalized = path.posix.normalize(filePath.replace(/\\/g, '/').replace(/^\/+/, ''))
    return normalized === 'project.md' || normalized === 'skills' || normalized.startsWith('skills/')
}
