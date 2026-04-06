import fsPromises from 'fs/promises'
import path from 'path'
import { Injectable } from '@nestjs/common'
import { LongTermMemoryTypeEnum } from '@metad/contracts'
import { MemoryFileRepository, MemoryLayer, MemoryRecordKind } from './types'
import { DefaultMemoryLayerResolver } from './layer-resolver'

@Injectable()
export class DefaultMemoryFileRepository implements MemoryFileRepository {
  constructor(private readonly layerResolver: DefaultMemoryLayerResolver) {}

  async listFiles(tenantId: string, layer: MemoryLayer, kinds?: MemoryRecordKind[]) {
    const baseDir = this.layerResolver.resolveLayerDirectory(tenantId, layer)
    const targetKinds = (kinds?.length ? kinds : [LongTermMemoryTypeEnum.PROFILE, LongTermMemoryTypeEnum.QA]).filter(
      Boolean
    )
    const files = await Promise.all(
      targetKinds.map(async (kind) => {
        const dir = path.join(baseDir, kind)
        try {
          const entries = await fsPromises.readdir(dir)
          return entries.filter((file) => file.endsWith('.md')).map((file) => path.join(dir, file))
        } catch (err) {
          if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
            return []
          }
          throw err
        }
      })
    )
    return files.flat()
  }

  async readFile(filePath: string) {
    return fsPromises.readFile(filePath, 'utf8')
  }

  async writeFile(filePath: string, content: string) {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true })
    await fsPromises.writeFile(filePath, content, 'utf8')
  }
}
