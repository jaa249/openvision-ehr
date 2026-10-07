<script lang="ts">
	// The shorthand bar (DESIGN §5.3): one text box for "rc:1+ inj; lk:tr spk.a; das", a live preview of
	// what Enter will do, and (D56) a WAI-ARIA 1.2 combobox: while a code or a finding is being typed, up
	// to 8 suggestions open above the box. Nothing is selected until Up/Down is pressed, so Enter with the
	// list open but untouched still saves, exactly as before.
	// Keys: Up/Down move, Enter or Tab accept the chosen one, Esc closes the list (a second Esc clears
	// the box), typing keeps filtering. Pointer: tap or click a suggestion.
	import { fieldLabel } from '#lib/exam/catalog.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import Msg from '#lib/i18n/Msg.svelte';
	import type { ParseResult } from '#lib/shorthand/parse.ts';
	import { ISSUE_TYPE_KEYS } from '#lib/history/lists.ts';
	import {
		CODE_ENTRIES,
		acceptInto,
		codeInsert,
		codesOf,
		loadRecent,
		rank,
		rememberCodes,
		shorthandContext,
		suggestCodes,
		termsFor,
		type CodeSuggestion,
		type PickLike,
		type TermSuggestion
	} from '#lib/shorthand/suggest.ts';
	import { describeCodePlain } from '#lib/shorthand/describe.ts';
	import { ariaKeys, openKeyboardHelp } from '#lib/exam/shortcuts.ts';
	import { keepInView } from './ui/place.ts';
	import { tip } from './ui/tooltip.ts';
	import { glossary } from '#lib/i18n/glossary.ts';

	let {
		text = $bindable(''),
		result,
		onsubmit,
		picks = [],
		defaults = {}
	}: {
		text: string;
		result: ParseResult;
		onsubmit: () => void;
		/** The user's quick picks (all zones): offered as findings after a code's colon. */
		picks?: readonly PickLike[];
		/** The user's normal values by field id: offered first after a code's colon. */
		defaults?: Record<string, string>;
	} = $props();

	let input = $state<HTMLInputElement | null>(null);
	export function focus() {
		input?.focus();
	}

	const { t } = useI18n();
	const LIMIT = 8;

	// Chips show what each entry will do; section ids, field values and typed text stay as they are.
	function label(op: ParseResult['ops'][number]): string {
		if (op.kind === 'defaults')
			return op.sections === 'all' ? t('exam.shNormalAll') : t('exam.shNormal', { sections: op.sections.join(', ') });
		if (op.kind === 'clear') return op.sections === 'all' ? t('exam.shClearAll') : t('exam.shClear', { sections: op.sections.join(', ') });
		if (op.kind === 'issue') return `${ISSUE_TYPE_KEYS[op.type] ? t(ISSUE_TYPE_KEYS[op.type].short) : op.type} + ${op.text}`;
		if (op.kind === 'setEach')
			return Object.entries(op.values)
				.map(([f, v]) => `${fieldLabel(f, t)} = ${v}`)
				.join(', ');
		const names = op.fields.map((f) => fieldLabel(f, t)).join(' + ');
		return `${names} ${op.append ? '+=' : '='} ${op.text || t('exam.shEmpty')}`;
	}

	// ---------- suggestions ----------
	let caret = $state(0);
	let focused = $state(false);
	let active = $state(-1);
	/** The text the list was closed for (Esc, or a suggestion just accepted): it stays shut until the text changes. */
	let dismissedFor = $state<string | null>(null);
	let recent = $state<string[]>(loadRecent());

	// Plain words per code, rebuilt when the language changes (t reads the current translator).
	const described = $derived(new Map(CODE_ENTRIES.map((e) => [e.code, describeCodePlain(e, t)])));
	const ctx = $derived(focused ? shorthandContext(text, caret) : null);

	type Item = { kind: 'code'; s: CodeSuggestion } | { kind: 'term'; s: TermSuggestion };
	const items = $derived.by((): Item[] => {
		if (!ctx) return [];
		if (ctx.mode === 'code')
			return suggestCodes(ctx.query, (e) => described.get(e.code) ?? e.code, { recent, limit: LIMIT }).map((s) => ({ kind: 'code', s }));
		const terms = termsFor(ctx.code, picks, defaults);
		const ranked = rank(
			// Abbreviated picks (BCC, PVD, NLDO…) show their plain name from the glossary, and match on it.
			terms.map((x) => {
				const plain = glossary(x.primary, t);
				const extra = plain && plain.toLocaleLowerCase() !== (x.secondary ?? x.text).toLocaleLowerCase() ? plain : null;
				return { ...x, secondary: [x.secondary, extra].filter(Boolean).join(' · ') || undefined };
			}),
			ctx.query,
			{ limit: LIMIT }
		);
		// The only match is exactly what is typed: nothing left to suggest.
		if (ranked.length === 1 && ranked[0].text.toLocaleLowerCase() === ctx.query.trim().toLocaleLowerCase()) return [];
		return ranked.map((s) => ({ kind: 'term', s }));
	});
	const open = $derived(items.length > 0 && dismissedFor !== text);

	// A new list starts with nothing chosen (so Enter still saves); keep the choice in range.
	$effect(() => {
		void items;
		active = -1;
	});
	$effect(() => {
		if (open && active >= 0) document.getElementById(optId(active))?.scrollIntoView({ block: 'nearest' });
	});

	const optId = (i: number) => `shorthand-opt-${i}`;

	function syncCaret() {
		caret = input?.selectionStart ?? text.length;
	}

	function accept(item: Item) {
		if (!ctx) return;
		const insert = item.kind === 'code' ? codeInsert(item.s.entry) : item.s.text;
		const next = acceptInto(text, ctx, insert);
		text = next.text;
		// A field code goes straight on to its findings; a finding or a command closes the list.
		dismissedFor = item.kind === 'code' && insert.endsWith(':') ? null : next.text;
		active = -1;
		queueMicrotask(() => {
			input?.focus();
			input?.setSelectionRange(next.caret, next.caret);
			caret = next.caret;
		});
	}

	function onkeydown(e: KeyboardEvent) {
		if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
			e.preventDefault();
			const n = items.length;
			active = e.key === 'ArrowDown' ? (active + 1) % n : active <= 0 ? n - 1 : active - 1;
			return;
		}
		if (open && active >= 0 && (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey))) {
			e.preventDefault();
			accept(items[active]);
			return;
		}
		if (e.key === 'Enter') {
			// Unchanged from before suggestions existed: Enter saves the whole box.
			e.preventDefault();
			recent = rememberCodes(codesOf(result.ops.map((op) => op.source)), recent);
			dismissedFor = null;
			onsubmit();
		} else if (e.key === 'Escape') {
			if (open) {
				e.preventDefault();
				dismissedFor = text;
				active = -1;
			} else text = '';
		}
	}
