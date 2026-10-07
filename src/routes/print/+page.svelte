<script lang="ts">
	import { onMount } from 'svelte';
	import ExamReport from '#lib/components/ExamReport.svelte';
	import Msg from '#lib/i18n/Msg.svelte';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const { t, dateTime } = useI18n();
	// In the page language (D48), so the server render and the browser agree.
	const generatedOn = dateTime(new Date());
	const n = $derived(data.items.length);
	const idList = $derived(data.items.map((i) => i.encounter.id).join(','));
	const title = $derived(
		n === 1
			? t('report.printTitleOne', { name: data.items[0].patient.legalName, date: data.items[0].encounter.date })
			: t('report.printTitleMany', { count: n })
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

<svelte:head><title>{t('report.printPageTitle', { title })}</title></svelte:head>

<div class="toolbar" role="toolbar" aria-label={t('report.print')}>
	<a href="/encounters">{t('report.backToEncounters')}</a>
	<span class="count">{n > 1 ? t('report.printCountMany', { count: n }) : t('report.printCount', { count: n })}</span>
	{#if data.missing}<span class="warn">{t('report.printMissing', { count: data.missing })}</span>{/if}
	<span class="spacer"></span>
	<span class="tip" class:pdf={data.pdf} role={data.pdf ? 'status' : undefined}>
		{#if data.pdf}<Msg key="report.pdfTipDialog">{#snippet saveAsPdf()}<strong>{t('report.saveAsPdf')}</strong>{/snippet}</Msg>{:else}<Msg key="report.pdfTipPrinter">{#snippet saveAsPdf()}<strong>{t('report.saveAsPdf')}</strong>{/snippet}</Msg>{/if}
	</span>
	<a class="export" href="/export/csv?ids={idList}" download>{t('report.exportCsv')}</a>
	<a class="export" href="/export/fhir?ids={idList}" download>{t('report.exportFhir')}</a>
	<button type="button" class="primary" onclick={printWhenReady}>{t('report.print')}</button>
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
