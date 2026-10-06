<script lang="ts">
	// Glaucoma flow sheet (spec §8.3 with every FIX, §17 B16). Left: targets, eye medicines, visual
	// fields, OCT, gonioscopy and optic discs. Right: IOP by date and by hour, each with a data table.
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import DocViewer from '#lib/components/documents/DocViewer.svelte';
	import IopTargets from '#lib/components/sections/workup/IopTargets.svelte';
	import type { DocMeta } from '#lib/components/documents/types.ts';
	import { onMount } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { ExamLock, lockHeaders } from '#lib/exam/lock.svelte.ts';
	import { TARGET_SOURCE_LABEL } from '#lib/exam/sections/glaucoma.ts';
	import type { Findings } from '#lib/shorthand/parse.ts';
	import type { FlowMarker } from '#lib/server/flowsheet.ts';
	import DateChart from './DateChart.svelte';
	import HourChart from './HourChart.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const s = $derived(data.sheet);
	const pid = $derived(data.patient.id);

	// ---------- editable targets (this exam only) ----------
	// svelte-ignore state_referenced_locally
	let targetFindings = $state<Findings>(
		data.exam
			? Object.fromEntries(Object.entries(data.exam.targets).map(([k, value]) => [k, { value, isDefault: false }]))
			: {}
	);
	// svelte-ignore state_referenced_locally
	let effective = $state({ OD: data.sheet.targets?.OD.value ?? 21, OS: data.sheet.targets?.OS.value ?? 21 });
	// The exam's edit lock (§15.1). The flow sheet changes that exam's targets, so it takes the lock,
	// but only on the first edit: just looking never takes the exam away from anyone. The lock is
	// released when you leave (and before an in-app link, so the exam page can take it straight back).
	// The initial state ignores a lock held at load time: that is usually the exam page you came from,
	// which releases it as it closes. If someone else really holds it, the first save says so.
	// svelte-ignore state_referenced_locally
	const examApi = data.exam ? `/api/patients/${data.patient.id}/encounters/${data.exam.id}` : '';
	// svelte-ignore state_referenced_locally
	const lock = data.exam
		? new ExamLock(examApi, { signature: data.exam.lockState.signature, lock: null }, (f) => {
				// Fresh values only matter while read-only (someone else is editing); never overwrite typing.
				if (!lock?.readonly) return;
				targetFindings = { ODIOPTARGET: f.ODIOPTARGET ?? { value: '', isDefault: false }, OSIOPTARGET: f.OSIOPTARGET ?? { value: '', isDefault: false } };
			})
		: null;
	let lockStarted: Promise<void> | null = null;
	const ensureLock = () => (lockStarted ??= lock ? lock.start() : Promise.resolve());

	/** Gives the lock back and waits for the server, so the next page can take it at once. */
	async function releaseNow() {
		if (!lock || lock.mode !== 'editing') return;
		await saveTargets();
		await fetch(`${examApi}/lock`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...lockHeaders() },
			body: JSON.stringify({ action: 'release' })
		}).catch(() => {});
	}

	beforeNavigate((nav) => {
		if (!lock || lock.mode !== 'editing' || !nav.to || nav.type === 'leave' || nav.type === 'popstate' || leaving) return;
		nav.cancel();
		leaving = true;
		const url = nav.to.url;
		void releaseNow().then(() => goto(url));
	});
	let leaving = false;

	onMount(() => {
		if (!lock) return;
		const hide = () => lock.release(true);
		const vis = () => document.visibilityState === 'visible' && lockStarted && void lock.resume();
		window.addEventListener('pagehide', hide);
		document.addEventListener('visibilitychange', vis);
		return () => {
			window.removeEventListener('pagehide', hide);
			document.removeEventListener('visibilitychange', vis);
			void saveTargets();
			if (lockStarted) lock.stop();
		};
	});

	let saveState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let saveError = $state('');
	const pending = new Map<string, string>();
	let timer: ReturnType<typeof setTimeout> | undefined;

	function editTarget(field: string, value: string) {
		targetFindings = { ...targetFindings, [field]: { value, isDefault: false } };
		pending.set(field, value);
		void ensureLock();
		clearTimeout(timer);
		timer = setTimeout(saveTargets, 500);
	}

	async function saveTargets() {
		clearTimeout(timer);
		if (!data.exam || pending.size === 0) return;
		await ensureLock();
		const changes = [...pending].map(([field, value]) => ({ field, value, isDefault: false }));
		pending.clear();
		saveState = 'saving';
		try {
			const res = await fetch(`${examApi}/findings`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json', ...lockHeaders() },
				body: JSON.stringify({ changes })
			});
			if (res.status === 423) {
				const body = await res.json().catch(() => ({}));
				lock?.lost(body);
				throw new Error(body.message ?? 'This exam cannot be changed right now.');
			}
			if (!res.ok) throw new Error(`Not saved (the server answered ${res.status}).`);
			saveState = 'saved';
			saveError = '';
		} catch (e) {
			saveState = 'error';
			saveError = `${(e as Error).message} The targets shown were not saved.`;
		}
	}

	/** Live update (§8.3): today's target points follow the boxes without reloading. */
	const visits = $derived(s.visits.map((v) => (v.current ? { ...v, target: { ...effective } } : v)));
	const visitsNewest = $derived([...visits].reverse());
	const gonio = $derived(visitsNewest.filter((v) => v.gonio.OD || v.gonio.OS));
	const discs = $derived(visitsNewest.filter((v) => v.cup.OD || v.cup.OS));

	// ---------- documents ----------
	let viewing = $state<DocMeta | null>(null);
	function openMarker(m: FlowMarker) {
		viewing = [...s.vf, ...s.oct].find((d) => d.id === m.ref && m.kind !== 'GONIO') ?? null;
	}

	const METHOD = { AP: 'App', TPN: 'Tpn' } as const;
	const asOfLabel = $derived(data.exam ? `as of the visit on ${data.exam.date}` : `as of today, ${s.asOf}`);
