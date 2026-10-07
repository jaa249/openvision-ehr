# 简体中文（zh）术语表

> **机器起草的翻译，等待母语为中文的眼科/视光专业人员审校。** 在审校完成之前，`locales.ts` 中该语言保持
> `status: 'draft'`，语言菜单显示“（翻译草稿）”。
>
> Machine-drafted translation awaiting review by a native Chinese-speaking eye-care professional.

Target: Simplified Chinese, mainland clinical usage (textbook and hospital software terms). Chinese punctuation
（，。：；“”）inside Chinese sentences; a space between Chinese and Latin text or numbers where it reads naturally
(e.g. `眼压 OD`, `{count} 个文件`). Plurals: Chinese has only the `other` category, so every plural key is written
as `<base>_other` only.

Kept as is (D48 and the spec): OpenVision, OD/OS/OU, CPT/ICD codes, mmHg / mm / D, 20/20, logMAR, CF/HM/LP/NLP,
ADD, PLANO, Tono-Pen, Amsler, Hertel, Schirmer, MRD, APD, NPC, NPA, PAM, LI, AR/MR/CR (vision rows), OCT, RNFL,
FHIR/CSV/PDF/PNG/JPEG/HEIC, shorthand codes, keyboard keys.

Diagnosis search (D50): ICD-10-CM titles are English (a US code set). ICD-11 titles are WHO's: when the
practice has downloaded WHO's official file for this language (Settings › Code sets), the code finder
searches and shows WHO's titles in it, otherwise English; English words and codes always work. We never
translate an ICD title. So `plan.newDxPlaceholderIcd10/11` keep the official English titles exactly
("Preglaucoma, unspecified, bilateral H40.003", "Primary open-angle glaucoma, unspecified 9C61.0Z&XK9J")
and only the plan line is translated; `codes.finderPlaceholderIcd10/11` keep their English search words;
`codes.finderPlaceholderIcd11Lang` (shown when WHO's titles in this language are loaded) names the
language through `{language}` and gives only a code as the example. The finding examples in
`plan.srcFindingsEmpty` ("2+ NS", "dermatochalasis") stay in English because the findings parser reads
English.

## Glossary

| English | 中文 | Note |
|---|---|---|
| Exam | 检查 | |
| Visit / Encounter | 就诊 / 就诊记录 | One word for both in Chinese software |
| Patient | 患者 | |
| Provider | 医生 | Role name; "提供者" is unidiomatic |
| Technician / Tech | 技师 | |
| Admin | 管理员 | |
| Practice | 诊所 | |
| Chart | 病历 | |
| MRN | 病历号 | |
| DOB | 出生日期 | |
| Legal name / Preferred name | 法定姓名 / 常用名 | |
| Sign / Signed | 签名 / 已签名 | |
| Addendum / Addenda | 补充记录 | |
| Read-only | 只读 | |
| Take over | 接管 | |
| Audit log | 审计日志 | |
| Shorthand | 简码 | Short codes typed in the exam |
| Quick picks | 快捷选项 | |
| Prior visits | 既往就诊 | |
| Normal (button) | 正常 | |
| Clear (button) | 清除 | Button that empties fields, not "cornea clear" |
| Default | 默认 | |
| Comments | 备注 | |
| Finding(s) | 检查所见 | |
| HPI | 现病史 | |
| Chief complaint | 主诉 | |
| ROS | 系统回顾 | |
| HEENT | 头眼耳鼻喉 | |
| Past history | 既往史 | |
| POH | 眼病史 / 既往眼病史 | English abbreviation unknown to Chinese readers |
| POS | 眼手术史 / 既往眼部手术史 | |
| PMH | 既往病史 | |
| FH / Family history | 家族史 | |
| Social history | 社会史 | |
| NKDA / No known allergies | 无已知过敏 | |
| Chronic | 慢性 | |
| Vision / Visual acuity (VA) | 视力 | |
| sc / cc | 裸眼 / 戴镜 | Vision and cover-test rows |
| Pinhole (PH) | 小孔 | |
| Near | 近 / 近视力 | |
| Glare / Contrast | 眩光 / 对比度 | |
| Potential acuity meter | 潜在视力仪 | |
| Refraction | 验光 | Section name; 屈光 was the alternative |
| Manifest (dry) | 显然验光（小瞳） | |
| Cycloplegic (wet) | 睫状肌麻痹验光（散瞳） | |
| Autorefraction | 电脑验光 | |
| Balanced | 双眼平衡 | |
| Sphere / Cylinder / Axis | 球镜 / 柱镜 / 轴位 | |
| Plus / minus cylinder | 正柱镜 / 负柱镜 | |
| Transpose | 转换 | Plus/minus cylinder transposition |
| Prism / Base | 棱镜 / 底向 | |
| Prism diopters | 棱镜度 | |
| Slab-off | 削薄棱镜 | Reviewer: check (also 消像差棱镜/slab-off) |
| Vertex distance | 镜眼距 | |
| PD | 瞳距 | |
| Base curve / Diameter | 基弧 / 直径 | |
| Single vision / Bifocal / Trifocal / Progressive | 单光 / 双光 / 三光 / 渐进多焦点 | |
| Lens treatments | 镜片膜层/处理 | Coatings, tints |
| Spectacle Rx | 框架眼镜处方 | |
| Contact lens | 隐形眼镜 | Clinic usage; 角膜接触镜 is the formal term |
| Dispensed Rx | 配镜处方 / 配镜记录 | |
| IOP | 眼压 | |
| Target IOP | 目标眼压 | |
| Applanation | 压平眼压 | |
| Finger tension | 指测眼压 | |
| Dilation / Dilated | 散瞳 / 已散瞳 | |
| Pupils | 瞳孔 | |
| Reactivity | 对光反射 | |
| Confrontation fields | 对照法视野 | |
| Full to CF | 对指数完整 | CF = 指数 (counting fingers) |
| Superior/Inferior temporal/nasal | 颞上 / 颞下 / 鼻上 / 鼻下 | |
| External | 外眼 | |
| Anterior segment | 眼前节 | |
| Slit lamp | 裂隙灯 | |
| Fundus / Retina | 眼底 / 视网膜 | |
| Lid / Brow / Medial canthus | 睑 / 眉部 / 内眦 | |
| Adnexa | 眼附属器 | |
| Levator function | 提上睑肌功能 | |
| Vertical fissure | 睑裂高度 | |
| Conjunctiva / Cornea / Iris / Lens | 结膜 / 角膜 / 虹膜 / 晶状体 | |
| Anterior chamber | 前房 | |
| Gonioscopy | 前房角镜 | Flow-sheet marker shortened to 房角 |
| Pachymetry | 角膜厚度 | |
| Tear break-up time | 泪膜破裂时间 | |
| Disc / Cup-to-disc ratio | 视盘 / 杯盘比 | |
| Macula / Vessels / Vitreous / Periphery | 黄斑 / 血管 / 玻璃体 / 周边视网膜 | |
| Central macular thickness | 黄斑中心厚度 | |
| Hertel | Hertel 眼突度 | |
| Visual field (VF) | 视野 | |
| Neuro | 神经眼科 | Section name |
| Motility | 眼球运动 | |
| Cover test / Alternate cover test | 遮盖试验 / 交替遮盖试验 | |
| Ortho / Orthophoric | 正位 | |
| Primary position | 第一眼位 | |
| Stereopsis | 立体视 | |
| Near point of convergence | 集合近点 | NPC kept as label |
| Accommodation | 调节 | |
| Convergence / Divergence amplitudes | 集合幅度 / 散开幅度 | |
| Vertical fusional amplitudes | 垂直融像幅度 | |
| Color vision | 色觉 | |
| Red desaturation | 红色饱和度降低 | |
| Glaucoma flow sheet | 青光眼随访表 | |
| Impression / Plan | 诊断/计划 | "印象" is not used in Chinese charts |
| Impression item | 诊断条目 | |
| Orders | 医嘱 | |
| Return to clinic | 复诊 | |
| Diagnosis code / Code set | 诊断编码 / 编码体系 | |
| Visit code | 就诊编码 | |
| Modifier | 修饰符 | |
| Justifier | 诊断依据 | US billing concept; no Chinese equivalent |
| Diagnosis pointer | 诊断指针 | |
| Billable | 可计费 | |
| New / Established patient | 新患者 / 复诊患者 | |
| Intermediate / Comprehensive | 中级 / 全面 | |
| Medical decision-making | 医疗决策（复杂度） | |
| Tropicamide / Phenylephrine / Cyclopentolate / Atropine | 托吡卡胺 / 去氧肾上腺素 / 环喷托酯 / 阿托品 | |
| Proparacaine | 丙美卡因 | |
| Drawing | 绘图 | |

## Check these first (native reviewer)

1. **Section rail and short labels** (`catalog.section*`, `sections.vaRow*`, `sections.coverZone*Short`): 裸眼/戴镜/小孔/隐形
   for sc/cc/PH/CTL while AR/MR/CR stay as Latin codes — decide whether mixed is acceptable or all should be Chinese.
2. **US billing vocabulary** (`codes.*`): 诊断依据 (justifier), 修饰符 (modifier), 诊断指针 (pointer), 中级/全面,
   the 992xx levels (简单/低/中/高复杂度决策). These describe US CPT rules with no Chinese equivalent.
3. **History abbreviations**: POH/POS/PMH/FH rendered as 眼病史/眼手术史/既往病史/家族史 (also on the printed report,
   `report.history*`).
4. **Refraction terms**: 显然验光（小瞳）/睫状肌麻痹验光（散瞳）, 削薄棱镜 (slab-off), 镜片膜层/处理 (lens treatments).
5. **Neuro / cover test**: 双眼同向和异向运动充分 (D&V full), 定向力 ×3 (oriented ×3), 硬币试验 (Coins), 偏斜 (Deviation),
   头倾 (Tilt).
6. **HPI elements** (`sections.hpiEl*`): 时间特征、诱因/情境、加重/缓解因素 etc. follow the US eight HPI elements.
7. **Placeholders with clinical examples**: `plan.newDxPlaceholderIcd10/11` keep the official English CMS/WHO titles
   (D50: ICD titles are never translated by us; only the plan line is Chinese). `plan.srcFindingsEmpty` and
   `codes.finderPlaceholderIcd10/11` keep the English example words because the finding parser and the English
   search work on English text; with WHO's Chinese file loaded, `codes.finderPlaceholderIcd11Lang` is shown.
8. **Address hint** (`settings.addressHint`): example changed to a Chinese-style address.
9. **Contact lens**: 隐形眼镜 (everyday clinic term) vs the formal 角膜接触镜.
