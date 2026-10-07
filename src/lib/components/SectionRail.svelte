<script lang="ts">
	import { SECTIONS, FIELDS, sectionLabel, type Section, type SectionId } from '#lib/exam/catalog.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { Findings } from '#lib/shorthand/parse.ts';

	let {
		sections = SECTIONS,
		current,
		findings,
		onselect
	}: { sections?: Section[]; current: SectionId; findings: Findings; onselect: (id: SectionId) => void } = $props();

	function state(id: SectionId): 'empty' | 'started' {
		return FIELDS.some((f) => f.section === id && findings[f.id]?.value) ? 'started' : 'empty';
	}
	const { t } = useI18n();
</script>

<nav class="rail" aria-label={t('exam.railLabel')}>
	{#each sections as s (s.id)}
		<button
			type="button"
			aria-current={current === s.id ? 'true' : undefined}
			aria-keyshortcuts={s.key}
			class:unavailable={!s.available}
			onclick={() => onselect(s.id)}
		>
			<span class="key">{s.key}</span>
			<span class="label">{sectionLabel(s.id, t)}</span>
			{#if s.available}
				<span class="dot" data-state={state(s.id)}><span class="visually-hidden">{state(s.id) === 'started' ? t('exam.railStarted') : t('exam.railEmpty')}</span></span>
			{/if}
		</button>
	{/each}
</nav>

<style>
	.rail {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-2);
		background: var(--surface-1);
		border-right: 1px solid var(--hairline);
		overflow: auto;
	}
	button {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		border: 0;
		background: transparent;
		color: var(--text-2);
		text-align: left;
		padding: 0 var(--space-2);
	}
	button:hover {
		background: var(--surface-2);
	}
	button[aria-current='true'] {
		background: var(--accent-soft);
		color: var(--text-1);
		font-weight: var(--weight-semibold);
	}
	.unavailable .label {
		color: var(--text-3);
	}
	.key {
		font: var(--text-xs) / 1 var(--font-mono);
		color: var(--text-3);
		width: 1.2em;
	}
	.label {
		flex: 1;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		border: 1px solid var(--text-3);
	}
	.dot[data-state='started'] {
		background: var(--ok);
		border-color: var(--ok);
	}
	@media (max-width: 900px) {
		.rail {
			flex-direction: row;
			border-right: 0;
			border-bottom: 1px solid var(--hairline);
		}
		button {
			white-space: nowrap;
		}
	}
</style>
