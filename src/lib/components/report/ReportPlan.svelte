<script lang="ts">
	// Impression/Plan on the printed report (spec §13.2 item 12 with FIXes): numbered items with a bold
	// title, the code text (or the code when there is no code text), the plan with its line breaks;
	// "Orders/Next visit:" only when there are orders. Paper colours, like the rest of ExamReport.
	// Headings translate (D48); titles, plans and orders print as recorded.
	import type { PlanReport } from '#lib/plan/types.ts';
	import { ICD11_CITATION, stripCodeTags } from '#lib/codesets/index.ts';
	import { icd11LanguageName } from '#lib/codesets/releases.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	let { plan }: { plan: PlanReport | null | undefined } = $props();
	const { t, locale } = useI18n();
	// WHO's citation whenever ICD-11 codes print; WHO's language files used for the titles are named too (D50).
	const icd11Items = $derived((plan?.items ?? []).filter((it) => it.codeSystem === 'icd11' && it.codes));
	const titleLangs = $derived([...new Set(icd11Items.map((it) => it.titleLang ?? '').filter((l) => l && l !== 'en'))]);
	/** The stored code text keeps its "ICD10:" / "ICD11:" tags; paper shows just "H40.1131 (description)". */
	const paperCodes = stripCodeTags;
</script>

{#if plan && (plan.items.length || plan.orders.length || plan.orderPlan)}
	<section class="rplan">
		<h2>{t('report.impressionPlan')}</h2>
		{#if plan.items.length}
			<ol>
				{#each plan.items as it, i (i)}
					<li>
						<strong>{it.title}</strong>
						{#if it.codeText || it.codes}<span class="code">{paperCodes(it.codeText || it.codes)}</span>{/if}
						{#if it.plan}<p class="text" dir="auto">{it.plan}</p>{/if}
					</li>
				{/each}
			</ol>
			{#if icd11Items.length}
				<p class="cite">
					{t('report.icd11Citation', { citation: ICD11_CITATION })}
					{#each titleLangs as l (l)}{' '}{t('report.icd11TitlesIn', { language: icd11LanguageName(l, locale) })}{/each}
				</p>
			{/if}
		{/if}
		{#if plan.orders.length}
			<h3>{t('report.ordersNextVisit')}</h3>
			<ul>
				{#each plan.orders as o, i (i)}<li>{o}</li>{/each}
			</ul>
		{/if}
		{#if plan.orderPlan}
			{#if !plan.orders.length}<h3>{t('report.nextVisit')}</h3>{/if}
			<p class="text" dir="auto">{plan.orderPlan}</p>
		{/if}
	</section>
{/if}

<style>
	.rplan {
		break-inside: auto;
		color: var(--ink, #111);
		margin-top: 0.8em;
	}
	h2 {
		font-size: 11.5pt;
		margin: 0 0 0.3em;
		padding-bottom: 2px;
		border-bottom: 1px solid var(--rule, #c9c9c9);
	}
	.cite {
		margin: 0.3em 0 0;
		font-size: 8pt;
		color: var(--ink-2, #444);
	}
	h3 {
		font-size: 10pt;
		margin: 0.6em 0 0.2em;
	}
	ol {
		margin: 0;
		padding-inline-start: 1.6em;
		display: grid;
		gap: 0.35em;
	}
	ol > li {
		break-inside: avoid;
	}
	.code {
		display: block;
		font-size: 9.5pt;
		color: var(--ink-2, #444);
	}
	.text {
		margin: 0.1em 0 0;
		white-space: pre-line;
	}
	ul {
		margin: 0;
		padding-inline-start: 1.4em;
	}
</style>
