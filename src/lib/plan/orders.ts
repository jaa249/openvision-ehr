// OpenVision's default next-visit orders list (spec §10.6), written for this project.
// Each provider's own list is seeded from this once; they can rename, reorder, remove and add.
// The CPT number makes an order a billable test (§11.3). Descriptions are our own short wording;
// OpenVision never ships CPT descriptor text (AMA copyright).
export interface OrderSeed {
	label: string;
	cpt: string;
}

export const ORDER_SEED: OrderSeed[] = [
	{ label: 'OCT optic nerve / RNFL', cpt: '92133' },
	{ label: 'OCT macula / retina', cpt: '92134' },
	{ label: 'Fundus photos', cpt: '92250' },
	{ label: 'Visual field, full threshold', cpt: '92083' },
	{ label: 'Visual field, screening', cpt: '92081' },
	{ label: 'Gonioscopy', cpt: '92020' },
	{ label: 'Pachymetry (corneal thickness)', cpt: '76514' },
	{ label: 'Corneal topography', cpt: '92025' },
	{ label: 'Extended ophthalmoscopy, first visit', cpt: '92201' },
	{ label: 'Extended ophthalmoscopy, follow-up', cpt: '92202' },
	{ label: 'A-scan biometry / IOL calculation', cpt: '92136' },
	{ label: 'External photos', cpt: '92285' },
	{ label: 'Specular microscopy', cpt: '92286' },
	{ label: 'Dilate next visit', cpt: '' },
	{ label: 'IOP check', cpt: '' },
	{ label: 'Refraction next visit', cpt: '' },
	{ label: 'Contact lens fitting', cpt: '' },
	{ label: 'Return in 1 week', cpt: '' },
	{ label: 'Return in 1 month', cpt: '' },
	{ label: 'Return in 3 months', cpt: '' },
	{ label: 'Return in 6 months', cpt: '' },
	{ label: 'Return in 1 year', cpt: '' },
	{ label: 'Refer to retina', cpt: '' },
	{ label: 'Refer to glaucoma', cpt: '' },
	{ label: 'Refer to oculoplastics', cpt: '' }
];

/** CPT numbers are 5 characters: 5 digits, or 4 digits + F/T (category II/III). '' = not billable. */
export const CPT_RE = /^(\d{5}|\d{4}[FT])$/;
