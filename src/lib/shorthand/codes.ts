// Shorthand vocabulary for the sections built so far. Codes are compared upper-case.
// Source of truth for the full set: docs/spec/SHORTHAND.md (+ fixes in BEHAVIOR.md §2.6).

import type { SectionId } from '#lib/exam/catalog.ts';

const both = (od: string, os: string) => [od, os];

/** Code -> target field ids. Field ids themselves are also valid codes (handled by the parser). */
export const ALIASES: Record<string, string[]> = {
	// ---------- External (R/L field names) ----------
	RB: ['RBROW'],
	LB: ['LBROW'],
	FH: both('RBROW', 'LBROW'),
	BB: both('RBROW', 'LBROW'),
	UL: both('RUL', 'LUL'),
	BUL: both('RUL', 'LUL'),
	BLL: both('RLL', 'LLL'), // LL alone stays "left lens" (§2.6)
	'4XL': ['RUL', 'RLL', 'LUL', 'LLL'],
	RMC: ['RMCT'],
	LMC: ['LMCT'],
	RAD: ['RADNEXA'],
	LAD: ['LADNEXA'],
	BAD: both('RADNEXA', 'LADNEXA'), // original wrote non-existent ids (§2.6)
	MRD: both('RMRD', 'LMRD'),
	BMRD: both('RMRD', 'LMRD'),
	LF: both('RLF', 'LLF'),
	BLF: both('RLF', 'LLF'),
	RVF: ['RVFISSURE'],
	LVF: ['LVFISSURE'],
	VF: both('RVFISSURE', 'LVFISSURE'), // unhandled in the original (§2.6)
	BVF: both('RVFISSURE', 'LVFISSURE'),
	RCAR: ['RCAROTID'],
	LCAR: ['LCAROTID'],
	CAR: both('RCAROTID', 'LCAROTID'),
	BCAR: both('RCAROTID', 'LCAROTID'),
	RTA: ['RTEMPART'],
	LTA: ['LTEMPART'],
	TA: both('RTEMPART', 'LTEMPART'),
	BTA: both('RTEMPART', 'LTEMPART'),
	RCN5: ['RCNV'],
	LCN5: ['LCNV'], // original wrote LCNVI (§2.6)
	CN5: both('RCNV', 'LCNV'),
	CNV: both('RCNV', 'LCNV'),
	BCN5: both('RCNV', 'LCNV'),
	BCNV: both('RCNV', 'LCNV'),
	RCN7: ['RCNVII'],
	LCN7: ['LCNVII'],
	CN7: both('RCNVII', 'LCNVII'), // original wrote the CN V fields (§2.6)
	CNVII: both('RCNVII', 'LCNVII'),
	BCN7: both('RCNVII', 'LCNVII'),
	BCNVII: both('RCNVII', 'LCNVII'),
	RH: ['ODHERTEL'],
	LH: ['OSHERTEL'], // original wrote OLHERTEL (§2.6)
	BHERT: ['HERTELBASE'],
	ECOM: ['EXT_COMMENTS'],
	EXTCOM: ['EXT_COMMENTS'],

	// ---------- Anterior segment ----------
	RC: ['ODCONJ'],
	LC: ['OSCONJ'],
	RK: ['ODCORNEA'],
	LK: ['OSCORNEA'],
	RAC: ['ODAC'],
	LAC: ['OSAC'],
	RL: ['ODLENS'],
	LL: ['OSLENS'],
	RI: ['ODIRIS'],
	LI: ['OSIRIS'],
	RG: ['ODGONIO'],
	LG: ['OSGONIO'],
	RPACH: ['ODKTHICKNESS'],
	LPACH: ['OSKTHICKNESS'],
	RSCH1: ['ODSCHIRMER1'],
	LSCH1: ['OSSCHIRMER1'],
	RSCH2: ['ODSCHIRMER2'],
	LSCH2: ['OSSCHIRMER2'],
	RTBUT: ['ODTBUT'],
	LTBUT: ['OSTBUT'],
	ASCOM: ['ANTSEG_COMMENTS'],
	ACOM: ['ANTSEG_COMMENTS'],
	BC: both('ODCONJ', 'OSCONJ'), // conjunctiva, not cup (§2.6)
	C: both('ODCONJ', 'OSCONJ'),
	BK: both('ODCORNEA', 'OSCORNEA'),
	K: both('ODCORNEA', 'OSCORNEA'),
	BAC: both('ODAC', 'OSAC'),
	AC: both('ODAC', 'OSAC'),
	BL: both('ODLENS', 'OSLENS'),
	L: both('ODLENS', 'OSLENS'),
	BI: both('ODIRIS', 'OSIRIS'),
	I: both('ODIRIS', 'OSIRIS'),
	BG: both('ODGONIO', 'OSGONIO'),
	G: both('ODGONIO', 'OSGONIO'),
	GONIO: both('ODGONIO', 'OSGONIO'),
	BPACH: both('ODKTHICKNESS', 'OSKTHICKNESS'),
	PACH: both('ODKTHICKNESS', 'OSKTHICKNESS'),
	BTBUT: both('ODTBUT', 'OSTBUT'),
	TBUT: both('ODTBUT', 'OSTBUT'),
	SCH1: both('ODSCHIRMER1', 'OSSCHIRMER1'), // unhandled in the original (§2.6)
	SCH2: both('ODSCHIRMER2', 'OSSCHIRMER2'),
	BSCH1: both('ODSCHIRMER1', 'OSSCHIRMER1'),
	BSCH2: both('ODSCHIRMER2', 'OSSCHIRMER2'),

	// ---------- Retina ----------
	RD: ['ODDISC'],
	RDISC: ['ODDISC'],
	LD: ['OSDISC'],
	LDISC: ['OSDISC'],
	BD: both('ODDISC', 'OSDISC'),
	BDISC: both('ODDISC', 'OSDISC'),
	BDISCS: both('ODDISC', 'OSDISC'),
	RCUP: ['ODCUP'],
	LCUP: ['OSCUP'],
	CUP: both('ODCUP', 'OSCUP'), // unhandled in the original (§2.6)
	BCUP: both('ODCUP', 'OSCUP'),
	BCUPS: both('ODCUP', 'OSCUP'),
	RMAC: ['ODMACULA'],
	RMACULA: ['ODMACULA'],
	LMAC: ['OSMACULA'],
	LMACULA: ['OSMACULA'],
	MAC: both('ODMACULA', 'OSMACULA'),
	BMAC: both('ODMACULA', 'OSMACULA'),
	BM: both('ODMACULA', 'OSMACULA'),
	RV: ['ODVESSELS'],
	LV: ['OSVESSELS'],
	V: both('ODVESSELS', 'OSVESSELS'),
	BV: both('ODVESSELS', 'OSVESSELS'),
	RVIT: ['ODVITREOUS'],
	LVIT: ['OSVITREOUS'],
	VIT: both('ODVITREOUS', 'OSVITREOUS'),
	BVIT: both('ODVITREOUS', 'OSVITREOUS'),
	RP: ['ODPERIPH'],
	LP: ['OSPERIPH'],
	P: both('ODPERIPH', 'OSPERIPH'),
	BP: both('ODPERIPH', 'OSPERIPH'),
	RCMT: ['ODCMT'],
	LCMT: ['OSCMT'],
	CMT: both('ODCMT', 'OSCMT'),
	BCMT: both('ODCMT', 'OSCMT'),
	RCOM: ['RETINA_COMMENTS']
};

