<script lang="ts">
	// Spectacle / contact lens Rx (spec §12.4). Values come from the exam; small edits here (transpose, CTL details,
	// quantity, treatments) go into the dispense record (FIX), which is written when the user prints (§12.5 FIX).
	import { onMount } from 'svelte';
	import {
		LENS_MATERIALS,
		LENS_TREATMENTS,
		METHOD_LABEL,
		RX_TYPES,
		formatAxis,
		formatPower,
		formatUpper,
		splitList,
		sumPd,
		transpose,
		type RxValues
	} from '#lib/exam/sections/refraction.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const p = $derived(data.patient);
	const e = $derived(data.encounter);
	const source = $derived(data.rx.source);
	const isCtl = $derived(data.rx.kind === 'CTL');
	// svelte-ignore state_referenced_locally
	let values = $state<RxValues>({ ...data.rx.values });
	// svelte-ignore state_referenced_locally
	let rxType = $state(data.rx.rxType);
	let comments = $derived(values.COMMENTS ?? '');

	const generatedOn = new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	const longDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'long' });
	const title = $derived(`${isCtl ? 'Contact lens' : 'Spectacle'} Rx · ${p.legalName}`);

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
			const t = transpose({ sph: g(`${eye}SPH`), cyl: g(`${eye}CYL`), axis: g(`${eye}AXIS`) });
			if (!t) continue;
			any = true;
			values = { ...values, [`${eye}SPH`]: t.sph, [`${eye}CYL`]: t.cyl, [`${eye}AXIS`]: t.axis };
		}
		message = any ? 'Transposed. The printed record keeps these values; the exam is unchanged.' : 'Nothing to transpose (no cylinder).';
	}

	function toggleTreatment(t: string, on: boolean) {
		const cur = splitList(g('LENS_TREATMENTS')).filter((x) => x !== t);
		if (on) cur.push(t);
		set('LENS_TREATMENTS', LENS_TREATMENTS.filter((x) => cur.includes(x)).concat(cur.filter((x) => !LENS_TREATMENTS.includes(x))).join('|'));
	}

	// ---------- what to show ----------
	const prismFilled = $derived(['ODPRISM', 'OSPRISM'].some((k) => g(k)));
	/** MR and AR offer a prism box on screen; paper shows the column only when filled. */
	const showPrism = $derived(prismFilled || data.rx.kind === 'MR' || data.rx.kind === 'AR');
	const showMid = $derived(rxType === '2' || rxType === '3' || !!(g('ODMIDADD') || g('OSMIDADD')));
	const showAdd = $derived(rxType !== '0' || !!(g('ODADD') || g('OSADD')));
	const FIT_KEYS = ['HPD', 'HBASE', 'VPD', 'VBASE', 'SLABOFF', 'VERTEXDIST', 'MPDD', 'MPDN'];
	const hasFitting = $derived(
		FIT_KEYS.some((c) => g(`OD${c}`) || g(`OS${c}`)) || !!(g('BPDD') || g('BPDN') || g('LENS_MATERIAL') || g('LENS_TREATMENTS'))
	);
	let fittingOpen = $state(false);
	const ctlAdd = $derived(!!(g('ODADD') || g('OSADD')));

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
			message = `Not printed: the dispense record could not be saved (${err instanceof Error ? err.message : err}).`;
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

	const printedAt = $derived(saved ? new Date(saved.printedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
</script>

<svelte:head><title>{title} · OpenVision</title></svelte:head>

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

<div class="toolbar" role="toolbar" aria-label="Rx">
	<a href="/patients/{p.id}/encounters/{e.id}">← Exam</a>
	<span class="what">{METHOD_LABEL[data.rx.kind]}{data.rx.kind === 'W' ? ` · glasses #${source.slice(1)}` : ''}</span>
	<a href="/patients/{p.id}/encounters/{e.id}/rx/history">Dispensed history</a>
	<span class="spacer"></span>
	{#if !isCtl}<button type="button" onclick={doTranspose} title="Plus/minus cylinder transpose">± Transpose</button>{/if}
	<button type="button" class="primary" onclick={printNow} disabled={busy}>Print</button>
</div>
<p class="msg" class:error={failed} role="status" aria-live="polite">
	{#if message}{message}{:else if saved}Dispense record saved, printed {printedAt}.{:else}Editing here changes only this Rx, not the exam. Printing saves a dispense record.{/if}
</p>

<article class="rx" aria-label={title}>
	<header>
		<div class="practice">
			<strong>{data.practice.name}</strong>
			{#if data.practice.address}<span>{data.practice.address}</span>{/if}
			<span>
				{#if data.practice.phone}Phone {data.practice.phone}{/if}{#if data.practice.phone && data.practice.fax}&ensp;·&ensp;{/if}{#if data.practice.fax}Fax {data.practice.fax}{/if}
			</span>
		</div>
		<dl class="patient">
			<dt>Patient</dt>
			<dd><strong>{p.legalName}</strong></dd>
			<dt>DOB</dt>
			<dd>{p.dob}</dd>
			<dt>Visit</dt>
			<dd>{e.date}</dd>
			<dt>Provider</dt>
			<dd>{e.provider}</dd>
			<dt>Generated</dt>
			<dd>{generatedOn}</dd>
		</dl>
	</header>

	<h1>{isCtl ? 'Contact lens prescription' : 'Spectacle prescription'}</h1>
	<p class="expires"><strong>Expiration date:</strong> {longDate(data.expires)}</p>

	{#if !isCtl}
		<section>
			<h2>Distance</h2>
			<table>
				<thead>
					<tr>
						<th scope="col"><span class="visually-hidden">Eye</span></th>
						<th scope="col">Sphere</th>
						<th scope="col">Cylinder</th>
						<th scope="col">Axis</th>
						{#if showPrism}<th scope="col" class:noprint={!prismFilled}>Prism</th>{/if}
					</tr>
				</thead>
				<tbody>
					{#each ['OD', 'OS'] as eye (eye)}
						<tr>
							<th scope="row">{eye} ({eye === 'OD' ? 'right' : 'left'})</th>
							<td>{@render field(`${eye}SPH`, `${eye} sphere`)}</td>
							<td>{@render field(`${eye}CYL`, `${eye} cylinder`)}</td>
							<td>{@render field(`${eye}AXIS`, `${eye} axis`)}</td>
							{#if showPrism}<td class:noprint={!prismFilled}>{@render field(`${eye}PRISM`, `${eye} prism`)}</td>{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section>
			<h2>Lens type</h2>
			<div class="types" role="radiogroup" aria-label="Lens type">
				{#each RX_TYPES as label, i (label)}
					<label class="radio" class:chosen={rxType === String(i)}>
						<input type="radio" name="rxtype" value={String(i)} checked={rxType === String(i)} onchange={() => (rxType = String(i))} />
						{label}
					</label>
				{/each}
				{#if rxType === ''}<span class="none-type">Not specified</span>{/if}
			</div>
			{#if showAdd || showMid}
				<table class="adds">
					<thead>
						<tr>
							<th scope="col"><span class="visually-hidden">Eye</span></th>
							{#if showMid}<th scope="col">Mid ADD</th>{/if}
							{#if showAdd}<th scope="col">Near ADD</th>{/if}
						</tr>
					</thead>
					<tbody>
						{#each ['OD', 'OS'] as eye (eye)}
							<tr>
								<th scope="row">{eye}</th>
								{#if showMid}<td>{@render field(`${eye}MIDADD`, `${eye} mid ADD`)}</td>{/if}
								{#if showAdd}<td>{@render field(`${eye}ADD`, `${eye} near ADD`)}</td>{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>

		<section class="fitting" class:empty={!hasFitting}>
			<details open={hasFitting || fittingOpen} ontoggle={(ev) => (fittingOpen = ev.currentTarget.open)}>
				<summary><h2>Fitting data</h2></summary>
				<table>
					<thead>
						<tr>
							<th scope="col"><span class="visually-hidden">Eye</span></th>
							<th scope="col">H prism</th>
							<th scope="col">Base</th>
							<th scope="col">V prism</th>
							<th scope="col">Base</th>
							<th scope="col">Slab-off</th>
							<th scope="col">Vertex</th>
							<th scope="col">PD dist</th>
							<th scope="col">PD near</th>
						</tr>
					</thead>
					<tbody>
						{#each ['OD', 'OS'] as eye (eye)}
							<tr>
								<th scope="row">{eye}</th>
								{#each FIT_KEYS as c (c)}<td>{@render field(`${eye}${c}`, `${eye} ${c.toLowerCase()}`, 'narrow')}</td>{/each}
							</tr>
						{/each}
					</tbody>
				</table>
				<p class="line">
					<span>Binocular PD: dist {@render field('BPDD', 'Binocular PD distance', 'narrow')} near {@render field('BPDN', 'Binocular PD near', 'narrow')}</span>
				</p>
				<p class="line">
					<label>
						Lens material
						<select class="f" value={g('LENS_MATERIAL')} onchange={(ev) => set('LENS_MATERIAL', ev.currentTarget.value)}>
							<option value=""></option>
							{#each LENS_MATERIALS as m (m)}<option value={m}>{m}</option>{/each}
							{#if g('LENS_MATERIAL') && !LENS_MATERIALS.includes(g('LENS_MATERIAL'))}<option value={g('LENS_MATERIAL')}>{g('LENS_MATERIAL')}</option>{/if}
						</select>
					</label>
				</p>
				<fieldset class="treat">
					<legend>Lens treatments</legend>
					{#each LENS_TREATMENTS as t (t)}
						{@const on = splitList(g('LENS_TREATMENTS')).includes(t)}
						<label class="check" class:chosen={on}>
							<input type="checkbox" checked={on} onchange={(ev) => toggleTreatment(t, ev.currentTarget.checked)} />
							{t}
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
						<th scope="col" class="lenshead"><span class="visually-hidden">Lens</span></th>
						<th scope="col" class="brandhead">Brand</th>
						<th scope="col">Sphere</th>
						<th scope="col">Cylinder</th>
						<th scope="col">Axis</th>
						<th scope="col">BC</th>
						<th scope="col">Diam</th>
						{#if ctlAdd}<th scope="col">ADD</th>{/if}
						<th scope="col">Quantity</th>
					</tr>
				</thead>
				<tbody>
					{#each ['OD', 'OS'] as eye (eye)}
						<tr>
							<th scope="row">{eye === 'OD' ? 'Right lens' : 'Left lens'}</th>
							<td class="brand">
								{@render field(`CTLBRAND${eye}`, `${eye} brand`, 'wide')}
								<span class="by" class:noprint={!g(`CTLMANUFACTURER${eye}`) && !g(`CTLSUPPLIER${eye}`)}>
									by {@render field(`CTLMANUFACTURER${eye}`, `${eye} manufacturer`, 'mid')}
									{#if g(`CTLSUPPLIER${eye}`)}via {g(`CTLSUPPLIER${eye}`)}{/if}
								</span>
							</td>
							<td>{@render field(`${eye}SPH`, `${eye} sphere`)}</td>
							<td>{@render field(`${eye}CYL`, `${eye} cylinder`)}</td>
							<td>{@render field(`${eye}AXIS`, `${eye} axis`)}</td>
							<td>{@render field(`${eye}BC`, `${eye} base curve`, 'narrow')}</td>
							<td>{@render field(`${eye}DIAM`, `${eye} diameter`, 'narrow')}</td>
							{#if ctlAdd}<td>{@render field(`${eye}ADD`, `${eye} ADD`)}</td>{/if}
							<td>{@render field(`CTL${eye}QUANTITY`, `${eye} quantity`)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}

	<section class="comments" class:empty={!comments}>
		<h2>Comments</h2>
		<textarea class="f" rows="2" value={comments} aria-label="Comments" oninput={(ev) => set('COMMENTS', ev.currentTarget.value)}></textarea>
		<p class="print-text">{comments}</p>
	</section>

	<footer>
		<div class="sign">
			<span class="line-sign"></span>
			<span>Provider: {e.provider}</span>
			<span class="draft">Not electronically signed</span>
		</div>
		<div class="generated">{saved ? `Printed ${printedAt}` : `Generated ${generatedOn}`} · OpenVision</div>
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
