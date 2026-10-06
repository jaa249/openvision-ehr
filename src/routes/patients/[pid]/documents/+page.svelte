<script lang="ts">
	// Patient documents (spec §15.4): every stored photo, scan and letter, filterable by exam zone and
	// category, with upload, notes, soft delete and a viewer. Newest by date taken first (FIX).
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import DocViewer from '#lib/components/documents/DocViewer.svelte';
	import { deleteDocumentFile, updateDocumentMeta, uploadDocumentFile } from '#lib/components/documents/client.ts';
	import {
		DOC_ACCEPT,
		DOC_ZONES,
		DOC_ZONE_LABEL,
		docUrl,
		formatBytes,
		isImage,
		type DocMeta,
		type DocZone
	} from '#lib/components/documents/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	let docs = $state<DocMeta[]>(data.documents);
	const pid = $derived(data.patient.id);
	const catById = $derived(new Map(data.categories.map((c) => [c.id, c])));
	const visitById = $derived(new Map(data.visits.map((v) => [v.id, v])));

	// ---------- filters (kept in the address so a link from an exam opens filtered) ----------
	const initZone = page.url.searchParams.get('zone');
	let zone = $state<DocZone | ''>((DOC_ZONES as readonly string[]).includes(initZone ?? '') ? (initZone as DocZone) : '');
	let category = $state(page.url.searchParams.get('category') ?? '');
	let search = $state('');
	const zoneCats = $derived(
		data.categories.filter((c) => !zone || (zone === 'OTHER' ? c.zones.length === 0 : c.zones.includes(zone)))
	);
	$effect(() => {
		if (category && !zoneCats.some((c) => c.id === category)) category = '';
	});
	const shown = $derived(
		docs.filter((d) => {
			if (category && d.category !== category) return false;
			if (zone && !zoneCats.some((c) => c.id === d.category)) return false;
			const q = search.trim().toLowerCase();
			return !q || `${d.filename} ${d.notes} ${d.categoryName}`.toLowerCase().includes(q);
		})
	);
	$effect(() => {
		const u = new URL(page.url.href);
		for (const [k, v] of [['zone', zone], ['category', category]] as const) {
			if (v) u.searchParams.set(k, v);
			else u.searchParams.delete(k);
		}
		if (u.search !== page.url.search) replaceState(u, {});
	});

	// ---------- upload ----------
	let upCategory = $state('');
	// svelte-ignore state_referenced_locally
	let upDate = $state(data.today);
	let upNotes = $state('');
	let upFiles = $state<FileList | null>(null);
	let fileInput: HTMLInputElement;
	let uploading = $state(false);
	let upError = $state('');
	let status = $state('');
	$effect(() => {
		// Follow the category filter so "upload" lands where the user is looking.
		if (category) upCategory = category;
	});

	async function upload(e: SubmitEvent) {
		e.preventDefault();
		upError = '';
		if (!upCategory) return (upError = 'Choose a category.');
		if (!upFiles?.length) return (upError = 'Choose a file to upload.');
		uploading = true;
		const saved: DocMeta[] = [];
		for (const f of upFiles) {
			status = `Uploading ${f.name}…`;
			try {
				saved.push(await uploadDocumentFile(pid, f, { category: upCategory, takenOn: upDate, notes: upNotes }));
			} catch (err) {
				upError = `${f.name}: ${(err as Error).message}`;
			}
		}
		uploading = false;
		if (saved.length) {
			docs = sortDocs([...saved, ...docs]);
			status = `Uploaded ${saved.length === 1 ? saved[0].filename : `${saved.length} files`}.`;
			upNotes = '';
			fileInput.value = '';
			upFiles = null;
		} else status = '';
	}

	const sortDocs = (list: DocMeta[]) =>
		[...list].sort((a, b) => b.takenOn.localeCompare(a.takenOn) || b.createdAt.localeCompare(a.createdAt) || b.id - a.id);

	// ---------- notes ----------
	let editing = $state<number | null>(null);
	let draftNotes = $state('');
	let draftDate = $state('');
	let editError = $state('');
	function startEdit(d: DocMeta) {
		editing = d.id;
		draftNotes = d.notes;
		draftDate = d.takenOn;
		editError = '';
	}
	async function saveEdit(d: DocMeta) {
		try {
			const u = await updateDocumentMeta(pid, d.id, { notes: draftNotes, takenOn: draftDate });
			docs = sortDocs(docs.map((x) => (x.id === u.id ? u : x)));
			editing = null;
			status = `Saved notes for ${u.filename}.`;
			requestAnimationFrame(() => document.getElementById(`doc-edit-${u.id}`)?.focus());
		} catch (err) {
			editError = (err as Error).message;
		}
	}

	// ---------- delete ----------
	let confirmDialog: HTMLDialogElement;
	let toDelete = $state<DocMeta | null>(null);
	let deleteError = $state('');
	function askDelete(d: DocMeta) {
		toDelete = d;
		deleteError = '';
		confirmDialog.showModal();
	}
	async function confirmDelete() {
		if (!toDelete) return;
		const d = toDelete;
		try {
			await deleteDocumentFile(pid, d.id);
			docs = docs.filter((x) => x.id !== d.id);
			confirmDialog.close();
			status = `Deleted ${d.filename}.`;
		} catch (err) {
			deleteError = (err as Error).message;
		}
	}

	let viewing = $state<DocMeta | null>(null);
