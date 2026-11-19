/**
 * @fileoverview Executes the shared conformance specification against this
 * runtime.
 *
 * The case data lives in `../../conformance/cases/*.json` and is loaded by the
 * test that drives this runner — nothing here touches the filesystem, so the
 * package keeps working in hosts that have none.
 *
 * The Python package ships the mirror of this file. When the two disagree about
 * a case, one of them is wrong: that is the whole point (R14).
 * @module conformance/runner
 */

import { computeBackoff, type BackoffConfig } from '../backoff.js';
import { classifyResponse } from '../classify.js';
import { AbortError, isAbortError } from '../clock.js';
import { resolveConfig, type RateLimiterOptions } from '../config.js';
import { isRateLimitError } from '../errors.js';
import { parseRateLimitHeaders, parseRetryAfter, resourceFromUrl } from '../headers.js';
import { GitHubRateLimiter } from '../limiter.js';
import { computePacing, type PacingConfig } from '../pacer.js';
import { RateLimitStore } from '../state.js';
import { computeWait } from '../wait.js';
import type { Clock, RateLimiterEventName, ResourceState } from '../types.js';

/** One case as it appears in the JSON. */
export interface ConformanceCase {
  id: string;
  requirements: string[];
  title: string;
  kind: string;
  input: Record<string, unknown>;
  expect: Record<string, unknown>;
}

/** One case file. */
export interface ConformanceFile {
  file: string;
  description: string;
  cases: ConformanceCase[];
}

/** A single mismatch between what the spec requires and what this runtime did. */
export interface Failure {
  path: string;
  expected: unknown;
  actual: unknown;
}

/** Tolerance for computed delays, in ms — enough to absorb float division. */
const TOLERANCE_MS = 1;

/**
 * Only millisecond quantities get {@link TOLERANCE_MS}. Counts — `attempts`,
 * `remaining`, `finalConcurrencyLimit`, `maxObservedInFlight` — compare
 * exactly: a ±1 slack there would let an off-by-one in a budget or a cap pass.
 */
function isMillisecondKey(key: string): boolean {
  return /(^ms|Ms)$/.test(key) || key.startsWith('milliseconds') || key === 'sleeps' || key === 'sendTimes';
}

/**
 * Run one case and return every way it diverged from the specification.
 *
 * An empty array means the case passes. The caller turns a non-empty array into
 * a test failure, which is how a divergence fails the build (R14).
 */
export async function runCase(testCase: ConformanceCase): Promise<Failure[]> {
  switch (testCase.kind) {
    case 'parse-headers':
      return runParseHeaders(testCase);
    case 'parse-retry-after':
      return runParseRetryAfter(testCase);
    case 'resource-from-url':
      return runResourceFromUrl(testCase);
    case 'classify':
      return runClassify(testCase);
    case 'wait':
      return runWait(testCase);
    case 'pace':
      return runPace(testCase);
    case 'backoff':
      return runBackoff(testCase);
    case 'store':
      return runStore(testCase);
    case 'scenario':
      return runScenario(testCase);
    case 'cancellation':
      return runCancellation(testCase);
    case 'concurrency':
      return runConcurrency(testCase);
    case 'concurrent-scenario':
      return runConcurrentScenario(testCase);
    case 'config-invalid':
      return runConfigInvalid(testCase);
    case 'config-defaults':
      return runConfigDefaults(testCase);
    default:
      return [{ path: 'kind', expected: 'a known case kind', actual: testCase.kind }];
  }
}

// ── pure operations ─────────────────────────────────────────────────────────

function runParseHeaders(testCase: ConformanceCase): Failure[] {
  const input = testCase.input as { headers: unknown; fallbackResource?: string };
  const actual = parseRateLimitHeaders(input.headers, input.fallbackResource);
  return compareFields(testCase.expect, actual as Record<string, unknown>);
}

function runParseRetryAfter(testCase: ConformanceCase): Failure[] {
  const input = testCase.input as { value: string | null; nowMs: number };
  const actual = parseRetryAfter(input.value ?? undefined, input.nowMs);
  return compareFields(testCase.expect, { ms: actual });
}

