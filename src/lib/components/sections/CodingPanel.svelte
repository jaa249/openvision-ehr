<script lang="ts">
	// Codes section (key 0): visit code, modifiers, justifiers, tests performed and the code summary.
	// A billing aid only (D46): codes to copy into the practice's billing system; OpenVision does not bill.
	// Spec: docs/spec/BEHAVIOR.md §11.1-11.4 with FIXes, §9.4 (92060), decision D7 (suggestions only,
	// always with the reasons; the provider chooses). Nothing is switched on for the provider.
	import { onMount } from 'svelte';
	import { MODIFIER_HELP_KEY, MODIFIER_LABEL_KEY, VISIT_MODIFIERS, type Family } from '#lib/coding/codes.ts';
	import { buildCoding } from '#lib/coding/lines.ts';
	import { splitCodes, suggestVisit } from '#lib/coding/visit.ts';
	import { EMPTY_CODING_STATE, type CodingResponse, type CodingState, type TestPerformed } from '#lib/coding/types.ts';
	import { sensorimotorSuggested } from '#lib/exam/sections/neuro.ts';
	import type { PlanData } from '#lib/plan/types.ts';
	import type { PanelProps } from './types.ts';
	import { CodingSaver, errorText } from './coding/saver.svelte.ts';
	import VisitCodeCard from './coding/VisitCodeCard.svelte';
	import TestsCard from './coding/TestsCard.svelte';
	import SummaryCard from './coding/SummaryCard.svelte';
	import { useI18n } from '#lib/i18n/context.ts';

	let { context, findings }: PanelProps = $props();
	const { t } = useI18n();

	// svelte-ignore state_referenced_locally
	const base = `/api/patients/${context.patientId}/encounters/${context.encounterId}`;
	const saver = new CodingSaver(`${base}/coding`);

	let data = $state<CodingResponse | null>(null);
	let coding = $state<CodingState>(structuredClone(EMPTY_CODING_STATE));
	let plan = $state<PlanData | null>(null);
	let planNote = $state<string | null>(null);
	let loadError = $state<string | null>(null);

	onMount(() => {
		void load();
		// Flush pending choices when leaving the panel or the page.
		return () => void saver.flush();
	});

	async function load() {
		loadError = null;
		try {
			const res = await fetch(`${base}/coding`);
			if (!res.ok) throw new Error(await errorText(res));
			data = (await res.json()) as CodingResponse;
			coding = data.state;
		} catch (e) {
			loadError = t('codes.loadFailed', { error: e instanceof Error ? e.message : String(e) });
		}
		// The Imp/Plan endpoint may not exist yet in this build: coding still works, without diagnoses or tests.
		try {
			const res = await fetch(`${base}/plan`);
			if (res.ok) {
				plan = (await res.json()) as PlanData;
				planNote = null;
			} else {
				planNote = res.status === 404 ? t('codes.planNotAvailable') : t('codes.planLoadFailedStatus', { status: res.status });
			}
		} catch {
			planNote = t('codes.planLoadFailedConnection');
		}
	}

	// ---------- derived ----------
	const canEdit = $derived(data?.canEdit ?? false);
	const disabled = $derived(!canEdit);
	const items = $derived(plan?.items ?? []);
	const coded = $derived(items.filter((i) => splitCodes(i.codes).length > 0));
	const sensorimotor = $derived(sensorimotorSuggested(findings));
	const suggestion = $derived(data ? suggestVisit({ findings, items, orders: plan?.orders ?? [], patient: data.patient }, t) : null);
	const summary = $derived(
		suggestion
			? buildCoding({
					state: coding,
					suggestedCode: coding.family === 'eye' ? suggestion.code : '',
					items: items.map((i) => ({ id: i.id, title: i.title, codes: i.codes })),
					sensorimotor,
					t
				})
			: null
	);

	// ---------- changes (autosaved) ----------
	function update(change: Partial<CodingState>) {
		if (!canEdit) return;
		coding = { ...coding, ...change };
		saver.queue(coding);
	}
	function setFamily(f: Family) {
		if (f !== coding.family) update({ family: f, visitCode: null });
	}
	function toggleModifier(code: string) {
		update({ modifiers: coding.modifiers.includes(code) ? coding.modifiers.filter((m) => m !== code) : [...coding.modifiers, code] });
	}
	function toggleJustifier(id: number) {
		update({ justifiersOff: coding.justifiersOff.includes(id) ? coding.justifiersOff.filter((x) => x !== id) : [...coding.justifiersOff, id] });
	}

	const saveLabel = $derived.by(() => {
		if (saver.status === 'error') return saver.lastError ? t('codes.notSaved', { error: saver.lastError }) : t('codes.notSavedUnknown');
		if (saver.showSaving) return t('codes.saving');
		if (saver.status === 'saved') return t('codes.saved');
		return '';
	});
</script>