</script>

<div class="bar">
	<span class="lead">
		<label for="shorthand"><Msg key="exam.shLabel">{#snippet keys()}<kbd use:tip={{ text: t('keys.barTip'), describe: false }}>Alt K</kbd>{/snippet}</Msg></label>
		<button
			type="button"
			class="help"
			aria-label={t('keys.helpButton')}
			aria-keyshortcuts={ariaKeys('helpF1')}
			use:tip={{ text: t('keys.barTip') }}
			onclick={() => openKeyboardHelp()}><span aria-hidden="true">?</span></button
		>
	</span>
	<span class="field">
		<input
			id="shorthand"
			dir="ltr"
			bind:this={input}
			bind:value={text}
			{onkeydown}
			oninput={() => {
				syncCaret();
				dismissedFor = null;
			}}
			onkeyup={syncCaret}
			onclick={syncCaret}
			onselect={syncCaret}
			onfocus={() => {
				focused = true;
				syncCaret();
			}}
			onblur={() => (focused = false)}
			role="combobox"
			aria-autocomplete="list"
			aria-expanded={open}
			aria-controls="shorthand-list"
			aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
			aria-keyshortcuts={ariaKeys('shorthand')}
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			placeholder="rc:1+ inj; lk:tr spk.a; das"
			aria-describedby="shorthand-preview"
			aria-invalid={result.errors.length > 0}
		/>
		<!-- Opens upward (the bar sits at the bottom of the screen); keepInView flips or caps it to stay on screen. -->
		<ul id="shorthand-list" role="listbox" aria-label={t('keys.listLabel')} hidden={!open} use:keepInView={{ anchor: input, placement: 'top-start' }}>
			{#if open}
				{#each items as item, i (i)}
					<!-- Keyboard choice happens in the combobox (aria-activedescendant); a click or tap here is the pointer path. -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<li
						id={optId(i)}
						role="option"
						aria-selected={i === active}
						class:active={i === active}
						onpointerdown={(e) => e.preventDefault()}
						onclick={() => accept(item)}
					>
						{#if item.kind === 'code'}
							<span class="code" dir="ltr">{item.s.entry.code.toLowerCase()}</span>
							<span class="desc">{item.s.secondary}{#if item.s.fuzzy}<span class="tag"> · {t('keys.didYouMean')}</span>{/if}</span>
						{:else}
							<span class="term" dir="auto">{item.s.primary}</span>
							<span class="desc"
								>{#if item.s.normal}<span class="tag">{t('keys.yourNormal')}</span>{:else if item.s.secondary}<span dir="auto">{item.s.secondary}</span>{/if}</span
							>
						{/if}
					</li>
				{/each}
			{/if}
		</ul>
	</span>
	<p class="visually-hidden" role="status">{open ? t('keys.suggestions', { count: items.length }) : ''}</p>
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
	.lead {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
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
	.help {
		min-width: var(--target-min);
		min-height: var(--target-min);
		padding: 0;
		border-radius: var(--radius-pill);
		font-weight: var(--weight-semibold);
	}
	.field {
		flex: 1 1 320px;
		display: flex;
		min-width: 0;
	}
	input {
		flex: 1 1 auto;
		min-width: 0;
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
	/* Placed by keepInView (position: fixed; above the box, flips or caps its height when there is no room). */
	ul {
		position: fixed;
		z-index: 20;
		top: 0;
		left: 0;
		min-width: min(18rem, 90vw);
		max-width: 34rem;
		max-height: 20rem;
		overflow-y: auto;
		margin: 0;
		padding: var(--space-1) 0;
		list-style: none;
		background: var(--surface-3);
		color: var(--text-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		box-shadow: var(--shadow-overlay);
	}
	ul[hidden] {
		display: none;
	}
	li {
		display: grid;
		grid-template-columns: minmax(4.5em, auto) minmax(0, 1fr);
		gap: var(--space-3);
		align-items: baseline;
		padding: var(--space-1) var(--space-3);
		min-height: var(--target-min);
		cursor: pointer;
	}
	li:hover {
		background: var(--surface-2);
	}
	li.active {
		background: var(--accent-soft);
		box-shadow: inset 3px 0 0 var(--accent);
	}
	:global([dir='rtl']) li.active {
		box-shadow: inset -3px 0 0 var(--accent);
	}
	.code {
		font-family: var(--font-mono);
		font-weight: var(--weight-semibold);
	}
	.term {
		font-weight: var(--weight-semibold);
	}
	.desc {
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.tag {
		color: var(--text-2);
		font-style: italic;
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
