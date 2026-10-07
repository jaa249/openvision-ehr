import { loadCatalog } from '#lib/i18n/catalog.ts';
import type { LayoutLoad } from './$types';

/** The messages for the page language (D48): English is in the bundle; another language loads once, lazily. */
export const load: LayoutLoad = async ({ data }) => ({ ...data, messages: await loadCatalog(data.locale) });
