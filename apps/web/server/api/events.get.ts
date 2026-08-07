import { realtimeEventSchema, type RealtimeEvent } from '@waves/shared'
import { createEventStream, getRequestHeader } from 'h3'

import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../utils/public-api-dependencies'
import { getRealtimeEventBus, type RealtimeEventBus } from '../utils/realtime-events'

const PING_INTERVAL_MS = 15_000

function serializeEvent(event: RealtimeEvent): string {
  return JSON.stringify(realtimeEventSchema.parse(event))
}

export function createRealtimeEventsHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
  getBus: () => RealtimeEventBus = getRealtimeEventBus,
) {
  return async function realtimeEventsHandler(event: Parameters<typeof createEventStream>[0]) {
    const eventStream = createEventStream(event)
    const bus = getBus()
    const lastEventId = getRequestHeader(event, 'last-event-id')

    const unsubscribe = bus.subscribe((publication) =>
      eventStream.push({
        id: publication.id,
        event: publication.event.type,
        data: serializeEvent(publication.event),
      }),
    )

    for (const publication of bus.replayAfter(lastEventId)) {
      void eventStream.push({
        id: publication.id,
        event: publication.event.type,
        data: serializeEvent(publication.event),
      })
    }

    const dependencies = getDependencies()

    void eventStream.push({
      id: bus.lastId(),
      event: 'sync.snapshot',
      data: serializeEvent({
        type: 'sync.snapshot',
        queue: dependencies.queueService.list(),
        player: dependencies.playerStateService.get(),
        status: dependencies.operationalStatusService.get(),
      }),
    })

    const pingTimer = setInterval(() => {
      void eventStream.push({ event: 'realtime.ping', data: '{}' })
    }, PING_INTERVAL_MS)

    eventStream.onClosed(async () => {
      unsubscribe()
      clearInterval(pingTimer)
      await eventStream.close()
    })

    return eventStream.send()
  }
}

export default createRealtimeEventsHandler()
