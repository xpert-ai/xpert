import { IntegrationService } from '@metad/server-core';
import { Injectable, NotFoundException } from '@nestjs/common';
import { XpertProjectService } from '../project.service';

@Injectable()
export class VcsService {
  constructor(
    private projectService: XpertProjectService,
    private integrationService: IntegrationService) {}

  async getClient(integrationId: string, installationId?: number) {
    // const integration = await this.integrationService.findById(integrationId);
    // if (!integration) throw new NotFoundException(`Integration ${integrationId} not found`);

    // switch (integration.config.provider) {
    //   case 'github':

    //     return null
    //   case 'gitlab':
    //     return null
    //   default:
    //     throw new NotFoundException(`Unsupported provider: ${integration.config.provider}`);
    // }
  }

  async getRepo(projectId: string, installationId?: number) {
    // const project = await this.projectService.findOne(projectId);
    // const client = await this.getClient(project.integration.id, installationId);
    // const [owner, repo] = project.repository.split('/');

    // if (project.integration.config.provider === 'github') {
    //   return client.request('GET /repos/{owner}/{repo}', { owner, repo });
    // } else if (project.integration.config.provider === 'gitlab') {
    //   return client.Projects.show(`${owner}/${repo}`);
    // }
    throw new Error('Unsupported provider');
  }
}