function runResourceFromUrl(testCase: ConformanceCase): Failure[] {
  const input = testCase.input as { url: string | null };
  return compareFields(testCase.expect, { resource: resourceFromUrl(input.url ?? undefined) });
}

function runClassify(testCase: ConformanceCase): Failure[] {
  const input = testCase.input as {
    status: number;
    headers: unknown;
    data?: unknown;
    nowMs: number;
    resourceHint?: string;
  };
  const actual = classifyResponse(
    { status: input.status, headers: input.headers, data: input.data },
    input.nowMs,
    input.resourceHint,
  );
  return compareFields(testCase.expect, actual as unknown as Record<string, unknown>);
}

function runWait(testCase: ConformanceCase): Failure[] {
  const input = testCase.input as {
    classification: { kind: string; retryAfterMs: number | null; resetAtMs: number | null };
    nowMs: number;
    maxWaitMs: number;
    paddingMs: number;
    fallbackMs: number;
    secondaryFallbackMs?: number;
    secondaryStreak?: number;
    secondaryEscalationFactor?: number;
  };

  const actual = computeWait({
    classification: {
      kind: input.classification.kind as 'primary' | 'secondary' | 'none',
      retryAfterMs: input.classification.retryAfterMs ?? undefined,
      resetAtMs: input.classification.resetAtMs ?? undefined,
    },
    nowMs: input.nowMs,
    maxWaitMs: input.maxWaitMs,
    paddingMs: input.paddingMs,
    fallbackMs: input.fallbackMs,
    ...(input.secondaryFallbackMs === undefined ? {} : { secondaryFallbackMs: input.secondaryFallbackMs }),
    secondaryStreak: input.secondaryStreak ?? 0,
    secondaryEscalationFactor: input.secondaryEscalationFactor ?? 2,
  });

  return compareFields(testCase.expect, actual as unknown as Record<string, unknown>);
}

function runPace(testCase: ConformanceCase): Failure[] {
  const input = testCase.input as {
    state: ResourceState | null;
    lastRequestAtMs: number | null;
    nowMs: number;
    config: PacingConfig;
  };

  const actual = computePacing({
    state: input.state ?? undefined,
    lastRequestAtMs: input.lastRequestAtMs ?? undefined,
    nowMs: input.nowMs,
    config: input.config,
  });

  return compareFields(testCase.expect, actual as unknown as Record<string, unknown>);
}

function runBackoff(testCase: ConformanceCase): Failure[] {
  const input = testCase.input as { attempt: number; config: BackoffConfig; random: number };
  const actual = computeBackoff(input.attempt, input.config, () => input.random);
  return compareFields(testCase.expect, { delayMs: actual });
}

function runStore(testCase: ConformanceCase): Failure[] {
  const input = testCase.input as {
    observations: Array<{ headers: unknown; fallbackResource?: string; atMs: number }>;
    nowMs: number;
  };

  const store = new RateLimitStore();
  for (const observation of input.observations) {
    const parsed = parseRateLimitHeaders(observation.headers, observation.fallbackResource);
    store.update(parsed.resource ?? observation.fallbackResource ?? 'core', parsed, observation.atMs);
  }

  const expected = (testCase.expect as { statuses: Record<string, Record<string, unknown>> }).statuses;
  const failures: Failure[] = [];

  for (const [resource, fields] of Object.entries(expected)) {
    const status = store.status(resource, input.nowMs) as unknown as Record<string, unknown>;
    failures.push(
      ...compareFields(fields, status).map((failure) => ({
        ...failure,
        path: `statuses.${resource}.${failure.path}`,
      })),
    );
  }

  return failures;
}

// ── stateful operations ─────────────────────────────────────────────────────

/** A clock that jumps instead of waiting, recording every sleep it was asked for. */
class RecordingClock implements Clock {
  readonly sleeps: number[] = [];
  #now: number;
  readonly #start: number;

