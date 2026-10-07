<script lang="ts">
	import { GRADES, SIZES, type QuickPick } from '#lib/exam/quickpicks.ts';
	import { rowLabel, sectionTitle, type SectionDef } from '#lib/exam/catalog.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import Msg from '#lib/i18n/Msg.svelte';
	import type { MessageKey } from '#lib/i18n/catalog.ts';
	import { roving } from './ui/roving.ts';
	import { tip } from './ui/tooltip.ts';
	import Abbr from './ui/Abbr.svelte';
	import { glossaryKey } from '#lib/i18n/glossary.ts';

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
	/** The starter "clear field" pick shows in the page language; a user's own pick keeps its name. */
	const shown = (p: QuickPick) => (p.mode === 'replace' && !p.text && p.label === 'clear field' ? t('exam.qpClearField') : p.label);
	/** Plain-language meaning of each grade chip (tooltip and accessible description). */
	const GRADE_TIP: Record<string, MessageKey> = {
		no: 'exam.qpGradeTipNo',
		trace: 'exam.qpGradeTipTrace',
		'+1': 'exam.qpGradeTip1',
		'+2': 'exam.qpGradeTip2',
		'+3': 'exam.qpGradeTip3'
	};
	/**
	 * A pick's label in pieces, abbreviations marked ("seb ker", "NLDO, acute", "2+ NS"): two-word
	 * glossary entries first, then single words; everything else stays plain text.
	 */
	function pieces(label: string): { text: string; abbr: boolean }[] {
		if (glossaryKey(label)) return [{ text: label, abbr: true }];
		const tokens = label.split(/(\s+|,\s*)/);
		const out: { text: string; abbr: boolean }[] = [];
		for (let i = 0; i < tokens.length; i++) {
			const two = i + 2 < tokens.length && /^\s+$/.test(tokens[i + 1]) ? `${tokens[i]} ${tokens[i + 2]}` : null;
			if (two && glossaryKey(two)) {
				out.push({ text: two, abbr: true });
				i += 2;
			} else out.push({ text: tokens[i], abbr: !!tokens[i].trim() && !!glossaryKey(tokens[i]) });
		}
		return out;
	}
	const EYES = [
		{ eye: 'OD', cls: 'od', key: 'exam.qpRightEye' },
		{ eye: 'OS', cls: 'os', key: 'exam.qpLeftEye' },
		{ eye: 'OU', cls: '', key: 'exam.qpBothEyes' }
	] as const satisfies readonly { eye: Eye; cls: string; key: MessageKey }[];
</script>

{#snippet chips(name: string, values: string[], tips?: Record<string, MessageKey>)}
	<div class="mods" role="group" aria-label={name}>
		<span class="mods-label" aria-hidden="true">{name}</span>
		{#each values as m (m)}
			<!-- dir=ltr: "+1" must not turn into "1+" in right-to-left languages. -->
			<button type="button" class="chip" aria-pressed={modifier === m} onclick={() => toggle(m)} use:tip={tips?.[m] ? t(tips[m]) : null}
				><bdi dir="ltr">{#if !tips?.[m] && glossaryKey(m)}<Abbr code={m} />{:else}{m}{/if}</bdi></button
			>
		{/each}
	</div>
{/snippet}

<section class="qp" aria-label={t('exam.qpFor', { section: sectionTitle(sec, t) })}>
	<div class="modbar">
		<!-- One Tab stop for every modifier: arrow keys move between chips (APG toolbar). -->
		<div class="toolbar" role="toolbar" aria-label={t('exam.qpModifiers')} use:roving={{ items: '.chip', key: sec.id }}>
			{@render chips(t('exam.qpGrade'), GRADES, GRADE_TIP)}
			{@render chips(t('exam.qpSize'), SIZES)}
			{@render chips(t('exam.qpLocation'), sec.locations)}
		</div>
		<p class="status" aria-live="polite">
			{#if modifier}<Msg key="exam.qpNextPick">{#snippet value()}<strong><bdi dir="ltr">{modifier}</bdi></strong>{/snippet}</Msg>{:else}{t('exam.qpPickModifier')}{/if}
		</p>
	</div>

	<!-- One Tab stop for the whole list (roving tabindex): Up/Down between findings, Left/Right
	     between OD / OS / OU, Home/End, typing the first letters of a finding jumps to it. -->
	<div
		class="list"
		role="group"
		aria-label={t('exam.qpFindings')}
		aria-describedby="qp-keys-{sec.id}"
		use:roving={{ items: 'button[data-row]', mode: 'grid', key: sec.id, label: (el) => el.dataset.label ?? '' }}
	>
		<p class="visually-hidden" id="qp-keys-{sec.id}">{t('exam.qpKeysHint')}</p>
		{#each groups as g (g.row.id)}
			<h3>{rowLabel(g.row, t)}</h3>
			<ul>
				{#each g.items as p (p.id)}
					<li>
						<span class="label" class:clear={p.mode === 'replace' && !p.text}
							>{#each pieces(shown(p)) as part, i (i)}{#if part.abbr}<Abbr code={part.text} />{:else}{part.text}{/if}{/each}</span
						>
						<span class="eyes eye-ltr">
							{#each EYES as e (e.eye)}
								<!-- The name starts with the visible text (WCAG 2.5.3): "OD, ptosis, right eye". -->
								<button
									type="button"
									class={e.cls}
									data-row={p.id}
									data-label={shown(p)}
									aria-label="{e.eye}, {t(e.key, { pick: shown(p) })}"
									onclick={() => pick(p, e.eye)}>{e.eye}</button
								>
							{/each}
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
	.toolbar {
		display: grid;
		gap: var(--space-1);
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
