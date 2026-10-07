<script lang="ts">
	import { onMount } from 'svelte';
	import ExamReport from '#lib/components/ExamReport.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const generatedOn = new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	const n = $derived(data.items.length);
	const idList = $derived(data.items.map((i) => i.encounter.id).join(','));
	const title = $derived(
		n === 1 ? `${data.items[0].patient.legalName} ${data.items[0].encounter.date} · Exam report` : `${n} exam reports`
	);

	onMount(() => {
		// Logged when the print dialog closes; browsers do not say whether the user printed or cancelled.
		const log = () =>
			fetch('/api/print-log', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ids: data.items.map((i) => i.encounter.id) })
			}).catch(() => {});
		window.addEventListener('afterprint', log);
		if (data.auto) void printWhenReady();
		return () => window.removeEventListener('afterprint', log);
	});

	/** Opens the print dialog once every report image (drawings, §13.4) has loaded, so none print blank. */
	async function printWhenReady() {
		const imgs = [...document.querySelectorAll<HTMLImageElement>('.sheets img')];
		const loaded = Promise.all(imgs.map((img) => img.decode().catch(() => {}))); // a broken image must not block printing
		await Promise.race([loaded, new Promise((r) => setTimeout(r, 15_000))]);
		window.print();
	}
</script>

<svelte:head><title>{title} · OpenVision</title></svelte:head>

<div class="toolbar" role="toolbar" aria-label="Print">
	<a href="/encounters">← Encounters</a>
	<span class="count">{n} {n === 1 ? 'report' : 'reports'}{#if n > 1}, each starts on a new page{/if}</span>
	{#if data.missing}<span class="warn">{data.missing} could not be found and were skipped</span>{/if}
	<span class="spacer"></span>
	<span class="tip" class:pdf={data.pdf} role={data.pdf ? 'status' : undefined}>
		{#if data.pdf}To download a PDF, choose <strong>Save as PDF</strong> in the print dialog.{:else}For a PDF, choose <strong>Save as PDF</strong> as the printer.{/if}
	</span>
	<a class="export" href="/export/csv?ids={idList}" download>Export CSV</a>
	<a class="export" href="/export/fhir?ids={idList}" download>Export FHIR</a>
	<button type="button" class="primary" onclick={printWhenReady}>Print</button>
</div>

<div class="sheets">
	{#each data.items as item (item.encounter.id)}
		<ExamReport {item} practice={data.practice} {generatedOn} />
	{/each}
</div>

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
	.count {
		color: var(--text-2);
	}
	.warn {
		color: var(--danger);
	}
	.spacer {
		flex: 1;
	}
	.tip {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.tip.pdf {
		color: var(--text-1);
		font-size: var(--text-sm);
		padding: var(--space-1) var(--space-2);
		background: var(--accent-soft);
		border-radius: var(--radius-2);
	}
	.export {
		font-size: var(--text-sm);
	}
	.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
		min-width: 6em;
	}
	.sheets {
		padding: var(--space-5) var(--space-4);
	}
	/* Each report on its own page. */
	.sheets > :global(.report + .report) {
		break-before: page;
	}
	@media print {
		:global(body) {
			background: #fff;
		}
		.toolbar {
			display: none;
		}
		.sheets {
			padding: 0;
		}
	}
	@page {
		margin: 0.6in 0.7in;
	}
</style>
