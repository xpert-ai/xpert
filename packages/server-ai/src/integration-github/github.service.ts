import { IntegrationEnum, Repository } from '@metad/contracts'
import { encryptSecret, IntegrationService } from '@metad/server-core'
import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common'
import { Endpoints } from '@octokit/types'
import { getInstallationToken } from './utils/auth'
import { getInstallationRepositories } from './utils/github'
import { randomBytes } from 'crypto'
import { ConfigService } from '@metad/server-config'

type GitHubInstallationsResponse = Endpoints['GET /user/installations']['response']['data']

@Injectable()
export class GithubService {
	private appsCache = new Map<string, any>()

	constructor(
		private integrationService: IntegrationService,
		private configService: ConfigService,
	) {}

	// async getApp(integrationId: string): Promise<any> {
	// 	if (!this.appsCache.has(integrationId)) {
	// 		const integration = await this.integrationService.findOne(integrationId)
	// 		if (!integration || integration.provider !== IntegrationEnum.GITHUB) {
	// 			throw new NotFoundException(`GitHub integration ${integrationId} not found`)
	// 		}
	// 		const { App } = await import('@octokit/app')
	// 		const app = new App({
	// 			appId: integration.options.appId,
	// 			privateKey: integration.options.privateKey,
	// 			webhookSecret: integration.options.webhookSecret
	// 		})
	// 		this.appsCache.set(integrationId, app)
	// 	}
	// 	return this.appsCache.get(integrationId)
	// }

	// async getOctokit(integrationId: string, installationId: number): Promise<any> {
	// 	const app = await this.getApp(integrationId)
	// 	const { Octokit } = await import('@octokit/core')
	// 	return app.getInstallationOctokit(installationId)
	// }

	/**
	 * Initiates the GitHub App installation flow
	 * This redirects users to the GitHub App installation page where they can
	 * select which repositories to grant access to
	 */
	async installation(integrationId: string, auth: { token_type?: string; access_token?: string; state?: string }) {
		const accessToken = auth?.access_token
		if (!accessToken) {
			throw new BadRequestException("GitHub access token not found")
		}

		const integration = await this.integrationService.findOne(integrationId)

		 // Get GitHub App name from environment variables
    	const githubAppName = integration.options.appName

		if (!githubAppName) {
			throw new BadRequestException("GitHub App name not configured")
		}

		// Check for existing state or generate a new one
		let state = auth.state

		// If no state exists or we want to ensure a fresh state, generate a new one
		if (!state) {
			state = randomBytes(16).toString("hex");
		}

		const encryptionKey = this.configService.get<string>('secretsEncryptionKey')
		state = encryptSecret(state, encryptionKey)

		// Create a response that will redirect to the GitHub App installation page
		// Include the callback URL as a parameter to ensure GitHub redirects back to our app
		// Add the state as a custom parameter in the callback URL
		const baseCallbackUrl = `${this.configService.get('baseUrl')}/api/github/${integrationId}/installation-callback`;
		const callbackUrl = `${baseCallbackUrl}?custom_state=${encodeURIComponent(state)}`;

		return {
			redirect: `https://github.com/apps/${githubAppName}/installations/new?redirect_uri=${encodeURIComponent(callbackUrl)}`
		}
	}

	async getInstallations(tokenData: { token_type?: string; access_token?: string }) {
		// Fetch installations from GitHub API
		const response = await fetch('https://api.github.com/user/installations', {
			headers: {
				Authorization: `${tokenData.token_type} ${tokenData.access_token}`,
				Accept: 'application/vnd.github.v3+json',
				'User-Agent': 'OpenSWE-Agent'
			}
		})

		if (!response.ok) {
			const errorData = await response.json()
			throw `Failed to fetch installations: ${JSON.stringify(errorData)}`
		}

		const data: GitHubInstallationsResponse = await response.json()
		return data
	}

	async getRepositories(
		integrationId: string,
		installationId: string,
		page: number = 1,
		perPage: number = 30
	) {
		const integration = await this.integrationService.findOne(integrationId)
		// Get GitHub App credentials from environment variables
		const appId = integration.options.appId
		const privateKey = integration.options.privateKey?.replace(/\\n/g, '\n')

		if (!appId || !privateKey) {
			throw new InternalServerErrorException('GitHub App configuration missing')
		}

		// Get an installation access token
		let installationToken: string
		try {
			const installationTokenData = await getInstallationToken(installationId, appId, privateKey)
			installationToken = installationTokenData.token
		} catch (error) {
			console.error('Failed to get installation token:', error)
			throw new BadRequestException('Failed to get installation token')
		}

		// Fetch repositories accessible to this installation
		let repositoryData: {
			repositories: Repository[]
			hasMore: boolean
			totalCount: number
		}
		try {
			repositoryData = await getInstallationRepositories(installationToken, page, perPage)
		} catch (error) {
			console.error('Failed to fetch repositories:', error)
			throw new InternalServerErrorException('Failed to fetch repositories')
		}

		// Transform the response to include only the data we need
		const transformedRepos = repositoryData.repositories.map((repo) => ({
			id: repo.id,
			name: repo.name,
			full_name: repo.full_name,
			description: repo.description,
			private: repo.private,
			html_url: repo.html_url,
			default_branch: repo.default_branch,
			permissions: repo.permissions,
			fork: repo.fork,
			has_issues: repo.has_issues
		}))

		return {
			repositories: transformedRepos,
			pagination: {
				page,
				perPage,
				hasMore: repositoryData.hasMore,
				totalCount: repositoryData.totalCount
			}
		}
	}
}
