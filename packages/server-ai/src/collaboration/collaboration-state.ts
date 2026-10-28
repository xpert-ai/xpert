import { BadRequestException } from '@nestjs/common'
import * as Y from 'yjs'

export function encodeDocument(doc: Y.Doc) {
    return {
        stateBase64: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
        stateVectorBase64: Buffer.from(Y.encodeStateVector(doc)).toString('base64')
    }
}

export function decodeDocument(stateBase64: string) {
    const doc = new Y.Doc()
    if (stateBase64) Y.applyUpdate(doc, Buffer.from(stateBase64, 'base64'))
    return doc
}

export function parseBase64(value: string, label: string, maxBytes: number) {
    if (!value || !/^[A-Za-z0-9+/=_-]+$/.test(value)) throw new BadRequestException(`${label} is invalid.`)
    const buffer = Buffer.from(value, 'base64')
    if (buffer.byteLength > maxBytes) throw new BadRequestException(`${label} exceeds the platform size limit.`)
    return buffer
}