  constructor(startMs: number) {
    this.#now = startMs;
    this.#start = startMs;
  }

  now(): number {
    return this.#now;
  }

  async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new AbortError();
    }
    this.sleeps.push(ms);
    this.#now += ms;
    // Yield so continuations interleave the way they would with a real timer.
    await Promise.resolve();
  }

  get elapsedMs(): number {
    return this.#now - this.#start;
  }
}

/** A clock whose sleeps never finish, so cancellation is the only way out. */
class BlockingClock implements Clock {
  #now: number;

  constructor(startMs: number) {
    this.#now = startMs;
  }

  now(): number {
    return this.#now;
  }

  sleep(_ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((_resolve, reject) => {
      if (signal?.aborted) {
        reject(new AbortError());
        return;
      }
      signal?.addEventListener('abort', () => reject(new AbortError()), { once: true });
    });
  }
}

interface ScenarioResponse {
  status?: number;
  throwStatus?: number;
  headers?: Record<string, string>;
  data?: unknown;
}

interface ScenarioRequest {
  url?: string;
  method?: string;
  resource?: string;
  idempotent?: boolean;
  skipPacing?: boolean;
  /** `concurrent-scenario` only: this request's own response script. */
  responses?: ScenarioResponse[];
}

interface ScenarioInput {
  config?: Record<string, unknown>;
  startTimeMs?: number;
  request?: ScenarioRequest;
  requests?: ScenarioRequest[];
  repeat?: number;
  responses: ScenarioResponse[];
  randomSequence?: number[];
  abortDuringWait?: boolean;
  /** Reuse the last scripted response once the list runs out, instead of failing. */
  repeatLastResponse?: boolean;
}

/** Raised by a scenario task that has no scripted response left to return. */
class OutOfResponsesError extends Error {
  constructor() {
    super('conformance scenario ran out of scripted responses');
  }
}

/** Error shape used to model a transport that throws on error responses. */
class TransportError extends Error {
  readonly response: { status: number; headers: Record<string, string>; data?: unknown };

  constructor(status: number, headers: Record<string, string>, data?: unknown) {
    super(`HTTP ${status}`);
    this.response = data === undefined ? { status, headers } : { status, headers, data };
  }
}

function requestsOf(input: ScenarioInput): ScenarioRequest[] {
  if (input.requests !== undefined) {
    return input.requests;
  }
  const single = input.request ?? {};
  return Array.from({ length: input.repeat ?? 1 }, () => single);
}

function buildOptions(
  input: ScenarioInput,
  clock: Clock,
): RateLimiterOptions {
  const sequence = input.randomSequence ?? [0.5];
  let index = 0;
  return {
    ...(input.config as RateLimiterOptions),
    clock,
    random: () => {
      const value = sequence[index % sequence.length] ?? 0.5;
      index++;
      return value;
    },
  };
}

