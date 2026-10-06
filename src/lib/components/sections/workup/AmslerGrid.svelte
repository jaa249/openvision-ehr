<script lang="ts">
	// A small Amsler grid. Severity 0-5 draws a growing distorted patch around fixation (spec §8.4);
	// null = not tested (faded grid). Decorative: the caller labels the control.
	let { severity }: { severity: number | null } = $props();
	const lines = Array.from({ length: 11 }, (_, i) => i);
</script>

<svg viewBox="0 0 10 10" class:untested={severity === null} aria-hidden="true" focusable="false">
	<rect x="0" y="0" width="10" height="10" class="bg" />
	{#each lines as i (i)}
		<line x1={i} y1="0" x2={i} y2="10" />
		<line x1="0" y1={i} x2="10" y2={i} />
	{/each}
	{#if severity}
		<circle cx="5" cy="5" r={0.6 + severity * 0.8} class="patch" />
	{/if}
	<circle cx="5" cy="5" r="0.35" class="dot" />
</svg>

<style>
	svg {
		width: 72px;
		height: 72px;
		display: block;
	}
	.bg {
		fill: var(--surface-1);
	}
	line {
		stroke: var(--text-3);
		stroke-width: 0.06;
	}
	.patch {
		fill: var(--abnormal);
		fill-opacity: 0.3;
		stroke: var(--abnormal);
		stroke-width: 0.12;
		stroke-dasharray: 0.4 0.25;
	}
	.dot {
		fill: var(--text-1);
	}
	.untested {
		opacity: 0.45;
	}
</style>
