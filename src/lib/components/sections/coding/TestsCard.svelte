<script lang="ts">
	// Tests performed (spec §11.3 with FIXes) and the advisory 92060 row (§9.4 FIX).
	// Checking a test reveals an EMPTY modifier box (59 is only a hint) and up to 4 justifier toggles.
	// Nothing on the visit is changed by a test: suggestions appear in the summary instead.
	import { MAX_POINTERS, MODIFIER_59_HINT, SENSORIMOTOR } from '#lib/coding/codes.ts';
	import { splitCodes } from '#lib/coding/visit.ts';
	import type { ImpItem, OrderOption } from '#lib/plan/types.ts';
	import type { TestPerformed } from '#lib/coding/types.ts';

	let {
		options,
		tests,
		items,
		sensorimotor,
		include92060,
		disabled = false,
		ontests,
		oninclude92060
	}: {
		/** The provider's orders list (only rows with a CPT code are tests). */
		options: OrderOption[];
		tests: TestPerformed[];
		/** Coded impression items, for the justifier toggles. */
		items: ImpItem[];
		sensorimotor: boolean;
		include92060: boolean;
		disabled?: boolean;
		ontests: (next: TestPerformed[]) => void;
		oninclude92060: (on: boolean) => void;
	} = $props();

	/** Rows to show: every coded order, plus checked tests whose order row has since been removed. */
	const rows = $derived.by(() => {
		const out = options.filter((o) => o.cpt.trim()).map((o) => ({ cpt: o.cpt.trim().toUpperCase(), label: o.label }));
		for (const t of tests) if (!out.some((r) => r.cpt === t.cpt)) out.push({ cpt: t.cpt, label: t.label });
		return out;
	});
	const byCpt = $derived(new Map(tests.map((t) => [t.cpt, t])));

	function toggle(cpt: string, label: string, on: boolean) {
		ontests(on ? [...tests, { cpt, label, modifier: '', justifiers: [] }] : tests.filter((t) => t.cpt !== cpt));
	}
	function patch(cpt: string, change: Partial<TestPerformed>) {
		ontests(tests.map((t) => (t.cpt === cpt ? { ...t, ...change } : t)));
	}
	function toggleJustifier(t: TestPerformed, id: number) {
		const on = t.justifiers.includes(id);
		if (!on && t.justifiers.length >= MAX_POINTERS) return;
		patch(t.cpt, { justifiers: on ? t.justifiers.filter((x) => x !== id) : [...t.justifiers, id] });
	}
	const codesOf = (i: ImpItem) => splitCodes(i.codes).join(', ');
</script>

<div class="panel" role="group" aria-labelledby="tests-title">
	<div class="card-head"><h3 id="tests-title">Tests performed</h3></div>
	<p class="help">From your orders list: only rows with a CPT code. Tick what was done today.</p>

	{#if sensorimotor || include92060}
		<div class="row sm" class:on={include92060 && sensorimotor}>
			<label class="check">
				<input type="checkbox" checked={include92060 && sensorimotor} disabled={disabled || !sensorimotor} onchange={(e) => oninclude92060(e.currentTarget.checked)} />
				<span><strong>{SENSORIMOTOR.code}</strong> {SENSORIMOTOR.label}</span>
			</label>
			<p class="note">
				{#if sensorimotor}
					Suggested: stereopsis plus a deviation measured in more than one position (Neuro). Advisory: include it only if you performed it. No modifier needed; uses the visit justifiers.
				{:else}
					No longer supported by the Neuro findings, so it is left out.
				{/if}
			</p>
		</div>
	{/if}

	{#if rows.length === 0}
		<p class="empty">No coded tests in the orders list yet. Add CPT codes to orders in Imp / Plan to list them here.</p>
	{:else}
		<ul class="tests">
			{#each rows as r (r.cpt)}
				{@const t = byCpt.get(r.cpt)}
				<li class="row" class:on={!!t}>
					<label class="check">
						<input type="checkbox" checked={!!t} {disabled} onchange={(e) => toggle(r.cpt, r.label, e.currentTarget.checked)} />
						<span>{r.label} <span class="cpt">({r.cpt})</span></span>
					</label>
					{#if t}
						<div class="detail">
							<label class="mod">
								<span>Modifier</span>
								<input
									value={t.modifier}
									maxlength="2"
									autocomplete="off"
									placeholder="none"
									aria-describedby="hint-59-{r.cpt}"
									{disabled}
									oninput={(e) => patch(r.cpt, { modifier: e.currentTarget.value.toUpperCase().replace(/[^0-9A-Z]/g, '') })}
								/>
							</label>
							<p id="hint-59-{r.cpt}" class="note">{MODIFIER_59_HINT}</p>
							<div class="justifiers" role="group" aria-label="Justifiers for {r.label}" aria-describedby="just-help-{r.cpt}">
								{#each items as item (item.id)}
									{@const on = t.justifiers.includes(item.id)}
									<button
										type="button"
										class="jt"
										aria-pressed={on}
										disabled={disabled || (!on && t.justifiers.length >= MAX_POINTERS)}
										onclick={() => toggleJustifier(t, item.id)}
									>
										<span class="num">{item.seq}</span>
										<span class="jt-text">{item.title}<span class="jt-code">{codesOf(item)}</span></span>
									</button>
								{/each}
							</div>
							<p id="just-help-{r.cpt}" class="note">
								{#if items.length === 0}
									No coded impression items to point to yet.
								{:else}
									Pick up to {MAX_POINTERS} diagnoses this test is for ({t.justifiers.length} of {MAX_POINTERS}).
								{/if}
							</p>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.tests {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.row {
		border-top: 1px solid var(--hairline);
		padding: var(--space-1) var(--space-3);
	}
	.row.on {
		background: var(--surface-2);
	}
	.check {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: max(var(--target-min), 40px);
		cursor: pointer;
	}
	.check input {
		width: 18px;
		height: 18px;
		flex: none;
		accent-color: var(--accent);
	}
	.cpt {
		font-family: var(--font-mono);
		color: var(--text-3);
	}
	.detail {
		display: grid;
		gap: var(--space-1);
		padding: 0 0 var(--space-2) calc(18px + var(--space-2));
	}
	.mod {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xs);
		color: var(--text-2);
	}
	.mod input {
		font: inherit;
		font-family: var(--font-mono);
		width: 4.5em;
		min-height: max(var(--target-min), 40px);
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		padding: 0 var(--space-2);
		text-transform: uppercase;
	}
	.mod input:focus {
		border-color: var(--accent);
		outline: none;
		box-shadow: 0 0 0 1px var(--focus-ring);
	}
	.justifiers {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.jt {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: max(var(--target-min), 40px);
		padding: 2px var(--space-2);
		text-align: left;
		max-width: 100%;
	}
	.jt[aria-pressed='true'] {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent);
	}
	.jt .num {
		font-weight: var(--weight-semibold);
	}
	.jt-text {
		display: grid;
		font-size: var(--text-xs);
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.jt-code {
		font-family: var(--font-mono);
		color: var(--text-3);
	}
	.note,
	.help,
	.empty {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.help,
	.empty {
		padding: var(--space-2) var(--space-3);
	}
	.sm .note {
		padding: 0 0 var(--space-1) calc(18px + var(--space-2));
	}
</style>
