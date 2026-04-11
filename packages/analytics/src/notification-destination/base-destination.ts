import { INotificationDestination, INotificationDestinationType } from '@xpert-ai/contracts'
import * as _axios  from 'axios'

const axios  =_axios.default

export abstract class BaseNotificationDestination implements INotificationDestinationType {
    name: string
    static type: string
    type: string
    icon: string
    enabled: boolean
    schema: any

    constructor(protected options: any, protected redisClient) {}

    abstract notify()
    abstract getGroups()

    get(url, options) {
        return axios.get(url, options)
    }
    post(url, data, options?: any) {
        return axios.post(url, data, options)
    }
}

export const C_NOTIFICATION_DESTINATION_TYPES = {

}
export function register(destinationClass) {
    C_NOTIFICATION_DESTINATION_TYPES[destinationClass.type] = destinationClass
}

export function getNotificationDestinationTypes() {
    return Object.keys(C_NOTIFICATION_DESTINATION_TYPES)
        .map(key => new C_NOTIFICATION_DESTINATION_TYPES[key]())
}

export function createNotificationDestination(destination: INotificationDestination, redis) {
    return new C_NOTIFICATION_DESTINATION_TYPES[destination.type](destination.options, redis)
}