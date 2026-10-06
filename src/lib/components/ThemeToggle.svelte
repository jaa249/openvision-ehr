<script lang="ts">
	import { onMount } from 'svelte';

	type Mode = 'light' | 'dark' | 'dim';
	const MODES: { id: Mode; label: string }[] = [
		{ id: 'light', label: 'Light' },
		{ id: 'dark', label: 'Dark' },
		{ id: 'dim', label: 'Dim room' }
	];

	let mode = $state<Mode>('light');

	onMount(() => {
		const attr = document.documentElement.getAttribute('data-theme');
		mode =
			attr === 'light' || attr === 'dark' || attr === 'dim'
				? attr
				: matchMedia('(prefers-color-scheme: dark)').matches
					? 'dark'
					: 'light';
	});

	export function setMode(next: Mode) {
		mode = next;
		document.documentElement.setAttribute('data-theme', next);
		try {
			localStorage.setItem('ov-theme', next);
		} catch {
			// private mode or blocked storage: the choice just won't persist
		}
	}
</script>

<div class="theme" role="group" aria-label="Color mode">
	{#each MODES as m (m.id)}
		<button type="button" aria-pressed={mode === m.id} onclick={() => setMode(m.id)}>{m.label}</button>
	{/each}
</div>

<style>
	.theme {
		display: inline-flex;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		overflow: hidden;
	}
	button {
		border: 0;
		border-radius: 0;
	}
	button[aria-pressed='true'] {
		background: var(--accent);
		color: var(--accent-text);
	}
</style>
