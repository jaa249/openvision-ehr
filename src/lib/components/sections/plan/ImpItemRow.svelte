<script lang="ts">
	// One impression item (spec §10.4): number, editable title, codes via the code finder, plan, move and delete.
	// The parent owns the item, its autosave and drag-and-drop; this renders the controls.
	import { tick } from 'svelte';
	import CodeFinder from '#lib/components/CodeFinder.svelte';
	import { CODE_SETS, splitCodeText, type CodeSetId, type DxCode } from '#lib/codesets/index.ts';
	import type { ImpItem } from '#lib/plan/types.ts';

	let {
		item,
		codeSet = 'icd10cm',
		index,
		count,
		error,
		duplicate,
		onedit,
		oncodes,
		onmove,
		ondelete,
		onkeep,
		ondraghandle
	}: {
		item: ImpItem;
		/** The practice's current code set (the finder searches it); the item shows its own. */
		codeSet?: CodeSetId;
		index: number;
		count: number;
		/** Last save error for this item (text is kept). */
		error: string;
		/** The save was refused as a duplicate: offer "Keep anyway". */
		duplicate: boolean;
		onedit: (field: 'title' | 'plan', value: string) => void;
		oncodes: (codes: string) => void;
		onmove: (delta: number) => void;
		ondelete: () => void;
		onkeep: () => void;
		ondraghandle: (e: DragEvent) => void;
	} = $props();

	const prefix = $derived(`imp-${item.id}`);
	const codes = $derived(item.codes ? item.codes.split(/,\s*/) : []);
	/** Descriptions from the code text ("ICD10:CODE (description); ..." or ICD11), keyed by code. */
	const descriptions = $derived(new Map(splitCodeText(item.codeText).map((c) => [c.code, c.description])));
	/** An item keeps the code set it was saved with (D44); say so when it differs from the practice's. */
	const otherSet = $derived(!!item.codes && (item.codeSystem ?? 'icd10cm') !== codeSet);

	let finding = $state(false);
	let codeButton: HTMLButtonElement | null = $state(null);

	async function closeFinder() {
		finding = false;
		await tick();
		codeButton?.focus();
	}
	function pick(c: DxCode) {
		if (!codes.includes(c.code)) oncodes([...codes, c.code].join(', '));
		closeFinder();
	}
	function removeCode(code: string) {
		oncodes(codes.filter((c) => c !== code).join(', '));
		tick().then(() => codeButton?.focus());
	}
	const KIND_LABEL = { free: 'Typed', finding: 'From exam findings', issue: 'From past history' } as const;
</script>

<div class="item" class:has-error={!!error}>
	<div class="row1">
		<button
			type="button"
			class="handle"
			draggable="true"
			ondragstart={ondraghandle}
			aria-label="Drag to reorder item {index + 1}. Use the Move buttons with a keyboard."
			tabindex="-1"
		>
			<span aria-hidden="true">⋮⋮</span>
		</button>
		<span class="num" aria-hidden="true">{index + 1}.</span>
		<label class="visually-hidden" for="{prefix}-title">Item {index + 1} title</label>
		<input
			id="{prefix}-title"
			class="title"
			value={item.title}
			maxlength="200"
			autocomplete="off"
			oninput={(e) => onedit('title', e.currentTarget.value)}
		/>
		<div class="moves">
			<button type="button" class="icon" onclick={() => onmove(-1)} disabled={index === 0} aria-label="Move item {index + 1} up">↑</button>
			<button type="button" class="icon" onclick={() => onmove(1)} disabled={index === count - 1} aria-label="Move item {index + 1} down">↓</button>
			<button type="button" class="icon danger" onclick={ondelete} aria-label="Delete item {index + 1}, {item.title}">✕</button>
		</div>
	</div>

	<div class="codes" role="group" aria-label="Codes for item {index + 1}">
		{#each codes as c (c)}
			<span class="chip">
				<span class="mono">{c}</span>
				{#if descriptions.get(c)}<span class="cdesc">{descriptions.get(c)}</span>{/if}
				<button type="button" class="chip-x" onclick={() => removeCode(c)} aria-label="Remove code {c}">✕</button>
			</span>
		{/each}
		{#if finding}
			<div class="finder"><CodeFinder id="{prefix}-finder" label="Find a diagnosis code for item {index + 1}" onpick={pick} oncancel={closeFinder} /></div>
		{:else}
			<button type="button" class="add-code" bind:this={codeButton} onclick={() => (finding = true)}>
				{codes.length ? '+ Add code' : 'Code'}<span class="visually-hidden"> for item {index + 1}</span>
			</button>
		{/if}
	</div>

	<label class="visually-hidden" for="{prefix}-plan">Item {index + 1} plan</label>
	<textarea
		id="{prefix}-plan"
		rows="2"
		value={item.plan}
		maxlength="4000"
		placeholder="Plan"
		oninput={(e) => onedit('plan', e.currentTarget.value)}
	></textarea>

	<p class="meta">
		{#if otherSet}Coded with {CODE_SETS[item.codeSystem].short}. {/if}{KIND_LABEL[item.kind]}{#if item.kind === 'issue'}: renaming here changes this visit only; the past-history entry keeps its name.{/if}
	</p>
	{#if error}
		<p class="error" role="alert">
			{error}
			{#if duplicate}<button type="button" onclick={onkeep}>Keep both</button>{/if}
		</p>
	{/if}
</div>

<style>
	.item {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}
	.row1 {
		display: grid;
		grid-template-columns: auto auto minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-1);
	}
	.handle {
		cursor: grab;
		min-width: 28px;
		min-height: 40px;
		padding: 0;
		border-color: transparent;
		background: transparent;
		color: var(--text-3);
		letter-spacing: -3px;
	}
	.num {
		font-weight: var(--weight-semibold);
		font-variant-numeric: tabular-nums;
		min-width: 1.6em;
		text-align: right;
	}
	input,
	textarea {
		font: inherit;
		color: var(--text-1);
		background: transparent;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		padding: 4px var(--space-2);
		min-height: max(var(--target-min), 40px);
		width: 100%;
		min-width: 0;
	}
	.title {
		font-weight: var(--weight-semibold);
	}
	textarea {
		resize: vertical;
	}
	input:focus,
	textarea:focus {
		border-color: var(--accent);
		background: var(--surface-1);
		outline: none;
		box-shadow: 0 0 0 1px var(--focus-ring);
	}
	textarea::placeholder {
		color: var(--text-3);
	}
	.moves {
		display: flex;
		gap: 2px;
	}
	.icon {
		min-width: 40px;
		min-height: 40px;
		padding: 0;
	}
	.danger {
		color: var(--danger);
	}
	.codes {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		max-width: 100%;
		padding-left: var(--space-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		min-height: 40px;
	}
	.mono {
		font-family: var(--font-mono);
		font-weight: var(--weight-semibold);
	}
	.cdesc {
		color: var(--text-2);
		font-size: var(--text-xs);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 28ch;
	}
	.chip-x {
		min-width: 40px;
		min-height: 38px;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--text-3);
		padding: 0;
	}
	.add-code {
		min-height: 40px;
		border-style: dashed;
		color: var(--accent);
	}
	.finder {
		flex: 1 1 100%;
		min-width: 0;
	}
	.meta {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.error {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		color: var(--danger);
		font-size: var(--text-xs);
	}
	.error button {
		min-height: 40px;
	}
</style>
