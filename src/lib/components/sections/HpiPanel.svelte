<script lang="ts">
	// HPI section (spec §1.3): three chief-complaint tabs with HPI text, the HPI elements panel,
	// chronic problems (fed from the patient's history, §7.4), past history (PMSFH) and the ROS (§7.3).
	import { tick } from 'svelte';
	import PmsfhPanel from '#lib/components/PmsfhPanel.svelte';
	import {
		CHRONIC_IDS,
		COMPLAINTS,
		HISTORY_FIELDS,
		HPI_ELEMENTS,
		HPI_ELEMENT_KEYS,
		chronicFill,
		complaintIds,
		hpiLevel,
		type Complaint
	} from '#lib/exam/sections/history.ts';
	import type { PanelProps } from './types.ts';
	import { cellState } from './workup/cell.ts';
	import RosGrid from './hpi/RosGrid.svelte';
	import Msg from '#lib/i18n/Msg.svelte';
	import { useI18n } from '#lib/i18n/context.ts';

	let { context, findings, preview, copied, onedit, oncommit }: PanelProps = $props();
	const { t } = useI18n();

	const cell = (id: string) => cellState(id, findings, preview, copied);
	const MAX = new Map(HISTORY_FIELDS.map((f) => [f.id, f.maxLength]));
	const maxLength = (id: string) => MAX.get(id) ?? 4000;
	const filled = (id: string) => !!(findings[id]?.value ?? '').trim();

	// ---------- tabs ----------
	let ccTab = $state<Complaint>(1);
	let elTab = $state<Complaint>(1);
	const ids = (n: Complaint) => complaintIds(n);
	/** The shorthand bar is about to write into this complaint (dot on its tab). */
	const ghostIn = (n: Complaint, which: 'cc' | 'el') => {
		if (!preview) return false;
		const c = ids(n);
		const list = which === 'cc' ? [c.cc, c.hpi, ...(n === 1 ? CHRONIC_IDS : [])] : c.elements;
		return list.some((id) => id in preview!);
	};
	const elementCount = (n: Complaint) => ids(n).elements.filter(filled).length;

	function chooseComplaint(n: Complaint) {
		ccTab = n;
		elTab = n; // the elements panel follows the complaint being written
	}

	/** Arrow keys / Home / End move between tabs (WAI-ARIA tabs pattern, automatic activation). */
	async function tabKey(e: KeyboardEvent, cur: Complaint, set: (n: Complaint) => void, prefix: string) {
		const i = COMPLAINTS.indexOf(cur);
		// The next tab is to the right in left-to-right, to the left in right-to-left.
		const rtl = getComputedStyle(e.currentTarget as Element).direction === 'rtl';
		const [next, prev] = rtl ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft'];
		const to =
			e.key === next ? COMPLAINTS[(i + 1) % 3] :
			e.key === prev ? COMPLAINTS[(i + 2) % 3] :
			e.key === 'Home' ? 1 :
			e.key === 'End' ? 3 : null;
		if (to === null) return;
		e.preventDefault();
		set(to);
		await tick();
		document.getElementById(`${prefix}-${to}`)?.focus();
	}

	// ---------- coding hint (§7.1, §11.1) ----------
	const level = $derived(hpiLevel(findings));

	// ---------- chronic feed (§7.4) ----------
	/** Last list handled, so a re-sent identical list does nothing (and cannot refill a box the user cleared). */
	let lastChronic = '';
	function onchronic(texts: string[]) {
		const key = JSON.stringify(texts);
		if (key === lastChronic) return;
		lastChronic = key;
		const { next, changed } = chronicFill(findings, texts);
		if (changed.length) oncommit(next, changed, t('sections.hpiChronicFromHistory'));
	}
</script>

