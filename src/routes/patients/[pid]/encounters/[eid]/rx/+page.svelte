<script lang="ts">
	// Spectacle / contact lens Rx (spec §12.4). Values come from the exam; small edits here (transpose, CTL details,
	// quantity, treatments) go into the dispense record (FIX), which is written when the user prints (§12.5 FIX).
	// Headings and labels are in the reader's language (D48); values, materials and treatments stay as recorded.
	import { onMount } from 'svelte';
	import {
		LENS_MATERIALS,
		LENS_TREATMENTS,
		RX_TYPES,
		formatAxis,
		formatPower,
		formatUpper,
		splitList,
		sumPd,
		transpose,
		type RxValues
	} from '#lib/exam/sections/refraction.ts';
	import Msg from '#lib/i18n/Msg.svelte';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { MessageKey } from '#lib/i18n/catalog.ts';
	import { METHOD_KEY, RX_TYPE_KEY } from './labels.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const { t, dateTime, longDate } = useI18n();

	const p = $derived(data.patient);
	const e = $derived(data.encounter);
	const source = $derived(data.rx.source);
	const isCtl = $derived(data.rx.kind === 'CTL');
	// svelte-ignore state_referenced_locally
	let values = $state<RxValues>({ ...data.rx.values });
	// svelte-ignore state_referenced_locally
	let rxType = $state(data.rx.rxType);
	let comments = $derived(values.COMMENTS ?? '');

	const generatedOn = dateTime(new Date());
	const title = $derived(isCtl ? t('rx.titleContactLens', { name: p.legalName }) : t('rx.titleSpectacle', { name: p.legalName }));

	const g = (k: string) => values[k] ?? '';
	function set(k: string, v: string) {
		values = { ...values, [k]: v };
	}

	// ---------- formatting on leaving a box (same rules as the exam, §8.7) ----------
	const focusStart: Record<string, string> = {};
	function leave(k: string) {
		const col = k.replace(/^(OD|OS)/, '');
		const raw = g(k);
		if (col === 'SPH') set(k, formatPower(raw, 'sph').value);
		else if (col === 'CYL') {
			const v = formatPower(raw, 'cyl', raw.trim().startsWith('-') ? '-' : '+').value;
			set(k, v);
			if (v === 'SPH') set(k.replace('CYL', 'AXIS'), '');
		} else if (col === 'AXIS') set(k, formatAxis(raw).value);
		else if (col === 'ADD' || col === 'MIDADD') {
			const v = formatPower(raw, 'add').value;
			set(k, v);
			// OD ADD, mid ADD and CTL ADD carry to OS unless OS was set to something else (§12.4).
			if (k.startsWith('OD')) {
				const os = k.replace(/^OD/, 'OS');
				if (v && (!g(os) || g(os) === (focusStart[k] ?? ''))) set(os, v);
			}
		} else if (/^(PRISM|HPD|HBASE|VPD|VBASE|MPDD|MPDN)$/.test(col) || k === 'BPDD' || k === 'BPDN') set(k, formatUpper(raw));
		if (col === 'MPDD' && !g('BPDD')) set('BPDD', sumPd(g('ODMPDD'), g('OSMPDD')));
		if (col === 'MPDN' && !g('BPDN')) set('BPDN', sumPd(g('ODMPDN'), g('OSMPDN')));
	}

	function doTranspose() {
		let any = false;
		for (const eye of ['OD', 'OS']) {
			const tr = transpose({ sph: g(`${eye}SPH`), cyl: g(`${eye}CYL`), axis: g(`${eye}AXIS`) });
			if (!tr) continue;
			any = true;
			values = { ...values, [`${eye}SPH`]: tr.sph, [`${eye}CYL`]: tr.cyl, [`${eye}AXIS`]: tr.axis };
		}
		message = any ? t('rx.transposed') : t('rx.nothingToTranspose');
	}

	function toggleTreatment(treatment: string, on: boolean) {
		const cur = splitList(g('LENS_TREATMENTS')).filter((x) => x !== treatment);
		if (on) cur.push(treatment);
		set('LENS_TREATMENTS', LENS_TREATMENTS.filter((x) => cur.includes(x)).concat(cur.filter((x) => !LENS_TREATMENTS.includes(x))).join('|'));
	}

	// ---------- what to show ----------
	const prismFilled = $derived(['ODPRISM', 'OSPRISM'].some((k) => g(k)));
	/** MR and AR offer a prism box on screen; paper shows the column only when filled. */
	const showPrism = $derived(prismFilled || data.rx.kind === 'MR' || data.rx.kind === 'AR');
	const showMid = $derived(rxType === '2' || rxType === '3' || !!(g('ODMIDADD') || g('OSMIDADD')));
	const showAdd = $derived(rxType !== '0' || !!(g('ODADD') || g('OSADD')));
	const FIT_KEYS = ['HPD', 'HBASE', 'VPD', 'VBASE', 'SLABOFF', 'VERTEXDIST', 'MPDD', 'MPDN'] as const;
	/** Box labels of the fitting columns ("OD hpd" in English, as before). */
	const FIT_ARIA: Record<(typeof FIT_KEYS)[number], MessageKey> = {
		HPD: 'rx.ariaFitHpd',
		HBASE: 'rx.ariaFitHbase',
		VPD: 'rx.ariaFitVpd',
		VBASE: 'rx.ariaFitVbase',
		SLABOFF: 'rx.ariaFitSlaboff',
		VERTEXDIST: 'rx.ariaFitVertexdist',
		MPDD: 'rx.ariaFitMpdd',
		MPDN: 'rx.ariaFitMpdn'
	};
	const hasFitting = $derived(
		FIT_KEYS.some((c) => g(`OD${c}`) || g(`OS${c}`)) || !!(g('BPDD') || g('BPDN') || g('LENS_MATERIAL') || g('LENS_TREATMENTS'))
	);
	let fittingOpen = $state(false);
	const ctlAdd = $derived(!!(g('ODADD') || g('OSADD')));
	const eyeSide = (eye: string) => (eye === 'OD' ? t('report.odRight') : t('report.osLeft'));

	// ---------- print = dispense record (§12.5) ----------
	let saved = $state<{ id: number; printedAt: string; body: string } | null>(null);
	let message = $state('');
	let failed = $state(false);
	let busy = $state(false);

	function payload(): string {
		const v = Object.fromEntries(Object.entries(values).filter(([, x]) => x.trim()));
		return JSON.stringify({ source, rxType: isCtl ? '' : rxType, values: v });
	}

	async function record(keepalive = false): Promise<boolean> {
		const body = payload();
		if (saved?.body === body) return true;
		try {
			const res = await fetch(`/api/patients/${p.id}/encounters/${e.id}/rx`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body,
				keepalive
			});
			if (!res.ok) throw new Error(await res.text());
			const j = (await res.json()) as { record: { id: number; printedAt: string } };
			saved = { id: j.record.id, printedAt: j.record.printedAt, body };
			failed = false;
			return true;
		} catch (err) {
			failed = true;
			message = t('rx.notPrinted', { error: err instanceof Error ? err.message : String(err) });
			return false;
		}
	}

	async function printNow() {
		if (busy) return;
		busy = true;
		const ok = await record();
		busy = false;
		if (ok) {
			message = '';
			window.print();
		}
	}

	onMount(() => {
		// Printing from the browser menu still records what was printed.
		const before = () => {
			if (saved?.body !== payload()) record(true);
		};
		const key = (ev: KeyboardEvent) => {
			if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && ev.key.toLowerCase() === 'p') {
				ev.preventDefault();
				printNow();
			}
		};
		window.addEventListener('beforeprint', before);
		window.addEventListener('keydown', key);
		return () => {
			window.removeEventListener('beforeprint', before);
			window.removeEventListener('keydown', key);
		};
	});

	const printedAt = $derived(saved ? dateTime(saved.printedAt) : '');