export type Command = { kind: 'defaults' | 'clear'; sections: SectionId[] | 'all' };

const ext: SectionId[] = ['EXT'];
const ant: SectionId[] = ['ANTSEG'];
const ret: SectionId[] = ['RETINA'];

/** Whole-entry commands (spec §2.3 stage 1). There is no clear-all command (parity). */
export const COMMANDS: Record<string, Command> = {
	D: { kind: 'defaults', sections: 'all' },
	DEXT: { kind: 'defaults', sections: ext },
	DANTSEG: { kind: 'defaults', sections: ant },
	DAS: { kind: 'defaults', sections: ant },
	DRETINA: { kind: 'defaults', sections: ret },
	DRET: { kind: 'defaults', sections: ret },
	CLEAREXT: { kind: 'clear', sections: ext },
	CEXT: { kind: 'clear', sections: ext },
	CLEARAS: { kind: 'clear', sections: ant },
	CLEARANTSEG: { kind: 'clear', sections: ant },
	CANTSEG: { kind: 'clear', sections: ant },
	CANT: { kind: 'clear', sections: ant },
	CAS: { kind: 'clear', sections: ant },
	CLEARRET: { kind: 'clear', sections: ret },
	CLEARRETINA: { kind: 'clear', sections: ret },
	CRET: { kind: 'clear', sections: ret },
	CRETINA: { kind: 'clear', sections: ret }
};

/** Codes whose text is split across several fields. */
export const SPECIAL = new Set(['HERT']);
