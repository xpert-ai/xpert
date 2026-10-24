import { artifactPresentationUrl } from './artifact-presentation-url'

describe('Artifact presentation URL', () => {
    it.each([
        ['https://app.example/artifacts/share/team-link-12', 'https://app.example/artifacts/view/team-link-12'],
        [
            'https://app.example/xpert/artifacts/share/team-link-12',
            'https://app.example/xpert/artifacts/view/team-link-12'
        ],
        [
            'http://localhost:4201/artifacts/share/team-link-12?xpert_artifact_preview=private#preview',
            'http://localhost:4201/artifacts/view/team-link-12'
        ]
    ])(
        'preserves the platform origin and path prefix while omitting preview credentials: %s',
        (publicUrl, expected) => {
            expect(artifactPresentationUrl(publicUrl, 'team-link-12')).toBe(expected)
        }
    )
})