<section class="coding" aria-labelledby="coding-title">
	<div class="head">
		<h2 id="coding-title">{t('codes.heading')}</h2>
		<span class="save" class:error={saver.status === 'error'} role="status" aria-live="polite">{saveLabel}</span>
	</div>

	{#if loadError}
		<p class="banner error" role="alert">
			{loadError}
			<button type="button" onclick={load}>{t('codes.retry')}</button>
		</p>
	{:else if !data || !suggestion || !summary}
		<p class="banner" role="status">{t('codes.loadingCodes')}</p>
	{:else}
		{#if !canEdit}
			<p class="banner">{t('codes.viewOnly')}</p>
		{/if}
		<p class="banner subtle">{t('codes.intro')}</p>
		{#if planNote}<p class="banner warn" role="status">{planNote}</p>{/if}

		<div class="cards">
			<VisitCodeCard
				family={coding.family}
				visitCode={coding.visitCode}
				{suggestion}
				{disabled}
				onfamily={setFamily}
				oncode={(code) => update({ visitCode: code })}
			/>

			<div class="stack">
				<div class="panel" role="group" aria-labelledby="mod-title">
					<div class="card-head"><h3 id="mod-title">{t('codes.modifiersTitle')}</h3></div>
					<ul class="mods">
						{#each VISIT_MODIFIERS as m (m.code)}
							{@const on = coding.modifiers.includes(m.code)}
							<li>
								<button type="button" class="toggle" aria-pressed={on} aria-describedby="mod-help-{m.code}" {disabled} onclick={() => toggleModifier(m.code)}>
									<span class="tcode">{m.code}</span>
									<span>{t(MODIFIER_LABEL_KEY[m.code])}</span>
									<span class="tstate">{on ? t('codes.on') : t('codes.off')}</span>
								</button>
								<p id="mod-help-{m.code}" class="note">{t(MODIFIER_HELP_KEY[m.code])}</p>
							</li>
						{/each}
					</ul>
				</div>

				<div class="panel" role="group" aria-labelledby="just-title">
					<div class="card-head"><h3 id="just-title">{t('codes.justifiersTitle')}</h3></div>
					<p class="note pad">{t('codes.justifiersHelp')}</p>
					{#if coded.length}
						<ul class="justs">
							{#each coded as item (item.id)}
								{@const on = !coding.justifiersOff.includes(item.id)}
								<li>
									<button type="button" class="toggle" aria-pressed={on} {disabled} onclick={() => toggleJustifier(item.id)}>
										<span class="tcode">{item.seq}</span>
										<span class="jtext">{item.title}<span class="jcode">{splitCodes(item.codes).join(', ')}</span></span>
										<span class="tstate">{on ? t('codes.on') : t('codes.off')}</span>
									</button>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="note pad">{t('codes.noCodedItems')}</p>
					{/if}
					{#if items.length > coded.length}
						<p class="note pad warn-text">
							{t('codes.notCoded', {
								titles: items
									.filter((i) => !coded.includes(i))
									.map((i) => i.title || t('codes.untitled'))
									.join('; ')
							})}
						</p>
					{/if}
				</div>
			</div>

			<TestsCard
				options={plan?.orderOptions ?? []}
				tests={coding.tests}
				items={coded}
				{sensorimotor}
				include92060={coding.include92060}
				{disabled}
				ontests={(next: TestPerformed[]) => update({ tests: next })}
				oninclude92060={(on) => update({ include92060: on })}
			/>

			<SummaryCard {summary} />
		</div>
	{/if}
</section>

<style>
	.coding {
		min-width: 0;
	}
	.head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}
	h2 {
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		margin: 0;
	}
	.save {
		font-size: var(--text-xs);
		color: var(--text-3);
		margin-left: auto;
	}
	.save.error {
		color: var(--danger);
	}
	.banner {
		margin: 0 0 var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		background: var(--surface-1);
		font-size: var(--text-xs);
		color: var(--text-2);
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.banner.subtle {
		border: 0;
		background: none;
		padding: 0;
		color: var(--text-3);
	}
	.banner.warn {
		color: var(--warn);
	}
	.banner.error {
		color: var(--danger);
	}
	.banner button {
		min-height: max(var(--target-min), 40px);
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
		gap: var(--space-4);
		align-items: start;
	}
	.stack {
		display: grid;
		gap: var(--space-4);
		min-width: 0;
	}
	/* Card chrome shared with the child cards (same look as the other exam panels). */
	.coding :global(.panel) {
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		overflow: hidden;
		min-width: 0;
	}
	.coding :global(.panel.wide) {
		grid-column: 1 / -1;
	}
	.coding :global(.card-head) {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--hairline);
		background: var(--surface-2);
	}
	.coding :global(h3) {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		margin: 0 auto 0 0;
	}
	.mods,
	.justs {
		list-style: none;
		margin: 0;
		padding: var(--space-2) var(--space-3);
		display: grid;
		gap: var(--space-2);
	}
	.toggle {
		display: grid;
		grid-template-columns: 2.5em 1fr auto;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		min-height: max(var(--target-min), 40px);
		text-align: left;
		padding: 2px var(--space-2);
	}
	.toggle[aria-pressed='true'] {
		background: var(--accent-soft);
		border-color: var(--accent);
	}
	.toggle[aria-pressed='true'] .tcode,
	.toggle[aria-pressed='true'] .tstate {
		color: var(--accent);
	}
	.tcode {
		font: var(--weight-semibold) var(--text-sm) var(--font-mono);
		color: var(--text-2);
	}
	.tstate {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--text-3);
	}
	.jtext {
		display: grid;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.jcode {
		font: var(--text-xs) var(--font-mono);
		color: var(--text-3);
	}
	.note {
		margin: 2px 0 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.note.pad {
		margin: 0;
		padding: var(--space-2) var(--space-3) 0;
	}
	.note.pad:last-child {
		padding-bottom: var(--space-2);
	}
	.warn-text {
		color: var(--warn);
	}
</style>
