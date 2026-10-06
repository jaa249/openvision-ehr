<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<main>
	<h1>OpenVision</h1>
	<p class="sub">Today's patients <span class="note">(all demo data is fictional)</span></p>
	<table>
		<thead>
			<tr><th scope="col">Patient</th><th scope="col">DOB</th><th scope="col">MRN</th><th scope="col"></th></tr>
		</thead>
		<tbody>
			{#each data.patients as p (p.id)}
				<tr>
					<td>{p.name}</td>
					<td class="num">{p.dob} · {p.age} y</td>
					<td class="num">{p.mrn}</td>
					<td>
						{#if p.latestEncounter}
							<a href="/patients/{p.id}/encounters/{p.latestEncounter}">Open exam</a>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</main>

<style>
	main {
		max-width: 760px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4);
	}
	h1 {
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		margin: 0 0 var(--space-1);
	}
	.sub {
		color: var(--text-2);
		margin: 0 0 var(--space-4);
	}
	.note {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
	}
	th,
	td {
		text-align: left;
		padding: 0 var(--space-3);
		height: var(--row-height);
		border-bottom: 1px solid var(--hairline);
	}
	tr:last-child td {
		border-bottom: 0;
	}
	th {
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-3);
		font-weight: var(--weight-semibold);
	}
</style>
