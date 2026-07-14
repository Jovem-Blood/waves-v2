import { realtimeEventSchema, type RealtimeEvent } from '@waves/shared'

export interface RealtimePublication {
  id: string
  event: RealtimeEvent
}

export type RealtimeSubscriber = (publication: RealtimePublication) => void | Promise<void>
export type RealtimePublisher = (event: RealtimeEvent) => RealtimePublication

export interface RealtimeEventBus {
  publish: RealtimePublisher
  subscribe(subscriber: RealtimeSubscriber): () => void
}

export function createRealtimeEventBus(): RealtimeEventBus {
  const subscribers = new Set<RealtimeSubscriber>()
  let nextId = 0

  return {
    publish(event) {
      const publication = {
        id: String(++nextId),
        event: realtimeEventSchema.parse(event),
      }

      for (const subscriber of subscribers) {
        Promise.resolve(subscriber(publication)).catch(() => undefined)
      }

      return publication
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
