import { describe, expect, it } from 'vitest';
import { SerialSave } from './serial.ts';

/** A send whose answers the test releases one by one. */
function controlled() {
	const sent: string[] = [];
	const answers: ((ok: boolean) => void)[] = [];
	let value = '';
	const saver = new SerialSave(() => {
		sent.push(value);
		return new Promise<boolean>((r) => answers.push(r));
	});
	return {
		saver,
		sent,
		set(v: string) {
			value = v;
			saver.changed();
		},
		answer(ok = true) {
			answers.shift()!(ok);
		}
	};
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('SerialSave', () => {
	it('keeps one request in flight and sends the newest value when it returns (last write wins)', async () => {
		const c = controlled();
		c.set('a');
		const first = c.saver.save();
		await tick();
		c.set('ab');
		const second = c.saver.save(); // joins the running save instead of overlapping it
		c.set('abc');
		await tick();
		expect(c.sent).toEqual(['a']);
		c.answer();
		await tick();
		expect(c.sent).toEqual(['a', 'abc']); // 'ab' was superseded before it could be sent
		c.answer();
		expect(await first).toBe(true);
		expect(await second).toBe(true);
		expect(c.saver.dirty).toBe(false);
	});

	it('flush waits for the request in flight, then saves what changed meanwhile', async () => {
		const c = controlled();
		c.set('a');
		void c.saver.save();
		await tick();
		c.set('b'); // typed while 'a' is on its way, no save scheduled yet
		const flushed = c.saver.save();
		c.answer();
		await tick();
		expect(c.sent).toEqual(['a', 'b']);
		c.answer();
		expect(await flushed).toBe(true);
	});

	it('resolves false when a request fails, and keeps the change for the next save', async () => {
		const c = controlled();
		c.set('a');
		const p = c.saver.save();
		await tick();
		c.answer(false);
		expect(await p).toBe(false);
		expect(c.saver.dirty).toBe(true);
		const retry = c.saver.save();
		await tick();
		c.answer(true);
		expect(await retry).toBe(true);
		expect(c.sent).toEqual(['a', 'a']);
	});

	it('a send that throws counts as a failure', async () => {
		const s = new SerialSave(async () => {
			throw new TypeError('offline');
		});
		s.changed();
		expect(await s.save()).toBe(false);
	});

	it('nothing to save resolves true at once without a request', async () => {
		const c = controlled();
		expect(await c.saver.save()).toBe(true);
		expect(c.sent).toEqual([]);
	});

	it('run() queues behind the save in flight; discard() drops unsaved changes', async () => {
		const c = controlled();
		c.set('a');
		void c.saver.save();
		await tick();
		const order: string[] = [];
		const other = c.saver.run(async () => order.push('delete'));
		await tick();
		expect(order).toEqual([]);
		c.answer();
		await other;
		expect(order).toEqual(['delete']);
		c.set('b');
		c.saver.discard();
		expect(await c.saver.save()).toBe(true);
		expect(c.sent).toEqual(['a']);
	});
});
