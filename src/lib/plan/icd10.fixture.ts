// Test fixture: a small slice of the CMS ICD-10-CM FY2027 code file (public domain), same format.
// Used by the engine, loader and plan tests so they never need the full 75k-row file.
export const ICD10_FIXTURE = `
E103311 Type 1 diabetes mellitus with moderate nonproliferative diabetic retinopathy with macular edema, right eye
E103312 Type 1 diabetes mellitus with moderate nonproliferative diabetic retinopathy with macular edema, left eye
E103313 Type 1 diabetes mellitus with moderate nonproliferative diabetic retinopathy with macular edema, bilateral
E103319 Type 1 diabetes mellitus with moderate nonproliferative diabetic retinopathy with macular edema, unspecified eye
E103391 Type 1 diabetes mellitus with moderate nonproliferative diabetic retinopathy without macular edema, right eye
E103392 Type 1 diabetes mellitus with moderate nonproliferative diabetic retinopathy without macular edema, left eye
E103393 Type 1 diabetes mellitus with moderate nonproliferative diabetic retinopathy without macular edema, bilateral
E103399 Type 1 diabetes mellitus with moderate nonproliferative diabetic retinopathy without macular edema, unspecified eye
E113211 Type 2 diabetes mellitus with mild nonproliferative diabetic retinopathy with macular edema, right eye
E113212 Type 2 diabetes mellitus with mild nonproliferative diabetic retinopathy with macular edema, left eye
E113213 Type 2 diabetes mellitus with mild nonproliferative diabetic retinopathy with macular edema, bilateral
E113219 Type 2 diabetes mellitus with mild nonproliferative diabetic retinopathy with macular edema, unspecified eye
E113291 Type 2 diabetes mellitus with mild nonproliferative diabetic retinopathy without macular edema, right eye
E113292 Type 2 diabetes mellitus with mild nonproliferative diabetic retinopathy without macular edema, left eye
E113293 Type 2 diabetes mellitus with mild nonproliferative diabetic retinopathy without macular edema, bilateral
E113299 Type 2 diabetes mellitus with mild nonproliferative diabetic retinopathy without macular edema, unspecified eye
E113311 Type 2 diabetes mellitus with moderate nonproliferative diabetic retinopathy with macular edema, right eye
E113312 Type 2 diabetes mellitus with moderate nonproliferative diabetic retinopathy with macular edema, left eye
E113313 Type 2 diabetes mellitus with moderate nonproliferative diabetic retinopathy with macular edema, bilateral
E113319 Type 2 diabetes mellitus with moderate nonproliferative diabetic retinopathy with macular edema, unspecified eye
E113391 Type 2 diabetes mellitus with moderate nonproliferative diabetic retinopathy without macular edema, right eye
E113392 Type 2 diabetes mellitus with moderate nonproliferative diabetic retinopathy without macular edema, left eye
E113393 Type 2 diabetes mellitus with moderate nonproliferative diabetic retinopathy without macular edema, bilateral
E113399 Type 2 diabetes mellitus with moderate nonproliferative diabetic retinopathy without macular edema, unspecified eye
E113411 Type 2 diabetes mellitus with severe nonproliferative diabetic retinopathy with macular edema, right eye
E113412 Type 2 diabetes mellitus with severe nonproliferative diabetic retinopathy with macular edema, left eye
E113413 Type 2 diabetes mellitus with severe nonproliferative diabetic retinopathy with macular edema, bilateral
E113419 Type 2 diabetes mellitus with severe nonproliferative diabetic retinopathy with macular edema, unspecified eye
E113491 Type 2 diabetes mellitus with severe nonproliferative diabetic retinopathy without macular edema, right eye
E113492 Type 2 diabetes mellitus with severe nonproliferative diabetic retinopathy without macular edema, left eye
E113493 Type 2 diabetes mellitus with severe nonproliferative diabetic retinopathy without macular edema, bilateral
E113499 Type 2 diabetes mellitus with severe nonproliferative diabetic retinopathy without macular edema, unspecified eye
E113511 Type 2 diabetes mellitus with proliferative diabetic retinopathy with macular edema, right eye
E113512 Type 2 diabetes mellitus with proliferative diabetic retinopathy with macular edema, left eye
E113513 Type 2 diabetes mellitus with proliferative diabetic retinopathy with macular edema, bilateral
E113519 Type 2 diabetes mellitus with proliferative diabetic retinopathy with macular edema, unspecified eye
E113591 Type 2 diabetes mellitus with proliferative diabetic retinopathy without macular edema, right eye
E113592 Type 2 diabetes mellitus with proliferative diabetic retinopathy without macular edema, left eye
E113593 Type 2 diabetes mellitus with proliferative diabetic retinopathy without macular edema, bilateral
E113599 Type 2 diabetes mellitus with proliferative diabetic retinopathy without macular edema, unspecified eye
E119    Type 2 diabetes mellitus without complications
E133311 Other specified diabetes mellitus with moderate nonproliferative diabetic retinopathy with macular edema, right eye
E133312 Other specified diabetes mellitus with moderate nonproliferative diabetic retinopathy with macular edema, left eye
E133313 Other specified diabetes mellitus with moderate nonproliferative diabetic retinopathy with macular edema, bilateral
E133319 Other specified diabetes mellitus with moderate nonproliferative diabetic retinopathy with macular edema, unspecified eye
E133391 Other specified diabetes mellitus with moderate nonproliferative diabetic retinopathy without macular edema, right eye
E133392 Other specified diabetes mellitus with moderate nonproliferative diabetic retinopathy without macular edema, left eye
E133393 Other specified diabetes mellitus with moderate nonproliferative diabetic retinopathy without macular edema, bilateral
E133399 Other specified diabetes mellitus with moderate nonproliferative diabetic retinopathy without macular edema, unspecified eye
G245    Blepharospasm
H02101  Unspecified ectropion of right upper eyelid
H02102  Unspecified ectropion of right lower eyelid
H02103  Unspecified ectropion of right eye, unspecified eyelid
H02104  Unspecified ectropion of left upper eyelid
H02105  Unspecified ectropion of left lower eyelid
H02106  Unspecified ectropion of left eye, unspecified eyelid
H02109  Unspecified ectropion of unspecified eye, unspecified eyelid
H02111  Cicatricial ectropion of right upper eyelid
H02112  Cicatricial ectropion of right lower eyelid
H02113  Cicatricial ectropion of right eye, unspecified eyelid
H02114  Cicatricial ectropion of left upper eyelid
H02115  Cicatricial ectropion of left lower eyelid
H02116  Cicatricial ectropion of left eye, unspecified eyelid
H02119  Cicatricial ectropion of unspecified eye, unspecified eyelid
H02401  Unspecified ptosis of right eyelid
H02402  Unspecified ptosis of left eyelid
H02403  Unspecified ptosis of bilateral eyelids
H02409  Unspecified ptosis of unspecified eyelid
H02831  Dermatochalasis of right upper eyelid
H02832  Dermatochalasis of right lower eyelid
H02833  Dermatochalasis of right eye, unspecified eyelid
H02834  Dermatochalasis of left upper eyelid
H02835  Dermatochalasis of left lower eyelid
H02836  Dermatochalasis of left eye, unspecified eyelid
H02839  Dermatochalasis of unspecified eye, unspecified eyelid
H1030   Unspecified acute conjunctivitis, unspecified eye
H1031   Unspecified acute conjunctivitis, right eye
H1032   Unspecified acute conjunctivitis, left eye
H1033   Unspecified acute conjunctivitis, bilateral
H109    Unspecified conjunctivitis
H11001  Unspecified pterygium of right eye
H11002  Unspecified pterygium of left eye
H11003  Unspecified pterygium of eye, bilateral
H11009  Unspecified pterygium of unspecified eye
H11151  Pinguecula, right eye
H11152  Pinguecula, left eye
H11153  Pinguecula, bilateral
H11159  Pinguecula, unspecified eye
H17811  Minor opacity of cornea, right eye
H17812  Minor opacity of cornea, left eye
H17813  Minor opacity of cornea, bilateral
H17819  Minor opacity of cornea, unspecified eye
H17821  Peripheral opacity of cornea, right eye
H17822  Peripheral opacity of cornea, left eye
H17823  Peripheral opacity of cornea, bilateral
H17829  Peripheral opacity of cornea, unspecified eye
H1789   Other corneal scars and opacities
H179    Unspecified corneal scar and opacity
H1820   Unspecified corneal edema
H2510   Age-related nuclear cataract, unspecified eye
H2511   Age-related nuclear cataract, right eye
H2512   Age-related nuclear cataract, left eye
H2513   Age-related nuclear cataract, bilateral
H269    Unspecified cataract
H348110 Central retinal vein occlusion, right eye, with macular edema
H348111 Central retinal vein occlusion, right eye, with retinal neovascularization
H348112 Central retinal vein occlusion, right eye, stable
H348120 Central retinal vein occlusion, left eye, with macular edema
H348121 Central retinal vein occlusion, left eye, with retinal neovascularization
H348122 Central retinal vein occlusion, left eye, stable
H348130 Central retinal vein occlusion, bilateral, with macular edema
H348131 Central retinal vein occlusion, bilateral, with retinal neovascularization
H348132 Central retinal vein occlusion, bilateral, stable
H348190 Central retinal vein occlusion, unspecified eye, with macular edema
H348191 Central retinal vein occlusion, unspecified eye, with retinal neovascularization
H348192 Central retinal vein occlusion, unspecified eye, stable
H348310 Tributary (branch) retinal vein occlusion, right eye, with macular edema
H348311 Tributary (branch) retinal vein occlusion, right eye, with retinal neovascularization
H348312 Tributary (branch) retinal vein occlusion, right eye, stable
H348320 Tributary (branch) retinal vein occlusion, left eye, with macular edema
H348321 Tributary (branch) retinal vein occlusion, left eye, with retinal neovascularization
H348322 Tributary (branch) retinal vein occlusion, left eye, stable
H348330 Tributary (branch) retinal vein occlusion, bilateral, with macular edema
H348331 Tributary (branch) retinal vein occlusion, bilateral, with retinal neovascularization
H348332 Tributary (branch) retinal vein occlusion, bilateral, stable
H348390 Tributary (branch) retinal vein occlusion, unspecified eye, with macular edema
H348391 Tributary (branch) retinal vein occlusion, unspecified eye, with retinal neovascularization
H348392 Tributary (branch) retinal vein occlusion, unspecified eye, stable
H35351  Cystoid macular degeneration, right eye
H35352  Cystoid macular degeneration, left eye
H35353  Cystoid macular degeneration, bilateral
H35359  Cystoid macular degeneration, unspecified eye
H35361  Drusen (degenerative) of macula, right eye
H35362  Drusen (degenerative) of macula, left eye
H35363  Drusen (degenerative) of macula, bilateral
H35369  Drusen (degenerative) of macula, unspecified eye
H3581   Retinal edema
H401110 Primary open-angle glaucoma, right eye, stage unspecified
H401111 Primary open-angle glaucoma, right eye, mild stage
H401112 Primary open-angle glaucoma, right eye, moderate stage
H401113 Primary open-angle glaucoma, right eye, severe stage
H401114 Primary open-angle glaucoma, right eye, indeterminate stage
H401120 Primary open-angle glaucoma, left eye, stage unspecified
H401121 Primary open-angle glaucoma, left eye, mild stage
H401122 Primary open-angle glaucoma, left eye, moderate stage
H401123 Primary open-angle glaucoma, left eye, severe stage
H401124 Primary open-angle glaucoma, left eye, indeterminate stage
H401130 Primary open-angle glaucoma, bilateral, stage unspecified
H401131 Primary open-angle glaucoma, bilateral, mild stage
H401132 Primary open-angle glaucoma, bilateral, moderate stage
H401133 Primary open-angle glaucoma, bilateral, severe stage
H401134 Primary open-angle glaucoma, bilateral, indeterminate stage
H401190 Primary open-angle glaucoma, unspecified eye, stage unspecified
H401191 Primary open-angle glaucoma, unspecified eye, mild stage
H401192 Primary open-angle glaucoma, unspecified eye, moderate stage
H401193 Primary open-angle glaucoma, unspecified eye, severe stage
H401194 Primary open-angle glaucoma, unspecified eye, indeterminate stage
H43811  Vitreous degeneration, right eye
H43812  Vitreous degeneration, left eye
H43813  Vitreous degeneration, bilateral
H43819  Vitreous degeneration, unspecified eye
H57811  Brow ptosis, right
H57812  Brow ptosis, left
H57813  Brow ptosis, bilateral
H57819  Brow ptosis, unspecified
H59031  Cystoid macular edema following cataract surgery, right eye
H59032  Cystoid macular edema following cataract surgery, left eye
H59033  Cystoid macular edema following cataract surgery, bilateral
H59039  Cystoid macular edema following cataract surgery, unspecified eye
I10     Essential (primary) hypertension
Z961    Presence of intraocular lens
`;
