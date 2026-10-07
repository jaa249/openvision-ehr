<script lang="ts">
	import { fieldLabel } from '#lib/exam/catalog.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import Msg from '#lib/i18n/Msg.svelte';
	import type { ParseResult } from '#lib/shorthand/parse.ts';
	import { ISSUE_TYPE_DEF } from '#lib/history/lists.ts';

	let {
		text = $bindable(''),
		result,
		onsubmit
	}: { text: string; result: ParseResult; onsubmit: () => void } = $props();

	let input: HTMLInputElement;
	export function focus() {
		input.focus();
	}

	const { t } = useI18n();

	// Chips show what each entry will do; section ids, field values and typed text stay as they are.
	function label(op: ParseResult['ops'][number]): string {
		if (op.kind === 'defaults')
			return op.sections === 'all' ? t('exam.shNormalAll') : t('exam.shNormal', { sections: op.sections.join(', ') });
		if (op.kind === 'clear') return op.sections === 'all' ? t('exam.shClearAll') : t('exam.shClear', { sections: op.sections.join(', ') });
		if (op.kind === 'issue') return `${ISSUE_TYPE_DEF.get(op.type)?.short ?? op.type} + ${op.text}`;
		if (op.kind === 'setEach')
			return Object.entries(op.values)
				.map(([f, v]) => `${fieldLabel(f, t)} = ${v}`)
				.join(', ');
		const names = op.fields.map((f) => fieldLabel(f, t)).join(' + ');
		return `${names} ${op.append ? '+=' : '='} ${op.text || t('exam.shEmpty')}`;
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			onsubmit();
		} else if (e.key === 'Escape') {
			text = '';
		}
	}
</script>

<div class="bar">
	<label for="shorthand"><Msg key="exam.shLabel">{#snippet keys()}<kbd>Alt K</kbd>{/snippet}</Msg></label>
	<input
		id="shorthand"
		bind:this={input}
		bind:value={text}
		{onkeydown}
		autocomplete="off"
		autocapitalize="off"
		spellcheck="false"
		placeholder="rc:1+ inj; lk:tr spk.a; das"
		aria-describedby="shorthand-preview"
		aria-invalid={result.errors.length > 0}
	/>
	<div class="preview" id="shorthand-preview" aria-live="polite">
		{#each result.ops as op, i (i)}
			<span class="chip">{label(op)}</span>
		{/each}
		{#each result.errors as err, i (i)}
			<span class="chip err">{err.message}</span>
		{/each}
		{#if text && !result.ops.length && !result.errors.length}
			<span class="hint">{t('exam.shHint')}</span>
		{/if}
	</div>
</div>

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-4);
		background: var(--surface-1);
		border-top: 1px solid var(--hairline);
		flex-wrap: wrap;
	}
	label {
		font-size: var(--text-xs);
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		display: inline-flex;
		gap: var(--space-2);
		align-items: center;
	}
	input {
		flex: 1 1 320px;
		min-height: var(--target-min);
		font: var(--text-sm) var(--font-mono);
		color: var(--text-1);
		background: var(--surface-0);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		padding: 0 var(--space-3);
	}
	input[aria-invalid='true'] {
		border-color: var(--danger);
	}
	.preview {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		flex: 1 1 280px;
		min-height: 1.5em;
	}
	.chip {
		font-size: var(--text-xs);
		padding: 2px 8px;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		border: 1px solid var(--hairline);
	}
	.chip.err {
		color: var(--danger);
		border-color: var(--danger);
	}
	.hint {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
</style>
