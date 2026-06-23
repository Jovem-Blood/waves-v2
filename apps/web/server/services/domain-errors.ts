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

export class DuplicateTrackError extends Error {
  readonly code = 'DUPLICATE_TRACK'

  constructor() {
    super('The track is already active in the queue')
    this.name = 'DuplicateTrackError'
  }
}

export class QueueItemNotRemovableError extends Error {
  readonly code = 'QUEUE_ITEM_NOT_REMOVABLE'

  constructor(readonly queueItemId: string) {
    super(`Queue item ${queueItemId} cannot be removed`)
    this.name = 'QueueItemNotRemovableError'
  }
}

export class QueueItemNotRestorableError extends Error {
  readonly code = 'QUEUE_ITEM_NOT_RESTORABLE'

  constructor(readonly queueItemId: string) {
    super(`Queue item ${queueItemId} cannot be restored`)
    this.name = 'QueueItemNotRestorableError'
  }
}

export class QueueRestoreExpiredError extends Error {
  readonly code = 'QUEUE_RESTORE_EXPIRED'

  constructor(readonly queueItemId: string) {
    super(`Queue item ${queueItemId} restore window expired`)
    this.name = 'QueueRestoreExpiredError'
  }
}
