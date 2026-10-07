<script lang="ts">
	// Automatic logoff warning (HIPAA 164.312(a)(2)(iii)). The server owns the idle clock; this only
	// asks how long is left (with x-background: 1, so asking never counts as activity), warns about a
	// minute before the end, and then goes to the sign-in page.
	// Events for other code (the exam saver flushes on the first):
	//   window 'session-expiring'  ~60 s before idle logoff, detail { remainingMs }
	//   window 'session-expired'   just before leaving for /login
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import Msg from '#lib/i18n/Msg.svelte';
	import { useI18n } from '#lib/i18n/context.ts';

	const { t } = useI18n();

	const WARN_MS = 60_000;
	const POLL_MS = 60_000;

	let deadline = $state(0);
	let now = $state(Date.now());
	let warning = $state(false);
	let announced = false;
	let leaving = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let tick: ReturnType<typeof setInterval> | undefined;

	const secondsLeft = $derived(Math.max(0, Math.ceil((deadline - now) / 1000)));

	function expire() {
		if (leaving) return;
		leaving = true;
		window.dispatchEvent(new CustomEvent('session-expired'));
		const next = location.pathname + location.search;
		location.assign(`/login?next=${encodeURIComponent(next)}`);
	}

	async function status(method: 'GET' | 'POST' = 'GET'): Promise<number | null> {
		try {
			const res = await fetch('/api/session', {
				method,
				headers: method === 'GET' ? { 'x-background': '1', accept: 'application/json' } : { accept: 'application/json' }
			});
			if (res.status === 401) return 0;
			if (!res.ok) return null;
			return ((await res.json()) as { remainingMs: number }).remainingMs;
		} catch {
			return null; // offline or server restarting: try again later, never sign out on a network blip
		}
	}

	function schedule(remaining: number) {
		clearTimeout(timer);
		deadline = Date.now() + remaining;
		if (remaining <= 0) return expire();
		if (remaining <= WARN_MS) {
			warning = true;
			if (!announced) {
				announced = true;
				window.dispatchEvent(new CustomEvent('session-expiring', { detail: { remainingMs: remaining } }));
			}
			tick ??= setInterval(() => (now = Date.now()), 1000);
			timer = setTimeout(check, remaining + 500);
		} else {
			warning = false;
			announced = false;
			clearInterval(tick);
			tick = undefined;
			timer = setTimeout(check, Math.min(POLL_MS, remaining - WARN_MS));
		}
	}

	async function check() {
		const r = await status();
		if (r === null) {
			clearTimeout(timer);
			timer = setTimeout(check, 15_000);
			return;
		}
		schedule(r);
	}

	async function stay() {
		const r = await status('POST');
		if (r !== null) schedule(r);
	}

	onMount(() => {
		check();
		const onFocus = () => check();
		window.addEventListener('focus', onFocus);
		return () => {
			clearTimeout(timer);
			clearInterval(tick);
			window.removeEventListener('focus', onFocus);
		};
	});
	// A navigation is activity on the server; re-read the clock afterwards.
	afterNavigate(() => {
		if (deadline) check();
	});
</script>

{#if warning}
	<div class="session-warn">
		<!-- The alert is announced once; the per-second countdown is visual only, so it is not re-read every second. -->
		<p role="alert" class="visually-hidden">{t('shell.sessionWarnAnnounce')}</p>
		<p aria-hidden="true">
			<Msg key="shell.sessionWarnCountdown">
				{#snippet seconds()}<span class="num">{secondsLeft}</span>{/snippet}
			</Msg>
		</p>
		<button type="button" onclick={stay}>{t('shell.staySignedIn')}</button>
	</div>
{/if}

<style>
	.session-warn {
		position: fixed;
		left: 50%;
		bottom: var(--space-4);
		transform: translateX(-50%);
		z-index: 1000;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		max-width: calc(100vw - 2 * var(--space-4));
		padding: var(--space-3) var(--space-4);
		background: var(--surface-3);
		color: var(--text-1);
		border: 1px solid var(--warn);
		border-radius: var(--radius-2);
		box-shadow: var(--shadow-overlay);
	}
	p {
		margin: 0;
	}
	button {
		min-height: max(40px, var(--target-min));
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
		font-weight: var(--weight-semibold);
	}
	@media print {
		.session-warn {
			display: none;
		}
	}
</style>
