<script lang="ts">
	// Impression/Plan on the printed report (spec §13.2 item 12 with FIXes): numbered items with a bold
	// title, the code text (or the code when there is no code text), the plan with its line breaks;
	// "Orders/Next visit:" only when there are orders. Paper colours, like the rest of ExamReport.
	import type { PlanReport } from '#lib/plan/types.ts';
	let { plan }: { plan: PlanReport | null | undefined } = $props();
	/** The stored code text keeps its "ICD10:" tags; paper shows just "H40.1131 (description)". */
	const paperCodes = (s: string) => s.replace(/ICD-?10(?:-CM)?:\s*/gi, '');
</script>

{#if plan && (plan.items.length || plan.orders.length || plan.orderPlan)}
	<section class="rplan">
		<h2>Impression/Plan</h2>
		{#if plan.items.length}
			<ol>
				{#each plan.items as it, i (i)}
					<li>
						<strong>{it.title}</strong>
						{#if it.codeText || it.codes}<span class="code">{paperCodes(it.codeText || it.codes)}</span>{/if}
						{#if it.plan}<p class="text">{it.plan}</p>{/if}
					</li>
				{/each}
			</ol>
		{/if}
		{#if plan.orders.length}
			<h3>Orders/Next visit:</h3>
			<ul>
				{#each plan.orders as o, i (i)}<li>{o}</li>{/each}
			</ul>
		{/if}
		{#if plan.orderPlan}
			{#if !plan.orders.length}<h3>Next visit:</h3>{/if}
			<p class="text">{plan.orderPlan}</p>
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
	h3 {
		font-size: 10pt;
		margin: 0.6em 0 0.2em;
	}
	ol {
		margin: 0;
		padding-left: 1.6em;
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
		padding-left: 1.4em;
	}
</style>
