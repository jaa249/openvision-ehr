<script lang="ts">
	// ICD-10-CM code finder (spec §10.4): a combobox over GET /api/codes/icd10?q=.
	// Keyboard: type to search, Up/Down to move, Enter to pick, Escape closes the list (a second Escape cancels).
	// The parent shows it in place of its "Code" button and puts focus back there on pick or cancel.
	import { onMount } from 'svelte';
	import type { IcdCode } from '#lib/plan/codes.ts';

	let {
		id,
		label,
		onpick,
		oncancel,
		autofocus = true
	}: {
		id: string;
		label: string;
		onpick: (code: IcdCode) => void;
		oncancel: () => void;
		autofocus?: boolean;
	} = $props();

	let query = $state('');
	let results = $state<IcdCode[]>([]);
	let active = $state(-1);
	let open = $state(false);
	let searching = $state(false);
	let failed = $state(false);
	let input: HTMLInputElement | null = $state(null);
	const listId = $derived(`${id}-list`);
	const optId = (i: number) => `${id}-opt-${i}`;

	let timer: ReturnType<typeof setTimeout> | undefined;
	let requestId = 0;

	onMount(() => {
		if (autofocus) input?.focus();
		return () => clearTimeout(timer);
	});

	function search(q: string) {
		clearTimeout(timer);
		if (q.trim().length < 2) {
			results = [];
			open = false;
			searching = false;
			return;
		}
		searching = true;
		timer = setTimeout(async () => {
			const rid = ++requestId;
			try {
				const res = await fetch(`/api/codes/icd10?q=${encodeURIComponent(q.trim())}`);
				if (!res.ok) throw new Error(String(res.status));
				const list = (await res.json()) as IcdCode[];
				if (rid !== requestId) return;
				results = list;
				active = list.length ? 0 : -1;
				open = true;
				failed = false;
			} catch {
				if (rid === requestId) {
					failed = true;
					results = [];
					open = true;
				}
			} finally {
				if (rid === requestId) searching = false;
			}
		}, 200);
	}

	function pick(c: IcdCode) {
		open = false;
		onpick(c);
	}

	function keydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (!open && results.length) open = true;
			else if (results.length) active = (active + 1) % results.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (results.length) active = (active - 1 + results.length) % results.length;
		} else if (e.key === 'Home' && open && results.length) {
			e.preventDefault();
			active = 0;
		} else if (e.key === 'End' && open && results.length) {
			e.preventDefault();
			active = results.length - 1;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (open && active >= 0 && results[active]) pick(results[active]);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			if (open) open = false;
			else oncancel();
		}
	}

	$effect(() => {
		if (active >= 0) document.getElementById(optId(active))?.scrollIntoView({ block: 'nearest' });
	});
</script>

<div class="finder">
	<label class="visually-hidden" for={id}>{label}</label>
	<input
		bind:this={input}
		{id}
		type="text"
		role="combobox"
		aria-autocomplete="list"
		aria-expanded={open}
		aria-controls={listId}
		aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
		aria-describedby="{id}-help"
		autocomplete="off"
		spellcheck="false"
		placeholder="Search code or words, e.g. H40.11 or nuclear cataract"
		bind:value={query}
		oninput={() => search(query)}
		onkeydown={keydown}
		onblur={() => (open = false)}
	/>
	<button type="button" class="cancel" onclick={oncancel} aria-label="Close code search">Cancel</button>
	<p class="help" id="{id}-help">Arrows choose, Enter picks, Esc closes. Billable ICD-10-CM 2027 codes only.</p>
	<p class="visually-hidden" role="status">
		{#if open && !searching}{failed ? 'Search failed.' : `${results.length} code${results.length === 1 ? '' : 's'} found.`}{/if}
	</p>
	{#if open}
		<ul id={listId} role="listbox" aria-label="Matching codes">
			{#each results as c, i (c.code)}
				<!-- Keyboard choice happens in the combobox input (aria-activedescendant); a click here is the pointer path. -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id={optId(i)}
					role="option"
					aria-selected={i === active}
					class:active={i === active}
					onpointerdown={(e) => e.preventDefault()}
					onclick={() => pick(c)}
					onpointerenter={() => (active = i)}
				>
					<span class="code">{c.code}</span>
					<span class="desc">{c.description}</span>
				</li>
			{:else}
				<li class="empty" role="presentation">{failed ? 'Search failed: check the connection.' : 'No billable code matches. Try other words.'}</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.finder {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--space-1) var(--space-2);
		align-items: center;
	}
	input {
		font: inherit;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--accent);
		border-radius: var(--radius-1);
		padding: 4px var(--space-2);
		min-height: max(var(--target-min), 40px);
		width: 100%;
		min-width: 0;
	}
	input:focus {
		outline: none;
		box-shadow: 0 0 0 1px var(--focus-ring);
	}
	input::placeholder {
		color: var(--text-3);
	}
	.cancel {
		min-height: max(var(--target-min), 40px);
	}
	.help {
		grid-column: 1 / -1;
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	ul {
		position: absolute;
		z-index: 20;
		top: calc(max(var(--target-min), 40px) + 2px);
		left: 0;
		right: 0;
		max-height: 18rem;
		overflow-y: auto;
		margin: 0;
		padding: var(--space-1) 0;
		list-style: none;
		background: var(--surface-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		box-shadow: var(--shadow-overlay);
	}
	li {
		display: grid;
		grid-template-columns: 6.5em minmax(0, 1fr);
		gap: var(--space-2);
		align-items: baseline;
		padding: var(--space-2) var(--space-3);
		min-height: 40px;
		cursor: pointer;
	}
	li.active {
		background: var(--accent-soft);
		box-shadow: inset 3px 0 0 var(--accent);
	}
	.code {
		font-family: var(--font-mono);
		font-weight: var(--weight-semibold);
	}
	.desc {
		color: var(--text-2);
	}
	li.empty {
		display: block;
		color: var(--text-3);
		cursor: default;
	}
</style>
