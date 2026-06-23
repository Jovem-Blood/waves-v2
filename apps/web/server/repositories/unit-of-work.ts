import type { WavesDatabase } from '../db/client'
import { PlayerStateRepository } from './player-state.repository'
import { QueueRepository } from './queue.repository'
import { OperationalStatusRepository } from './operational-status.repository'

export interface RepositoryContext {
  playerState: PlayerStateRepository
  queue: QueueRepository
  operationalStatus: OperationalStatusRepository
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
      }),
    )
  }
}
