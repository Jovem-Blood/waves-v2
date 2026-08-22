import type { WavesDatabase } from '../db/client'
import { PlayerStateRepository } from './player-state.repository'
import { QueueRepository } from './queue.repository'
import { OperationalStatusRepository } from './operational-status.repository'
import { AutoplayRepository } from './autoplay.repository'
import { AutoplaySuggestionRepository } from './autoplay-suggestion.repository'
import { AutoplayCandidateRepository } from './autoplay-candidate.repository'
import { PlaybackAttemptRepository } from './playback-attempt.repository'

export interface RepositoryContext {
  playerState: PlayerStateRepository
  queue: QueueRepository
  operationalStatus: OperationalStatusRepository
  autoplay: AutoplayRepository
  autoplaySuggestion: AutoplaySuggestionRepository
  autoplayCandidate: AutoplayCandidateRepository
  playbackAttempt: PlaybackAttemptRepository
}

export interface UnitOfWork {
  run<T>(operation: (repositories: RepositoryContext) => T): T
}

export class DatabaseUnitOfWork implements UnitOfWork {
  constructor(
    private readonly db: WavesDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  run<T>(operation: (repositories: RepositoryContext) => T): T {
    return this.db.transaction((transaction) =>
      operation({
        playerState: new PlayerStateRepository(transaction, this.now),
        queue: new QueueRepository(transaction),
        operationalStatus: new OperationalStatusRepository(transaction, this.now),
        autoplay: new AutoplayRepository(transaction, this.now),
        autoplaySuggestion: new AutoplaySuggestionRepository(transaction),
        autoplayCandidate: new AutoplayCandidateRepository(transaction),
        playbackAttempt: new PlaybackAttemptRepository(transaction),
      }),
    )
  }
}
