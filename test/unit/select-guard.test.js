import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SelectGuard } from '../../src/main/select-guard.js';

test('runs one selection and drops overlapping ones', async () => {
  const guard = new SelectGuard(400);
  let runs = 0;
  let release;
  const slow = () => new Promise((r) => (release = r)).then(() => ++runs);
  const first = guard.run(slow);
  assert.equal(await guard.run(async () => ++runs), undefined, 'second call while busy is dropped');
  release();
  await first;
  assert.equal(runs, 1);
});

test('drops repeats inside the cooldown, allows them after', async () => {
  let t = 1000;
  const now = () => t;
  const guard = new SelectGuard(400);
  let runs = 0;
  await guard.run(async () => ++runs, now);
  t += 150; // auto-repeat Enter
  await guard.run(async () => ++runs, now);
  assert.equal(runs, 1);
  t += 400; // a genuine later pick
  await guard.run(async () => ++runs, now);
  assert.equal(runs, 2);
});

test('a failed selection still releases the guard', async () => {
  let t = 0;
  const guard = new SelectGuard(0);
  await assert.rejects(
    guard.run(
      async () => {
        throw new Error('boom');
      },
      () => t,
    ),
  );
  t = 1;
  assert.equal(
    await guard.run(
      async () => 'ok',
      () => t,
    ),
    'ok',
  );
});
