<script lang="ts">
	// Visit code choice (spec §11.1 FIX, decision D7): the suggestion is pre-selected and marked
	// "suggested" with its reasons and the documented evidence; the provider confirms or picks another.
	import { FAMILIES, LEVEL_LABEL, VISIT_CODES, type Family, type VisitCodeDef } from '#lib/coding/codes.ts';
	import type { VisitSuggestion } from '#lib/coding/types.ts';

	let {
		family,
		visitCode,
		suggestion,
		disabled = false,
		onfamily,
		oncode
	}: {
		family: Family;
		/** The provider's choice; null = not chosen (the suggestion is pre-selected). */
		visitCode: string | null;
		suggestion: VisitSuggestion;
		disabled?: boolean;
		onfamily: (f: Family) => void;
		oncode: (code: string) => void;
	} = $props();

	const codes = $derived(VISIT_CODES.filter((c) => c.family === family));
	const groups = $derived([
		{ id: 'new', label: 'New patient', codes: codes.filter((c) => c.patient === 'new') },
		{ id: 'established', label: 'Established patient', codes: codes.filter((c) => c.patient === 'established') }
	]);
	const suggested = $derived(family === 'eye' ? suggestion.code : null);
	const selected = $derived(visitCode ?? suggested);
	const confirmed = $derived(visitCode !== null);
	const familyHelp = $derived(FAMILIES.find((f) => f.id === family)?.help ?? '');

	function hint(c: VisitCodeDef): string {
		const parts: string[] = [];
		if (c.code === suggested) parts.push('suggested');
		if (c.patient !== suggestion.patient.status) parts.push(`patient looks ${suggestion.patient.status}`);
		return parts.join(' · ');
	}
</script>

