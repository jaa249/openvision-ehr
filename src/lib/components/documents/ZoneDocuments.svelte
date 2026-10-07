<script lang="ts">
	// Per-zone documents strip (spec §15.4) under External, Slit lamp and Fundus: for each category of
	// the zone, its name, how many files the patient has, an upload button (with camera on tablets),
	// and "latest", which opens the newest by date taken (FIX: not by upload order).
	// Files uploaded here belong to this visit, so they follow the exam lock (lockHeaders()).
	import { lockHeaders } from '#lib/exam/lock.svelte.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import { uploadDocumentFile } from './client.ts';
	import DocViewer from './DocViewer.svelte';
	import { DOC_ACCEPT, DOC_ZONE_LABEL_KEY, type DocMeta, type DocZone, type ZoneCategorySummary } from './types.ts';

	let { patientId, encounterId, zone }: { patientId: number; encounterId: number; zone: DocZone } = $props();
	const { t } = useI18n();

	const uid = $props.id();
	let cats = $state<ZoneCategorySummary[] | null>(null);
	let loadError = $state<string | null>(null);
	let busy = $state<string | null>(null);
	let status = $state('');
	let problem = $state('');
	let viewing = $state<DocMeta | null>(null);
	const inputs: Record<string, HTMLInputElement> = {};

	async function load() {
		try {
			const r = await fetch(`/api/patients/${patientId}/documents?zone=${zone}&summary=1`);
			if (!r.ok) throw new Error(t('documents.serverAnswered', { status: r.status }));
			cats = ((await r.json()) as { categories: ZoneCategorySummary[] }).categories;
			loadError = null;
		} catch (e) {
			loadError = (e as Error).message;
		}
	}

	$effect(() => {
		void [patientId, zone];
		cats = null;
		load();
	});

	async function upload(cat: ZoneCategorySummary, files: FileList | null) {
		if (!files?.length) return;
		problem = '';
		busy = cat.category;
		const done: string[] = [];
		for (const file of files) {
			status = t('documents.uploadingFile', { name: file.name });
			try {
				await uploadDocumentFile(patientId, file, { category: cat.category, encounterId, headers: lockHeaders() });
				done.push(file.name);
			} catch (e) {
				problem = t('documents.fileProblem', { name: file.name, error: (e as Error).message });
			}
		}
		busy = null;
		status = done.length
			? done.length === 1
				? t('documents.savedOneTo', { name: done[0], category: cat.name })
				: t('documents.savedManyTo', { count: done.length, category: cat.name })
			: '';
		for (const el of Object.values(inputs)) if (el) el.value = '';
		await load();
	}
</script>

<section class="docs" aria-labelledby="{uid}-h">
	<div class="bar">
		<h3 id="{uid}-h">{t('documents.zoneHeading', { zone: t(DOC_ZONE_LABEL_KEY[zone]) })}</h3>
		<a href="/patients/{patientId}/documents?zone={zone}">{t('documents.allDocuments')}</a>
	</div>
	<p class="visually-hidden" role="status" aria-live="polite">{status}</p>
	{#if problem}<p class="err" role="alert">{problem}</p>{/if}
	{#if loadError}
		<p class="err">{t('documents.couldNotLoad', { error: loadError })} <button type="button" onclick={load}>{t('documents.tryAgain')}</button></p>
	{:else if !cats}
		<p class="muted">{t('documents.loading')}</p>
	{:else}
		<ul>
			{#each cats as c (c.category)}
				<li>
					<span class="name">{c.name}</span>
					<span class="count num" aria-label={t('documents.fileCount', { count: c.count })}>{c.count}</span>
					<span class="actions">
						<input
							bind:this={inputs[c.category]}
							id="{uid}-file-{c.category}"
							class="visually-hidden"
							type="file"
							accept={DOC_ACCEPT}
							multiple
							tabindex="-1"
							aria-hidden="true"
							onchange={(e) => upload(c, e.currentTarget.files)}
						/>
						<input
							bind:this={inputs[`${c.category}-cam`]}
							class="visually-hidden"
							type="file"
							accept="image/*"
							capture="environment"
							tabindex="-1"
							aria-hidden="true"
							onchange={(e) => upload(c, e.currentTarget.files)}
						/>
						<button type="button" disabled={busy !== null} onclick={() => inputs[c.category]?.click()}>
							{busy === c.category ? t('documents.uploading') : t('documents.upload')}<span class="visually-hidden"> {t('documents.uploadToHidden', { category: c.name })}</span>
						</button>
						<button type="button" class="camera" disabled={busy !== null} onclick={() => inputs[`${c.category}-cam`]?.click()}>
							{t('documents.camera')}<span class="visually-hidden"> {t('documents.cameraForHidden', { category: c.name })}</span>
						</button>
						{#if c.latest}
							<button type="button" class="latest" onclick={() => (viewing = c.latest)} title={c.latest.notes || c.latest.filename}>
								{t('documents.latest')} <span class="num date">{c.latest.takenOn}</span><span class="visually-hidden"> {c.name}</span>
							</button>
						{:else}
							<span class="none">{t('documents.noneYet')}</span>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
		<p class="help">{t('documents.zoneHelp')}</p>
	{/if}
</section>

{#if viewing}
	<DocViewer doc={viewing} onclose={() => (viewing = null)} />
{/if}

<style>
	.docs {
		margin-top: var(--space-4);
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		padding: var(--space-2) var(--space-3);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	h3 {
		margin: 0 auto 0 0;
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
	}
	.bar a {
		display: inline-flex;
		align-items: center;
		min-height: max(40px, var(--target-min));
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		padding: var(--space-1) 0;
		border-top: 1px solid var(--hairline);
	}
	.name {
		flex: 1 1 12em;
		min-width: 0;
	}
	.count {
		min-width: 2em;
		text-align: center;
		padding: 1px 6px;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--text-xs);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		align-items: center;
	}
	button {
		min-height: max(40px, var(--target-min));
	}
	.camera {
		display: none;
	}
	@media (pointer: coarse) {
		.camera {
			display: inline-block;
		}
	}
	.date {
		color: var(--text-2);
	}
	.none,
	.muted,
	.help {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.latest,
	.none {
		min-width: 150px;
	}
	.none {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.help {
		margin: var(--space-1) 0 0;
	}
	.err {
		color: var(--danger);
		font-weight: var(--weight-semibold);
		margin: var(--space-1) 0;
	}
</style>
