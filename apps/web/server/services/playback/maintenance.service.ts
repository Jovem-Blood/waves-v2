import type { BotHeartbeatInput } from '@waves/shared'
import type { UnitOfWork } from '../../repositories/unit-of-work'

export const PLAYBACK_STALE_AFTER_MS = 120_000

/** Leases come from the bot's heartbeat, including paused/resolving playback. */
export class PlaybackMaintenanceService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly now: () => Date = () => new Date(),
  ) {}

  reconcile(heartbeat?: BotHeartbeatInput): number {
    const now = this.now()
    const timestamp = now.toISOString()
    const cutoff = new Date(now.getTime() - PLAYBACK_STALE_AFTER_MS).toISOString()
    const active = new Set(heartbeat?.activePlaybackAttemptIds ?? [])
    return this.unitOfWork.run(({ playbackAttempt, queue, playerState }) => {
      playbackAttempt.touchActive([...active], timestamp)
      let count = 0
      for (const record of playbackAttempt.listIncomplete()) {
        if (active.has(record.playbackAttemptId)) continue
        const restarted =
          heartbeat?.startedAt !== undefined &&
          heartbeat.activePlaybackAttemptIds !== undefined &&
          record.startedAt < heartbeat.startedAt
        if (!restarted && record.updatedAt >= cutoff) continue
        const item = queue.findById(record.queueItemId)
        if (!item) continue
        const intentional = item.status === 'skipped' || item.status === 'removed'
        playbackAttempt.report(
          {
            queueItemId: item.id,
            playbackAttemptId: record.playbackAttemptId,
            attempt: record.attemptNumber,
            outcome: intentional ? (item.status === 'skipped' ? 'skipped' : 'cancelled') : 'failed',
            terminal: true,
            failureStage: 'sync',
            failureClass: intentional ? 'intentional' : 'sync',
            errorCode: intentional
              ? 'PLAYBACK_CANCELLED'
              : restarted
                ? 'BOT_RESTARTED'
                : 'PLAYBACK_ORPHANED',
          },
          item,
          timestamp,
        )
        const player = playerState.get()
        if (player.currentQueueItemId === item.id && item.status === 'playing') {
          queue.updateStatusAndPosition(item.id, {
            status: 'queued',
            position: item.position,
            updatedAt: timestamp,
          })
          playerState.update({
            status: 'idle',
            currentQueueItemId: null,
            progressMs: 0,
            updatedAt: timestamp,
          })
        }
        count += 1
      }
      return count
    })
  }
}