{#snippet textBox(id: string, label: string, opts: { rows?: number; placeholder?: string; prompt?: string } = {})}
	{@const c = cell(id)}
	<div class="box" class:ghost={c.ghost} class:copied={c.copied} data-field={id}>
		<label class="lbl" for="f-{id}">{label}<span class="code" aria-hidden="true">{id}</span></label>
		{#if opts.prompt}<span class="prompt" id="f-{id}-prompt">{opts.prompt}</span>{/if}
		{#if opts.rows}
			<textarea
				id="f-{id}"
				rows={opts.rows}
				value={c.value}
				maxlength={maxLength(id)}
				placeholder={opts.placeholder}
				aria-describedby={opts.prompt ? `f-${id}-prompt` : undefined}
				oninput={(e) => onedit(id, e.currentTarget.value)}
			></textarea>
		{:else}
			<input
				id="f-{id}"
				value={c.value}
				maxlength={maxLength(id)}
				autocomplete="off"
				placeholder={opts.placeholder}
				aria-describedby={opts.prompt ? `f-${id}-prompt` : undefined}
				oninput={(e) => onedit(id, e.currentTarget.value)}
			/>
		{/if}
	</div>
{/snippet}

{#snippet tabs(prefix: string, label: string, cur: Complaint, set: (n: Complaint) => void, which: 'cc' | 'el')}
	<div class="tabs" role="tablist" aria-label={label}>
		{#each COMPLAINTS as n (n)}
			{@const done = which === 'cc' ? n > 1 && filled(ids(n).cc) : elementCount(n) > 0}
			<button
				type="button"
				role="tab"
				id="{prefix}-{n}"
				aria-selected={cur === n}
				aria-controls="{prefix}-panel"
				tabindex={cur === n ? 0 : -1}
				onclick={() => set(n)}
				onkeydown={(e) => tabKey(e, cur, set, prefix)}
			>
				{#if which === 'cc'}{t('sections.hpiComplaintN', { n })}{:else}<span class="visually-hidden">{t('sections.hpiComplaint')}</span> {n}{/if}
				{#if which === 'cc' && done}<span class="tick" aria-hidden="true">✓</span><span class="visually-hidden">{t('sections.hpiTabFilled')}</span>{/if}
				{#if which === 'el' && done}<span class="badge" aria-hidden="true">{elementCount(n)}/8</span><span class="visually-hidden">{t('sections.hpiTabElementsFilled', { n: elementCount(n) })}</span>{/if}
				{#if ghostIn(n, which)}<span class="dot" aria-hidden="true"></span><span class="visually-hidden">{t('sections.hpiTabShorthandPending')}</span>{/if}
			</button>
		{/each}
	</div>
{/snippet}

<section aria-labelledby="hpi-title">
	<div class="head">
		<h2 id="hpi-title">{t('sections.hpiTitle')}</h2>
	</div>

	<div class="row">
		<!-- Complaints: CC + HPI text (+ chronic problems on tab 1) -->
		<div class="panel" role="group" aria-labelledby="cc-title">
			<div class="card-head"><h3 id="cc-title">{t('sections.hpiChiefComplaints')}</h3></div>
			{@render tabs('hpi-cc', t('sections.hpiChiefComplaints'), ccTab, chooseComplaint, 'cc')}
			<div class="tabpanel" role="tabpanel" id="hpi-cc-panel" aria-labelledby="hpi-cc-{ccTab}">
				{@render textBox(ids(ccTab).cc, t('sections.hpiChiefComplaint'), { placeholder: t('sections.hpiCcPlaceholder') })}
				{@render textBox(ids(ccTab).hpi, t('sections.hpiHpi'), { rows: 4, placeholder: t('sections.hpiHpiPlaceholder') })}
				{#if ccTab === 1}
					<fieldset class="chronic">
						<legend>{t('sections.hpiChronicLegend')}</legend>
						<p class="help">{t('sections.hpiChronicHelp')}</p>
						{#each CHRONIC_IDS as id, i (id)}
							{@render textBox(id, t('sections.hpiProblemN', { n: i + 1 }), { rows: 2, placeholder: t('sections.hpiProblemPlaceholder') })}
						{/each}
					</fieldset>
				{/if}
			</div>
			<div class="level" class:detailed={level.detailed} aria-live="polite">
				<p class="verdict">
					<span aria-hidden="true">{level.detailed ? '✓' : '○'}</span>
					<strong>{level.detailed ? t('sections.hpiDetailed') : t('sections.hpiLimited')}</strong>
					<span class="counts">{t('sections.hpiLevelCounts', { count: level.elements, chronic: level.chronic })}</span>
				</p>
				<p class="help">{t('sections.hpiLevelHelp')}</p>
			</div>
		</div>

		<!-- HPI elements, one tab per complaint -->
		<div class="panel" role="group" aria-labelledby="el-title">
			<div class="card-head"><h3 id="el-title">{t('sections.hpiElements')}</h3></div>
			{@render tabs('hpi-el', t('sections.hpiElementsTabs'), elTab, (n) => (elTab = n), 'el')}
			<div class="tabpanel elements" role="tabpanel" id="hpi-el-panel" aria-labelledby="hpi-el-{elTab}">
				{#if elTab > 1 && !filled(ids(elTab).cc)}
					<p class="help wide">{t('sections.hpiNoCcYet', { n: elTab })}</p>
				{/if}
				{#each HPI_ELEMENTS as e, i (e.key)}
					{@render textBox(ids(elTab).elements[i], t(HPI_ELEMENT_KEYS[e.key].label), { rows: 2, prompt: t(HPI_ELEMENT_KEYS[e.key].prompt) })}
				{/each}
			</div>
		</div>
	</div>

	<PmsfhPanel patientId={context.patientId} encounterId={context.encounterId} {onchronic} />

	<RosGrid {findings} {preview} {copied} {onedit} {oncommit} {maxLength} />

	<p class="legend">
		<span class="swatch copied" aria-hidden="true"></span> {t('sections.legendCopied')}
		<span class="sep"
			><Msg key="sections.legendShorthand"
				>{#snippet codes()}<code>CC:blurry vision</code>, <code>HPI:worse at night</code>, <code>TIMING3:mornings</code>, <code>ROSCV:HTN</code>{/snippet}</Msg
			></span
		>
	</p>
</section>

<style>
	section {
		display: grid;
		gap: var(--space-4);
	}
	.head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	h2 {
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		margin: 0;
	}
	h3 {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		margin: 0;
	}
	.row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
		gap: var(--space-4);
		align-items: start;
	}
	.panel {
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		overflow: hidden;
		min-width: 0;
	}
	.card-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--hairline);
		background: var(--surface-2);
	}
	.tabs {
		display: flex;
		gap: 2px;
		padding: var(--space-2) var(--space-3) 0;
		border-bottom: 1px solid var(--hairline);
	}
	[role='tab'] {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: max(var(--target-min), 40px);
		min-width: 3.5em;
		justify-content: center;
		border-bottom-color: transparent;
		border-radius: var(--radius-1) var(--radius-1) 0 0;
		margin-bottom: -1px;
		background: var(--surface-2);
		color: var(--text-2);
	}
	[role='tab'][aria-selected='true'] {
		background: var(--surface-1);
		color: var(--text-1);
		font-weight: var(--weight-semibold);
		border-bottom-color: var(--surface-1);
		box-shadow: inset 0 2px 0 var(--accent);
	}
	.tick {
		color: var(--ok);
	}
	.badge {
		font-size: var(--text-xs);
		padding: 0 6px;
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: var(--weight-regular);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
	}
	.tabpanel {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3);
	}
	.elements {
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr));
		align-items: start;
	}
	.wide {
		grid-column: 1 / -1;
	}
	.box {
		display: grid;
		gap: 2px;
		border-radius: var(--radius-1);
		min-width: 0;
	}
	.lbl {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		color: var(--text-2);
		font-weight: var(--weight-semibold);
	}
	.code {
		font: var(--text-xs) var(--font-mono);
		font-weight: var(--weight-regular);
		color: var(--text-3);
	}
	.prompt {
		font-style: italic;
		font-size: var(--text-xs);
		color: var(--text-3);
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
		box-sizing: border-box;
	}
	textarea {
		resize: vertical;
	}
	input::placeholder,
	textarea::placeholder {
		color: var(--text-3);
	}
	input:focus,
	textarea:focus {
		border-color: var(--accent);
		background: var(--surface-1);
		outline: none;
		box-shadow: 0 0 0 1px var(--focus-ring);
	}
	.box.ghost input,
	.box.ghost textarea {
		background: var(--accent-soft);
		color: var(--accent);
		font-style: italic;
	}
	.box.copied input,
	.box.copied textarea {
		background: var(--copied-tint);
	}
	.chronic {
		display: grid;
		gap: var(--space-2);
		margin: var(--space-1) 0 0;
		padding: var(--space-2) var(--space-3) var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		min-width: 0;
	}
	legend {
		color: var(--text-2);
		font-weight: var(--weight-semibold);
		padding: 0 var(--space-1);
	}
	.help {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.level {
		display: grid;
		gap: 2px;
		padding: var(--space-2) var(--space-3);
		border-top: 1px solid var(--hairline);
		background: var(--surface-2);
	}
	.verdict {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		color: var(--text-2);
	}
	.counts {
		font-size: var(--text-xs);
		color: var(--text-3);
		font-variant-numeric: tabular-nums;
	}
	.level.detailed {
		background: var(--accent-soft);
		box-shadow: inset 3px 0 0 var(--ok);
	}
	.level.detailed .verdict {
		color: var(--ok);
	}
	.legend {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.legend code {
		font-family: var(--font-mono);
	}
	.swatch {
		width: 14px;
		height: 14px;
		border-radius: 3px;
		border: 1px solid var(--hairline);
	}
	.swatch.copied {
		background: var(--copied-tint);
	}
	.sep {
		margin-inline-start: var(--space-3);
	}
</style>
