export type CollaborationTransportPayload = Record<string, unknown>
export type CollaborationTransportHandler = (payload: CollaborationTransportPayload) => void

/** Framework-neutral event transport used by the collaboration client. */
export interface CollaborationTransport {
  readonly connected: boolean
  /** Socket/session identifier for this exact browser client, when the transport exposes one. */
  readonly clientId?: string | null
  connect(): void
  disconnect(): void
  emit(event: string, payload?: CollaborationTransportPayload): void
  on(event: string, handler: CollaborationTransportHandler): () => void
}

/** Minimal Socket.IO-compatible shape; keeps socket.io-client out of the SDK bundle. */
export interface CollaborationSocketLike {
  readonly connected: boolean
  readonly id?: string
  connect(): unknown
  disconnect(): unknown
  emit(event: string, payload?: CollaborationTransportPayload): unknown
  on(event: string, handler: CollaborationTransportHandler): unknown
  off(event: string, handler: CollaborationTransportHandler): unknown
}

/** Adapt a caller-owned Socket.IO client to the SDK's framework-neutral transport. */
export function createSocketIoTransportAdapter(socket: CollaborationSocketLike): CollaborationTransport {
  return {
    get connected() {
      return socket.connected
    },
    get clientId() {
      return socket.id ?? null
    },
    connect: () => {
      socket.connect()
    },
    disconnect: () => {
      socket.disconnect()
    },
    emit: (event, payload = {}) => {
      socket.emit(event, payload)
    },
    on: (event, handler) => {
      socket.on(event, handler)
      return () => {
        socket.off(event, handler)
      }
    }
  }
}