async function runScenario(testCase: ConformanceCase): Promise<Failure[]> {
  const input = testCase.input as unknown as ScenarioInput;
  const clock = new RecordingClock(input.startTimeMs ?? 0);
  const limiter = new GitHubRateLimiter(buildOptions(input, clock));

  const events: RateLimiterEventName[] = [];
  for (const name of [
    'throttle',
    'wait',
    'retry',
    'limit',
    'state',
    'concurrency',
    'exhaustion',
  ] as RateLimiterEventName[]) {
    limiter.on(name, () => events.push(name));
  }

  let queueIndex = 0;
  let attempts = 0;
  let outcome = 'success';
  let raised: unknown;
  let ranOut = false;

  for (const request of requestsOf(input)) {
    try {
      await limiter.execute(
        async () => {
          attempts++;
          const index =
            input.repeatLastResponse === true ? Math.min(queueIndex, input.responses.length - 1) : queueIndex;
          const next = input.responses[index];
          queueIndex++;
          if (next === undefined) {
            // An attempt the case did not script is a divergence, not a replay
            // of the last response (which would hide an unexpected retry).
            ranOut = true;
            throw new OutOfResponsesError();
          }
          if (next.throwStatus !== undefined) {
            throw new TransportError(next.throwStatus, next.headers ?? {}, next.data);
          }
          return {
            status: next.status ?? 200,
            headers: next.headers ?? {},
            ...(next.data === undefined ? {} : { data: next.data }),
          };
        },
        {
          url: request.url,
          method: request.method,
          resource: request.resource,
          idempotent: request.idempotent,
          skipPacing: request.skipPacing,
        },
      );
    } catch (error) {
      raised = error;
      outcome = isRateLimitError(error) ? 'rate-limit' : 'error';
      break;
    }
  }

  const failures: Failure[] = [];
  const expect = testCase.expect;

  if (ranOut) {
    failures.push({ path: 'responses', expected: 'no attempt beyond the scripted responses', actual: attempts });
  }
  pushCompare(failures, expect, 'outcome', outcome);
  pushCompare(failures, expect, 'attempts', attempts);
  pushCompare(failures, expect, 'elapsedMs', clock.elapsedMs);
  pushCompare(failures, expect, 'finalConcurrencyLimit', limiter.getConcurrency().limit);

  if ('sleeps' in expect) {
    failures.push(...compareNumberList('sleeps', expect['sleeps'] as number[], clock.sleeps));
  }
  if ('events' in expect) {
    failures.push(...compareSubsequence('events', expect['events'] as string[], events));
  }
  if ('eventsAbsent' in expect) {
    for (const name of expect['eventsAbsent'] as string[]) {
      if (events.includes(name as RateLimiterEventName)) {
        failures.push({ path: `eventsAbsent.${name}`, expected: 'not emitted', actual: 'emitted' });
      }
    }
  }
  if ('finalStatus' in expect) {
    const expected = expect['finalStatus'] as Record<string, Record<string, unknown>>;
    for (const [resource, fields] of Object.entries(expected)) {
      const status = limiter.getStatus(resource) as unknown as Record<string, unknown>;
      failures.push(
        ...compareFields(fields, status).map((failure) => ({
          ...failure,
          path: `finalStatus.${resource}.${failure.path}`,
        })),
      );
    }
  }
  if ('error' in expect) {
    failures.push(...compareError(expect['error'] as Record<string, unknown>, raised));
  }

  limiter.close();
  return failures;
}

async function runCancellation(testCase: ConformanceCase): Promise<Failure[]> {
  const input = testCase.input as unknown as ScenarioInput;
  const clock = new BlockingClock(input.startTimeMs ?? 0);
  const limiter = new GitHubRateLimiter(buildOptions(input, clock));

  const controller = new AbortController();
  const request = requestsOf(input)[0] ?? {};

  const pending = limiter.execute(
    async () => {
      const next = input.responses[0];
      if (next === undefined) {
        throw new Error('conformance cancellation case has no response');
      }
      if (next.throwStatus !== undefined) {
        throw new TransportError(next.throwStatus, next.headers ?? {}, next.data);
      }
      return { status: next.status ?? 200, headers: next.headers ?? {} };
    },
    { url: request.url, method: request.method, signal: controller.signal },
  );

  // Let the first attempt run and reach the wait, then abandon it.
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
  controller.abort();

  let outcome = 'completed';
  try {
    await pending;
  } catch (error) {
    outcome = isAbortError(error) ? 'aborted' : isRateLimitError(error) ? 'rate-limit' : 'error';
  }

  limiter.close();
  return compareFields(testCase.expect, { outcome });
}

