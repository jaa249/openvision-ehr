# eye_mag shorthand reference (generated)

Grammar and behavior rules live in BEHAVIOR.md. This file lists the *vocabulary* extracted from `js/shorthand_eye.js`: codes that map to fields other than their own name, and the abbreviation expansions. Any field name in FIELDS.md is also a valid code on its own.

Known defects in the original (do not replicate): `LCN5` maps to `LCNVI` (should be `LCNV`); `LH` maps to `OLHERTEL` (should be `OSHERTEL`); `BC` is claimed by both conjunctiva and cup (cup branch unreachable); `BCNVII`/`CNVII`/`CN7` writes into the CN V fields `RCNV`/`LCNV` instead of `RCNVII`/`LCNVII` (shorthand_eye.js:543-551). Review every row against FIELDS.md during implementation.

## Field aliases (119)

| Code(s) typed | Writes to field(s) |
|---|---|
| `ALL` | `Allergy` |
| `ALLERGY` | `Allergy` |
| `MEDICATION` | `Medication` |
| `MEDICATIONS` | `Medication` |
| `MEDS` | `Medication` |
| `SURG` | `Surgery` |
| `SURGERY` | `Surgery` |
| `PSURG` | `Surgery` |
| `PSURGH` | `Surgery` |
| `CC` | `CC1` |
| `HPI` | `HPI1` |
| `RB / RBROW` | `RBROW` |
| `LB / LBROW` | `LBROW` |
| `RMC / RMCT` | `RMCT` |
| `LMC / LMCT` | `LMCT` |
| `RAD` | `RADNEXA` |
| `LAD` | `LADNEXA` |
| `RVF` | `RVFISSURE` |
| `LVF` | `LVFISSURE` |
| `RCAR` | `RCAROTID` |
| `LCAR` | `LCAROTID` |
| `RTA` | `RTEMPART` |
| `LTA` | `LTEMPART` |
| `RCN5` | `RCNV` |
| `LCN5` | `LCNVI` |
| `RCN7` | `RCNVII` |
| `LCN7` | `LCNVII` |
| `RH` | `ODHERTEL` |
| `LH` | `OLHERTEL` |
| `BHERT` | `HERTELBASE` |
| `EXTCOM` | `EXT_COMMENTS` |
| `ECOM` | `EXT_COMMENTS` |
| `RC` | `ODCONJ` |
| `LC` | `OSCONJ` |
| `RK` | `ODCORNEA` |
| `LK` | `OSCORNEA` |
| `RAC` | `ODAC` |
| `LAC` | `OSAC` |
| `RL` | `ODLENS` |
| `LL` | `OSLENS` |
| `RI` | `ODIRIS` |
| `LI` | `OSIRIS` |
| `RG` | `ODGONIO` |
| `LG` | `OSGONIO` |
| `RPACH` | `ODKTHICKNESS` |
| `LPACH` | `OSKTHICKNESS` |
| `RSCH1` | `ODSCHIRMER1` |
| `LSCH1` | `OSSCHIRMER1` |
| `RSCH2` | `ODSCHIRMER2` |
| `LSCH2` | `OSSCHIRMER2` |
| `RTBUT` | `ODTBUT` |
| `LTBUT` | `OSTBUT` |
| `ASCOM` | `ANTSEG_COMMENTS` |
| `ACOM` | `ANTSEG_COMMENTS` |
| `RD / RDISC` | `ODDISC` |
| `LD / LDISC` | `OSDISC` |
| `RCUP` | `ODCUP` |
| `LCUP` | `OSCUP` |
| `RMAC / RMACULA` | `ODMACULA` |
| `LMAC / LMACULA` | `OSMACULA` |
| `RV` | `ODVESSELS` |
| `LV` | `OSVESSELS` |
| `RVIT` | `ODVITREOUS` |
| `LVIT` | `OSVITREOUS` |
| `RP` | `ODPERIPH` |
| `LP` | `OSPERIPH` |
| `RCMT` | `ODCMT` |
| `LCMT` | `OSCMT` |
| `RCOM` | `RETINA_COMMENTS` |
| `RCOL / RCOLOR` | `ODCOLOR` |
| `LCOL / LCOLOR` | `OSCOLOR` |
| `RCOIN / RCOINS` | `ODCOINS` |
| `LCOIN / LCOINS` | `OSCOINS` |
| `RRED` | `ODREDDESAT` |
| `LRED` | `OSREDDESAT` |
| `RNPC` | `ODNPC` |
| `LNPC` | `OSNPC` |
| `RNPA` | `ODNPA` |
| `LNPA` | `OSNPA` |
| `STEREO` | `STEREOPSIS` |
| `VERTFUS` | `VERTFUSAMPS` |
| `CAD` | `CACCDIST` |
| `CAN` | `CACCNEAR` |
| `DAD` | `DACCDIST` |
| `DAN` | `DACCNEAR` |
| `NCOM` | `NEURO_COMMENTS` |
| `IMPPLAN` | `IMP` |
| `HERT` | `ODHERTEL`, `OSHERTEL`, `HERTELBASE` |
| `BLF / LF` | `RLF`, `LLF` |
| `BMRD / MRD` | `RMRD`, `LMRD` |
| `BVF` | `RVFISSURE`, `LVFISSURE` |
| `BCAR / CAR` | `RCAROTID`, `LCAROTID` |
| `BTA / TA` | `RTEMPART`, `LTEMPART` |
| `BCNV / BCN5 / CNV / CN5` | `RCNV`, `LCNV` |
| `BCNVII / CNVII / CN7` | `RCNV`, `LCNV`, `LCNVII` |
| `BLL / LL` | `RLL`, `LLL` |
| `4XL / Lx4` | `RLL`, `RUL`, `LUL`, `LLL` |
| `BUL / UL` | `RUL`, `LUL` |
| `BAD` | `RAD`, `LAD` |
| `FH / BB` | `RBROW`, `LBROW` |
| `BC / C` | `ODCONJ`, `OSCONJ` |
| `BK / K` | `ODCORNEA`, `OSCORNEA` |
| `BAC / AC` | `ODAC`, `OSAC` |
| `BL / L` | `ODLENS`, `OSLENS` |
| `BI / I` | `ODIRIS`, `OSIRIS` |
| `BPACH / PACH` | `ODKTHICKNESS`, `OSKTHICKNESS` |
| `BG / G / GONIO` | `ODGONIO`, `OSGONIO` |
| `BTBUT / TBUT` | `ODTBUT`, `OSTBUT` |
| `BD / BDISC / BDISCS` | `ODDISC`, `OSDISC` |
| `BC / C / BCUP / BCUPS` | `ODCUP`, `OSCUP` |
| `BMAC / MAC / BM` | `ODMACULA`, `OSMACULA` |
| `BV / V` | `ODVESSELS`, `OSVESSELS` |
| `BVIT / VIT` | `ODVITREOUS`, `OSVITREOUS` |
| `BP / P` | `ODPERIPH`, `OSPERIPH` |
| `BCMT / CMT` | `ODCMT`, `OSCMT` |
| `SCDIST` | `NEURO_ACT_zone` |
| `CCDIST` | `NEURO_ACT_zone` |
| `SCNEAR` | `NEURO_ACT_zone` |
| `CCNEAR` | `NEURO_ACT_zone` |