</script>

<svelte:head><title>Documents · {data.patient.name} · OpenVision</title></svelte:head>

<header class="top">
	<a href="/patients/{pid}">← {data.patient.name}</a>
	<ThemeToggle />
</header>

<main>
	<div class="title">
		<h1>Documents and images</h1>
		<p class="meta num">{data.patient.name} · DOB {data.patient.dob} · MRN {data.patient.mrn}</p>
	</div>

	<p class="visually-hidden" role="status" aria-live="polite">{status}</p>

	<section class="card" aria-labelledby="up-h">
		<h2 id="up-h">Upload</h2>
		<form class="upload" onsubmit={upload} novalidate>
			<div class="field">
				<label for="up-cat">Category</label>
				<select id="up-cat" bind:value={upCategory} required aria-invalid={upError === 'Choose a category.' ? 'true' : undefined}>
					<option value="" disabled>Choose…</option>
					{#each DOC_ZONES as z (z)}
						{@const list = data.categories.filter((c) => (z === 'OTHER' ? c.zones.length === 0 : c.zones[0] === z))}
						{#if list.length}
							<optgroup label={DOC_ZONE_LABEL[z]}>
								{#each list as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
							</optgroup>
						{/if}
					{/each}
				</select>
			</div>
			<div class="field">
				<label for="up-date">Date taken</label>
				<input id="up-date" type="date" bind:value={upDate} max={data.today} required />
			</div>
			<div class="field grow">
				<label for="up-notes">Notes <span class="opt">(optional)</span></label>
				<input id="up-notes" bind:value={upNotes} maxlength="2000" autocomplete="off" />
			</div>
			<div class="field grow">
				<label for="up-file">File</label>
				<input id="up-file" type="file" accept={DOC_ACCEPT} multiple bind:files={upFiles} bind:this={fileInput} aria-describedby="up-help" />
			</div>
			<button type="submit" class="primary" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload'}</button>
		</form>
		<p class="help" id="up-help">
			PNG, JPEG or PDF, up to 15 MB each. On a tablet the file button also offers the camera. Files uploaded here belong to the
			patient, not to one visit; files added from an exam are tied to that visit.
		</p>
		{#if upError}<p class="err" role="alert">{upError}</p>{/if}
	</section>

	<section class="card" aria-labelledby="list-h">
		<div class="row">
			<h2 id="list-h">Stored documents</h2>
			<span class="meta" aria-live="polite">Showing {shown.length} of {docs.length}</span>
		</div>
		<div class="filters" role="search" aria-label="Filter documents">
			<div class="field">
				<label for="f-zone">Exam area</label>
				<select id="f-zone" bind:value={zone}>
					<option value="">All areas</option>
					{#each DOC_ZONES as z (z)}<option value={z}>{DOC_ZONE_LABEL[z]}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="f-cat">Category</label>
				<select id="f-cat" bind:value={category}>
					<option value="">All categories</option>
					{#each zoneCats as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
				</select>
			</div>
			<div class="field grow">
				<label for="f-q">Search names and notes</label>
				<input id="f-q" type="search" bind:value={search} autocomplete="off" />
			</div>
			{#if zone || category || search}
				<button type="button" class="clear" onclick={() => ((zone = ''), (category = ''), (search = ''))}>Clear filters</button>
			{/if}
		</div>

		{#if docs.length === 0}
			<p class="empty">No documents yet. Upload photos, scans, visual fields or letters above.</p>
		{:else if shown.length === 0}
			<p class="empty">No documents match these filters.</p>
		{:else}
			<ul class="list">
				{#each shown as d (d.id)}
					{@const visit = d.encounterId ? visitById.get(d.encounterId) : null}
					<li class="doc">
						<button type="button" class="thumb" onclick={() => (viewing = d)} aria-label="View {d.categoryName}, {d.takenOn}">
							{#if isImage(d.mime)}
								<img src={docUrl(pid, d.id)} alt="" loading="lazy" decoding="async" />
							{:else}
								<span class="pdf" aria-hidden="true">PDF</span>
							{/if}
						</button>
						<div class="info">
							<p class="cat">{d.categoryName} <span class="num date">{d.takenOn}</span></p>
							<p class="file" title={d.filename}>{d.filename}</p>
							<p class="meta num">
								{formatBytes(d.size)} · by {d.createdBy}{#if visit}{' · '}<a href="/patients/{pid}/encounters/{visit.id}">visit {visit.date}</a>{/if}
								{#if catById.get(d.category)?.flow}{' · on the glaucoma flow sheet'}{/if}
							</p>
							{#if editing === d.id}
								<div class="edit">
									<div class="field">
										<label for="doc-date-{d.id}">Date taken</label>
										<input id="doc-date-{d.id}" type="date" bind:value={draftDate} max={data.today} />
									</div>
									<div class="field">
										<label for="doc-notes-{d.id}">Notes</label>
										<textarea id="doc-notes-{d.id}" bind:value={draftNotes} maxlength="2000" rows="3"></textarea>
									</div>
									{#if editError}<p class="err" role="alert">{editError}</p>{/if}
									<div class="actions">
										<button type="button" class="primary" onclick={() => saveEdit(d)}>Save</button>
										<button type="button" onclick={() => (editing = null)}>Cancel</button>
									</div>
								</div>
							{:else}
								<p class="notes" class:none={!d.notes}>{d.notes || 'No notes'}</p>
								<div class="actions">
									<button type="button" onclick={() => (viewing = d)}>View</button>
									<a class="btn" href={docUrl(pid, d.id, true)} download={d.filename}>Download</a>
									<button type="button" id="doc-edit-{d.id}" onclick={() => startEdit(d)}>Edit notes</button>
									<button type="button" class="danger" onclick={() => askDelete(d)}>Delete</button>
								</div>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

<dialog bind:this={confirmDialog} class="confirm" aria-labelledby="del-h" aria-describedby="del-body">
	{#if toDelete}
		<h2 id="del-h">Delete this document?</h2>
		<p id="del-body">
			<strong>{toDelete.filename}</strong> ({toDelete.categoryName}, {toDelete.takenOn}) will be removed from the chart.
			The record of who deleted it and when is kept.
		</p>
		{#if deleteError}<p class="err" role="alert">{deleteError}</p>{/if}
		<div class="actions">
			<button type="button" class="danger-solid" onclick={confirmDelete}>Delete document</button>
			<button type="button" onclick={() => confirmDialog.close()}>Keep it</button>
		</div>
	{/if}
</dialog>

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
	.top a {
		display: inline-flex;
		align-items: center;
		min-height: max(40px, var(--target-min));
	}
	main {
		max-width: 1100px;
		margin: 0 auto;
		padding: var(--space-5) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
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
	.meta,
	.opt {
		color: var(--text-2);
		margin: 0;
	}
	.title .meta {
		margin-top: var(--space-1);
	}
	.card {
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		padding: var(--space-3) var(--space-4) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.upload,
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		align-items: flex-end;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
		flex: 0 1 14em;
	}
	.field.grow {
		flex: 1 1 14em;
	}
	label {
		font-weight: var(--weight-semibold);
	}
	input,
	select,
	textarea {
		font: inherit;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		min-height: max(40px, var(--target-min));
		padding: 0 var(--space-2);
		width: 100%;
	}
	textarea {
		padding: var(--space-1) var(--space-2);
		resize: vertical;
	}
	input[type='file'] {
		padding: var(--space-1);
	}
	select[aria-invalid='true'] {
		border-color: var(--danger);
	}
	button,
	.btn {
		min-height: max(40px, var(--target-min));
	}
	.btn {
		display: inline-flex;
		align-items: center;
		padding: 0 var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		background: var(--surface-1);
		color: var(--text-1);
		text-decoration: none;
	}
	.btn:hover {
		background: var(--surface-2);
	}
	.primary {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
		font-weight: var(--weight-semibold);
	}
	.primary:hover {
		background: var(--accent);
		filter: brightness(1.1);
	}
	.danger {
		color: var(--danger);
	}
	.danger-solid {
		background: var(--danger);
		border-color: var(--danger);
		color: var(--surface-1);
		font-weight: var(--weight-semibold);
	}
	.help,
	.empty {
		margin: 0;
		color: var(--text-2);
		max-width: var(--measure-prose);
	}
	.help {
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.err {
		margin: 0;
		color: var(--danger);
		font-weight: var(--weight-semibold);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr));
		gap: var(--space-3);
	}
	.doc {
		display: flex;
		gap: var(--space-3);
		padding: var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		background: var(--surface-2);
		min-width: 0;
	}
	.thumb {
		flex: none;
		width: 96px;
		height: 96px;
		padding: 0;
		overflow: hidden;
		display: grid;
		place-items: center;
		background: var(--surface-0);
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.pdf {
		font-weight: var(--weight-semibold);
		color: var(--abnormal);
		border: 2px solid currentColor;
		border-radius: var(--radius-1);
		padding: 2px 6px;
	}
	.info {
		min-width: 0;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.info p {
		margin: 0;
	}
	.cat {
		font-weight: var(--weight-semibold);
	}
	.date {
		color: var(--text-2);
		font-weight: var(--weight-regular);
		margin-left: var(--space-1);
	}
	.file {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-2);
	}
	.notes {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		margin-top: var(--space-1) !important;
	}
	.notes.none {
		color: var(--text-3);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-top: var(--space-2);
	}
	.edit {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}
	.edit .field {
		flex: none;
	}
	.confirm {
		width: min(480px, calc(100vw - 32px));
		padding: var(--space-4);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		background: var(--surface-3);
		color: var(--text-1);
		box-shadow: var(--shadow-overlay);
	}
	.confirm::backdrop {
		background: rgb(0 0 0 / 0.4);
	}
	.confirm p {
		color: var(--text-2);
	}
	@media (max-width: 520px) {
		.doc {
			flex-direction: column;
		}
		.thumb {
			width: 100%;
			height: 160px;
		}
	}
</style>
