// import { Injectable } from '@angular/core'
// import { pick } from 'lodash'
// import { BehaviorSubject, Observable, Subject } from 'rxjs'
// import { webSocket, WebSocketSubject } from 'rxjs/webSocket'
// import { AgentEvent } from '@xpert-ai/contracts'
// import { DataSourceOptions } from '../data-source'
// import { uuid, UUID } from '../types'
// import { Agent, AgentType } from './types'

// export enum LocalAgentStatus {
//   OFFLINE = 'offline',
//   ONLINE = 'online',
//   LOADING = 'loading',
//   ERROR = 'error'
// }

// @Injectable()
// export class LocalAgent implements Agent {
//   type = AgentType.Local
//   reconnection$
//   socket: WebSocketSubject<any>

//   queuePool = new Map<UUID, Subject<any>>()

//   reconnectInterval = 5000

//   status$ = new BehaviorSubject<LocalAgentStatus>(LocalAgentStatus.OFFLINE)
//   constructor() {
//     // this.socket = new RxWebsocketSubject('ws://localhost:20215/agent/')

//     this.socket = webSocket('ws://localhost:20215/agent/')
//     this.status$.next(LocalAgentStatus.ONLINE)
//     this.socket?.subscribe({
//       next: (result: AgentEvent) => {
//         // console.warn(result)
//         this.response(result)
//       },
//       error: err => {
//         console.log(err)
//         this.status$.next(LocalAgentStatus.OFFLINE)
//       }
//     })
//   }

//   request(dataSource: DataSourceOptions, options: any): Observable<any> {
//     const req = new Subject()

//     if (this.status$.value === LocalAgentStatus.OFFLINE) {
//       req.error("Agent is offline")
//     } else {
//       const id = uuid()
//       this.queuePool.set(id, req)
  
//       this.socket.next({
//         id,
//         event: 'request',
//         data: {
//           dataSource: {
//             ...pick(dataSource, ['id', 'type']),
//             // options: {
//             //   ...(dataSource.options || {}),
//             //   port: String(dataSource.options?.port),
//             // },
//           },
//           modelId: dataSource.settings?.modelId,
//           request: {
//             ...options,
//           },
//         },
//       })
  
//       this.status$.next(LocalAgentStatus.LOADING)
//     }

//     return req
//   }

//   private response(result: AgentEvent) {
//     const req = this.queuePool.get(result.id)
//     // websocket 错误类型当作服务器内部错误
//     if (result.event === 'error') {
//       req?.error(result.data.error)
//     } else {
//       if (result.data.response?.status === 404 || result.data.response?.status === 500) {
//         req?.error(result.data.response?.body || result.data.response.statusText)
//       } else {
//         // if (result.data.response.headers['content-type'][0] === 'application/json') {
//         req?.next(result.data.response)
//         // } else {
//         //   req?.next(result.data.response)
//         // }
//         req?.complete()
//       }
//     }

//     this.queuePool.delete(result.id)

//     if (this.queuePool.size === 0) {
//       this.status$.next(LocalAgentStatus.ONLINE)
//     }
//   }
// }

// // /// we inherit from the ordinary Subject
// // class RxWebsocketSubject<T> extends Subject<T> {
// //   private reconnectionObservable: Observable<number>
// //   private wsSubjectConfig: WebSocketSubjectConfig<any>
// //   private socket: WebSocketSubject<any>;
// //   private connectionObserver: Observer<boolean>;
// //   public connectionStatus: Observable<boolean>;

// //   /// by default, when a message is received from the server, we are trying to decode it as JSON
// //   /// we can override it in the constructor
// //   defaultResultSelector = (e: MessageEvent) => {
// //     return JSON.parse(e.data);
// //   }

// //   /// when sending a message, we encode it to JSON
// //   /// we can override it in the constructor
// //   defaultSerializer = (data: any): string => {
// //     return JSON.stringify(data);
// //   }

// //   constructor(
// //     private url: string,
// //     private reconnectInterval: number = 10000,  /// pause between connections
// //     private reconnectAttempts: number = Number.MAX_SAFE_INTEGER,  /// number of connection attempts

// //     private resultSelector?: (e: MessageEvent) => any,
// //     private serializer?: (data: any) => string,
// //     ) {
// //     super();

// //     /// connection status
// //     this.connectionStatus = new Observable<boolean>((observer) => {
// //       this.connectionObserver = observer;
// //     }).pipe(
// //       share(),
// //       distinctUntilChanged()
// //     )

// //     if (!resultSelector) {
// //       this.resultSelector = this.defaultResultSelector;
// //     }
// //     if (!this.serializer) {
// //       this.serializer = this.defaultSerializer;
// //     }

// //     /// config for WebSocketSubject
// //     /// except the url, here is closeObserver and openObserver to update connection status
// //     this.wsSubjectConfig = {
// //       url: url,
// //       closeObserver: {
// //         next: (e: CloseEvent) => {
// //           this.socket = null;
// //           this.connectionObserver.next(false);
// //         }
// //       },
// //       openObserver: {
// //         next: (e: Event) => {
// //           this.connectionObserver.next(true);
// //         }
// //       }
// //     };
// //     /// we connect
// //     this.connect();
// //     /// we follow the connection status and run the reconnect while losing the connection
// //     this.connectionStatus.subscribe((isConnected) => {
// //       if (!this.reconnectionObservable && typeof(isConnected) == "boolean" && !isConnected) {
// //         this.reconnect();
// //       }
// //     });
// //   }

// //   connect(): void {
// //     this.socket = new WebSocketSubject(this.wsSubjectConfig);
// //     this.socket.subscribe(
// //       (m) => {
// //         this.next(m); /// when receiving a message, we just send it to our Subject
// //       },
// //       (error: Event) => {
// //         if (!this.socket) {
// //           /// in case of an error with a loss of connection, we restore it
// //           this.reconnect();
// //         }
// //       });
// //   }

// //   /// WebSocket Reconnect handling
// //   reconnect(): void {
// //     this.reconnectionObservable = interval(this.reconnectInterval).pipe(takeWhile((v, index) => index < this.reconnectAttempts && !this.socket))

// //     this.reconnectionObservable.subscribe(
// //       {
// //         next: (value: number) => this.connect(),
// //         complete: () => {
// //           /// if the reconnection attempts are failed, then we call complete of our Subject and status
// //           this.reconnectionObservable = null;
// //           if (!this.socket) {
// //             this.complete();
// //             this.connectionObserver.complete();
// //           }
// //         }
// //       }
// //     )

// //   }

// //   /// sending the message
// //   next(data: T): void {
// //     this.socket.next(data)
// //   }
// // }
