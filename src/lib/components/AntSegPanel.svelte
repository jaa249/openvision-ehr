<script lang="ts">
	import { ANTSEG_ROWS, fieldId, type Row } from '#lib/exam/catalog.ts';
	import type { Findings } from '#lib/shorthand/parse.ts';

	type Side = 'OD' | 'OS' | 'OU';
	let {
		findings,
		preview,
		onedit,
		ondefaults,
		oncopy,
		onclear
	}: {
		findings: Findings;
		/** Values the shorthand bar would write, shown as a ghost until committed. */
		preview: Findings | null;
		onedit: (field: string, value: string) => void;
		ondefaults: (side: Side) => void;
		oncopy: (from: 'OD' | 'OS') => void;
		onclear: (side: 'OD' | 'OS') => void;
	} = $props();

	const comments = $derived(cell('ANTSEG_COMMENTS'));
	const textRows = ANTSEG_ROWS.filter((r) => !r.measure);
	const measureRows = ANTSEG_ROWS.filter((r) => r.measure);

	function cell(id: string) {
		const ghost = preview?.[id];
		const real = findings[id];
		return {
			value: ghost?.value ?? real?.value ?? '',
			ghost: !!ghost,
			isDefault: !ghost && !!real?.isDefault
		};
	}
</script>

{#snippet eyeHead(eye: 'OD' | 'OS')}
	<th scope="col" class="eyecol">
		<span class="eye {eye.toLowerCase()}">{eye} ({eye === 'OD' ? 'R' : 'L'})</span>
		<span class="side-actions">
			<button type="button" class="mini" onclick={() => ondefaults(eye)}>Normal</button>
			<button type="button" class="mini" onclick={() => onclear(eye)}>Clear</button>
		</span>
	</th>
{/snippet}

{#snippet field(row: Row, eye: 'OD' | 'OS')}
	{@const id = fieldId(eye, row.id)}
	{@const c = cell(id)}
	<td class="cell" class:ghost={c.ghost} class:is-default={c.isDefault} data-field={id}>
		{#if row.measure}
			<span class="measure">
				<input
					class="num"
					value={c.value}
					inputmode={row.id === 'GONIO' ? 'text' : 'decimal'}
					aria-label="{row.label} {eye}"
					maxlength="25"
					placeholder="–"
					oninput={(e) => onedit(id, e.currentTarget.value)}
				/>
				<span class="unit">{row.measure}</span>
			</span>
		{:else}
			<textarea
				rows="1"
				placeholder="–"
				value={c.value}
				aria-label="{row.label} {eye}{c.isDefault ? ' (default)' : ''}"
				oninput={(e) => onedit(id, e.currentTarget.value)}
			></textarea>
		{/if}
	</td>
{/snippet}

<section aria-labelledby="antseg-title">
	<div class="head">
		<h2 id="antseg-title">Anterior segment (slit lamp)</h2>
		<button type="button" onclick={() => ondefaults('OU')}>Normal OU</button>
		<button type="button" onclick={() => oncopy('OD')} aria-label="Copy right eye to left eye">OD → OS</button>
		<button type="button" onclick={() => oncopy('OS')} aria-label="Copy left eye to right eye">OS → OD</button>
	</div>

	<div class="panel">
		<table>
			<thead>
				<tr>
					<th scope="col" class="rowhead"><span class="visually-hidden">Finding</span></th>
					{@render eyeHead('OD')}
					{@render eyeHead('OS')}
				</tr>
			</thead>
			<tbody>
				{#each textRows as row (row.id)}
					<tr>
						<th scope="row">
							{row.label}
							<abbr class="code" title="Shorthand: R{row.code} right, L{row.code} left, B{row.code} both">{row.code}</abbr>
						</th>
						{@render field(row, 'OD')}
						{@render field(row, 'OS')}
					</tr>
				{/each}
				<tr class="divider"><td colspan="3"></td></tr>
				{#each measureRows as row (row.id)}
					<tr>
						<th scope="row">
							{row.label}
							<abbr class="code" title="Shorthand: R{row.code} right, L{row.code} left, {row.code} both">{row.code}</abbr>
						</th>
						{@render field(row, 'OD')}
						{@render field(row, 'OS')}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<label class="comments">
		<span>Comments <abbr class="code" title="Shorthand: ASCOM">ASCOM</abbr></span>
		<textarea
			rows="2"
			class:ghost={comments.ghost}
			value={comments.value}
			oninput={(e) => onedit('ANTSEG_COMMENTS', e.currentTarget.value)}
		></textarea>
	</label>
	<p class="legend"><span class="swatch" aria-hidden="true"></span> Tinted fields still hold the default "normal" value.</p>
</section>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		margin-bottom: var(--space-3);
	}
	h2 {
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		margin: 0 auto 0 0;
	}
	.panel {
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		overflow: hidden;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
	}
	th,
	td {
		text-align: left;
		padding: 0 var(--space-3);
		border-bottom: 1px solid var(--hairline);
		vertical-align: middle;
	}
	tbody tr:last-child > * {
		border-bottom: 0;
	}
	.rowhead {
		width: 22%;
	}
	thead th {
		height: calc(var(--row-height) + var(--space-2));
	}
	.eyecol {
		width: 39%;
	}
	tbody th {
		font-weight: var(--weight-regular);
		color: var(--text-2);
		height: var(--row-height);
	}
	.code {
		font: var(--text-xs) var(--font-mono);
		color: var(--text-3);
		text-decoration: none;
		margin-left: var(--space-1);
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
	.side-actions {
		float: right;
		display: inline-flex;
		gap: var(--space-1);
	}
	.mini {
		font-size: var(--text-xs);
		min-height: calc(var(--target-min) - 4px);
		padding: 0 var(--space-2);
		color: var(--text-2);
	}
	.cell {
		padding: 2px var(--space-1);
		transition: background var(--dur-small-in) var(--ease-enter);
	}
	.cell.is-default {
		background: var(--default-tint);
	}
	textarea,
	input {
		width: 100%;
		font: inherit;
		color: var(--text-1);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-1);
		padding: 4px var(--space-2);
		min-height: calc(var(--row-height) - 4px);
		resize: none;
		field-sizing: content;
	}
	textarea::placeholder,
	input::placeholder {
		color: var(--text-3);
	}
	.measure input {
		border-color: var(--hairline);
	}
	textarea:hover,
	input:hover {
		border-color: var(--hairline);
	}
	textarea:focus,
	input:focus {
		border-color: var(--accent);
		background: var(--surface-1);
		outline: none;
	}
	textarea:focus-visible,
	input:focus-visible {
		box-shadow: 0 0 0 1px var(--focus-ring);
	}
	.ghost textarea,
	.ghost input,
	textarea.ghost {
		color: var(--accent);
		font-style: italic;
	}
	.cell.ghost {
		background: var(--accent-soft);
	}
	.measure {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		width: 9em;
	}
	.unit {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.divider td {
		height: var(--space-2);
		background: var(--surface-2);
	}
	.comments {
		display: grid;
		gap: var(--space-1);
		margin-top: var(--space-4);
		color: var(--text-2);
	}
	.comments textarea {
		background: var(--surface-1);
		border-color: var(--hairline);
		max-width: var(--measure-prose);
	}
	.legend {
		color: var(--text-3);
		font-size: var(--text-xs);
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.swatch {
		width: 14px;
		height: 14px;
		border-radius: 3px;
		background: var(--default-tint);
		border: 1px solid var(--hairline);
	}
</style>
