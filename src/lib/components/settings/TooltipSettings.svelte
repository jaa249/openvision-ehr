<script lang="ts">
	// My settings: "Show tooltips" switch and "Show the tour again". Both save at once (per-user
	// prefs, no Save button needed); the switch takes effect on this page immediately.
	import { onMount } from 'svelte';
	import { loadPrefs, savePref } from '#lib/prefs/client.ts';
	import { setTooltipsEnabled } from '#lib/components/ui/tooltip.ts';
	import { useI18n } from '#lib/i18n/context.ts';

	const { t } = useI18n();
	let on = $state(true);
	let ready = $state(false);
	let tourStatus = $state('');

	onMount(async () => {
		on = (await loadPrefs()).tooltips;
		ready = true;
	});

	function toggle() {
		if (!ready) return;
		on = !on;
		setTooltipsEnabled(on);
		void savePref('tooltips', on);
	}

	async function tourAgain() {
		await savePref('tourSeen', false);
		tourStatus = t('tips.tourAgainDone');
	}
</script>

<fieldset class="tips">
	<legend>{t('tips.settingsLegend')}</legend>
	<div class="row">
		<button type="button" role="switch" class="switch" aria-checked={on} aria-describedby="tooltips-hint" onclick={toggle}>
			<span class="track" aria-hidden="true"><span class="thumb"></span></span>
			{t('tips.showTooltips')}
		</button>
	</div>
	<p class="hint" id="tooltips-hint">{t('tips.showTooltipsHelp')}</p>
	<div class="row">
		<button type="button" onclick={tourAgain}>{t('tips.tourAgain')}</button>
		<p class="saved" role="status">{tourStatus}</p>
	</div>
</fieldset>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.switch {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		border: 0;
		background: none;
		padding: 0;
		min-height: var(--target-min, 24px);
		color: var(--text-1);
		font: inherit;
	}
	.track {
		position: relative;
		width: 36px;
		height: 20px;
		border-radius: 999px;
		background: var(--surface-2);
		border: 1px solid var(--text-3);
		flex: none;
		transition: background var(--dur-small-in, 150ms) var(--ease-standard, ease);
	}
	.thumb {
		position: absolute;
		top: 2px;
		inset-inline-start: 2px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--text-2);
		transition: inset-inline-start var(--dur-small-in, 150ms) var(--ease-standard, ease);
	}
	.switch[aria-checked='true'] .track {
		background: var(--accent);
		border-color: var(--accent);
	}
	.switch[aria-checked='true'] .thumb {
		inset-inline-start: 18px;
		background: var(--accent-text, #fff);
	}
	.switch:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
		border-radius: var(--radius-1);
	}
	@media (forced-colors: active) {
		.track {
			border-color: CanvasText;
		}
		.switch[aria-checked='true'] .track {
			background: Highlight;
		}
	}
	.saved {
		margin: 0;
		color: var(--ok);
	}
</style>