async function runConcurrency(testCase: ConformanceCase): Promise<Failure[]> {
  const input = testCase.input as unknown as { config?: Record<string, unknown>; tasks: number };
  const clock = new RecordingClock(0);
  const limiter = new GitHubRateLimiter({
    ...(input.config as RateLimiterOptions),
    clock,
  });

  let inFlight = 0;
  let maxObservedInFlight = 0;
  let completed = 0;

  await Promise.all(
    Array.from({ length: input.tasks }, () =>
      limiter.execute(async () => {
        inFlight++;
        maxObservedInFlight = Math.max(maxObservedInFlight, inFlight);
        // Hold the slot across several microtask turns so genuine overlap is
        // observable; the semaphore is what must keep it under the cap.
        for (let i = 0; i < 5; i++) {
          await Promise.resolve();
        }
        inFlight--;
        completed++;
        return { status: 200, headers: {} };
      }),
    ),
  );

  limiter.close();
  return compareFields(testCase.expect, { maxObservedInFlight, completed });
}

/**
 * A clock whose sleeps only finish when the driver moves time to their
 * deadline. Concurrent sleepers therefore overlap the way real timers do,
 * instead of each one adding its own duration to a shared timeline.
 */
class VirtualClock implements Clock {
  readonly sleeps: number[] = [];
  #now: number;
  readonly #start: number;
  #sequence = 0;
  #timers: Array<{ at: number; sequence: number; resolve: () => void; cleanup: () => void }> = [];

  constructor(startMs: number) {
    this.#now = startMs;
    this.#start = startMs;
  }

  now(): number {
    return this.#now;
  }

