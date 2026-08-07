import { realtimeEventSchema, type RealtimeEvent } from '@waves/shared'

export interface RealtimePublication {
  id: string
  event: RealtimeEvent
}

export type RealtimeSubscriber = (publication: RealtimePublication) => void | Promise<void>
export type RealtimePublisher = (event: RealtimeEvent) => RealtimePublication

export interface RealtimeEventBus {
  publish: RealtimePublisher
  lastId(): string
  replayAfter(id: string | undefined): RealtimePublication[]
  subscribe(subscriber: RealtimeSubscriber): () => void
}

const REPLAY_BUFFER_LIMIT = 100

export function createRealtimeEventBus(): RealtimeEventBus {
  const subscribers = new Set<RealtimeSubscriber>()
  const replayBuffer: RealtimePublication[] = []
  let nextId = 0

  return {
    publish(event) {
      const publication = {
        id: String(++nextId),
        event: realtimeEventSchema.parse(event),
      }
      replayBuffer.push(publication)
      if (replayBuffer.length > REPLAY_BUFFER_LIMIT) replayBuffer.shift()

      for (const subscriber of subscribers) {
        Promise.resolve(subscriber(publication)).catch(() => undefined)
      }

      return publication
    },

    lastId() {
      return String(nextId)
    },

    replayAfter(id) {
      if (id === undefined) return []

      const parsedId = Number.parseInt(id, 10)
      if (!Number.isSafeInteger(parsedId) || parsedId < 0) return []

      return replayBuffer.filter((publication) => Number.parseInt(publication.id, 10) > parsedId)
    },

    subscribe(subscriber) {
      subscribers.add(subscriber)
      return () => {
        subscribers.delete(subscriber)
      }
    },
  }
}

let runtimeBus: RealtimeEventBus | undefined

export function getRealtimeEventBus(): RealtimeEventBus {
  runtimeBus ??= createRealtimeEventBus()
  return runtimeBus
}
