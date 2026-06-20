export class QueueItemNotFoundError extends Error {
  readonly code = 'QUEUE_ITEM_NOT_FOUND'

  constructor(readonly queueItemId: string) {
    super(`Queue item ${queueItemId} was not found`)
    this.name = 'QueueItemNotFoundError'
  }
}

export class TrackNotFoundError extends Error {
  readonly code = 'TRACK_NOT_FOUND'

  constructor() {
    super('No track matched the search query')
    this.name = 'TrackNotFoundError'
  }
}

export class PlaybackConflictError extends Error {
  readonly code = 'PLAYBACK_CONFLICT'

  constructor() {
    super('Playback transition does not match the current queue item')
    this.name = 'PlaybackConflictError'
  }
}
