# GitHub Rate Limit — Conformance Specification

This directory is the single definition of correct behavior for **both** runtime
implementations of the GitHub rate limiter:

- TypeScript — `../ts`, consumed by the eleven workspaces in `github-api/v100/packages/ts`
- Python — `../python`, consumed by `github-api/v100/python.v3/github_sdk_core`

Two implementations of one behavior diverge unless a single artifact defines
correctness for both. That artifact is this one (**R14**, and the reason
[D1](../../../.ai/planners/RCM-github/PRDs/0001-unified-github-rate-limit-package/decisions/01-two-runtimes-one-conformance-spec.md)
chose two packages over a bridge).

## The contract

- Cases live in `cases/*.json`. They are **runtime-neutral data** — no code, no
  runtime-specific constructs.
- Each runtime ships a harness that loads every case file and executes every
  case. Neither harness may skip, filter, or subset the list. Both harnesses
  assert that the `cases/*.json` files on disk are exactly the files
  `cases/index.json` lists, so a case file left out of the manifest fails the
  build instead of silently never running.
- **A divergence fails the build of the diverging implementation.** Not a
  warning, not a report. The suites run in CI as ordinary test failures.
- A deliberate divergence is recorded in [`DIVERGENCES.md`](DIVERGENCES.md) with
  its reason. An unrecorded divergence is a defect in whichever runtime differs.
- Every requirement R1–R13 has at least one case. `cases/index.json` maps
  requirement ids to the files that cover them; the harnesses assert that map is
  complete, so deleting the last case for a requirement fails the build too.

## Conventions

- **`null` means "absent"**, not zero and not empty. This distinction is the
  whole of R1: a header that is missing or unparseable must never be read as a
  budget of `0`.
- **Time is milliseconds since the epoch** everywhere in this spec, except
  `x-ratelimit-reset`, which is epoch **seconds** because that is GitHub's own
  unit. Field names carry the unit: `resetAtMs` vs `reset`.
- **Header names are lowercase** in case data. Both harnesses must read headers
  case-insensitively, so this is a convention of the data, not a constraint on
  the implementation.
- No case may depend on real elapsed time, on `Math.random`, or on the local
  timezone. Clocks and randomness are injected (**R13**), which is what keeps
  the whole suite's real sleeping under one second (**N7**).
- **HTTP-dates** (`Retry-After`, `Date`) are accepted only in the three forms
  RFC 9110 §5.6.7 requires: IMF-fixdate (`Wed, 21 Oct 2015 07:28:00 GMT`),
  RFC 850 and asctime. Anything else — a numeric zone, ISO 8601, a zone-less
  date — is malformed (`null`), never read in the host's timezone.
- **Integers are ASCII digits only.** A header of Arabic-Indic or full-width
  digits is not a number.
- **Event payloads are not compared.** Only event *names* and their order are
  part of the contract; payload keys follow each runtime's casing (see
  [`DIVERGENCES.md`](DIVERGENCES.md)).

## Case shape

```jsonc
{
  "id": "R3-004",                 // stable; cited by commits and tests
  "requirements": ["R3"],         // one or more requirement ids
  "title": "403 with budget remaining is a permission failure, not a limit",
  "kind": "classify",             // selects the operation, see below
  "input":  { /* kind-specific */ },
  "expect": { /* kind-specific */ }
}
```

## Kinds

Each kind names one operation both runtimes expose. The first eight are pure
functions; the rest exercise stateful behavior through a scripted timeline.

### `parse-headers` — R1, R2

Read GitHub's rate-limit headers off a response.

```jsonc
"input":  { "headers": { "x-ratelimit-limit": "5000" }, "fallbackResource": "core" }
"expect": { "limit": 5000, "remaining": null, "used": null, "reset": null, "resource": "core" }
```

### `parse-retry-after` — R4

```jsonc
"input":  { "value": "120", "nowMs": 1700000000000 }
"expect": { "ms": 120000 }
```

### `resource-from-url` — R2

```jsonc
"input":  { "url": "/search/repositories?q=x" }
"expect": { "resource": "search" }
```

### `classify` — R3, R4, R5

```jsonc
"input":  { "status": 403, "headers": {…}, "data": null, "nowMs": 0, "resourceHint": "core" }
"expect": { "kind": "primary", "isRateLimit": true, "resource": "core",
            "retryAfterMs": null, "resetAtMs": 3600000 }
```

