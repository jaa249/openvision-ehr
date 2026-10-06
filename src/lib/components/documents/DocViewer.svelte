<script lang="ts">
	// Document viewer (spec §15.4 "view": opens a document). Images show in place; PDFs open in a new
	// tab with the browser's own viewer (pages from this app cannot be framed: X-Frame-Options DENY).
	import { onMount } from 'svelte';
	import { docUrl, formatBytes, isImage, type DocMeta } from './types.ts';

	let { doc, onclose }: { doc: DocMeta; onclose: () => void } = $props();
	let dialog: HTMLDialogElement;
	let zoom = $state(false);

	onMount(() => dialog.showModal());
</script>

<dialog bind:this={dialog} class="viewer" aria-labelledby="doc-viewer-title" {onclose}>
	<div class="head">
		<h2 id="doc-viewer-title">{doc.categoryName} <span class="date num">· {doc.takenOn}</span></h2>
		<a class="btn" href={docUrl(doc.patientId, doc.id)} target="_blank" rel="noopener">Open in new tab</a>
		<a class="btn" href={docUrl(doc.patientId, doc.id, true)} download={doc.filename}>Download</a>
		<button type="button" onclick={() => dialog.close()}>Close</button>
	</div>
	{#if isImage(doc.mime)}
		<button type="button" class="frame" class:zoom aria-pressed={zoom} aria-label={zoom ? 'Fit image to window' : 'Show image at full size'} onclick={() => (zoom = !zoom)}>
			<img src={docUrl(doc.patientId, doc.id)} alt="{doc.categoryName}, taken {doc.takenOn}{doc.notes ? `: ${doc.notes}` : ''}" />
		</button>
		<p class="hint">Press the image to switch between fit and full size.</p>
	{:else}
		<div class="pdf">
			<p>This is a PDF ({formatBytes(doc.size)}). It opens in your browser's PDF viewer.</p>
			<a class="btn primary" href={docUrl(doc.patientId, doc.id)} target="_blank" rel="noopener">Open PDF</a>
		</div>
	{/if}
	<dl>
		<div><dt>File</dt><dd>{doc.filename}</dd></div>
		<div><dt>Size</dt><dd class="num">{formatBytes(doc.size)}</dd></div>
		<div><dt>Uploaded</dt><dd>{doc.createdAt.slice(0, 10)} by {doc.createdBy}</dd></div>
		<div class="wide"><dt>Notes</dt><dd>{doc.notes || 'None'}</dd></div>
	</dl>
</dialog>

<style>
	.viewer {
		width: min(1100px, calc(100vw - 32px));
		max-height: calc(100vh - 32px);
		padding: var(--space-4);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		background: var(--surface-3);
		color: var(--text-1);
		box-shadow: var(--shadow-overlay);
	}
	.viewer::backdrop {
		background: rgb(0 0 0 / 0.5);
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}
	h2 {
		margin: 0 auto 0 0;
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
	}
	.date {
		color: var(--text-2);
		font-weight: var(--weight-regular);
	}
	button,
	.btn {
		min-height: max(40px, var(--target-min));
	}
	.btn {
		display: inline-flex;
		align-items: center;
		padding: 0 var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		background: var(--surface-1);
		color: var(--text-1);
		text-decoration: none;
	}
	.btn:hover {
		background: var(--surface-2);
	}
	.btn.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
		font-weight: var(--weight-semibold);
	}
	.frame {
		display: block;
		width: 100%;
		padding: 0;
		background: var(--surface-0);
		max-height: 70vh;
		overflow: auto;
		cursor: zoom-in;
		text-align: center;
	}
	.frame.zoom {
		cursor: zoom-out;
	}
	.frame img {
		max-width: 100%;
		max-height: 68vh;
		object-fit: contain;
		vertical-align: middle;
	}
	.frame.zoom img {
		max-width: none;
		max-height: none;
	}
	.hint {
		margin: var(--space-1) 0 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.pdf {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4);
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
	}
	.pdf p {
		margin: 0;
		color: var(--text-2);
	}
	dl {
		margin: var(--space-3) 0 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 12em), 1fr));
		gap: var(--space-2) var(--space-3);
	}
	.wide {
		grid-column: 1 / -1;
	}
	dt {
		font-size: var(--text-xs);
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}
</style>
