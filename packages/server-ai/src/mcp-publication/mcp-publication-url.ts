import { ConfigService } from '@xpert-ai/server-config'

export function mcpPublicationPublicUrl(configService: ConfigService | undefined, path: string) {
    const apiBaseUrl =
        (configService?.get('baseUrl') as string | undefined) || process.env.API_BASE_URL || 'http://localhost:3000'
    return new URL(path, apiBaseUrl).toString()
}
