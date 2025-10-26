import { IIntegration } from '@metad/contracts'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { UnstructuredClient } from 'unstructured-client'
import { SDKError } from 'unstructured-client/dist/commonjs/sdk/models/errors'
import { PartitionResponse } from 'unstructured-client/dist/commonjs/sdk/models/operations'
import { ENV_UNSTRUCTURED_API_BASE_URL, ENV_UNSTRUCTURED_API_TOKEN, TUnstructuredIntegrationOptions } from './types'

@Injectable()
export class UnstructuredService {
  private readonly logger = new Logger(UnstructuredService.name)

  constructor(private readonly configService: ConfigService) {}

  instantiateClient(integration: IIntegration<TUnstructuredIntegrationOptions>): UnstructuredClient {
    if (integration) {
      const options = integration.options
      return new UnstructuredClient({
        serverURL: options.apiUrl,
        security: {
          apiKeyAuth: options.apiKey
        }
      })
    }

    // Read configuration or environment variables
    const baseUrl = this.configService.get<string>(ENV_UNSTRUCTURED_API_BASE_URL)
    const token = this.configService.get<string>(ENV_UNSTRUCTURED_API_TOKEN)
    if (!baseUrl && !token) {
      throw new BadRequestException('Unstructured integration is not configured.')
    }

    return new UnstructuredClient({
      serverURL: baseUrl,
      security: {
        apiKeyAuth: token
      }
    })
  }

  async test(integration: IIntegration<TUnstructuredIntegrationOptions>) {
    const client = this.instantiateClient(integration)

    try {
      const response: PartitionResponse = await client.general.partition({
        partitionParameters: {
          files: new Blob()
        }
      })
    } catch (err) {
      const error = err as SDKError
      if (error.statusCode === 401) {
        throw new BadRequestException('API key is malformed, please type the API key correctly.')
      }
    }
  }
}
