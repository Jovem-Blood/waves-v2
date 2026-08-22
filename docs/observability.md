# Waves Observability

Waves keeps application logs as structured Pino JSON on stdout. Docker retains a
short rolling window using the `json-file` driver, and Dozzle is used for live
inspection and SQL Analytics. SQLite playback attempts are the historical source
for product analytics in the panel.

## Correlation

Use `playbackAttemptId` to follow one logical playback execution. The `attempt`
field identifies the physical try inside that execution. `queueItemId` connects
the execution to the queue and `sourceIdentifier` identifies the provider source
without exposing a signed URL.

## Dozzle SQL

Dozzle SQL Analytics reads structured JSON logs into the `logs` table. The
canonical terminal event is emitted by the web with `operation =
'playback.result'`; intermediate bot events must not be counted as terminal
plays.

Failures by code:

```sql
SELECT errorCode, COUNT(*) AS failures
FROM logs
WHERE operation = 'playback.result'
  AND outcome = 'failed'
  AND terminal = true
GROUP BY errorCode
ORDER BY failures DESC;
```

Failures by source provider:

```sql
SELECT sourceProvider, errorCode, COUNT(*) AS failures
FROM logs
WHERE operation = 'playback.result'
  AND outcome = 'failed'
  AND terminal = true
GROUP BY sourceProvider, errorCode
ORDER BY failures DESC;
```

Timeline for one execution:

```sql
SELECT timestamp, service, level, operation, outcome, attempt,
       sourceProvider, errorCode, httpStatus, durationMs, msg
FROM logs
WHERE playbackAttemptId = 'replace-with-id'
ORDER BY timestamp ASC;
```

The SQL engine is intended for investigation, not durable reporting. Use
`/playback-health` for historical product metrics.

## Safe fields

Logs and playback attempts may contain classified codes, IDs, track metadata,
provider names, source identifiers, HTTP status and durations. Do not add signed
stream URLs, tokens, cookies, headers, raw provider payloads, or unsanitized
external error messages.
