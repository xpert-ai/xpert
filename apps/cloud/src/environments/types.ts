export const VERSION = '3.6.0-beta.6'
export type IEnvironment = {
    /**
     * Is `production` or `development` evnironment
     */
    production: boolean
    /**
     * Enable local agent
     */
    enableLocalAgent: boolean | string
    /**
     * Is Demo system
     */
    DEMO: boolean
    pro?: boolean
    version?: string

    API_BASE_URL: string

    IS_ELECTRON: boolean

    GOOGLE_AUTH_LINK?: string
    FACEBOOK_AUTH_LINK?: string
    LINKEDIN_AUTH_LINK?: string
    GITHUB_AUTH_LINK?: string
    TWITTER_AUTH_LINK?: string
    MICROSOFT_AUTH_LINK?: string
    AUTH0_AUTH_LINK?: string
}