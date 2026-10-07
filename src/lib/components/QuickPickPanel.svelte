<script lang="ts">
	import { GRADES, SIZES, type QuickPick } from '#lib/exam/quickpicks.ts';
	import { rowLabel, sectionTitle, type SectionDef } from '#lib/exam/catalog.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import Msg from '#lib/i18n/Msg.svelte';

	type Eye = 'OD' | 'OS' | 'OU';
	let {
		sec,
		picks,
		onpick
	}: {
		sec: SectionDef;
		picks: QuickPick[];
		onpick: (pick: QuickPick, eye: Eye, modifier: string | null) => void;
	} = $props();

	const { t } = useI18n();
	// One modifier at a time; it applies to the next pick only (spec §4.2).
	let modifier = $state<string | null>(null);

	const groups = $derived(
		sec.rows
			.map((row) => ({ row, items: picks.filter((p) => p.row === row.id) }))
			.filter((g) => g.items.length > 0)
	);

	function pick(p: QuickPick, eye: Eye) {
		onpick(p, eye, modifier);
		modifier = null;
	}
	function toggle(m: string) {
		modifier = modifier === m ? null : m;
	}
</script>

{#snippet chips(name: string, values: string[])}
	<div class="mods" role="group" aria-label={name}>
		<span class="mods-label">{name}</span>
		{#each values as m (m)}
			<button type="button" class="chip" aria-pressed={modifier === m} onclick={() => toggle(m)}>{m}</button>
		{/each}
	</div>
{/snippet}

<section class="qp" aria-label={t('exam.qpFor', { section: sectionTitle(sec, t) })}>
	<div class="modbar">
		{@render chips(t('exam.qpGrade'), GRADES)}
		{@render chips(t('exam.qpSize'), SIZES)}
		{@render chips(t('exam.qpLocation'), sec.locations)}
		<p class="status" aria-live="polite">
			{#if modifier}<Msg key="exam.qpNextPick">{#snippet value()}<strong>{modifier}</strong>{/snippet}</Msg>{:else}{t('exam.qpPickModifier')}{/if}
		</p>
	</div>

	<div class="list">
		{#each groups as g (g.row.id)}
			<h3>{rowLabel(g.row, t)}</h3>
			<ul>
				{#each g.items as p (p.id)}
					<li>
						<span class="label" class:clear={p.mode === 'replace' && !p.text}>{p.label}</span>
						<span class="eyes eye-ltr">
							<button type="button" class="od" aria-label={t('exam.qpRightEye', { pick: p.label })} onclick={() => pick(p, 'OD')}>OD</button>
							<button type="button" class="os" aria-label={t('exam.qpLeftEye', { pick: p.label })} onclick={() => pick(p, 'OS')}>OS</button>
							<button type="button" aria-label={t('exam.qpBothEyes', { pick: p.label })} onclick={() => pick(p, 'OU')}>OU</button>
						</span>
					</li>
				{/each}
			</ul>
		{/each}
	</div>
</section>

<style>
	.qp {
		display: grid;
		grid-template-rows: auto 1fr;
		min-height: 0;
		height: 100%;
	}
	.modbar {
		display: grid;
		gap: var(--space-1);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--hairline);
	}
	.mods {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		align-items: center;
	}
	.mods-label {
		font-size: var(--text-xs);
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		width: 5.5em;
	}
	.chip {
		font-size: var(--text-xs);
		min-height: 28px;
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
	}
	.chip[aria-pressed='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}
	.status {
		margin: var(--space-1) 0 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.list {
		overflow: auto;
		padding-top: var(--space-2);
	}
	h3 {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin: var(--space-3) 0 var(--space-1);
	}
	h3:first-child {
		margin-top: 0;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		min-height: 36px;
		border-bottom: 1px solid var(--hairline);
	}
	.label.clear {
		color: var(--text-3);
		font-style: italic;
	}
	.eyes {
		display: inline-flex;
		gap: 2px;
		flex-shrink: 0;
	}
	.eyes button {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		min-height: 30px;
		min-width: 38px;
		padding: 0 6px;
	}
	.eyes .od {
		color: var(--od);
	}
	.eyes .os {
		color: var(--os);
	}
	@media (pointer: coarse) {
		li {
			min-height: var(--target-min);
		}
		.eyes button,
		.chip {
			min-height: var(--target-min);
			min-width: var(--target-min);
		}
	}
</style>
