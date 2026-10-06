<script lang="ts">
	// Drawing helper panel for one exam zone (spec §5). Each zone gets its own canvas instance,
	// so pointer state, undo history and autosave never leak between zones (§5.2 FIX).
	import DrawingCanvas from './drawing/DrawingCanvas.svelte';

	let { patientId, encounterId, zone }: { patientId: number; encounterId: number; zone: string } = $props();
</script>

{#key `${patientId}/${encounterId}/${zone}`}
	<DrawingCanvas {patientId} {encounterId} {zone} />
{/key}
