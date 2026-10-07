<script lang="ts">
	import { onMount } from 'svelte';
	import { useI18n } from '#lib/i18n/context.ts';
	import { tip } from './ui/tooltip.ts';
	import { roving } from './ui/roving.ts';
	import { BEFORE_DIM_STORAGE_KEY, THEME_STORAGE_KEY, isDimRoomKey, isThemeMode, isTypingTarget, toggleDim, type ThemeMode } from './theme.ts';

	type Mode = ThemeMode;
	const { t } = useI18n();
	const MODES = $derived<{ id: Mode; label: string }[]>([
		{ id: 'light', label: t('shell.themeLight') },
		{ id: 'dark', label: t('shell.themeDark') },
		{ id: 'dim', label: t('shell.themeDim') }
	]);

	let mode = $state<Mode>('light');
	/** Said by screen readers after Shift+D (the buttons' pressed state says it for clicks). */
	let announce = $state('');
	let announceTimer: ReturnType<typeof setTimeout> | undefined;

	onMount(() => {
		const attr = document.documentElement.getAttribute('data-theme');
		mode = isThemeMode(attr) ? attr : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		return () => clearTimeout(announceTimer);
	});

	export function setMode(next: Mode) {
		if (next === 'dim' && mode !== 'dim') remember(BEFORE_DIM_STORAGE_KEY, mode);
		mode = next;
		document.documentElement.setAttribute('data-theme', next);
		remember(THEME_STORAGE_KEY, next);
	}

	function remember(key: string, value: string) {
		try {
			localStorage.setItem(key, value);
		} catch {
			// private mode or blocked storage: the choice just won't persist
		}
	}
	function recall(key: string): string | null {
		try {
			return localStorage.getItem(key);
		} catch {
			return null;
		}
	}

	// Shift+D (DESIGN §3.1): dim room on / off, from anywhere on the page except while typing.
	function onkeydown(e: KeyboardEvent) {
		if (e.defaultPrevented || !isDimRoomKey(e, isTypingTarget(e.target))) return;
		e.preventDefault(); // also tells a second toggle on the page that this key press is taken
		const next = toggleDim(mode, recall(BEFORE_DIM_STORAGE_KEY));
		setMode(next);
		clearTimeout(announceTimer);
		announce = next === 'dim' ? t('shell.dimRoomOn') : t('shell.dimRoomOff');
		announceTimer = setTimeout(() => (announce = ''), 4000);
	}
</script>

<svelte:window {onkeydown} />

<!-- One Tab stop; arrow keys move between the three modes (APG toolbar). -->
<div class="theme" role="toolbar" aria-label={t('shell.colorMode')} use:roving={{ items: 'button', typeahead: false }}>
	{#each MODES as m (m.id)}
		<button
			type="button"
			aria-pressed={mode === m.id}
			aria-keyshortcuts={m.id === 'dim' ? 'Shift+D' : undefined}
			use:tip={{ text: t(m.id === 'dim' ? 'tips.themeDim' : m.id === 'dark' ? 'tips.themeDark' : 'tips.themeLight'), placement: 'bottom' }}
			onclick={() => setMode(m.id)}
		>{m.label}</button>
	{/each}
	<span class="visually-hidden" role="status" aria-live="polite">{announce}</span>
</div>

<style>
	.theme {
		display: inline-flex;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		overflow: hidden;
		position: relative;
	}
	button {
		border: 0;
		border-radius: 0;
	}
	button[aria-pressed='true'] {
		background: var(--accent);
		color: var(--accent-text);
	}
	@media (forced-colors: active) {
		button[aria-pressed='true'] {
			background: Highlight;
			color: HighlightText;
			forced-color-adjust: none;
		}
	}
</style>
