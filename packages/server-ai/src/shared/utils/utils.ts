import { TFileDirectory } from '@metad/contracts'
import { urlJoin } from '@metad/server-common';
import { environment } from '@metad/server-config';
import { Dirent } from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import mime from 'mime-types'


export async function listFiles(dir: string, depth: number, currentDepth = 0, params: {root: string; baseUrl: string} ): Promise<TFileDirectory[]> {
	const { root, baseUrl } = params
	if (depth !== undefined && currentDepth >= depth) {
		return null
	}
	let entries: Dirent[]
	try {
		entries = await fsPromises.readdir(path.join(root, dir), { withFileTypes: true })
	} catch (err) {
		return null
	}
	const files = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = path.join(dir, entry.name)
			if (entry.isDirectory()) {
				const stat = await fsPromises.stat(path.join(root, fullPath))
				const children = await listFiles(fullPath, depth, currentDepth + 1, { root, baseUrl })
				return {
					filePath: entry.name,
					fullPath,
					directory: dir,
					fileType: 'directory',
					hasChildren: true,
					children,
					size: 0,
					createdAt: stat.mtime,
				} as TFileDirectory
			} else {
				const stat = await fsPromises.stat(path.join(root, fullPath))
				return {
					filePath: entry.name,
					fullPath,
					directory: dir,
					fileType: path.extname(entry.name).slice(1),
					hasChildren: false,
					size: stat.size,
					createdAt: stat.birthtime,
					url: urlJoin(baseUrl, fullPath.replace(/\\/g, '/'))
				} as TFileDirectory
			}
		})
	)
	return files
}

// Manually specify some common types (for overriding)
const explicitMediaTypeMapping: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.py': 'text/plain; charset=utf-8'
  // Optional: Continue to add any mandatory
}

export function getMediaTypeWithCharset(filePath: string): string {
  const ext = '.' + (filePath.split('.').pop() || '').toLowerCase()

  let mediaType = explicitMediaTypeMapping[ext] || mime.lookup(filePath) || 'application/octet-stream'

  if (typeof mediaType === 'string' && mediaType.startsWith('text/')) {
    // Automatically add utf-8 for text/*
    if (!mediaType.includes('charset')) {
      mediaType += '; charset=utf-8'
    }
  } else if (
    ['application/javascript', 'application/json', 'application/xml', 'application/typescript'].includes(mediaType)
  ) {
    mediaType += '; charset=utf-8'
  }

  return mediaType
}

export function sandboxVolumeUrl(volume: string, workspaceId?: string) {
    return `${environment.baseUrl}/api/sandbox/volume${volume}` + (workspaceId ? `/${workspaceId}` : '')
}
/**
 * 
 * @deprecated Unable to meet unified volume classification
 */
export function sandboxVolume(projectId: string, userId: string) {
	return projectId ? `/projects/${projectId}` : `/users/${userId}`
}
export function getWorkspace(projectId: string, conversationId: string) {
    return projectId ? '' : conversationId
}