## Abbreviation expansion (61)

Applied to entered text. `i` flag = case-insensitive.

| Typed | Becomes | Flags |
|---|---|---|
| `inf` | inferior |  |
| `sup` | superior |  |
| `nas ` | nasal |  |
| `temp ` | temporal |  |
| `med` | medial |  |
| `lat` | lateral |  |
| `dermato` | dermatochalasis |  |
| `w/ ` | with  |  |
| `lac ` | laceration |  |
| `lacr` | lacrimal |  |
| `dcr` | DCR | i |
| `bcc` | BCC | i |
| `scc` | SCC | i |
| `sebc` | sebaceous cell carcinoma | i |
| `fh` | forehead | i |
| `glab` | glabellar | i |
| `cic` | cicatricial | i |
| `entrop` | entropion | i |
| `ectrop` | ectropion | i |
| `ect` | ectropion |  |
| `ent` | entropion | i |
| `tr` | trace | i |
| `gut` | guttata |  |
| `tr` | trace | i |
| `pter` | pterygium |  |
| `pig` | pigmented |  |
| `inj` | injection | i |
| `fc` | flare/cell | i |
| `ks` | kruckenberg spindle | i |
| `sebc` | sebaceous cell carcinoma | i |
| `spk` | SPK | i |
| `pek` | PEK | i |
| `str` | stromal | i |
| `endo?` | endothelial | i |
| `rec` | recession | i |
| `1 o` | 1 o'clock | i |
| `2 o` | 2 o'clock | i |
| `3 o` | 3 o'clock | i |
| `4 o` | 4 o'clock | i |
| `5 o` | 5 o'clock | i |
| `6 o` | 6 o'clock | i |
| `7 o` | 7 o'clock | i |
| `8 o` | 8 o'clock | i |
| `9 o` | 9 o'clock | i |
| `10 o` | 10 o'clock | i |
| `11 o` | 11 o'clock | i |
| `12 o` | 12 o'clock | i |
| `limb` | limbus | i |
| `tl` | tear lake | i |
| `csme` | CSME | i |
| `bdr()` | BDR | i |
| `ppdr` | PPDR |  |
| `ht` | horseshoe tear | i |
| `ab` | air bubble | i |
| `c3f8` | C3F8 | i |
| `ma` | macroaneurysm | i |
| `mias` | microaneurysm | i |
| `ped` | PED | i |
| `mac` | macula | i |
| `fov` | fovea | i |
| `vh` | vitreous hemorrhage | i |
