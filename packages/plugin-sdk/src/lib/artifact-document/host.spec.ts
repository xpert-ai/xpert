/** @jest-environment jsdom */
import { TextEncoder } from 'node:util'
import { MessageChannel } from 'node:worker_threads'
import { installArtifactDocumentFramePolicy, mountArtifactDocument, type ArtifactDocumentHostOptions } from './host'

describe('Artifact document sandbox', () => {
  it('grants downloads for one mount and restores the default on the next mount', () => {
    Object.assign(globalThis, { MessageChannel, TextEncoder })
    installArtifactDocumentFramePolicy(document)
    const frame = document.createElement('iframe')
    document.body.append(frame)
    const options: ArtifactDocumentHostOptions<null> = {
      html: '<html><body>Report</body></html>',
      context: { bindingIds: [], defaults: {}, theme: 'light', locale: 'en' },
      query: async () => null
    }

    try {
      for (const [policy, expected] of [
        [{ allowDownloads: true }, 'allow-scripts allow-downloads'],
        [{}, 'allow-scripts'],
        [{ allowDownloads: false }, 'allow-scripts']
      ] as const) {
        const host = mountArtifactDocument(frame, { ...options, ...policy })
        try {
          expect(frame.getAttribute('sandbox')).toBe(expected)
        } finally {
          host.dispose()
        }
      }
    } finally {
      frame.remove()
    }
  })
})
