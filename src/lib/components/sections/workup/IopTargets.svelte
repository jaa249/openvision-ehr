<script module lang="ts">
	import { DEFAULT_IOP_TARGET, iopHigh, iopNumber, type ResolvedTarget, type TargetEye } from '#lib/exam/sections/glaucoma.ts';
	import type { Findings } from '#lib/shorthand/parse.ts';

	export type Fallback = Record<TargetEye, ResolvedTarget>;

	/** The target in force for one eye: the exam's own number, else the fallback chain, else 21 (§8.3). */
	export function effectiveTarget(eye: TargetEye, findings: Findings, fallback: Fallback | null): number {
		return iopNumber(findings[`${eye}IOPTARGET`]?.value) ?? fallback?.[eye].value ?? DEFAULT_IOP_TARGET;
	}

	/**
	 * Text for the non-colour "high" cue next to an IOP box (§16.4 FIX: colour is never the only cue).
	 * '' when the reading is not above the target.
	 */
	export function highLabel(value: string | undefined, target: number): string {
		return iopHigh(value, String(target)) ? `Above target ${target}` : '';
	}
</script>

<script lang="ts">
	// IOP targets per eye (spec §8.3 with FIXes). Free numeric entry, no default value, and the boxes are
	// never coloured. When a box is empty the placeholder shows the target that applies instead and
	// where it comes from (latest prior visit, the provider's default, or 21).
	// Mount (PressurePanel, IOP card):
	//   <IopTargets {context} {findings} {preview} {copied} {onedit} bind:effective={targets} />
	// then flag a reading with iopHigh(value, String(targets.OD)) plus highLabel() as the text cue.
	import { cellState } from './cell.ts';
	import Msg from '#lib/i18n/Msg.svelte';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { MessageKey } from '#lib/i18n/catalog.ts';

	let {
		context,
		findings,
		preview = null,
		copied = new Set<string>(),
		onedit,
		effective = $bindable({ OD: DEFAULT_IOP_TARGET, OS: DEFAULT_IOP_TARGET }),
		fallbackOverride = undefined,
		compact = false
	}: {
		context: { patientId: number; encounterId: number };
		findings: Findings;
		preview?: Findings | null;
		copied?: Set<string>;
		onedit: (field: string, value: string) => void;
		/** Out: the target in force per eye (for the "high" checks beside the readings). */
		effective?: Record<TargetEye, number>;
		/** Supply the fallback chain instead of fetching it (the flow sheet already has it). */
		fallbackOverride?: Fallback;
		/** Inline layout for tight spaces. */
		compact?: boolean;
	} = $props();

	const uid = $props.id();
	const { t } = useI18n();
	let fetched = $state<Fallback | null>(null);
	const fallback = $derived(fallbackOverride ?? fetched);

	$effect(() => {
		if (fallbackOverride) return;
		const ctrl = new AbortController();
		fetch(`/patients/${context.patientId}/flowsheet/targets?encounter=${context.encounterId}`, { signal: ctrl.signal })
			.then((r) => (r.ok ? r.json() : null))
			.then((j: { fallback: Fallback } | null) => {
				if (j) fetched = j.fallback;
			})
			.catch(() => {});
		return () => ctrl.abort();
	});

	$effect(() => {
		const next = { OD: effectiveTarget('OD', findings, fallback), OS: effectiveTarget('OS', findings, fallback) };
		if (next.OD !== effective.OD || next.OS !== effective.OS) effective = next;
	});

	const SOURCE: Record<ResolvedTarget['source'], MessageKey> = {
		exam: 'sections.tgtSourceExam',
		prior: 'sections.tgtSourcePrior',
		provider: 'sections.tgtSourceProvider',
		default: 'sections.tgtSourceDefault'
	};
	function note(eye: TargetEye): string {
		const own = iopNumber(findings[`${eye}IOPTARGET`]?.value);
		if (own !== null) return t('sections.tgtSetHere');
		const f = fallback?.[eye];
		if (!f) return t('sections.tgtUntilSet', { value: DEFAULT_IOP_TARGET });
		return f.source === 'prior'
			? t('sections.tgtUsingFrom', { value: f.value, from: f.from ?? '' })
			: t('sections.tgtUsingSource', { value: f.value, source: t(SOURCE[f.source]) });
	}
</script>

<div class="targets eye-ltr" class:compact role="group" aria-labelledby="{uid}-h" aria-describedby="{uid}-help">
	<span class="title page-dir" id="{uid}-h">{t('sections.tgtTitle')} <span class="unit">mmHg</span></span>
	{#each ['OD', 'OS'] as const as eye (eye)}
		{@const id = `${eye}IOPTARGET`}
		{@const c = cellState(id, findings, preview, copied)}
		{@const noteId = `${uid}-note-${eye}`}
		<label class="eye-field" data-field={id}>
			<span class="eye {eye.toLowerCase()}">{eye}</span>
			<input
				class="num"
				class:ghost={c.ghost}
				class:copied={c.copied}
				value={c.value}
				inputmode="decimal"
				maxlength="10"
				autocomplete="off"
				placeholder={String(fallback?.[eye].value ?? DEFAULT_IOP_TARGET)}
				aria-label={t('sections.tgtEyeLabel', { eye })}
				aria-describedby={noteId}
				oninput={(e) => onedit(id, e.currentTarget.value.trim())}
			/>
			<span class="note page-dir" id={noteId}>{note(eye)}</span>
		</label>
	{/each}
	<p class="help" id="{uid}-help">
		<Msg key="sections.tgtHelp">{#snippet codes()}<code>TGT:15</code>, <code>RTGT</code>, <code>LTGT</code>{/snippet}</Msg>
	</p>
</div>

<style>
	.targets {
		display: grid;
		grid-template-columns: 1fr 1fr;
		align-items: start;
		gap: var(--space-1) var(--space-3);
	}
	.targets.compact {
		grid-template-columns: auto auto auto;
	}
	.title {
		grid-column: 1 / -1;
		font-weight: var(--weight-semibold);
		color: var(--text-2);
	}
	.compact .title {
		grid-column: auto;
		align-self: center;
	}
	.unit {
		font-weight: var(--weight-regular);
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.eye-field {
		display: grid;
		grid-template-columns: auto minmax(3.5em, 5em);
		align-items: center;
		gap: 2px var(--space-1);
	}
	.eye {
		display: inline-flex;
		padding: 1px 6px;
		border-radius: var(--radius-1);
		font-weight: var(--weight-semibold);
	}
	.eye.od {
		color: var(--od);
		background: var(--od-soft);
	}
	.eye.os {
		color: var(--os);
		background: var(--os-soft);
	}
	input {
		width: 100%;
		font: inherit;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		padding: 4px var(--space-2);
		min-height: max(40px, var(--target-min));
	}
	input::placeholder {
		color: var(--text-3);
	}
	input:focus {
		border-color: var(--accent);
		outline: none;
		box-shadow: 0 0 0 1px var(--focus-ring);
	}
	/* Shorthand preview and copy-forward tints only: a target box is never coloured as high/low. */
	input.ghost {
		color: var(--accent);
		font-style: italic;
	}
	input.copied {
		background: var(--copied-tint);
	}
	.note {
		grid-column: 1 / -1;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.help {
		grid-column: 1 / -1;
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.help code {
		font-family: var(--font-mono);
	}
</style>
