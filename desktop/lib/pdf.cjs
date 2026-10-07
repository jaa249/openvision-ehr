'use strict';
// PDF details for Download › PDF in the desktop app (D51).

// Countries where US Letter is the usual paper; everywhere else gets A4. Taken from the Windows
// region (app.getLocaleCountryCode()), so a practice gets the paper its printer already uses.
const LETTER = new Set(['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'PR', 'GT', 'CR', 'PA', 'DO', 'SV', 'NI', 'HN', 'BZ']);

/** 'Letter' or 'A4' for a two-letter country code (unknown → A4, except an empty code → Letter for en-US defaults). */
function pdfPageSize(country) {
	const c = String(country || '').toUpperCase();
	if (!c) return 'Letter';
	return LETTER.has(c) ? 'Letter' : 'A4';
}

/** A safe file name for the Save dialog: letters, digits, dot, dash and underscore; ".pdf" added. */
function pdfFileName(suggested, now = new Date()) {
	let base = typeof suggested === 'string' ? suggested.replace(/\.pdf$/i, '').replace(/[^0-9A-Za-z._-]+/g, '-') : '';
	base = base.replace(/^[-.]+|[-.]+$/g, '').slice(0, 100);
	if (!base) base = `openvision-report-${now.toISOString().slice(0, 10)}`;
	return `${base}.pdf`;
}

/** Visit ids for savePdf: 1..max (MAX_PRINT, 200) positive safe integers, or null when invalid. */
function validIds(ids, max = 200) {
	if (!Array.isArray(ids) || ids.length === 0 || ids.length > max) return null;
	if (!ids.every((n) => Number.isSafeInteger(n) && n > 0)) return null;
	return [...new Set(ids)];
}

module.exports = { pdfPageSize, pdfFileName, validIds };
