# Recorded Divergences

Deliberate differences between the TypeScript and Python implementations, each
with the reason it is acceptable (**R14**). A divergence that is not written down
here is a defect, not a decision — the harnesses treat every unrecorded
difference as a build failure.

| Case / behavior | Runtime | Difference | Why it is acceptable |
| --- | --- | --- | --- |
| Event payload keys (R10) | both | TypeScript payloads use camelCase (`delayMs`, `waitMs`, `inFlight`, `retryAfterUsed`); Python uses snake_case (`delay_ms`, `wait_ms`, `in_flight`, `retry_after_used`). Values and event names are identical. | Each runtime's idiom, the same translation the option names get. The harnesses compare event names and order only; payload *values* are covered by unit tests in each runtime. |
| `SystemClock` keep-alive (R6, R13) | TypeScript | `new SystemClock({ unref: true })` can let Node exit while a wait is pending; the default keeps the process alive. Python has no equivalent option. | An event-loop property Python's `asyncio` does not have: a pending `asyncio.sleep` always keeps `asyncio.run` going. Behaviour with the defaults is the same. |
| Cancellation handle | both | `AbortSignal` in TypeScript, `CancelToken` in Python. | Platform primitive; both reject promptly with `AbortError` (`R6-007`). |

Every conformance case passes identically in both runtimes.

## What belongs here

A divergence is admissible only when the runtime makes the shared behavior
impossible or actively wrong — not when one implementation is merely harder to
write. Examples that would qualify:

- A language-level integer or float bound that changes a computed delay.
- A concurrency primitive with different fairness guarantees, where the case
  asserts ordering the other runtime cannot promise.

Examples that would **not** qualify, and which should be fixed instead:

- "The Python version rounds differently." Pick one rule and specify it.
- "The TypeScript version emits an extra event." Events are part of the
  contract (R10); either specify it for both or remove it.