  get elapsedMs(): number {
    return this.#now - this.#start;
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(new AbortError());
    }
    this.sleeps.push(ms);
    if (!(ms > 0)) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const timer = {
        at: this.#now + ms,
        sequence: this.#sequence++,
        resolve,
        cleanup: (): void => signal?.removeEventListener('abort', onAbort),
      };
      const onAbort = (): void => {
        this.#timers = this.#timers.filter((t) => t !== timer);
        reject(new AbortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.#timers.push(timer);
    });
  }

  /**
   * Jump to the earliest pending deadline and settle every timer due then, in
   * deadline order and, within one deadline, in the order they were set.
   *
   * @returns `false` when nothing is pending.
   */
  advanceToNext(): boolean {
    if (this.#timers.length === 0) {
      return false;
    }
    const next = Math.min(...this.#timers.map((t) => t.at));
    this.#now = Math.max(this.#now, next);
    const due = this.#timers
      .filter((t) => t.at <= this.#now)
      .sort((a, b) => a.at - b.at || a.sequence - b.sequence);
    this.#timers = this.#timers.filter((t) => t.at > this.#now);
    for (const timer of due) {
      timer.cleanup();
      timer.resolve();
    }
    return true;
  }
}

/** Let every queued continuation run before the driver moves time. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Turns a scripted task stays in flight, so concurrent requests overlap. */
const IN_FLIGHT_TURNS = 5;

async function runConcurrentScenario(testCase: ConformanceCase): Promise<Failure[]> {
  const input = testCase.input as unknown as ScenarioInput;
  const requests = input.requests ?? [];
  const clock = new VirtualClock(input.startTimeMs ?? 0);
  const limiter = new GitHubRateLimiter(buildOptions(input, clock));

  const events: RateLimiterEventName[] = [];
  for (const name of [
    'throttle',
    'wait',
    'retry',
    'limit',
    'state',
    'concurrency',
    'exhaustion',
  ] as RateLimiterEventName[]) {
    limiter.on(name, () => events.push(name));
  }

  let attempts = 0;
  let ranOut = false;
  const outcomes: string[] = requests.map(() => 'pending');
  const sendTimes: number[][] = requests.map(() => []);

  const runs = requests.map(async (request, i) => {
    const script = request.responses ?? [];
    let cursor = 0;
    try {
      await limiter.execute(
        async () => {
          attempts++;
          (sendTimes[i] as number[]).push(clock.now());
          const next = script[cursor++];
          for (let turn = 0; turn < IN_FLIGHT_TURNS; turn++) {
            await Promise.resolve();
          }
          if (next === undefined) {
            ranOut = true;
            throw new OutOfResponsesError();
          }
          if (next.throwStatus !== undefined) {
            throw new TransportError(next.throwStatus, next.headers ?? {}, next.data);
          }
          return {
            status: next.status ?? 200,
            headers: next.headers ?? {},
            ...(next.data === undefined ? {} : { data: next.data }),
          };
        },
        {
          url: request.url,
          method: request.method,
          resource: request.resource,
          idempotent: request.idempotent,
          skipPacing: request.skipPacing,
        },
      );
      outcomes[i] = 'success';
    } catch (error) {
      outcomes[i] = isRateLimitError(error) ? 'rate-limit' : isAbortError(error) ? 'aborted' : 'error';
    }
  });

  let finished = false;
  void Promise.all(runs).then(() => {
    finished = true;
  });

  const failures: Failure[] = [];
  // Drive virtual time: let everything runnable run, then jump to the next
  // deadline. Bounded so a hang is reported instead of hanging the suite.
  for (let step = 0; step < 10_000; step++) {
    await settle();
    if (finished) {
      break;
    }
    if (!clock.advanceToNext()) {
      failures.push({ path: 'outcomes', expected: 'every request to settle', actual: 'deadlock' });
      break;
    }
  }
  limiter.close();
  await settle();

  const expect = testCase.expect;
  if (ranOut) {
    failures.push({ path: 'responses', expected: 'no attempt beyond the scripted responses', actual: attempts });
  }
  if ('outcomes' in expect) {
    const expected = expect['outcomes'] as string[];
    if (expected.length !== outcomes.length || expected.some((o, i) => o !== outcomes[i])) {
      failures.push({ path: 'outcomes', expected, actual: outcomes });
    }
  }
  pushCompare(failures, expect, 'attempts', attempts);
  pushCompare(failures, expect, 'elapsedMs', clock.elapsedMs);
  pushCompare(failures, expect, 'finalConcurrencyLimit', limiter.getConcurrency().limit);
  if ('sleeps' in expect) {
    // Concurrent sleeps are compared as a multiset: their interleaving is not
    // part of the contract, their durations are.
    const sorted = (list: number[]): number[] => [...list].sort((a, b) => a - b);
    failures.push(...compareNumberList('sleeps', sorted(expect['sleeps'] as number[]), sorted(clock.sleeps)));
  }
  if ('sendTimes' in expect) {
    const expected = expect['sendTimes'] as number[][];
    if (
      expected.length !== sendTimes.length ||
      expected.some((times, i) => compareNumberList('sendTimes', times, sendTimes[i] as number[]).length > 0)
    ) {
      failures.push({ path: 'sendTimes', expected, actual: sendTimes });
    }
  }
  if ('events' in expect) {
    failures.push(...compareSubsequence('events', expect['events'] as string[], events));
  }
  if ('eventsAbsent' in expect) {
    for (const name of expect['eventsAbsent'] as string[]) {
      if (events.includes(name as RateLimiterEventName)) {
        failures.push({ path: `eventsAbsent.${name}`, expected: 'not emitted', actual: 'emitted' });
      }
    }
  }
  if ('finalStatus' in expect) {
    const expected = expect['finalStatus'] as Record<string, Record<string, unknown>>;
    for (const [resource, fields] of Object.entries(expected)) {
      const status = limiter.getStatus(resource) as unknown as Record<string, unknown>;
      failures.push(
        ...compareFields(fields, status).map((failure) => ({
          ...failure,
          path: `finalStatus.${resource}.${failure.path}`,
        })),
      );
    }
  }

  return failures;
}

function runConfigInvalid(testCase: ConformanceCase): Failure[] {
  const input = testCase.input as { options: RateLimiterOptions };
  let threw = false;
  try {
    // Construction must fail here, not at the first request.
    new GitHubRateLimiter(input.options);
  } catch {
    threw = true;
  }
  return compareFields(testCase.expect, { throws: threw });
}

function runConfigDefaults(testCase: ConformanceCase): Failure[] {
  const input = testCase.input as { options: RateLimiterOptions };
  const resolved = resolveConfig(input.options) as unknown as Record<string, unknown>;
  const failures: Failure[] = [];

  if ('resolved' in testCase.expect) {
    failures.push(
      ...compareFields(testCase.expect['resolved'] as Record<string, unknown>, resolved).map((f) => ({
        ...f,
        path: `resolved.${f.path}`,
      })),
    );
  }
  if ('resolvedBackoff' in testCase.expect) {
    failures.push(
      ...compareFields(
        testCase.expect['resolvedBackoff'] as Record<string, unknown>,
        resolved['backoff'] as Record<string, unknown>,
      ).map((f) => ({ ...f, path: `resolvedBackoff.${f.path}` })),
    );
  }

  return failures;
}

// ── comparison helpers ──────────────────────────────────────────────────────

function pushCompare(
  failures: Failure[],
  expect: Record<string, unknown>,
  key: string,
  actual: unknown,
): void {
  if (!(key in expect)) {
    return;
  }
  if (!valuesMatch(expect[key], actual, key)) {
    failures.push({ path: key, expected: expect[key], actual });
  }
}

/**
 * Compare only the fields the case names.
 *
 * `null` in the specification means **absent**, which is the distinction R1
 * turns on: a field that is missing must not compare equal to one that is `0`.
 */
function compareFields(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
): Failure[] {
  const failures: Failure[] = [];
  for (const [key, value] of Object.entries(expected)) {
    const found = actual[key];
    if (value === null) {
      if (found !== undefined && found !== null) {
        failures.push({ path: key, expected: 'absent', actual: found });
      }
      continue;
    }
    if (!valuesMatch(value, found, key)) {
      failures.push({ path: key, expected: value, actual: found });
    }
  }
  return failures;
}

function valuesMatch(expected: unknown, actual: unknown, key: string): boolean {
  if (typeof expected === 'number' && typeof actual === 'number') {
    return isMillisecondKey(key) ? Math.abs(expected - actual) <= TOLERANCE_MS : expected === actual;
  }
  return expected === actual;
}

function compareNumberList(path: string, expected: number[], actual: number[]): Failure[] {
  if (expected.length !== actual.length) {
    return [{ path, expected, actual }];
  }
  for (let i = 0; i < expected.length; i++) {
    if (!valuesMatch(expected[i], actual[i], path)) {
      return [{ path, expected, actual }];
    }
  }
  return [];
}

/** The expected names must appear in order, though not necessarily adjacently. */
function compareSubsequence(path: string, expected: string[], actual: string[]): Failure[] {
  let cursor = 0;
  for (const name of expected) {
    const found = actual.indexOf(name, cursor);
    if (found < 0) {
      return [{ path: `${path}.${name}`, expected: `emitted after index ${cursor}`, actual }];
    }
    cursor = found + 1;
  }
  return [];
}

function compareError(expected: Record<string, unknown>, raised: unknown): Failure[] {
  if (!isRateLimitError(raised)) {
    return [{ path: 'error', expected: 'a rate-limit error', actual: raised }];
  }

  const actual: Record<string, unknown> = {
    kind: raised.kind,
    resource: raised.resource,
    status: raised.status,
    retried: raised.retried,
    attempts: raised.attempts,
    exceededWaitCeiling: raised.exceededWaitCeiling,
    retryAfterMs: raised.retryAfterMs,
    resetAtMs: raised.resetAt === null ? null : raised.resetAt.getTime(),
    message: raised.message,
    responseStatus: raised.response?.status ?? null,
  };

  return compareFields(expected, actual).map((failure) => ({
    ...failure,
    path: `error.${failure.path}`,
  }));
}

/**
 * Assert that every requirement the manifest demands is exercised by at least
 * one case. Deleting the last case for a requirement is itself a divergence.
 */
export function findUncoveredRequirements(
  required: string[],
  files: ConformanceFile[],
): string[] {
  const covered = new Set<string>();
  for (const file of files) {
    for (const testCase of file.cases) {
      for (const requirement of testCase.requirements) {
        covered.add(requirement);
      }
    }
  }
  return required.filter((requirement) => !covered.has(requirement));
}