`kind` is one of `none`, `primary`, `secondary`. The rules, in order: a status
other than `403`/`429` is `none`; GitHub's secondary-limit wording in the body is
`secondary`; `remaining: 0` is `primary`; a `429` is `secondary`; a `403` with a
parseable `Retry-After` is `secondary`; any other `403` is `none` (a permission
failure).

### `wait` — R4, R5, R6

```jsonc
"input":  { "classification": { "kind": "primary", "retryAfterMs": null, "resetAtMs": 3600000 },
            "nowMs": 0, "maxWaitMs": 60000, "paddingMs": 1000,
            "fallbackMs": 1000, "secondaryStreak": 0, "secondaryEscalationFactor": 2 }
"expect": { "waitMs": 60000, "requestedMs": 3601000, "exceedsCeiling": true, "retryAfterUsed": false }
```

Optional `secondaryFallbackMs` replaces `fallbackMs` when `kind` is `secondary`
and neither `Retry-After` nor a reset is known (the limiter passes
`secondaryFallbackWaitMs`, default 60 000).

### `pace` — R7

```jsonc
"input":  { "state": { "resource": "core", "limit": 5000, "remaining": 10, "reset": 3600 },
            "lastRequestAtMs": null, "nowMs": 0,
            "config": { "minIntervalMs": 0, "adaptive": true, "adaptiveThreshold": 0.2,
                        "reserve": 1, "maxDelayMs": 5000 } }
"expect": { "delayMs": 5000, "reason": "adaptive" }
```

`delayMs` is compared with a tolerance of ±1 ms to absorb float division. The
tolerance applies to millisecond quantities only (keys ending in `Ms`,
`millisecondsUntilReset`, `sleeps`, `sendTimes`); counts such as `attempts`,
`remaining`, `finalConcurrencyLimit` and `maxObservedInFlight` compare exactly.

### `backoff` — R9

`random` is a fixed value in `[0, 1)`, standing in for the injected source.

```jsonc
"input":  { "attempt": 3, "config": { "baseMs": 1000, "factor": 2, "maxMs": 30000, "jitter": "equal" },
            "random": 0.5 }
"expect": { "delayMs": 3000 }
```

### `store` — R1, R2, R10

Replay observations into a fresh store, then read the derived statuses.

```jsonc
"input":  { "observations": [ { "headers": {…}, "fallbackResource": "core", "atMs": 0 } ],
            "nowMs": 0 }
"expect": { "statuses": { "core": { "limit": 5000, "remaining": 4999, "exhausted": false } } }
```

Only the resources named in `expect.statuses` are checked, and within each, only
the fields named. A field expected as `null` must be absent.

Observations are not simply "latest wins": one whose `x-ratelimit-reset` is
older than the stored window is ignored, and within the same window `remaining`
keeps the minimum seen and `used` the maximum.

### `scenario` — R1, R3–R6, R9–R12

The stateful one. A limiter is built with an auto-advancing manual clock, handed
a queue of responses, and asked to run one governed request. Every sleep is
recorded and time jumps by exactly that much, so an hour-long wait costs
microseconds.

```jsonc
"input": {
  "config": { "maxRetries": 1, "backoff": { "jitter": "none", "baseMs": 0 } },
  "startTimeMs": 0,
  "request": { "url": "/repos/o/r", "method": "GET" },
  "responses": [ { "status": 403, "headers": {…} }, { "status": 200, "headers": {…} } ]
}
"expect": {
  "outcome": "success",          // success | rate-limit | error
  "attempts": 2,
  "sleeps": [3601000],           // every sleep performed, in order, in ms
  "events": ["limit", "wait", "retry"],   // emitted at least these, in order
  "finalStatus": { "core": { "remaining": 4999 } }
}
```

**Only the `expect` keys actually present are checked.** Omitting `sleeps` means
the sleep timeline is not asserted for that case, not that it must be empty.

Further `input` fields:

| Field | Meaning |
| --- | --- |
| `request` | One governed request. Accepts `url`, `method`, `resource`, `idempotent`, `skipPacing`. |
| `repeat` | Run `request` this many times in sequence, consuming `responses` in order. Default `1`. |
| `requests` | An explicit list of requests, used instead of `request` + `repeat`. |
| `randomSequence` | Fixed `[0,1)` draws for backoff jitter, cycled. Default: always `0.5`. |

`responses` entries may instead be `{ "throwStatus": 403, "headers": {…} }` to
model a transport that throws on error responses, as Axios and `httpx` do. Both
forms must be governed identically.

