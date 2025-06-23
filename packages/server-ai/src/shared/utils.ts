import { TFileDirectory } from '@metad/contracts'
import { urlJoin } from '@metad/server-common';
import { Dirent } from 'fs'
import fs from 'fs/promises'
import path from 'path'


export async function listFiles(dir: string, depth: number, currentDepth = 0, params: {root: string; baseUrl: string} ): Promise<TFileDirectory[]> {
	const { root, baseUrl } = params
	if (depth !== undefined && currentDepth >= depth) {
		return null
	}
	let entries: Dirent[]
	try {
		entries = await fs.readdir(path.join(root, dir), { withFileTypes: true })
	} catch (err) {
		return null
	}
	const files = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = path.join(dir, entry.name)
			if (entry.isDirectory()) {
				const children = await listFiles(fullPath, depth, currentDepth + 1, { root, baseUrl})
				return {
					filePath: entry.name,
					fullPath,
					directory: dir,
					fileType: 'directory',
					hasChildren: true,
					children,
					size: 0,
					createdAt: undefined,
				} as TFileDirectory
			} else {
				const stat = await fs.stat(path.join(root, fullPath))
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
