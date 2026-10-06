<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();

	let q = $state(untrack(() => data.q));
	let timer: ReturnType<typeof setTimeout> | undefined;

	// Search as you type (debounced); the form also works as a plain GET without JavaScript.
	function onInput() {
		clearTimeout(timer);
		timer = setTimeout(() => {
			const t = q.trim();
			goto(t ? `/?q=${encodeURIComponent(t)}` : '/', { reset: false, replace: true });
		}, 200);
	}
</script>

<main>
	<h1>OpenVision</h1>
	<p class="sub">
		Patients <span class="note">(all demo data is fictional)</span>
		<a class="enc" href="/encounters">All encounters &amp; printing →</a>
	</p>

	<div class="tools">
		<form method="GET" role="search" onsubmit={() => clearTimeout(timer)}>
			<label class="visually-hidden" for="q">Search patients by name, preferred name, MRN or date of birth</label>
			<input id="q" name="q" type="search" placeholder="Search name, MRN or DOB" autocomplete="off" bind:value={q} oninput={onInput} />
			<button type="submit">Search</button>
		</form>
		<a class="new" href="/patients/new">New patient</a>
	</div>

	<p class="count" role="status" aria-live="polite">
		{#if data.q}{data.patients.length} {data.patients.length === 1 ? 'match' : 'matches'} for “{data.q}”{:else}{data.patients.length} {data.patients.length === 1 ? 'patient' : 'patients'}{/if}
	</p>

	{#if data.patients.length}
		<ul>
			{#each data.patients as p (p.id)}
				<li>
					<a class="who" href="/patients/{p.id}">
						<span class="name">{p.name}</span>
						{#if p.name !== p.legalName}<span class="legal">legal: {p.legalName}</span>{/if}
						<span class="meta num">DOB {p.dob} · {p.age} y · MRN {p.mrn}</span>
					</a>
					<span class="acts">
						{#if p.latestEncounter}
							<a href="/patients/{p.id}/encounters/{p.latestEncounter}">Open exam<span class="visually-hidden"> for {p.name}</span></a>
							<a href="/print?ids={p.latestEncounter}" target="_blank" rel="noopener">Print<span class="visually-hidden"> latest visit of {p.name}</span></a>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">
			{#if data.q}No patients match “{data.q}”. <a href="/patients/new">Add a new patient</a>.{:else}No patients yet. <a href="/patients/new">Add the first one</a>.{/if}
		</p>
	{/if}
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
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: baseline;
	}
	.enc {
		margin-left: auto;
	}
	.note {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.tools {
		display: flex;
		gap: var(--space-3);
		align-items: center;
		flex-wrap: wrap;
	}
	form {
		display: flex;
		gap: var(--space-2);
		flex: 1 1 16em;
	}
	input {
		font: inherit;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		min-height: var(--target-min);
		padding: 0 var(--space-2);
		flex: 1;
		min-width: 0;
	}
	.new {
		display: inline-flex;
		align-items: center;
		min-height: var(--target-min);
		padding: 0 var(--space-4);
		background: var(--accent);
		color: var(--accent-text);
		border-radius: var(--radius-1);
		font-weight: var(--weight-semibold);
		text-decoration: none;
	}
	.new:hover {
		filter: brightness(1.1);
	}
	.count {
		margin: var(--space-3) 0;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
	}
	li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0 var(--space-4);
		padding: var(--space-1) var(--space-3);
		border-bottom: 1px solid var(--hairline);
	}
	li:last-child {
		border-bottom: 0;
	}
	.who {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 var(--space-3);
		min-height: var(--target-min);
		padding: var(--space-1) 0;
		text-decoration: none;
		color: var(--text-1);
		flex: 1 1 14em;
		min-width: 0;
	}
	.who:hover .name {
		text-decoration: underline;
		color: var(--accent);
	}
	.name {
		font-weight: var(--weight-semibold);
	}
	.legal,
	.meta {
		color: var(--text-2);
		font-size: var(--text-xs);
	}
	.acts {
		display: flex;
		gap: var(--space-4);
	}
	.acts a {
		display: inline-flex;
		align-items: center;
		min-height: var(--target-min);
	}
	.empty {
		color: var(--text-2);
	}
</style>
