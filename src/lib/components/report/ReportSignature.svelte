<script lang="ts">
	// Signature block on the printed report (spec §13.2 item 12 FIX: always shown; real signing date).
	// Addenda follow the signature, each with its author and time; they never change the signed text.
	import type { Signature } from '#lib/plan/types.ts';
	let { provider, signature }: { provider: string; signature: Signature | null | undefined } = $props();

	const when = (iso: string) =>
		new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
</script>

<div class="block">
	<div class="sign">
		<span class="line"></span>
		<span class="provider">{provider}</span>
		{#if signature}
			<span class="signed">Electronically signed by {signature.signedBy} on <time datetime={signature.signedAt}>{when(signature.signedAt)}</time></span>
		{:else}
			<span class="draft">Not signed</span>
		{/if}
	</div>
	{#if signature?.addenda.length}
		<section class="addenda" aria-label="Addenda">
			<h3>Addenda</h3>
			<ol>
				{#each signature.addenda as a, i (i)}
					<li>
						<div class="by">{a.by} · <time datetime={a.at}>{when(a.at)}</time></div>
						<p>{a.text}</p>
					</li>
				{/each}
			</ol>
		</section>
	{/if}
</div>

<style>
	/* One root element: the report footer lays out signature and "Generated" side by side. */
	.block {
		max-width: 5.5in;
	}
	.sign {
		display: grid;
		gap: 2px;
		font-size: 9.5pt;
		min-width: 3in;
	}
	.line {
		border-bottom: 1px solid var(--ink);
		height: 2em;
	}
	.provider {
		color: var(--ink);
	}
	.signed {
		color: var(--ink);
		font-size: 8.5pt;
	}
	.draft {
		color: var(--ink-2);
		font-size: 8.5pt;
		font-style: italic;
	}
	.addenda {
		margin-top: 8pt;
		font-size: 9.5pt;
		color: var(--ink);
		break-inside: avoid;
	}
	.addenda h3 {
		font-size: 10pt;
		margin: 0 0 4pt;
	}
	.addenda ol {
		margin: 0;
		padding-left: 1.4em;
	}
	.addenda li + li {
		margin-top: 4pt;
	}
	.by {
		color: var(--ink-2);
		font-size: 8.5pt;
	}
	.addenda p {
		margin: 1pt 0 0;
		white-space: pre-wrap;
	}
</style>
