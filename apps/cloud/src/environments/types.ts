import packageJson from '../../package.json'
export const VERSION = packageJson.version as string

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

    API_BASE_URL: string
    CHATKIT_FRAME_URL: string
}
