import packageJson from '../../package.json'
export const VERSION = packageJson.version as string

export type DeploymentTarget = 'cloud' | 'customer-onprem' | 'local'

export function normalizeDeploymentTarget(value: string | undefined, fallback: DeploymentTarget): DeploymentTarget {
    if (!value || value.startsWith('DOCKER_')) {
        return fallback
    }

    if (value === 'cloud' || value === 'customer-onprem' || value === 'local') {
        return value
    }

    return fallback
}

export type IEnvironment = {
    /**
     * Is `production` or `development` evnironment
     */
    production: boolean
    /**
     * Enable local agent
     * @deprecated
     */
    enableLocalAgent: boolean | string
    /**
     * Is Demo system
     */
    DEMO: boolean
    pro?: boolean
    version?: string
    deploymentTarget: string

    API_BASE_URL: string
    CHATKIT_FRAME_URL: string
}