</script>

<svelte:head><title>Glaucoma flow sheet · {data.patient.name} · OpenVision</title></svelte:head>

<header class="top">
	<nav aria-label="Back">
		<a href="/patients/{pid}">← {data.patient.name}</a>
		{#if data.exam}<a href="/patients/{pid}/encounters/{data.exam.id}">Back to the exam of {data.exam.date}</a>{/if}
	</nav>
	<ThemeToggle />
</header>

<main>
	<div class="title">
		<h1>Glaucoma flow sheet</h1>
		<p class="meta num">{data.patient.name} · DOB {data.patient.dob} · MRN {data.patient.mrn} · {asOfLabel}</p>
		<p class="help">
			IOP uses applanation when recorded, otherwise Tono-Pen (finger tension is not charted). The last 20 visits are shown;
			{#if data.exam}visits after this exam are left out.{:else}open it from an exam to edit that exam's targets.{/if}
		</p>
	</div>

	<div class="layout">
		<div class="left">
			<section class="card" aria-labelledby="t-h">
				<h2 id="t-h">Current targets</h2>
				{#if data.exam && lock && !lock.readonly}
					<IopTargets
						context={{ patientId: pid, encounterId: data.exam.id }}
						findings={targetFindings}
						onedit={editTarget}
						fallbackOverride={data.exam.fallback}
						bind:effective
					/>
					<p class="save" role="status" aria-live="polite">
						{#if saveState === 'saving'}Saving…{:else if saveState === 'saved'}Saved to the exam of {data.exam.date}.{/if}
					</p>
					{#if saveState === 'error'}<p class="err" role="alert">{saveError}</p>{/if}
				{:else if s.targets}
					{#if lock?.readonly}
						<p class="note-locked" role="status">
							{lock.mode === 'signed'
								? 'This exam is signed, so its targets are read-only.'
								: lock.holder
									? `${lock.holder.holderName} is editing this exam, so its targets are read-only here.`
									: (lock.message ?? 'Targets are read-only right now.')}
						</p>
					{/if}
					<dl class="targets">
						{#each ['OD', 'OS'] as const as eye (eye)}
							<div>
								<dt><span class="eye {eye.toLowerCase()}">{eye}</span></dt>
								<dd><strong class="num">{s.targets[eye].value}</strong> mmHg <span class="src">{TARGET_SOURCE_LABEL[s.targets[eye].source]}{s.targets[eye].from ? ` (${s.targets[eye].from})` : ''}</span></dd>
							</div>
						{/each}
					</dl>
				{:else}
					<p class="empty">No visits yet.</p>
				{/if}
			</section>

			<section class="card" aria-labelledby="m-h">
				<h2 id="m-h">Current eye medicines</h2>
				{#if s.meds.current.length}
					<table class="mini">
						<thead><tr><th scope="col">Medicine</th><th scope="col">Started</th></tr></thead>
						<tbody>
							{#each s.meds.current as m (m.id)}
								<tr><td>{m.title}{#if m.comments}<span class="sub block">{m.comments}</span>{/if}</td><td class="num">{m.begin || '—'}</td></tr>
							{/each}
						</tbody>
					</table>
				{:else}
					<p class="empty">None recorded.</p>
				{/if}
				{#if s.meds.prior.length}
					<details>
						<summary>Prior eye medicines ({s.meds.prior.length})</summary>
						<table class="mini">
							<thead><tr><th scope="col">Medicine</th><th scope="col">Started</th><th scope="col">Stopped</th></tr></thead>
							<tbody>
								{#each s.meds.prior as m (m.id)}
									<tr><td>{m.title}</td><td class="num">{m.begin || '—'}</td><td class="num">{m.end}</td></tr>
								{/each}
							</tbody>
						</table>
					</details>
				{/if}
			</section>

			{#each [{ id: 'vf', title: 'Visual fields', list: s.vf }, { id: 'oct', title: 'OCT optic nerve / RNFL', list: s.oct }] as g (g.id)}
				<section class="card" aria-labelledby="{g.id}-h">
					<h2 id="{g.id}-h">{g.title}</h2>
					{#if g.list.length}
						{@const [newest, ...older] = g.list}
						<button type="button" class="doc" onclick={() => (viewing = newest)}>
							<span class="num">{newest.takenOn}</span> <span class="sub">{newest.notes || newest.filename}</span>
						</button>
						{#if older.length}
							<details>
								<summary>Older ({older.length})</summary>
								<ul class="docs">
									{#each older as d (d.id)}
										<li><button type="button" class="doc" onclick={() => (viewing = d)}><span class="num">{d.takenOn}</span> <span class="sub">{d.notes || d.filename}</span></button></li>
									{/each}
								</ul>
							</details>
						{/if}
					{:else}
						<p class="empty">None stored. <a href="/patients/{pid}/documents?zone=GLAUCOMA">Upload on the documents page</a>.</p>
					{/if}
				</section>
			{/each}

			<section class="card" aria-labelledby="g-h">
				<h2 id="g-h">Gonioscopy</h2>
				{#if gonio.length}
					<table class="mini">
						<thead><tr><th scope="col">Visit</th><th scope="col" class="od">OD</th><th scope="col" class="os">OS</th></tr></thead>
						<tbody>
							{#each gonio as v (v.id)}<tr><th scope="row" class="num">{v.date}</th><td>{v.gonio.OD}</td><td>{v.gonio.OS}</td></tr>{/each}
						</tbody>
					</table>
				{:else}
					<p class="empty">Not recorded at any visit shown.</p>
				{/if}
			</section>

			<section class="card" aria-labelledby="d-h">
				<h2 id="d-h">Optic discs (C/D)</h2>
				{#if discs.length}
					<table class="mini">
						<thead><tr><th scope="col">Visit</th><th scope="col" class="od">OD cup</th><th scope="col" class="os">OS cup</th></tr></thead>
						<tbody>
							{#each discs as v (v.id)}<tr><th scope="row" class="num">{v.date}</th><td class="num">{v.cup.OD}</td><td class="num">{v.cup.OS}</td></tr>{/each}
						</tbody>
					</table>
				{:else}
					<p class="empty">Not recorded at any visit shown.</p>
				{/if}
			</section>
		</div>

		<div class="right">
			<section class="card" aria-labelledby="cd-h">
				<h2 id="cd-h">IOP by date</h2>
				{#if visits.length}
					<DateChart {visits} markers={s.markers} dates={s.dates} onmarker={openMarker} />
					<details>
						<summary>Table of these values</summary>
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<div class="scroll" role="region" aria-label="IOP by date table" tabindex="0">
							<table class="mini">
								<thead>
									<tr>
										<th scope="col">Date</th>
										<th scope="col" class="od">IOP OD</th>
										<th scope="col" class="os">IOP OS</th>
										<th scope="col" class="od">Target OD</th>
										<th scope="col" class="os">Target OS</th>
										<th scope="col">Tests performed</th>
									</tr>
								</thead>
								<tbody>
									{#each s.dates as date (date)}
										{@const vs = visits.filter((v) => v.date === date)}
										{@const tests = s.markers.filter((m) => m.date === date).map((m) => (m.kind === 'GONIO' ? 'Gonio' : m.kind))}
										{#if vs.length}
											{#each vs as v (v.id)}
												<tr class:current={v.current}>
													<th scope="row" class="num">{date}{v.current ? ' (this visit)' : ''}</th>
													{#each ['OD', 'OS'] as const as eye (eye)}
														{@const r = v.iop[eye]}
														<td class="num">{#if r}{r.value} <span class="sub">{METHOD[r.method]}</span>{#if r.value > v.target[eye]} <span class="high">above target</span>{/if}{:else}—{/if}</td>
													{/each}
													<td class="num">{v.target.OD}</td>
													<td class="num">{v.target.OS}</td>
													<td>{tests.join(', ')}</td>
												</tr>
											{/each}
										{:else}
											<tr><th scope="row" class="num">{date}</th><td>—</td><td>—</td><td>—</td><td>—</td><td>{tests.join(', ')}</td></tr>
										{/if}
									{/each}
								</tbody>
							</table>
						</div>
					</details>
				{:else}
					<p class="empty">No visits to chart yet.</p>
				{/if}
			</section>

			<section class="card" aria-labelledby="ch-h">
				<h2 id="ch-h">IOP by time of day</h2>
				<HourChart {visits} />
				{#if visits.some((v) => v.time && (v.iop.OD || v.iop.OS))}
					<details>
						<summary>Table of these values</summary>
						<table class="mini">
							<thead><tr><th scope="col">Time</th><th scope="col">Date</th><th scope="col" class="od">OD</th><th scope="col" class="os">OS</th></tr></thead>
							<tbody>
								{#each [...visits].filter((v) => v.time && (v.iop.OD || v.iop.OS)).sort((a, b) => a.time!.localeCompare(b.time!)) as v (v.id)}
									<tr><th scope="row" class="num">{v.time}</th><td class="num">{v.date}</td><td class="num">{v.iop.OD?.value ?? '—'}</td><td class="num">{v.iop.OS?.value ?? '—'}</td></tr>
								{/each}
							</tbody>
						</table>
					</details>
				{/if}
			</section>
		</div>
	</div>
</main>

{#if viewing}
	<DocViewer doc={viewing} onclose={() => (viewing = null)} />
{/if}

<style>
	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-4);
		background: var(--surface-1);
		border-bottom: 1px solid var(--hairline);
	}
	.top nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--space-4);
	}
	.top a {
		display: inline-flex;
		align-items: center;
		min-height: max(40px, var(--target-min));
	}
	main {
		max-width: 1400px;
		margin: 0 auto;
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	h1 {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
	}
	h2 {
		margin: 0;
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
	}
	.meta {
		color: var(--text-2);
		margin: var(--space-1) 0 0;
	}
	.help {
		color: var(--text-3);
		font-size: var(--text-xs);
		margin: var(--space-1) 0 0;
		max-width: var(--measure-prose);
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
		gap: var(--space-3);
		align-items: start;
	}
	@media (max-width: 900px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.left,
	.right {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.card {
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.empty {
		color: var(--text-2);
		margin: 0;
	}
	.err {
		color: var(--danger);
		font-weight: var(--weight-semibold);
		margin: 0;
	}
	.save {
		margin: 0;
		min-height: 1.4em;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.note-locked {
		margin: 0;
		color: var(--warn);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
	}
	.targets {
		margin: 0;
		display: grid;
		gap: var(--space-2);
	}
	.targets div {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}
	.targets dd {
		margin: 0;
	}
	.src,
	.sub {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.sub.block {
		display: block;
	}
	.mini td.num,
	.mini th.num {
		white-space: nowrap;
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
	table.mini {
		width: 100%;
		border-collapse: collapse;
	}
	.mini th,
	.mini td {
		text-align: left;
		padding: var(--space-1) var(--space-2);
		border-bottom: 1px solid var(--hairline);
		vertical-align: top;
	}
	.mini thead th {
		font-size: var(--text-xs);
		color: var(--text-2);
		background: var(--surface-2);
	}
	.mini tbody th {
		font-weight: var(--weight-regular);
		white-space: nowrap;
	}
	th.od {
		color: var(--od);
	}
	th.os {
		color: var(--os);
	}
	tr.current {
		background: var(--accent-soft);
	}
	.high {
		color: var(--abnormal);
		font-weight: var(--weight-semibold);
		font-size: var(--text-xs);
	}
	.high::before {
		content: '▲ ';
	}
	details summary {
		cursor: pointer;
		min-height: max(40px, var(--target-min));
		display: flex;
		align-items: center;
		color: var(--accent);
	}
	.doc {
		width: 100%;
		text-align: left;
		min-height: max(40px, var(--target-min));
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 var(--space-2);
		padding: var(--space-1) var(--space-2);
	}
	.doc .sub {
		display: inline;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.docs {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.scroll {
		overflow-x: auto;
	}
</style>
