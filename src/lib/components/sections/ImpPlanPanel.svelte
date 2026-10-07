<script lang="ts">
	// Impression / Plan section (spec §10): left, the numbered impression list and the New Dx box;
	// right, an accordion with the Builder (§10.2) and Next-visit orders (§10.6). Coding is its own section.
	// Items save BY ID (§10.5 FIX): add, update (autosave, debounced), reorder, delete with Undo.
	import { onDestroy, onMount, tick } from 'svelte';
	import type { PanelProps } from './types.ts';
	import type { Candidate, CandidateSet, ImpItem, OrderOption, PlanData, VisitOrder } from '#lib/plan/types.ts';
	import { registerFlush } from '#lib/exam/lock.svelte.ts';
	import { SerialSave } from '#lib/exam/serial.ts';
	import { postJson } from './plan/api.ts';
	import ImpItemRow from './plan/ImpItemRow.svelte';
	import Builder from './plan/Builder.svelte';
	import Orders from './plan/Orders.svelte';
	import { useI18n } from '#lib/i18n/context.ts';
	import { tip } from '#lib/components/ui/tooltip.ts';

	let { context, findings }: PanelProps = $props();
	const { t } = useI18n();

	const url = $derived(`/api/patients/${context.patientId}/encounters/${context.encounterId}/plan`);

	let data = $state<PlanData | null>(null);
	/** The practice's diagnosis code set (D44), for the code finder and the New Dx hint. */
	const codeSet = $derived(data?.codeSet ?? 'icd10cm');
	let items = $state<ImpItem[]>([]);
	let loadError = $state('');
	/** Per-item save problems (the typed text stays). */
	let errors = $state<Record<number, { message: string; duplicate: boolean }>>({});
	/** Items whose next save may keep a duplicate (user chose "Keep both"). */
	const allowDup = new Set<number>();
	/** Screen-reader announcement for list changes. */
	let announce = $state('');
	/** List-level message with an optional action (Undo, Add anyway). */
	let notice = $state<{ text: string; tone: 'info' | 'warn'; action?: { label: string; run: () => void } } | null>(null);
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;

	// ---------- save indicator ----------
	let inflight = $state(0);
	let saveError = $state('');
	let savedOnce = $state(false);
	let dirtyCount = $state(0);
	const timers = new Map<number, ReturnType<typeof setTimeout>>();
	const saveText = $derived(
		inflight > 0 || dirtyCount > 0 ? t('plan.saving') : saveError ? t('plan.notSaved', { error: saveError }) : savedOnce ? t('plan.allSaved') : ''
	);

	async function track<T>(p: Promise<import('./plan/api.ts').Result<T>>) {
		inflight++;
		const r = await p;
		inflight--;
		if (r.ok) {
			saveError = '';
			savedOnce = true;
		} else if (r.status !== 409) saveError = r.message;
		return r;
	}
	const post = <T,>(body: Record<string, unknown>) => track(postJson<T>(t, url, body));

	function say(text: string, tone: 'info' | 'warn' = 'info', action?: { label: string; run: () => void }) {
		clearTimeout(noticeTimer);
		notice = { text, tone, action };
		announce = text;
		noticeTimer = setTimeout(() => (notice = null), action ? 12000 : 6000);
	}

	// ---------- loading ----------
	onMount(async () => {
		try {
			const res = await fetch(url);
			if (!res.ok) throw new Error(String(res.status));
			const d = (await res.json()) as PlanData;
			data = d;
			items = d.items;
		} catch {
			loadError = t('plan.loadError');
		}
	});

	/** Server order and fields, but the user's unsaved typing wins for items still waiting to save. */
	function merge(server: ImpItem[]): ImpItem[] {
		return server.map((s) => {
			const local = items.find((i) => i.id === s.id);
			return local && (timers.has(s.id) || savers.get(s.id)?.dirty) ? { ...s, title: local.title, plan: local.plan } : s;
		});
	}

	// ---------- item edits (autosave ~600 ms) ----------
	// One saver per item: at most one update in flight; typing that arrives meanwhile is sent when it
	// returns, so an older update can never land after a newer one.
	const savers = new Map<number, SerialSave>();
	function saverFor(id: number): SerialSave {
		let s = savers.get(id);
		if (!s) savers.set(id, (s = new SerialSave(() => sendItem(id))));
		return s;
	}

	function edit(id: number, field: 'title' | 'plan', value: string) {
		const it = items.find((i) => i.id === id);
		if (!it) return;
		it[field] = value;
		saverFor(id).changed();
		clearTimeout(timers.get(id));
		timers.set(id, setTimeout(() => flush(id), 600));
		dirtyCount = timers.size;
	}

	/** Saves one item now (after any update in flight). True when its title and plan are saved. */
	function flush(id: number): Promise<boolean> {
		clearTimeout(timers.get(id));
		timers.delete(id);
		dirtyCount = timers.size;
		return saverFor(id).save();
	}

	/** Sends the item's current title and plan; true when the server took them. */
	async function sendItem(id: number): Promise<boolean> {
		const it = items.find((i) => i.id === id);
		if (!it) return true; // deleted meanwhile: nothing left to save
		if (!it.title.trim()) {
			errors[id] = { message: t('plan.titleEmpty'), duplicate: false };
			return false;
		}
		const sent = { title: it.title, plan: it.plan };
		const r = await post<{ item: ImpItem }>({ action: 'update', id, ...sent, allowDuplicate: allowDup.has(id) });
		const cur = items.find((i) => i.id === id);
		if (r.ok) {
			allowDup.delete(id);
			delete errors[id];
			if (cur) {
				cur.codes = r.data.item.codes;
				cur.codeText = r.data.item.codeText;
				cur.codeType = r.data.item.codeType;
				cur.codeSystem = r.data.item.codeSystem;
				cur.codeUris = r.data.item.codeUris;
			}
		} else {
			errors[id] = { message: r.message, duplicate: r.status === 409 && r.body.code === 'duplicate' };
		}
		return r.ok;
	}

	async function setCodes(id: number, codes: string) {
		// Queued behind the item's title/plan update in flight, so their answers cannot cross.
		const r = await saverFor(id).run(() => post<{ item: ImpItem }>({ action: 'update', id, codes }));
		const cur = items.find((i) => i.id === id);
		if (r.ok && cur) {
			cur.codes = r.data.item.codes;
			cur.codeText = r.data.item.codeText;
			cur.codeType = r.data.item.codeType;
			cur.codeSystem = r.data.item.codeSystem;
			cur.codeUris = r.data.item.codeUris;
			delete errors[id];
			announce = codes ? t('plan.announceCodes', { title: cur.title, codes: r.data.item.codes }) : t('plan.announceCodesRemoved', { title: cur.title });
		} else if (!r.ok) {
			errors[id] = { message: r.message, duplicate: false };
		}
	}

	function keepBoth(id: number) {
		allowDup.add(id);
		saverFor(id).changed();
		flush(id);
	}

	function retryAll() {
		saveError = '';
		for (const id of Object.keys(errors).map(Number)) flush(id);
	}

	// Signing saves everything first: waits for updates in flight and sends pending edits; false
	// (signing is refused) when any item could not be saved.
	async function flushItems(): Promise<boolean> {
		const ids = new Set([...timers.keys(), ...savers.keys()]);
		const saved = await Promise.all([...ids].map((id) => flush(id)));
		return saved.every(Boolean);
	}
	const unregister = registerFlush(flushItems);
	// Saves still on their way when the section closes keep counting for signing until they settle.
	onDestroy(() => {
		clearTimeout(noticeTimer);
		void flushItems().finally(unregister);
	});

	// ---------- add, move, delete ----------
	const itemOf = (c: Candidate) => ({ kind: c.kind, title: c.title, codes: c.codes, plan: c.plan, link: c.link });

	async function addCandidate(c: Candidate, index?: number, allowDuplicate = false): Promise<'ok' | 'dup' | 'error'> {
		const r = await post<{ item: ImpItem; items: ImpItem[] }>({ action: 'add', item: itemOf(c), index, allowDuplicate });
		if (r.ok) {
			items = merge(r.data.items);
			announce = t('plan.announceAdded', { title: r.data.item.title, seq: r.data.item.seq });
			return 'ok';
		}
		if (r.status === 409) {
			say(r.message, 'warn', { label: t('plan.addAnyway'), run: () => addCandidate(c, index, true) });
			return 'dup';
		}
		say(r.message, 'warn');
		return 'error';
	}

	async function addMany(cs: Candidate[]) {
		let added = 0;
		const skipped: string[] = [];
		for (const c of cs) {
			const r = await post<{ item: ImpItem; items: ImpItem[] }>({ action: 'add', item: itemOf(c) });
			if (r.ok) {
				items = merge(r.data.items);
				added++;
			} else if (r.status === 409) skipped.push(c.title);
			else {
				say(r.message, 'warn');
				return;
			}
		}
		say(
			skipped.length ? t('plan.addedSkipped', { count: added, titles: skipped.join(', ') }) : t('plan.added', { count: added }),
			skipped.length ? 'warn' : 'info'
		);
	}

	async function reorder(ids: number[], moved: ImpItem) {
		const before = items;
		items = ids.map((id) => items.find((i) => i.id === id)!);
		const r = await post<{ items: ImpItem[] }>({ action: 'reorder', ids });
		if (r.ok) {
			items = merge(r.data.items);
			announce = t('plan.announceMoved', { title: moved.title, position: ids.indexOf(moved.id) + 1 });
		} else {
			items = Array.isArray(r.body.items) ? merge(r.body.items as ImpItem[]) : before;
			say(r.message, 'warn');
		}
	}

	function move(index: number, delta: number) {
		const j = index + delta;
		if (j < 0 || j >= items.length) return;
		const ids = items.map((i) => i.id);
		[ids[index], ids[j]] = [ids[j], ids[index]];
		reorder(ids, items[index]);
	}

	function moveTo(id: number, index: number) {
		const from = items.findIndex((i) => i.id === id);
		if (from < 0) return;
		const ids = items.map((i) => i.id).filter((x) => x !== id);
		const to = index > from ? index - 1 : index;
		if (to === from) return;
		ids.splice(to, 0, id);
		reorder(ids, items[from]);
	}

	async function remove(index: number) {
		const it = items[index];
		if (!it) return;
		const snapshot = { ...it };
		clearTimeout(timers.get(it.id));
		timers.delete(it.id);
		dirtyCount = timers.size;
		// After any update of this item in flight; its unsent typing goes with the item.
		const saver = saverFor(it.id);
		saver.discard();
		const r = await saver.run(() => post<{ items: ImpItem[] }>({ action: 'delete', id: it.id }));
		if (!r.ok) {
			saver.changed(); // still there: its text counts as unsaved again
			say(r.message, 'warn');
			return;
		}
		savers.delete(it.id);
		delete errors[it.id];
		items = merge(r.data.items);
		say(t('plan.deleted', { title: snapshot.title }), 'info', { label: t('plan.undo'), run: () => restore(snapshot, index) });
		await tick();
		const next = items[Math.min(index, items.length - 1)];
		document.getElementById(next ? `imp-${next.id}-title` : 'imp-newdx')?.focus();
	}

	async function restore(s: ImpItem, index: number) {
		notice = null;
		const r = await post<{ item: ImpItem; items: ImpItem[] }>({
			action: 'add',
			item: { kind: s.kind, title: s.title, codes: s.codes, plan: s.plan, link: s.link },
			index,
			allowDuplicate: true
		});
		if (r.ok) {
			items = merge(r.data.items);
			announce = t('plan.announceRestored', { title: s.title });
		} else say(r.message, 'warn');
	}

	// ---------- New Dx box (§10.4) ----------
	let newDx = $state('');
	let newDxError = $state('');
	/** The server said 409 {code: 'duplicate'}: offer "Add anyway". */
	let newDxDuplicate = $state(false);
	let committing = false;
	async function commitNewDx(allowDuplicate = false) {
		const text = newDx;
		if (text.trim().length < 2 || committing) return;
		committing = true;
		const r = await post<{ item: ImpItem | null; items: ImpItem[] }>({ action: 'newDx', text, allowDuplicate });
		committing = false;
		if (r.ok) {
			items = merge(r.data.items);
			if (r.data.item) {
				if (newDx === text) newDx = '';
				newDxError = '';
				newDxDuplicate = false;
				announce = t('plan.announceAdded', { title: r.data.item.title, seq: r.data.item.seq });
			}
		} else {
			newDxError = r.message;
			newDxDuplicate = r.status === 409 && r.body.code === 'duplicate';
		}
	}

	// ---------- Builder candidates (recomputed on open and as findings change) ----------
	let cands = $state<CandidateSet | null>(null);
	let candLoading = $state(false);
	let candError = $state('');
	const values = $derived.by(() => {
		const out: Record<string, string> = {};
		for (const [k, f] of Object.entries(findings)) if (f?.value) out[k] = f.value;
		return out;
	});
	const valuesKey = $derived(JSON.stringify(values));
	let candTimer: ReturnType<typeof setTimeout> | undefined;
	let candRequest = 0;
	async function loadCandidates(body: string) {
		const rid = ++candRequest;
		candLoading = true;
		const r = await postJson<CandidateSet>(t, `${url}/candidates`, { findings: JSON.parse(body) }, false);
		if (rid !== candRequest) return;
		candLoading = false;
		if (r.ok) {
			cands = r.data;
			candError = '';
		} else candError = t('plan.candError', { error: r.message });
	}
	let first = true;
	$effect(() => {
		const key = valuesKey;
		clearTimeout(candTimer);
		candTimer = setTimeout(() => loadCandidates(key), first ? 0 : 800);
		first = false;
		return () => clearTimeout(candTimer);
	});

	// ---------- drag and drop ----------
	const CAND = 'application/x-openvision-candidate';
	const ITEM = 'application/x-openvision-item';
	let dropAt = $state<number | null>(null);
	let dropOnBox = $state(false);
	const allCandidates = $derived(cands ? [...cands.findings, ...cands.poh, ...cands.pmh] : []);

	function itemDrag(e: DragEvent, it: ImpItem) {
		if (!e.dataTransfer) return;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData(ITEM, String(it.id));
		e.dataTransfer.setData('text/plain', it.title);
		const li = (e.currentTarget as HTMLElement).closest('li');
		if (li) e.dataTransfer.setDragImage(li, 16, 16);
	}
	const accepts = (e: DragEvent) => !!e.dataTransfer && (e.dataTransfer.types.includes(CAND) || e.dataTransfer.types.includes(ITEM));
	function over(e: DragEvent, index: number) {
		if (!accepts(e)) return;
		e.preventDefault();
		const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
		dropAt = e.clientY > box.top + box.height / 2 ? index + 1 : index;
	}
	function drop(e: DragEvent, index: number | null) {
		if (!accepts(e)) return;
		e.preventDefault();
		const at = index ?? dropAt ?? items.length;
		dropAt = null;
		const id = e.dataTransfer!.getData(ITEM);
		const key = e.dataTransfer!.getData(CAND);
		if (id) moveTo(Number(id), at);
		else if (key) {
			const c = allCandidates.find((x) => x.key === key);
			if (c) addCandidate(c, at);
		}
	}
	function dropOnNewDx(e: DragEvent) {
		dropOnBox = false;
		const key = e.dataTransfer?.getData(CAND);
		if (!key) return;
		e.preventDefault();
		const c = allCandidates.find((x) => x.key === key);
		if (!c) return;
		// Replaces the box with the row's text (§10.2), first code on the title line so it parses back.
		const code = c.codes.split(/,\s*/)[0] ?? '';
		newDx = `${c.title}${code ? ` ${code}` : ''}${c.plan ? `\n${c.plan}` : ''}`;
		document.getElementById('imp-newdx')?.focus();
	}

	const inList = (c: Candidate) =>
		items.some((i) => (c.kind === 'issue' ? i.link === c.link : i.kind === c.kind && i.title === c.title && i.codes === c.codes));

	// ---------- orders ----------
	async function saveOrders(optionIds: number[], plan: string): Promise<string> {
		const r = await post<{ orders: string[]; orderDetails: VisitOrder[]; orderPlan: string }>({ action: 'orders', optionIds, plan });
		if (!r.ok) return r.message;
		if (data) {
			data.orders = r.data.orders;
			data.orderDetails = r.data.orderDetails;
			data.orderPlan = r.data.orderPlan;
		}
		return '';
	}
	function setOptions(next: OrderOption[]) {
		if (data) data.orderOptions = next;
	}

	// ---------- accordion ----------
	let pane = $state<'builder' | 'orders'>('builder');
	const ordersCount = $derived(data?.orderDetails.length ?? 0);
