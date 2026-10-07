// Glossary: plain names for the abbreviations the exam shows (OD, NS, sc, ADD, mmHg, 920xx ...).
// The text lives in the i18n namespace "glossary" (English is the source; other languages are drafts and
// translate only the explanation: the abbreviation itself stays as written). <Abbr code="NS" /> and the
// tooltips use it; glossary.test.ts checks every abbreviation in the quick picks and section definitions.
import type { MessageKey } from './catalog.ts';
import type { Params } from './translate.ts';
import { EN } from './catalog.ts';

type T = (key: MessageKey, params?: Params) => string;

/** Abbreviation exactly as written on screen -> its glossary message. */
export const GLOSSARY: Record<string, MessageKey> = {
	OD: 'glossary.od',
	OS: 'glossary.os',
	OU: 'glossary.ou',
	HPI: 'glossary.hpi',
	ROS: 'glossary.ros',
	CC: 'glossary.chiefComplaint',
	IOP: 'glossary.iop',
	VA: 'glossary.va',
	VF: 'glossary.vf',
	OCT: 'glossary.oct',
	Gonio: 'glossary.gonio',
	CN: 'glossary.cn',
	"CN V": 'glossary.cn5',
	"CN VII": 'glossary.cn7',
	MRD: 'glossary.mrd',
	LF: 'glossary.lf',
	TBUT: 'glossary.tbut',
	CMT: 'glossary.cmt',
	PACH: 'glossary.pach',
	"seb ker": 'glossary.sebKer',
	"act ker": 'glossary.actKer',
	BCC: 'glossary.bcc',
	SCC: 'glossary.scc',
	NLDO: 'glossary.nldo',
	MDF: 'glossary.mdf',
	FB: 'glossary.fb',
	KP: 'glossary.kp',
	PXE: 'glossary.pxe',
	PI: 'glossary.pi',
	NVI: 'glossary.nvi',
	NS: 'glossary.ns',
	PSC: 'glossary.psc',
	PCIOL: 'glossary.pciol',
	PC: 'glossary.pc',
	NVD: 'glossary.nvd',
	NVE: 'glossary.nve',
	PED: 'glossary.ped',
	CSR: 'glossary.csr',
	BDR: 'glossary.bdr',
	PDR: 'glossary.pdr',
	BRVO: 'glossary.brvo',
	CRVO: 'glossary.crvo',
	BRAO: 'glossary.brao',
	CRAO: 'glossary.crao',
	PVD: 'glossary.pvd',
	RD: 'glossary.rd',
	"C/D": 'glossary.cd',
	"A/V": 'glossary.av',
	gr: 'glossary.gr',
	trace: 'glossary.trace',
	"+1": 'glossary.grade',
	sc: 'glossary.sc',
	cc: 'glossary.cc',
	PH: 'glossary.ph',
	AR: 'glossary.ar',
	MR: 'glossary.mr',
	CR: 'glossary.cr',
	CTL: 'glossary.ctl',
	PAM: 'glossary.pam',
	LI: 'glossary.li',
	CF: 'glossary.cf',
	HM: 'glossary.hm',
	LP: 'glossary.lp',
	NLP: 'glossary.nlp',
	J1: 'glossary.jaeger',
	"20/20": 'glossary.snellen',
	logMAR: 'glossary.logmar',
	BAT: 'glossary.bat',
	W: 'glossary.w',
	dist: 'glossary.dist',
	Sph: 'glossary.sph',
	Cyl: 'glossary.cyl',
	Axis: 'glossary.axis',
	ADD: 'glossary.add',
	Prism: 'glossary.prism',
	Base: 'glossary.base',
	BI: 'glossary.bi',
	BO: 'glossary.bo',
	BU: 'glossary.bu',
	BD: 'glossary.bd',
	PD: 'glossary.pd',
	D: 'glossary.dioptre',
	"Δ": 'glossary.prismDioptre',
	DIA: 'glossary.dia',
	mmHg: 'glossary.mmhg',
	mm: 'glossary.mm',
	"µm": 'glossary.um',
	s: 'glossary.sec',
	APD: 'glossary.apd',
	RAPD: 'glossary.rapd',
	ST: 'glossary.st',
	SN: 'glossary.sn',
	IT: 'glossary.it',
	IN: 'glossary.in',
	DIL: 'glossary.dil',
	"Tono-Pen": 'glossary.tonoPen',
	"D&V": 'glossary.dv',
	NPA: 'glossary.npa',
	NPC: 'glossary.npc',
	E: 'glossary.e',
	"E(T)": 'glossary.eIntermittent',
	ET: 'glossary.et',
	X: 'glossary.x',
	"X(T)": 'glossary.xIntermittent',
	XT: 'glossary.xt',
	HT: 'glossary.ht',
	"H(T)": 'glossary.hIntermittent',
	hypoT: 'glossary.hypoT',
	"hypo(T)": 'glossary.hypoIntermittent',
	RHT: 'glossary.rht',
	LHT: 'glossary.lht',
	Ortho: 'glossary.ortho',
	ACT: 'glossary.act',
	CT: 'glossary.ct',
	POH: 'glossary.poh',
	POS: 'glossary.pos',
	PMH: 'glossary.pmh',
	FH: 'glossary.fh',
	SH: 'glossary.sh',
	PMSFH: 'glossary.pmsfh',
	CPT: 'glossary.cpt',
	ICD: 'glossary.icd',
	"920xx": 'glossary.eyeCodes',
	"992xx": 'glossary.emCodes',
	"E/M": 'glossary.em',
	Rx: 'glossary.rx',
	Dx: 'glossary.dx',
	Hx: 'glossary.hx',
	Imp: 'glossary.imp',
	BC: 'glossary.baseCurve',
	Vertex: 'glossary.vertex',
	'Slab-off': 'glossary.slabOff',
};

/** Families written with a number: J1+ ... J16 (Jaeger), 20/40 (Snellen), +2 / 2+ (grades). */
const PATTERNS: [RegExp, MessageKey][] = [
	[/^J\d{1,2}\+?$/, 'glossary.jaeger'],
	[/^20\/\d{2,3}$/, 'glossary.snellen'],
	[/^(\+[1-4]|[1-4]\+)$/, 'glossary.grade']
];

/**
 * Codes typed in capitals ("SPH", "SC", "AXIS" in a shorthand hint) find the entry written in mixed or
 * lower case. Never the other way round: "in", "it", "x" or "s" in a sentence are words, not codes.
 */
const UPPER = new Map<string, MessageKey | null>();
for (const [code, key] of Object.entries(GLOSSARY)) {
	const k = code.toUpperCase();
	if (k === code) continue;
	UPPER.set(k, UPPER.has(k) && UPPER.get(k) !== key ? null : key);
}

/** The glossary message for an abbreviation, or null when it has none. */
export function glossaryKey(code: string): MessageKey | null {
	const c = code.trim();
	if (!c) return null;
	if (Object.hasOwn(GLOSSARY, c)) return GLOSSARY[c];
	if (c === c.toUpperCase()) {
		const upper = UPPER.get(c);
		if (upper) return upper;
	}
	for (const [re, key] of PATTERNS) if (re.test(c)) return key;
	return null;
}

/**
 * The plain name of an abbreviation ("NS" -> "nuclear sclerosis ..."), or null.
 * Pass the page's t() for the page language; without it the English text is returned.
 */
export function glossary(code: string, t?: T): string | null {
	const key = glossaryKey(code);
	if (!key) return null;
	return t ? t(key) : (EN[key] ?? null);
}