**Running out of responses is a failure.** An attempt beyond the scripted list
fails the case (`responses: no attempt beyond the scripted responses`) rather
than replaying the last response, which would hide an unexpected retry. A case
that genuinely wants the last response repeated says so with
`"repeatLastResponse": true`.

A `date` header on a response feeds the limiter's clock-skew estimate:
reset-derived waits are computed on GitHub's clock (`R6-008`).

Further `expect` fields:

| Field | Meaning |
| --- | --- |
| `outcome` | `success`, `rate-limit` (the package's own error), or `error` (anything else, surfaced unchanged). |
| `attempts` | Total task invocations across every request in the scenario. |
| `events` | Event names that must appear **in this order**, as a subsequence of what was emitted. |
| `eventsAbsent` | Event names that must not have been emitted at all. |
| `finalStatus` | Per-resource budget after the scenario, checked field by field. |
| `finalConcurrencyLimit` | The concurrency cap after the scenario (R8's automatic reduction). |
| `elapsedMs` | Total time the injected clock advanced. Proves waiting happened without real elapsed time. |
| `error` | For `rate-limit` outcomes: fields the raised error must carry — `kind`, `resource`, `status`, `retried`, `exceededWaitCeiling`, `resetAtMs`. |

### `concurrent-scenario` — R5, R7, R8

Like `scenario`, but every entry of `requests` runs **at once**, each with its
own response script, under a virtual clock: sleeps finish only when the harness
moves time to their deadline, so concurrent waits overlap as they would with
real timers. The harness lets every runnable continuation settle, then jumps to
the earliest pending deadline (settling every timer due then, in deadline and
then registration order), until every request has settled. Each scripted task
stays in flight for a few scheduler turns before returning, so the requests
genuinely overlap.

```jsonc
"input": {
  "config": { "minIntervalMs": 300, "maxRetries": 0 },
  "startTimeMs": 0,
  "requests": [
    { "url": "/repos/o/r", "method": "GET", "responses": [ { "status": 200, "headers": {} } ] },
    { "url": "/repos/o/r", "method": "GET", "responses": [ { "status": 200, "headers": {} } ] }
  ]
}
"expect": { "outcomes": ["success", "success"], "sendTimes": [[0], [300]], "sleeps": [300] }
```

`expect` accepts `outcomes` (one per request, in order), `attempts`,
`sendTimes` (the clock at each task invocation, per request), `sleeps`
(compared as a sorted multiset — interleaving is not part of the contract),
`elapsedMs`, `finalConcurrencyLimit`, `events`, `eventsAbsent` and
`finalStatus`, with the `scenario` meanings. Running out of a request's
responses is a failure here too.

### `cancellation` — R6

Same input shape as `scenario`, plus `abortDuringWait: true`. The harness aborts
the caller's signal while the limiter is mid-wait and asserts the call rejects
promptly with an abort, not with a rate-limit error and not after the full sleep.

```jsonc
"expect": { "outcome": "aborted" }
```

### `concurrency` — R8

```jsonc
"input":  { "config": { "maxConcurrent": 3 }, "tasks": 10 }
"expect": { "maxObservedInFlight": 3, "completed": 10 }
```

### `config-invalid` — R12

```jsonc
"input":  { "options": { "maxConcurrent": 0 } }
"expect": { "throws": true }
```

Construction must fail, and it must fail at construction rather than at the
first request.

Unknown or misspelt option names (`maxWaitMS`, `backoff.baseMS`) must be
rejected too, as must an escalation factor below `1` and a non-integer
`maxConcurrent`, `maxRetries`, `secondaryConcurrencyFloor` or
`secondaryRecoveryAfter` (an integral float such as `2.0` is an integer).

### `config-defaults` — R12

```jsonc
"input":  { "options": {} }
"expect": { "resolved": { "maxWaitMs": 60000, "enabled": true },
            "resolvedBackoff": { "baseMs": 1000, "jitter": "equal" } }
```

Only the named fields are compared. `resolvedBackoff` checks the nested backoff
schedule, which has its own defaults.

## Adding a case

1. Add the object to the right `cases/*.json`, with a new stable id. Never
   renumber an existing one — ids are cited from commits and from the PRD.
2. Register the requirement in `cases/index.json` if it is not already there.
3. Run both suites. A case that passes in one runtime and fails in the other is
   the exact drift this specification exists to catch: fix the implementation,
   or record the divergence in `DIVERGENCES.md` with its reason.