</script>

<section class="impplan" aria-labelledby="ip-title">
	<div class="head">
		<h2 id="ip-title">{t('plan.heading')}</h2>
		<p class="save" class:error={!!saveError && !inflight && !dirtyCount} role="status" aria-live="polite">
			{saveText}
			{#if saveError && !inflight && !dirtyCount}<button type="button" onclick={retryAll}>{t('plan.retry')}</button>{/if}
		</p>
	</div>
	<p class="visually-hidden" role="status" aria-live="polite">{announce}</p>

	{#if loadError}
		<p class="load-error" role="alert">{loadError}</p>
	{:else}
		<div class="cols">
			<!-- Left: impression list + New Dx -->
			<div class="panel" role="group" aria-labelledby="ip-list-title">
				<div class="card-head">
					<h3 id="ip-list-title">{t('plan.impression')}</h3>
					<span class="count">{t('plan.itemCount', { count: items.length })}</span>
				</div>
				<div class="body">
					{#if !data}
						<p class="help">{t('plan.loading')}</p>
					{:else if items.length}
						<ol class="list" aria-label={t('plan.impressionItems')}>
							{#each items as it, i (it.id)}
								<li
									class:drop-before={dropAt === i}
									class:drop-after={dropAt === items.length && i === items.length - 1}
									ondragover={(e) => over(e, i)}
									ondragleave={() => (dropAt = null)}
									ondrop={(e) => drop(e, null)}
								>
									<ImpItemRow
										item={it}
										{codeSet}
										index={i}
										count={items.length}
										error={errors[it.id]?.message ?? ''}
										duplicate={errors[it.id]?.duplicate ?? false}
										onedit={(field, value) => edit(it.id, field, value)}
										oncodes={(codes) => setCodes(it.id, codes)}
										onmove={(d) => move(i, d)}
										ondelete={() => remove(i)}
										onkeep={() => keepBoth(it.id)}
										ondraghandle={(e) => itemDrag(e, it)}
									/>
								</li>
							{/each}
						</ol>
					{:else}
						<div
							class="empty"
							class:drop-target={dropAt !== null}
							role="presentation"
							ondragover={(e) => {
								if (accepts(e)) {
									e.preventDefault();
									dropAt = 0;
								}
							}}
							ondragleave={() => (dropAt = null)}
							ondrop={(e) => drop(e, 0)}
						>
							<p><strong>{t('plan.emptyTitle')}</strong></p>
							<p class="help">{t('plan.emptyHelp')}</p>
						</div>
					{/if}

					{#if notice}
						<div class="notice" class:warn={notice.tone === 'warn'}>
							<span>{notice.text}</span>
							{#if notice.action}
								{@const a = notice.action}
								<button type="button" onclick={() => { notice = null; a.run(); }}>{a.label}</button>
							{/if}
							<button type="button" class="dismiss" onclick={() => (notice = null)} aria-label={t('plan.dismiss')}>✕</button>
						</div>
					{/if}

					<div class="newdx" class:drop-target={dropOnBox}>
						<label for="imp-newdx">{t('plan.newDx')}</label>
						<textarea
							id="imp-newdx"
							rows="2"
							maxlength="4200"
							placeholder={codeSet === 'icd11' ? t('plan.newDxPlaceholderIcd11') : t('plan.newDxPlaceholderIcd10')}
							aria-describedby="imp-newdx-help"
							bind:value={newDx}
							onblur={() => commitNewDx()}
							ondragover={(e) => {
								if (e.dataTransfer?.types.includes(CAND)) {
									e.preventDefault();
									dropOnBox = true;
								}
							}}
							ondragleave={() => (dropOnBox = false)}
							ondrop={dropOnNewDx}
						></textarea>
						<div class="newdx-actions">
							<!-- aria-disabled: stays focusable and its tip says what is missing; commitNewDx() checks the length itself. -->
							<button type="button" onclick={() => commitNewDx()} aria-disabled={newDx.trim().length < 2 ? 'true' : undefined} use:tip={newDx.trim().length < 2 ? t('tips.addToListShort') : null}>{t('plan.addToList')}</button>
						</div>
						<p class="help" id="imp-newdx-help">
							{codeSet === 'icd11' ? t('plan.newDxHelpIcd11') : t('plan.newDxHelpIcd10')}
						</p>
						{#if newDxError}
							<p class="err" role="alert">
								{newDxError}
								{#if newDxError && newDxDuplicate}<button type="button" onclick={() => commitNewDx(true)}>{t('plan.addAnyway')}</button>{/if}
							</p>
						{/if}
					</div>
					<p class="help">{t('plan.reorderHelp')}</p>
				</div>
			</div>

			<!-- Right: accordion, one pane open -->
			<div class="accordion">
				<div class="acc" class:open={pane === 'builder'}>
					<h3>
						<button type="button" id="acc-builder" aria-expanded={pane === 'builder'} aria-controls="acc-builder-pane" onclick={() => (pane = 'builder')}>
							<span class="chev flip-rtl" aria-hidden="true">{pane === 'builder' ? '▾' : '▸'}</span>
							{t('plan.builder')}
							<span class="count">{cands ? cands.findings.length + cands.poh.length + cands.pmh.length : ''}</span>
						</button>
					</h3>
					{#if pane === 'builder'}
						<div id="acc-builder-pane" role="region" aria-labelledby="acc-builder" class="pane">
							<Builder
								set={cands}
								loading={candLoading}
								error={candError}
								{inList}
								onadd={(c) => addCandidate(c)}
								onaddmany={addMany}
								onrefresh={() => loadCandidates(valuesKey)}
							/>
						</div>
					{/if}
				</div>
				<div class="acc" class:open={pane === 'orders'}>
					<h3>
						<button type="button" id="acc-orders" aria-expanded={pane === 'orders'} aria-controls="acc-orders-pane" onclick={() => (pane = 'orders')}>
							<span class="chev flip-rtl" aria-hidden="true">{pane === 'orders' ? '▾' : '▸'}</span>
							{t('plan.ordersNextVisit')}
							<span class="count">{ordersCount ? t('plan.ordersChecked', { count: ordersCount }) : ''}</span>
						</button>
					</h3>
					{#if pane === 'orders'}
						<div id="acc-orders-pane" role="region" aria-labelledby="acc-orders" class="pane">
							{#if data}
								<Orders
									options={data.orderOptions}
									details={data.orderDetails}
									plan={data.orderPlan}
									canEdit={data.canEditOrders}
									owner={data.orderListOwner}
									onsave={saveOrders}
									onoptions={setOptions}
								/>
							{:else}
								<p class="help">{t('plan.loading')}</p>
							{/if}
						</div>
					{/if}
				</div>
				{#if data?.usBilling !== false}<p class="help">{t('plan.codesHint')}</p>{/if}
			</div>
		</div>
	{/if}
</section>

<style>
	.impplan {
		display: grid;
		gap: var(--space-3);
		container-type: inline-size;
		min-width: 0;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		min-height: 40px;
	}
	h2 {
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		margin: 0;
	}
	h3 {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		margin: 0;
	}
	.save {
		margin: 0;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.save.error {
		color: var(--danger);
	}
	.save button {
		min-height: 40px;
	}
	.load-error {
		color: var(--danger);
		margin: 0;
	}
	.cols {
		display: grid;
		gap: var(--space-4);
		align-items: start;
		min-width: 0;
	}
	@container (min-width: 47.5rem) {
		.cols {
			grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
		}
	}
	.panel,
	.acc {
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		min-width: 0;
	}
	.card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--hairline);
		background: var(--surface-2);
		border-radius: var(--radius-2) var(--radius-2) 0 0;
	}
	.count {
		font-size: var(--text-xs);
		color: var(--text-3);
		font-weight: var(--weight-regular);
		font-variant-numeric: tabular-nums;
	}
	.body {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-3);
		min-width: 0;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
	}
	.list li {
		padding: var(--space-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		background: var(--surface-1);
		min-width: 0;
	}
	.list li.drop-before {
		box-shadow: 0 -3px 0 var(--accent);
	}
	.list li.drop-after {
		box-shadow: 0 3px 0 var(--accent);
	}
	.empty {
		padding: var(--space-4);
		border: 1px dashed var(--hairline);
		border-radius: var(--radius-1);
		text-align: center;
	}
	.empty p {
		margin: 0;
	}
	.drop-target {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.notice {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		padding-block: var(--space-1);
		padding-inline: var(--space-3) var(--space-1);
		border-radius: var(--radius-1);
		background: var(--accent-soft);
		color: var(--text-1);
	}
	.notice.warn {
		background: var(--abnormal-soft);
	}
	.notice span {
		flex: 1 1 12em;
	}
	.notice button {
		min-height: 40px;
	}
	.notice .dismiss {
		min-width: 40px;
		padding: 0;
		border-color: transparent;
		background: transparent;
	}
	.newdx {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		background: var(--surface-2);
	}
	.newdx label {
		color: var(--text-2);
		font-weight: var(--weight-semibold);
	}
	.newdx textarea {
		font: inherit;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		padding: 4px var(--space-2);
		min-height: 56px;
		width: 100%;
		resize: vertical;
	}
	.newdx textarea:focus {
		border-color: var(--accent);
		outline: none;
		box-shadow: 0 0 0 1px var(--focus-ring);
	}
	.newdx textarea::placeholder {
		color: var(--text-3);
	}
	.newdx-actions {
		display: flex;
		justify-content: flex-end;
	}
	.newdx-actions button,
	.err button {
		min-height: 40px;
	}
	.err {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		color: var(--danger);
		font-size: var(--text-xs);
	}
	.help {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.accordion {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}
	.acc h3 button {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		min-height: 44px;
		border: 0;
		border-radius: var(--radius-2);
		background: var(--surface-2);
		text-align: start;
		font-weight: var(--weight-semibold);
	}
	.acc.open h3 button {
		border-radius: var(--radius-2) var(--radius-2) 0 0;
		border-bottom: 1px solid var(--hairline);
		box-shadow: inset 3px 0 0 var(--accent);
	}
	.acc h3 .count {
		margin-inline-start: auto;
	}
	.chev {
		width: 1em;
		color: var(--text-3);
	}
	.pane {
		padding: var(--space-3);
		min-width: 0;
	}
</style>
