# Playback Health

[Português](playback-health.pt-BR.md)

An execution is identified by `playbackAttemptId`; physical retries share that ID.
The period selects executions by their **first start**, in `[from, to)`, and shows
their latest known result, including retries crossing the period boundary.
`errorCode` filters terminal errors by default. Set `errorScope=encountered` to
include errors recovered by retry. Provider rates use terminal successes and
failures as their denominator; cancellations and incomplete executions are separate.

The bot renews active attempts on heartbeat, including paused/resolving playback.
Attempts missing a heartbeat for 2 minutes are reconciled on the next heartbeat
or health query. A restart closes pre-start attempts not owned by the new runtime.
Graceful shutdown and intentional cancellation are distinct from unexpected voice loss.
Delivery uses up to 3 tries (250/500 ms backoff); exhausted delivery is logged safely.
An unreachable API cannot receive a final report: stale reconciliation handles that gap.

Queries use keyset pagination without a record cap. `dataCompleteness` reports
known gaps and retention coverage, not proof that every historical event was captured.
Completed telemetry groups expire after 90 days, checked at most hourly during
maintenance. Queue items and musical history are preserved. Back up SQLite before
deploying migrations. Deleted rows free reusable pages; they do not immediately
shrink the database file. Monitor database/WAL disk usage and long-running readers;
plan offline compaction separately if necessary.

Timings measure source resolution, resource preparation (`fetchLatencyMs`, including
fetch/demux), first player `Playing` state, and resource playback duration.
First audio is a player-side estimate, not a measurement at Discord listeners.
Missing historic samples remain null. P50 requires 5 samples; P95 requires 20.
Source classifications use safe structured codes/status, never signed URLs or raw
provider messages; an ambiguous 403 is not guessed to be a geographic restriction.

Deploy web and bot together after migration. Deployment remains manual.