<div class="panel" role="group" aria-labelledby="visit-code-title">
	<div class="card-head">
		<h3 id="visit-code-title">Visit code</h3>
		<fieldset class="family">
			<legend class="visually-hidden">Code family</legend>
			{#each FAMILIES as f (f.id)}
				<label class="seg" class:on={family === f.id}>
					<input type="radio" name="code-family" value={f.id} checked={family === f.id} {disabled} onchange={() => onfamily(f.id)} />
					<span>{f.label}</span>
				</label>
			{/each}
		</fieldset>
	</div>
	<p class="help">{familyHelp}</p>

	<p class="patient">
		<strong>{suggestion.patient.status === 'new' ? 'New patient' : 'Established patient'}</strong>
		<span>{suggestion.patient.reason}</span>
	</p>

	<fieldset class="codes" aria-describedby="visit-code-state">
		<legend class="visually-hidden">Visit code</legend>
		{#each groups as g (g.id)}
			<div class="group" role="group" aria-label={g.label}>
				<span class="group-label">{g.label}</span>
				<div class="options" class:many={g.codes.length > 2}>
					{#each g.codes as c (c.code)}
						<label class="opt" class:on={selected === c.code} class:suggested={c.code === suggested} class:unconfirmed={selected === c.code && !confirmed}>
							<input type="radio" name="visit-code" value={c.code} checked={selected === c.code} {disabled} onclick={() => oncode(c.code)} />
							<span class="opt-code">{c.code}</span>
							<span class="opt-level">{LEVEL_LABEL[c.level]}</span>
							{#if c.code === suggested}<span class="badge">Suggested</span>{/if}
							{#if hint(c) && c.code !== suggested}<span class="opt-hint">{hint(c)}</span>{/if}
						</label>
					{/each}
				</div>
			</div>
		{/each}
	</fieldset>
	<p id="visit-code-state" class="state" class:warn={!confirmed} aria-live="polite">
		{#if family === 'em' && !visitCode}
			Pick the level by medical decision-making or total time. No suggestion is made for office codes.
		{:else if !confirmed}
			{suggested} is pre-selected from the suggestion and not yet confirmed. Pick a code to confirm it.
		{:else if visitCode === suggested}
			You confirmed the suggested code {visitCode}.
		{:else}
			You chose {visitCode}{suggested ? `; the suggestion was ${suggested}` : ''}.
		{/if}
	</p>

	{#if family === 'eye'}
		<div class="why">
			<h4>Why {suggestion.code} is suggested</h4>
			<ul class="reasons">
				{#each suggestion.reasons as r, i (i)}<li>{r}</li>{/each}
			</ul>
			<h4>Documented evidence</h4>
			<ul class="evidence">
				{#each suggestion.evidence as e (e.id)}
					<li class:met={e.met}>
						<span class="mark" aria-hidden="true">{e.met ? '✓' : '○'}</span>
						<span class="ev-text">
							<span class="ev-label">{e.label}<span class="visually-hidden">: {e.met ? 'documented' : 'not documented'}</span></span>
							<span class="ev-detail">{e.detail}{e.supports === 'comprehensive' ? ' Speaks for comprehensive.' : ' Supports either level.'}</span>
						</span>
					</li>
				{/each}
			</ul>
			<p class="help">Intermediate: evaluation of a new or existing condition. Comprehensive: a general evaluation of the complete visual system, including starting diagnostic or treatment programs.</p>
		</div>
	{/if}
</div>

<style>
	.family {
		display: inline-flex;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		overflow: hidden;
		margin: 0;
		padding: 0;
		min-width: 0;
		flex-wrap: wrap;
	}
	.seg {
		position: relative;
		display: inline-flex;
		align-items: center;
		min-height: max(var(--target-min), 40px);
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		color: var(--text-2);
		cursor: pointer;
		background: var(--surface-1);
	}
	.seg + .seg {
		border-left: 1px solid var(--hairline);
	}
	.seg.on {
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: var(--weight-semibold);
	}
	.seg input,
	.opt input {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		cursor: pointer;
	}
	.seg:has(input:focus-visible),
	.opt:has(input:focus-visible) {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}
	.patient {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-2);
		align-items: baseline;
		border-bottom: 1px solid var(--hairline);
	}
	.patient span {
		color: var(--text-2);
		font-size: var(--text-xs);
	}
	.codes {
		border: 0;
		margin: 0;
		padding: var(--space-2) var(--space-3) 0;
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}
	.group {
		display: grid;
		gap: var(--space-1);
	}
	.group-label {
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.options {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-1);
	}
	.options.many {
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 9em), 1fr));
	}
	.opt {
		position: relative;
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 0 var(--space-2);
		min-height: 48px;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		cursor: pointer;
		background: var(--surface-1);
	}
	.opt.suggested {
		border-style: dashed;
		border-color: var(--accent);
	}
	.opt.on {
		background: var(--accent-soft);
		border-color: var(--accent);
		border-style: solid;
	}
	.opt.on.unconfirmed {
		border-style: dashed;
	}
	.opt-code {
		font: var(--weight-semibold) var(--text-md) var(--font-mono);
	}
	.opt-level {
		color: var(--text-2);
		font-size: var(--text-xs);
	}
	.badge {
		grid-column: 1 / -1;
		justify-self: start;
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--accent);
	}
	.opt-hint {
		grid-column: 1 / -1;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.state {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-xs);
		color: var(--text-2);
	}
	.state.warn {
		color: var(--warn);
	}
	.why {
		border-top: 1px solid var(--hairline);
		padding: var(--space-2) var(--space-3);
		display: grid;
		gap: var(--space-1);
	}
	h4 {
		margin: var(--space-1) 0 0;
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--text-2);
	}
	.reasons {
		margin: 0;
		padding-left: var(--space-4);
		font-size: var(--text-xs);
		color: var(--text-2);
	}
	.evidence {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-1);
	}
	.evidence li {
		display: grid;
		grid-template-columns: 1.2em 1fr;
		gap: var(--space-1);
		font-size: var(--text-xs);
	}
	.mark {
		color: var(--text-3);
		font-weight: var(--weight-semibold);
	}
	.met .mark {
		color: var(--ok);
	}
	.ev-text {
		display: grid;
	}
	.ev-label {
		color: var(--text-1);
	}
	.ev-detail {
		color: var(--text-3);
	}
	.help {
		margin: 0;
		padding: var(--space-1) var(--space-3) 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.why .help {
		padding: var(--space-1) 0 0;
	}
</style>