</script>

<svelte:head><title>{t('rx.pageTitle', { title })}</title></svelte:head>

{#snippet field(k: string, label: string, cls = '')}
	<input
		class="f {cls}"
		value={g(k)}
		aria-label={label}
		autocomplete="off"
		spellcheck="false"
		onfocus={(ev) => (focusStart[k] = ev.currentTarget.value)}
		oninput={(ev) => set(k, ev.currentTarget.value)}
		onblur={() => leave(k)}
	/>
{/snippet}

<div class="toolbar" role="toolbar" aria-label={t('rx.toolbarLabel')}>
	<a href="/patients/{p.id}/encounters/{e.id}">{t('rx.backToExam')}</a>
	<span class="what">{data.rx.kind === 'W' ? t('rx.methodGlassesNumber', { method: t(METHOD_KEY.W), number: source.slice(1) }) : t(METHOD_KEY[data.rx.kind])}</span>
	<a href="/patients/{p.id}/encounters/{e.id}/rx/history">{t('rx.dispensedHistory')}</a>
	<span class="spacer"></span>
	{#if !isCtl}<button type="button" onclick={doTranspose} title={t('rx.transposeTitle')}>{t('rx.transpose')}</button>{/if}
	<button type="button" class="primary" onclick={printNow} disabled={busy}>{t('rx.print')}</button>
</div>
<p class="msg" class:error={failed} role="status" aria-live="polite">
	{#if message}{message}{:else if saved}{t('rx.savedPrinted', { when: printedAt })}{:else}{t('rx.editingHint')}{/if}
</p>

<article class="rx" aria-label={title}>
	<header>
		<div class="practice">
			<strong>{data.practice.name}</strong>
			{#if data.practice.address}<span>{data.practice.address}</span>{/if}
			<span>
				{#if data.practice.phone}{t('report.practicePhone', { phone: data.practice.phone })}{/if}{#if data.practice.phone && data.practice.fax}&ensp;·&ensp;{/if}{#if data.practice.fax}{t('report.practiceFax', { fax: data.practice.fax })}{/if}
			</span>
		</div>
		<dl class="patient">
			<dt>{t('report.patient')}</dt>
			<dd><strong>{p.legalName}</strong></dd>
			<dt>{t('report.dob')}</dt>
			<dd>{p.dob}</dd>
			<dt>{t('report.visit')}</dt>
			<dd>{e.date}</dd>
			<dt>{t('report.provider')}</dt>
			<dd>{e.provider}</dd>
			<dt>{t('rx.generatedLabel')}</dt>
			<dd>{generatedOn}</dd>
		</dl>
	</header>

	<h1>{isCtl ? t('rx.headingContactLens') : t('rx.headingSpectacle')}</h1>
	<p class="expires"><strong>{t('rx.expirationLabel')}</strong> {longDate(data.expires)}</p>

	{#if !isCtl}
		<section>
			<h2>{t('rx.distance')}</h2>
			<table>
				<thead>
					<tr>
						<th scope="col"><span class="visually-hidden">{t('rx.colEye')}</span></th>
						<th scope="col">{t('rx.sphere')}</th>
						<th scope="col">{t('rx.cylinder')}</th>
						<th scope="col">{t('rx.axis')}</th>
						{#if showPrism}<th scope="col" class:noprint={!prismFilled}>{t('rx.colPrism')}</th>{/if}
					</tr>
				</thead>
				<tbody>
					{#each ['OD', 'OS'] as eye (eye)}
						<tr>
							<th scope="row">{eyeSide(eye)}</th>
							<td>{@render field(`${eye}SPH`, t('rx.ariaSphere', { eye }))}</td>
							<td>{@render field(`${eye}CYL`, t('rx.ariaCylinder', { eye }))}</td>
							<td>{@render field(`${eye}AXIS`, t('rx.ariaAxis', { eye }))}</td>
							{#if showPrism}<td class:noprint={!prismFilled}>{@render field(`${eye}PRISM`, t('rx.ariaPrism', { eye }))}</td>{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section>
			<h2>{t('rx.lensType')}</h2>
			<div class="types" role="radiogroup" aria-label={t('rx.lensType')}>
				{#each RX_TYPES as label, i (label)}
					<label class="radio" class:chosen={rxType === String(i)}>
						<input type="radio" name="rxtype" value={String(i)} checked={rxType === String(i)} onchange={() => (rxType = String(i))} />
						{t(RX_TYPE_KEY[label])}
					</label>
				{/each}
				{#if rxType === ''}<span class="none-type">{t('rx.notSpecified')}</span>{/if}
			</div>
			{#if showAdd || showMid}
				<table class="adds">
					<thead>
						<tr>
							<th scope="col"><span class="visually-hidden">{t('rx.colEye')}</span></th>
							{#if showMid}<th scope="col">{t('rx.colMidAdd')}</th>{/if}
							{#if showAdd}<th scope="col">{t('rx.nearAdd')}</th>{/if}
						</tr>
					</thead>
					<tbody>
						{#each ['OD', 'OS'] as eye (eye)}
							<tr>
								<th scope="row">{eye}</th>
								{#if showMid}<td>{@render field(`${eye}MIDADD`, t('rx.ariaMidAdd', { eye }))}</td>{/if}
								{#if showAdd}<td>{@render field(`${eye}ADD`, t('rx.ariaNearAdd', { eye }))}</td>{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>

		<section class="fitting" class:empty={!hasFitting}>
			<details open={hasFitting || fittingOpen} ontoggle={(ev) => (fittingOpen = ev.currentTarget.open)}>
				<summary><h2>{t('rx.fittingData')}</h2></summary>
				<table>
					<thead>
						<tr>
							<th scope="col"><span class="visually-hidden">{t('rx.colEye')}</span></th>
							<th scope="col">{t('rx.hPrism')}</th>
							<th scope="col">{t('rx.base')}</th>
							<th scope="col">{t('rx.vPrism')}</th>
							<th scope="col">{t('rx.base')}</th>
							<th scope="col">{t('rx.slabOff')}</th>
							<th scope="col">{t('rx.vertex')}</th>
							<th scope="col">{t('rx.pdDist')}</th>
							<th scope="col">{t('rx.pdNear')}</th>
						</tr>
					</thead>
					<tbody>
						{#each ['OD', 'OS'] as eye (eye)}
							<tr>
								<th scope="row">{eye}</th>
								{#each FIT_KEYS as c (c)}<td>{@render field(`${eye}${c}`, t(FIT_ARIA[c], { eye }), 'narrow')}</td>{/each}
							</tr>
						{/each}
					</tbody>
				</table>
				<p class="line">
					<span
						><Msg key="rx.binocularPd"
							>{#snippet dist()}{@render field('BPDD', t('rx.ariaBpdDist'), 'narrow')}{/snippet}{#snippet near()}{@render field('BPDN', t('rx.ariaBpdNear'), 'narrow')}{/snippet}</Msg
						></span
					>
				</p>
				<p class="line">
					<label>
						{t('rx.lensMaterial')}
						<select class="f" value={g('LENS_MATERIAL')} onchange={(ev) => set('LENS_MATERIAL', ev.currentTarget.value)}>
							<option value=""></option>
							{#each LENS_MATERIALS as m (m)}<option value={m}>{m}</option>{/each}
							{#if g('LENS_MATERIAL') && !LENS_MATERIALS.includes(g('LENS_MATERIAL'))}<option value={g('LENS_MATERIAL')}>{g('LENS_MATERIAL')}</option>{/if}
						</select>
					</label>
				</p>
				<fieldset class="treat">
					<legend>{t('rx.lensTreatments')}</legend>
					{#each LENS_TREATMENTS as treatment (treatment)}
						{@const on = splitList(g('LENS_TREATMENTS')).includes(treatment)}
						<label class="check" class:chosen={on}>
							<input type="checkbox" checked={on} onchange={(ev) => toggleTreatment(treatment, ev.currentTarget.checked)} />
							{treatment}
						</label>
					{/each}
				</fieldset>
			</details>
		</section>
	{:else}
		<section>
			<table class="ctl">
				<thead>
					<tr>
						<th scope="col" class="lenshead"><span class="visually-hidden">{t('rx.colLens')}</span></th>
						<th scope="col" class="brandhead">{t('rx.colBrand')}</th>
						<th scope="col">{t('rx.sphere')}</th>
						<th scope="col">{t('rx.cylinder')}</th>
						<th scope="col">{t('rx.axis')}</th>
						<th scope="col">{t('rx.colBc')}</th>
						<th scope="col">{t('rx.colDiam')}</th>
						{#if ctlAdd}<th scope="col">{t('rx.colAdd')}</th>{/if}
						<th scope="col">{t('rx.quantity')}</th>
					</tr>
				</thead>
				<tbody>
					{#each ['OD', 'OS'] as eye (eye)}
						<tr>
							<th scope="row">{eye === 'OD' ? t('rx.rightLens') : t('rx.leftLens')}</th>
							<td class="brand">
								{@render field(`CTLBRAND${eye}`, t('rx.ariaBrand', { eye }), 'wide')}
								<span class="by" class:noprint={!g(`CTLMANUFACTURER${eye}`) && !g(`CTLSUPPLIER${eye}`)}>
									<Msg key="rx.ctlBy">{#snippet manufacturer()}{@render field(`CTLMANUFACTURER${eye}`, t('rx.ariaManufacturer', { eye }), 'mid')}{/snippet}</Msg>
									{#if g(`CTLSUPPLIER${eye}`)}{t('rx.ctlVia', { supplier: g(`CTLSUPPLIER${eye}`) })}{/if}
								</span>
							</td>
							<td>{@render field(`${eye}SPH`, t('rx.ariaSphere', { eye }))}</td>
							<td>{@render field(`${eye}CYL`, t('rx.ariaCylinder', { eye }))}</td>
							<td>{@render field(`${eye}AXIS`, t('rx.ariaAxis', { eye }))}</td>
							<td>{@render field(`${eye}BC`, t('rx.ariaBaseCurve', { eye }), 'narrow')}</td>
							<td>{@render field(`${eye}DIAM`, t('rx.ariaDiameter', { eye }), 'narrow')}</td>
							{#if ctlAdd}<td>{@render field(`${eye}ADD`, t('rx.ariaAdd', { eye }))}</td>{/if}
							<td>{@render field(`CTL${eye}QUANTITY`, t('rx.ariaQuantity', { eye }))}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}

	<section class="comments" class:empty={!comments}>
		<h2>{t('rx.comments')}</h2>
		<textarea class="f" rows="2" value={comments} aria-label={t('rx.comments')} oninput={(ev) => set('COMMENTS', ev.currentTarget.value)}></textarea>
		<p class="print-text">{comments}</p>
	</section>

	<footer>
		<div class="sign">
			<span class="line-sign"></span>
			<span>{t('rx.providerLine', { name: e.provider })}</span>
			<span class="draft">{t('rx.notESigned')}</span>
		</div>
		<div class="generated">{saved ? t('rx.footerPrinted', { when: printedAt }) : t('rx.footerGenerated', { when: generatedOn })}</div>
	</footer>
</article>

<style>
	:global(body) {
		background: var(--surface-2);
	}
	.toolbar {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		padding: var(--space-2) var(--space-4);
		background: var(--surface-1);
		border-bottom: 1px solid var(--hairline);
	}
	.what {
		color: var(--text-2);
	}
	.spacer {
		flex: 1;
	}
	.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
		min-width: 6em;
	}
	.msg {
		max-width: 8.5in;
		margin: var(--space-3) auto 0;
		padding: 0 var(--space-4);
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.msg.error {
		color: var(--danger);
	}
	/* Paper: black on white in every theme. */
	.rx {
		--ink: #111;
		--ink-2: #444;
		--rule: #c9c9c9;
		color: var(--ink);
		background: #fff;
		font: 11pt/1.4 var(--font-sans, system-ui, sans-serif);
		font-variant-numeric: tabular-nums;
		max-width: 8.5in;
		margin: var(--space-3) auto var(--space-6);
		padding: 0.6in 0.7in;
		box-sizing: border-box;
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.25);
	}
	header {
		display: flex;
		justify-content: space-between;
		gap: 1.5em;
		padding-bottom: 0.6em;
		border-bottom: 2px solid var(--ink);
	}
	.practice {
		display: grid;
		align-content: start;
		gap: 1px;
		font-size: 9.5pt;
		color: var(--ink-2);
	}
	.practice strong {
		font-size: 13pt;
		color: var(--ink);
	}
	.patient {
		display: grid;
		grid-template-columns: auto auto;
		gap: 1px 0.8em;
		margin: 0;
		font-size: 9.5pt;
	}
	.patient dt {
		color: var(--ink-2);
		text-align: right;
	}
	.patient dd {
		margin: 0;
	}
	h1 {
		font-size: 15pt;
		margin: 0.7em 0 0.2em;
	}
	.expires {
		margin: 0 0 0.6em;
	}
	section {
		margin-top: 0.9em;
		break-inside: avoid;
	}
	h2 {
		display: inline-block;
		font-size: 11pt;
		margin: 0 0 0.3em;
	}
	table {
		border-collapse: collapse;
	}
	th,
	td {
		text-align: left;
		padding: 2px 0.5em 2px 0;
		vertical-align: middle;
	}
	thead th {
		font-size: 8.5pt;
		font-weight: 600;
		color: var(--ink-2);
	}
	tbody th {
		font-weight: 600;
		white-space: nowrap;
	}
	.f {
		font: inherit;
		color: var(--ink);
		background: #fff;
		border: 0;
		border-bottom: 1px solid var(--rule);
		border-radius: 0;
		width: 6.5em;
		min-height: var(--target-min);
		padding: 0 4px;
	}
	.f.narrow {
		width: 4.5em;
	}
	.f.mid {
		width: 9em;
	}
	.f.wide {
		width: 11em;
	}
	.f:focus {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}
	select.f {
		width: auto;
	}
	textarea.f {
		width: 100%;
		resize: vertical;
		field-sizing: content;
	}
	.brand .by {
		display: block;
		font-size: 9pt;
		color: var(--ink-2);
	}
	.ctl .brand .by .f {
		width: calc(100% - 1.6em);
	}
	.types,
	.treat {
		display: flex;
		flex-wrap: wrap;
		gap: 0 1.2em;
		border: 0;
		padding: 0;
		margin: 0;
	}
	.treat legend {
		font-weight: 600;
		padding: 0;
		margin-bottom: 2px;
	}
	.radio,
	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
		min-height: var(--target-min);
	}
	.radio input,
	.check input {
		width: 18px;
		height: 18px;
		accent-color: #111;
	}
	.none-type {
		color: var(--ink-2);
		align-self: center;
	}
	.adds {
		margin-top: 0.3em;
	}
	.line {
		margin: 0.4em 0;
	}
	summary {
		cursor: pointer;
		min-height: var(--target-min);
		display: flex;
		align-items: center;
	}
	summary h2 {
		margin: 0;
	}
	.ctl,
	.fitting table {
		width: 100%;
		table-layout: fixed;
	}
	.ctl .f,
	.fitting td .f {
		width: 100%;
	}
	.lenshead {
		width: 6.5em;
	}
	.brandhead {
		width: 28%;
	}
	.fitting thead th:first-child {
		width: 2.5em;
	}
	.print-text {
		display: none;
		white-space: pre-wrap;
		margin: 0;
	}
	footer {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		margin-top: 2.5em;
		break-inside: avoid;
	}
	.sign {
		display: grid;
		gap: 2px;
		font-size: 10pt;
		min-width: 3in;
	}
	.line-sign {
		border-bottom: 1px solid var(--ink);
		height: 2.2em;
	}
	.draft {
		color: var(--ink-2);
		font-size: 8.5pt;
	}
	.generated {
		font-size: 8pt;
		color: var(--ink-2);
	}
	@media screen {
		section {
			overflow-x: auto;
		}
	}
	@media screen and (max-width: 760px) {
		.rx {
			padding: 1.25rem 1rem;
		}
		header {
			flex-direction: column;
		}
		section {
			overflow-x: auto;
		}
	}
	@media print {
		:global(body) {
			background: #fff;
		}
		.toolbar,
		.msg,
		.noprint {
			display: none;
		}
		.rx {
			box-shadow: none;
			margin: 0;
			max-width: none;
			padding: 0;
		}
		.f {
			border: 0;
			padding: 0;
			min-height: 0;
			appearance: none;
		}
		select.f {
			background: none;
		}
		/* Paper shows only the chosen lens type and treatments, as text. */
		.radio input,
		.check input,
		.radio:not(.chosen),
		.check:not(.chosen) {
			display: none;
		}
		.radio,
		.check {
			min-height: 0;
		}
		.fitting.empty,
		.comments.empty {
			display: none;
		}
		textarea.f {
			display: none;
		}
		.print-text {
			display: block;
		}
		summary {
			list-style: none;
			min-height: 0;
		}
		summary::-webkit-details-marker {
			display: none;
		}
	}
	@page {
		margin: 0.6in 0.7in;
	}
</style>
