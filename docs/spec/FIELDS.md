# eye_mag field reference (generated)

Every data field in OpenEMR eye_mag's tables, extracted from `sql/database.sql`. Field names double as shorthand targets (typing `RUL:ptosis;` writes column `RUL`). The *Eye* column is a naming-convention guess (R*/OD* = right, L*/OS* = left); verify per field.

## `form_eye_mag_dispense` (55 columns)

| Column | Type | Default | Eye (guess) | Comment |
|---|---|---|---|---|
| `id` | bigint(20) |  |  |  |
| `date` | TIMESTAMP | CURRENT_TIMESTAMP |  |  |
| `encounter` | bigint(20) |  |  |  |
| `pid` | bigint(20) | NULL |  |  |
| `user` | varchar(255) | NULL |  |  |
| `groupname` | varchar(255) | NULL |  |  |
| `authorized` | tinyint(4) | NULL |  |  |
| `activity` | tinyint(4) | NULL |  |  |
| `REFDATE` | DATETIME | NULL | OD |  |
| `REFTYPE` | varchar(10) | NULL | OD |  |
| `RXTYPE` | varchar(20) | NULL | OD |  |
| `ODSPH` | varchar(10) | NULL | OD |  |
| `ODCYL` | varchar(10) | NULL | OD |  |
| `ODAXIS` | varchar(10) | NULL | OD |  |
| `OSSPH` | varchar(10) | NULL | OS |  |
| `OSCYL` | varchar(10) | NULL | OS |  |
| `OSAXIS` | varchar(10) | NULL | OS |  |
| `ODMIDADD` | varchar(10) | NULL | OD |  |
| `OSMIDADD` | varchar(10) | NULL | OS |  |
| `ODADD` | varchar(10) | NULL | OD |  |
| `OSADD` | varchar(10) | NULL | OS |  |
| `ODHPD` | varchar(20) | NULL | OD |  |
| `ODHBASE` | varchar(20) | NULL | OD |  |
| `ODVPD` | varchar(20) | NULL | OD |  |
| `ODVBASE` | varchar(20) | NULL | OD |  |
| `ODSLABOFF` | varchar(20) | NULL | OD |  |
| `ODVERTEXDIST` | varchar(20) | NULL | OD |  |
| `OSHPD` | varchar(20) | NULL | OS |  |
| `OSHBASE` | varchar(20) | NULL | OS |  |
| `OSVPD` | varchar(20) | NULL | OS |  |
| `OSVBASE` | varchar(20) | NULL | OS |  |
| `OSSLABOFF` | varchar(20) | NULL | OS |  |
| `OSVERTEXDIST` | varchar(20) | NULL | OS |  |
| `ODMPDD` | varchar(20) | NULL | OD |  |
| `ODMPDN` | varchar(20) | NULL | OD |  |
| `OSMPDD` | varchar(20) | NULL | OS |  |
| `OSMPDN` | varchar(20) | NULL | OS |  |
| `BPDD` | varchar(20) | NULL |  |  |
| `BPDN` | varchar(20) | NULL |  |  |
| `LENS_MATERIAL` | varchar(20) | NULL | OS |  |
| `LENS_TREATMENTS` | varchar(100) | NULL | OS |  |
| `CTLMANUFACTUREROD` | varchar(25) | NULL |  |  |
| `CTLMANUFACTUREROS` | varchar(25) | NULL |  |  |
| `CTLSUPPLIEROD` | varchar(25) | NULL |  |  |
| `CTLSUPPLIEROS` | varchar(25) | NULL |  |  |
| `CTLBRANDOD` | varchar(50) | NULL |  |  |
| `CTLBRANDOS` | varchar(50) | NULL |  |  |
| `CTLODQUANTITY` | varchar(255) | NULL |  |  |
| `CTLOSQUANTITY` | varchar(255) | NULL |  |  |
| `ODDIAM` | varchar(50) | NULL | OD |  |
| `ODBC` | varchar(50) | NULL | OD |  |
| `OSDIAM` | varchar(50) | NULL | OS |  |
| `OSBC` | varchar(50) | NULL | OS |  |
| `RXCOMMENTS` | text |  | OD |  |
| `COMMENTS` | text |  |  |  |

Keys: `PRIMARY KEY (`id`)`; `UNIQUE KEY `pid` (`pid`,`encounter`,`id`)`

## `form_eye_mag_prefs` (12 columns)

| Column | Type | Default | Eye (guess) | Comment |
|---|---|---|---|---|
| `PEZONE` | varchar(25) | NULL |  |  |
| `LOCATION` | varchar(25) | NULL | OS |  |
| `LOCATION_text` | varchar(25) |  | OS |  |
| `id` | bigint(20) | NULL |  |  |
| `selection` | varchar(255) | NULL |  |  |
| `ZONE_ORDER` | int(11) | NULL |  |  |
| `GOVALUE` | varchar(10) | '0' |  |  |
| `ordering` | smallint(6) | NULL |  |  |
| `FILL_ACTION` | varchar(10) | 'ADD' |  |  |
| `GORIGHT` | varchar(50) |  |  |  |
| `GOLEFT` | varchar(50) |  |  |  |
| `UNSPEC` | varchar(50) |  |  |  |

Keys: `UNIQUE KEY `id` (`id`,`PEZONE`,`LOCATION`,`selection`)`

## `form_eye_mag_orders` (10 columns)

| Column | Type | Default | Eye (guess) | Comment |
|---|---|---|---|---|
| `id` | bigint(20) |  |  |  |
| `form_id` | int(20) |  |  |  |
| `pid` | bigint(20) |  |  |  |
| `ORDER_DETAILS` | varchar(255) |  |  |  |
| `ORDER_STATUS` | varchar(50) | NULL |  |  |
| `ORDER_PRIORITY` | varchar(50) | NULL |  |  |
| `ORDER_DATE_PLACED` | date |  |  |  |
| `ORDER_PLACED_BYWHOM` | varchar(50) | NULL |  |  |
| `ORDER_DATE_COMPLETED` | date | NULL |  |  |
| `ORDER_COMPLETED_BYWHOM` | varchar(50) | NULL |  |  |

Keys: `PRIMARY KEY (`id`)`; `UNIQUE KEY `VISIT_ID` (`pid`,`ORDER_DETAILS`,`ORDER_DATE_PLACED`)`

## `form_eye_mag_impplan` (11 columns)

| Column | Type | Default | Eye (guess) | Comment |
|---|---|---|---|---|
| `id` | int(11) |  |  |  |
| `form_id` | bigint(20) |  |  |  |
| `pid` | bigint(20) |  |  |  |
| `title` | varchar(255) |  |  |  |
| `code` | varchar(50) | NULL |  |  |
| `codetype` | varchar(50) | NULL |  |  |
| `codedesc` | varchar(255) | NULL |  |  |
| `codetext` | varchar(255) | NULL |  |  |
| `plan` | varchar(3000) | NULL |  |  |
| `PMSFH_link` | varchar(50) | NULL |  |  |
| `IMPPLAN_order` | tinyint(4) | NULL |  |  |

Keys: `PRIMARY KEY (`id`)`; `UNIQUE KEY `second_index` (`form_id`,`pid`,`title`,`plan`(20))`

## `form_eye_mag_wearing` (41 columns)

| Column | Type | Default | Eye (guess) | Comment |
|---|---|---|---|---|
| `id` | int(11) |  |  |  |
| `ENCOUNTER` | int(11) |  |  |  |
| `FORM_ID` | smallint(6) |  |  |  |
| `PID` | bigint(20) |  |  |  |
| `RX_NUMBER` | int(11) |  | OD |  |
| `ODSPH` | varchar(10) | NULL | OD |  |
| `ODCYL` | varchar(10) | NULL | OD |  |
| `ODAXIS` | varchar(10) | NULL | OD |  |
| `OSSPH` | varchar(10) | NULL | OS |  |
| `OSCYL` | varchar(10) | NULL | OS |  |
| `OSAXIS` | varchar(10) | NULL | OS |  |
| `ODMIDADD` | varchar(10) | NULL | OD |  |
| `OSMIDADD` | varchar(10) | NULL | OS |  |
| `ODADD` | varchar(10) | NULL | OD |  |
| `OSADD` | varchar(10) | NULL | OS |  |
| `ODVA` | varchar(10) | NULL | OD |  |
| `OSVA` | varchar(10) | NULL | OS |  |
| `ODNEARVA` | varchar(10) | NULL | OD |  |
| `OSNEARVA` | varchar(10) | NULL | OS |  |
| `ODHPD` | varchar(20) | NULL | OD |  |
| `ODHBASE` | varchar(20) | NULL | OD |  |
| `ODVPD` | varchar(20) | NULL | OD |  |
| `ODVBASE` | varchar(20) | NULL | OD |  |
| `ODSLABOFF` | varchar(20) | NULL | OD |  |
| `ODVERTEXDIST` | varchar(20) | NULL | OD |  |
| `OSHPD` | varchar(20) | NULL | OS |  |
| `OSHBASE` | varchar(20) | NULL | OS |  |
| `OSVPD` | varchar(20) | NULL | OS |  |
| `OSVBASE` | varchar(20) | NULL | OS |  |
| `OSSLABOFF` | varchar(20) | NULL | OS |  |
| `OSVERTEXDIST` | varchar(20) | NULL | OS |  |
| `ODMPDD` | varchar(20) | NULL | OD |  |
| `ODMPDN` | varchar(20) | NULL | OD |  |
| `OSMPDD` | varchar(20) | NULL | OS |  |
| `OSMPDN` | varchar(20) | NULL | OS |  |
| `BPDD` | varchar(20) | NULL |  |  |
| `BPDN` | varchar(20) | NULL |  |  |
| `LENS_MATERIAL` | varchar(20) | NULL | OS |  |
| `LENS_TREATMENTS` | varchar(100) | NULL | OS |  |
| `RX_TYPE` | varchar(25) | NULL | OD |  |
| `COMMENTS` | text |  |  |  |

Keys: `UNIQUE KEY `id` (`id`)`; `UNIQUE KEY `FORM_ID` (`FORM_ID`,`ENCOUNTER`,`PID`,`RX_NUMBER`)`

## `form_eye_base` (7 columns)

| Column | Type | Default | Eye (guess) | Comment |
|---|---|---|---|---|
| `id` | bigint(20) |  |  | Links to forms.form_id |
| `date` | datetime | NULL |  |  |
| `pid` | bigint(20) | NULL |  |  |
| `user` | varchar(255) | NULL |  |  |
| `groupname` | varchar(255) | NULL |  |  |
| `authorized` | tinyint(4) | NULL |  |  |
| `activity` | tinyint(4) | NULL |  |  |

Keys: `PRIMARY KEY `form_link` (`id`)`

## `form_eye_hpi` (35 columns)

| Column | Type | Default | Eye (guess) | Comment |
|---|---|---|---|---|
| `id` | bigint(20) |  |  | Links to forms.form_id |
| `pid` | bigint(20) | NULL |  |  |
| `CC1` | varchar(255) | NULL |  |  |
| `HPI1` | text |  |  |  |
| `QUALITY1` | varchar(255) | NULL |  |  |
| `TIMING1` | varchar(255) | NULL |  |  |
| `DURATION1` | varchar(255) | NULL |  |  |
| `CONTEXT1` | varchar(255) | NULL |  |  |
| `SEVERITY1` | varchar(255) | NULL |  |  |
| `MODIFY1` | varchar(255) | NULL |  |  |
| `ASSOCIATED1` | varchar(255) | NULL |  |  |
| `LOCATION1` | varchar(255) | NULL | OS |  |
| `CHRONIC1` | varchar(255) | NULL |  |  |
| `CHRONIC2` | varchar(255) | NULL |  |  |
| `CHRONIC3` | varchar(255) | NULL |  |  |
| `CC2` | text |  |  |  |
| `HPI2` | text |  |  |  |
| `QUALITY2` | text |  |  |  |
| `TIMING2` | text |  |  |  |
| `DURATION2` | text |  |  |  |
| `CONTEXT2` | text |  |  |  |
| `SEVERITY2` | text |  |  |  |
| `MODIFY2` | text |  |  |  |
| `ASSOCIATED2` | text |  |  |  |
| `LOCATION2` | text |  | OS |  |
| `CC3` | text |  |  |  |
| `HPI3` | text |  |  |  |
| `QUALITY3` | text |  |  |  |
| `TIMING3` | text |  |  |  |
| `DURATION3` | text |  |  |  |
| `CONTEXT3` | text |  |  |  |
| `SEVERITY3` | text |  |  |  |
| `MODIFY3` | text |  |  |  |
| `ASSOCIATED3` | text |  |  |  |
| `LOCATION3` | text |  | OS |  |

Keys: `PRIMARY KEY `hpi_link` (`id`)`; `UNIQUE KEY `id_pid` (`id`,`pid`)`

## `form_eye_ros` (15 columns)

| Column | Type | Default | Eye (guess) | Comment |
|---|---|---|---|---|
| `id` | bigint(20) |  |  | Links to forms.form_id |
| `pid` | bigint(20) | NULL |  |  |
| `ROSGENERAL` | text |  | OD |  |
| `ROSHEENT` | text |  | OD |  |
| `ROSCV` | text |  | OD |  |
| `ROSPULM` | text |  | OD |  |
| `ROSGI` | text |  | OD |  |
| `ROSGU` | text |  | OD |  |
| `ROSDERM` | text |  | OD |  |
| `ROSNEURO` | text |  | OD |  |
| `ROSPSYCH` | text |  | OD |  |
| `ROSMUSCULO` | text |  | OD |  |
| `ROSIMMUNO` | text |  | OD |  |
| `ROSENDOCRINE` | text |  | OD |  |
| `ROSCOMMENTS` | text |  | OD |  |

Keys: `PRIMARY KEY `ros_link` (`id`)`; `UNIQUE KEY `id_pid` (`id`,`pid`)`

## `form_eye_vitals` (27 columns)

| Column | Type | Default | Eye (guess) | Comment |
|---|---|---|---|---|
| `id` | bigint(20) |  |  | Links to forms.form_id |
| `pid` | bigint(20) | NULL |  |  |
| `alert` | char(3) | 'yes' |  |  |
| `oriented` | char(3) | 'TPP' |  |  |
| `confused` | char(3) | 'nml' |  |  |
| `ODIOPAP` | varchar(10) | NULL | OD |  |
| `OSIOPAP` | varchar(10) | NULL | OS |  |
| `ODIOPTPN` | varchar(10) | NULL | OD |  |
| `OSIOPTPN` | varchar(10) | NULL | OS |  |
| `ODIOPFTN` | varchar(10) | NULL | OD |  |
| `OSIOPFTN` | varchar(10) | NULL | OS |  |
| `IOPTIME` | time |  |  |  |
| `ODIOPPOST` | varchar(10) |  | OD |  |
| `OSIOPPOST` | varchar(10) |  | OS |  |
| `IOPPOSTTIME` | time | NULL |  |  |
| `ODIOPTARGET` | varchar(10) |  | OD |  |
| `OSIOPTARGET` | varchar(10) |  | OS |  |
| `AMSLEROD` | smallint(1) | NULL |  |  |
| `AMSLEROS` | smallint(1) | NULL |  |  |
| `ODVF1` | tinyint(1) | NULL | OD |  |
| `ODVF2` | tinyint(1) | NULL | OD |  |
| `ODVF3` | tinyint(1) | NULL | OD |  |
| `ODVF4` | tinyint(1) | NULL | OD |  |
| `OSVF1` | tinyint(1) | NULL | OS |  |
| `OSVF2` | tinyint(1) | NULL | OS |  |
| `OSVF3` | tinyint(1) | NULL | OS |  |
| `OSVF4` | tinyint(1) | NULL | OS |  |

Keys: `PRIMARY KEY `vitals_link` (`id`)`; `UNIQUE KEY `id_pid` (`id`,`pid`)`

## `form_eye_acuity` (30 columns)

| Column | Type | Default | Eye (guess) | Comment |
|---|---|---|---|---|
| `id` | bigint(20) |  |  | Links to forms.form_id |
| `pid` | bigint(20) | NULL |  |  |
| `SCODVA` | varchar(25) | NULL |  |  |
| `SCOSVA` | varchar(25) | NULL |  |  |
| `PHODVA` | varchar(25) | NULL |  |  |
| `PHOSVA` | varchar(25) | NULL |  |  |
| `CTLODVA` | varchar(25) | NULL |  |  |
| `CTLOSVA` | varchar(25) | NULL |  |  |
| `MRODVA` | varchar(25) | NULL |  |  |
| `MROSVA` | varchar(25) | NULL |  |  |
| `SCNEARODVA` | varchar(25) | NULL |  |  |
| `SCNEAROSVA` | varchar(25) | NULL |  |  |
| `MRNEARODVA` | varchar(25) | NULL |  |  |
| `MRNEAROSVA` | varchar(25) | NULL |  |  |
| `GLAREODVA` | varchar(25) | NULL |  |  |
| `GLAREOSVA` | varchar(25) | NULL |  |  |
| `GLARECOMMENTS` | varchar(255) | NULL |  |  |
| `ARODVA` | varchar(25) | NULL |  |  |
| `AROSVA` | varchar(25) | NULL |  |  |
| `CRODVA` | varchar(25) | NULL |  |  |
| `CROSVA` | varchar(25) | NULL |  |  |
| `CTLODVA1` | varchar(25) | NULL |  |  |
| `CTLOSVA1` | varchar(25) | NULL |  |  |
| `PAMODVA` | varchar(25) | NULL |  |  |
| `PAMOSVA` | varchar(25) | NULL |  |  |
| `LIODVA` | varchar(25) |  | OS |  |
| `LIOSVA` | varchar(25) |  | OS |  |
| `WODVANEAR` | varchar(25) | NULL |  |  |
| `OSVANEARCC` | varchar(25) | NULL | OS |  |
| `BINOCVA` | varchar(25) | NULL |  |  |

Keys: `PRIMARY KEY `acuity_link` (`id`)`; `UNIQUE KEY `id_pid` (`id`,`pid`)`

## `form_eye_refraction` (65 columns)

| Column | Type | Default | Eye (guess) | Comment |
|---|---|---|---|---|
| `id` | bigint(20) |  |  | Links to forms.form_id |
| `pid` | bigint(20) | NULL |  |  |
| `MRODSPH` | varchar(25) | NULL |  |  |
| `MRODCYL` | varchar(25) | NULL |  |  |
| `MRODAXIS` | varchar(25) | NULL |  |  |
| `MRODPRISM` | varchar(25) | NULL |  |  |
| `MRODBASE` | varchar(25) | NULL |  |  |
| `MRODADD` | varchar(25) | NULL |  |  |
| `MROSSPH` | varchar(25) | NULL |  |  |
| `MROSCYL` | varchar(25) | NULL |  |  |
| `MROSAXIS` | varchar(25) | NULL |  |  |
| `MROSPRISM` | varchar(50) | NULL |  |  |
| `MROSBASE` | varchar(50) | NULL |  |  |
| `MROSADD` | varchar(25) | NULL |  |  |
| `MRODNEARSPHERE` | varchar(25) | NULL |  |  |
| `MRODNEARCYL` | varchar(25) | NULL |  |  |
| `MRODNEARAXIS` | varchar(25) | NULL |  |  |
| `MRODPRISMNEAR` | varchar(50) | NULL |  |  |
| `MRODBASENEAR` | varchar(25) | NULL |  |  |
| `MROSNEARSHPERE` | varchar(25) | NULL |  |  |
| `MROSNEARCYL` | varchar(25) | NULL |  |  |
| `MROSNEARAXIS` | varchar(125) | NULL |  |  |
| `MROSPRISMNEAR` | varchar(50) | NULL |  |  |
| `MROSBASENEAR` | varchar(25) | NULL |  |  |
| `CRODSPH` | varchar(25) | NULL |  |  |
| `CRODCYL` | varchar(25) | NULL |  |  |
| `CRODAXIS` | varchar(25) | NULL |  |  |
| `CROSSPH` | varchar(25) | NULL |  |  |
| `CROSCYL` | varchar(25) | NULL |  |  |
| `CROSAXIS` | varchar(25) | NULL |  |  |
| `CRCOMMENTS` | varchar(255) | NULL |  |  |
| `BALANCED` | char(2) |  |  |  |
| `ARODSPH` | varchar(25) | NULL |  |  |
| `ARODCYL` | varchar(25) | NULL |  |  |
| `ARODAXIS` | varchar(25) | NULL |  |  |
| `AROSSPH` | varchar(25) | NULL |  |  |
| `AROSCYL` | varchar(25) | NULL |  |  |
| `AROSAXIS` | varchar(25) | NULL |  |  |
| `ARODADD` | varchar(25) | NULL |  |  |
| `AROSADD` | varchar(25) | NULL |  |  |
| `ARNEARODVA` | varchar(25) | NULL |  |  |
| `ARNEAROSVA` | varchar(25) | NULL |  |  |
| `ARODPRISM` | varchar(50) | NULL |  |  |
| `AROSPRISM` | varchar(50) | NULL |  |  |
| `CTLODSPH` | varchar(25) | NULL |  |  |
| `CTLODCYL` | varchar(25) | NULL |  |  |
| `CTLODAXIS` | varchar(25) | NULL |  |  |
| `CTLODBC` | varchar(25) | NULL |  |  |
| `CTLODDIAM` | varchar(25) | NULL |  |  |
| `CTLOSSPH` | varchar(25) | NULL |  |  |
| `CTLOSCYL` | varchar(25) | NULL |  |  |
| `CTLOSAXIS` | varchar(25) | NULL |  |  |
| `CTLOSBC` | varchar(25) | NULL |  |  |
| `CTLOSDIAM` | varchar(25) | NULL |  |  |
| `CTL_COMMENTS` | text |  |  |  |
| `CTLMANUFACTUREROD` | varchar(50) | NULL |  |  |
| `CTLSUPPLIEROD` | varchar(50) | NULL |  |  |
| `CTLBRANDOD` | varchar(50) | NULL |  |  |
| `CTLMANUFACTUREROS` | varchar(50) | NULL |  |  |
| `CTLSUPPLIEROS` | varchar(50) | NULL |  |  |
| `CTLBRANDOS` | varchar(50) | NULL |  |  |
| `CTLODADD` | varchar(25) | NULL |  |  |
| `CTLOSADD` | varchar(25) | NULL |  |  |
| `NVOCHECKED` | varchar(25) | NULL |  |  |
| `ADDCHECKED` | varchar(25) | NULL |  |  |

Keys: `PRIMARY KEY `refraction_link` (`id`)`; `UNIQUE KEY `id_pid` (`id`,`pid`)`

## `form_eye_biometrics` (18 columns)

| Column | Type | Default | Eye (guess) | Comment |
|---|---|---|---|---|
| `id` | bigint |  |  | Links to forms.form_id |
| `pid` | bigint(20) | NULL |  |  |
| `ODK1` | varchar | NULL | OD |  |
| `ODK2` | varchar | NULL | OD |  |
| `ODK2AXIS` | varchar | NULL | OD |  |
| `OSK1` | varchar | NULL | OS |  |
| `OSK2` | varchar | NULL | OS |  |
| `OSK2AXIS` | varchar | NULL | OS |  |
| `ODAXIALLENGTH` | varchar | NULL | OD |  |
| `OSAXIALLENGTH` | varchar | NULL | OS |  |
| `ODPDMeasured` | varchar | NULL | OD |  |
| `OSPDMeasured` | varchar | NULL | OS |  |
| `ODACD` | varchar | NULL | OD |  |
| `OSACD` | varchar | NULL | OS |  |
| `ODW2W` | varchar | NULL | OD |  |
| `OSW2W` | varchar | NULL | OS |  |
| `ODLT` | varchar | NULL | OD |  |
| `OSLT` | varchar | NULL | OS |  |

Keys: `PRIMARY KEY `biometrics_link` (`id`)`; `UNIQUE KEY `id_pid` (`id`,`pid`)`

## `form_eye_external` (30 columns)

| Column | Type | Default | Eye (guess) | Comment |
|---|---|---|---|---|
| `id` | bigint(20) |  |  | Links to forms.form_id |
| `pid` | bigint(20) | NULL |  |  |
| `RUL` | text |  | OD |  |
| `LUL` | text |  | OS |  |
| `RLL` | text |  | OD |  |
| `LLL` | text |  | OS |  |
| `RBROW` | text |  | OD |  |
| `LBROW` | text |  | OS |  |
| `RMCT` | text |  | OD |  |
| `LMCT` | text |  | OS |  |
| `RADNEXA` | text |  | OD |  |
| `LADNEXA` | text |  | OS |  |
| `RMRD` | varchar(25) | NULL | OD |  |
| `LMRD` | varchar(25) | NULL | OS |  |
| `RLF` | varchar(25) | NULL | OD |  |
| `LLF` | varchar(25) | NULL | OS |  |
| `RVFISSURE` | varchar(25) | NULL | OD |  |
| `LVFISSURE` | varchar(25) | NULL | OS |  |
| `ODHERTEL` | varchar(25) | NULL | OD |  |
| `OSHERTEL` | varchar(25) | NULL | OS |  |
| `HERTELBASE` | varchar(25) | NULL |  |  |
| `RCAROTID` | text |  | OD |  |
| `LCAROTID` | text |  | OS |  |
| `RTEMPART` | text |  | OD |  |
| `LTEMPART` | text |  | OS |  |
| `RCNV` | text |  | OD |  |
| `LCNV` | text |  | OS |  |
| `RCNVII` | text |  | OD |  |
| `LCNVII` | text |  | OS |  |
| `EXT_COMMENTS` | text |  |  |  |

Keys: `PRIMARY KEY `external_link` (`id`)`; `UNIQUE KEY `id_pid` (`id`,`pid`)`

## `form_eye_antseg` (39 columns)

| Column | Type | Default | Eye (guess) | Comment |
|---|---|---|---|---|
| `id` | bigint(20) |  |  | Links to forms.form_id |
| `pid` | bigint(20) | NULL |  |  |
| `ODSCHIRMER1` | varchar(25) | NULL | OD |  |
| `OSSCHIRMER1` | varchar(25) | NULL | OS |  |
| `ODSCHIRMER2` | varchar(25) | NULL | OD |  |
| `OSSCHIRMER2` | varchar(25) | NULL | OS |  |
| `ODTBUT` | varchar(25) | NULL | OD |  |
| `OSTBUT` | varchar(25) | NULL | OS |  |
| `OSCONJ` | varchar(25) | NULL | OS |  |
| `ODCONJ` | text |  | OD |  |
| `ODCORNEA` | text |  | OD |  |
| `OSCORNEA` | text |  | OS |  |
| `ODAC` | text |  | OD |  |
| `OSAC` | text |  | OS |  |
| `ODLENS` | text |  | OD |  |
| `OSLENS` | text |  | OS |  |
| `ODIRIS` | text |  | OD |  |
| `OSIRIS` | text |  | OS |  |
| `PUPIL_NORMAL` | varchar(2) | '1' |  |  |
| `ODPUPILSIZE1` | varchar(25) | NULL | OD |  |
| `ODPUPILSIZE2` | varchar(25) | NULL | OD |  |
| `ODPUPILREACTIVITY` | char(25) | NULL | OD |  |
| `ODAPD` | varchar(25) | NULL | OD |  |
| `OSPUPILSIZE1` | varchar(25) | NULL | OS |  |
| `OSPUPILSIZE2` | varchar(25) | NULL | OS |  |
| `OSPUPILREACTIVITY` | char(25) | NULL | OS |  |
| `OSAPD` | varchar(25) | NULL | OS |  |
| `DIMODPUPILSIZE1` | varchar(25) | NULL |  |  |
| `DIMODPUPILSIZE2` | varchar(25) | NULL |  |  |
| `DIMODPUPILREACTIVITY` | varchar(25) | NULL |  |  |
| `DIMOSPUPILSIZE1` | varchar(25) | NULL |  |  |
| `DIMOSPUPILSIZE2` | varchar(25) | NULL |  |  |
| `DIMOSPUPILREACTIVITY` | varchar(25) | NULL |  |  |
| `PUPIL_COMMENTS` | text |  |  |  |
| `ODKTHICKNESS` | varchar(25) | NULL | OD |  |
| `OSKTHICKNESS` | varchar(25) | NULL | OS |  |
| `ODGONIO` | varchar(25) | NULL | OD |  |
| `OSGONIO` | varchar(25) | NULL | OS |  |
| `ANTSEG_COMMENTS` | text |  |  |  |

Keys: `PRIMARY KEY `antseg_link` (`id`)`; `UNIQUE KEY `id_pid` (`id`,`pid`)`

## `form_eye_postseg` (25 columns)

| Column | Type | Default | Eye (guess) | Comment |
|---|---|---|---|---|
| `id` | bigint(20) |  |  | Links to forms.form_id |
| `pid` | bigint(20) | NULL |  |  |
| `ODDISC` | text |  | OD |  |
| `OSDISC` | text |  | OS |  |
| `ODCUP` | text |  | OD |  |
| `OSCUP` | text |  | OS |  |
| `ODMACULA` | text |  | OD |  |
| `OSMACULA` | text |  | OS |  |
| `ODVESSELS` | text |  | OD |  |
| `OSVESSELS` | text |  | OS |  |
| `ODVITREOUS` | text |  | OD |  |
| `OSVITREOUS` | text |  | OS |  |
| `ODPERIPH` | text |  | OD |  |
| `OSPERIPH` | text |  | OS |  |
| `ODCMT` | text |  | OD |  |
| `OSCMT` | text |  | OS |  |
| `RETINA_COMMENTS` | text |  | OD |  |
| `DIL_RISKS` | char(2) | 'on' |  |  |
| `DIL_MEDS` | mediumtext |  |  |  |
| `WETTYPE` | varchar(10) |  |  |  |
| `ATROPINE` | varchar(25) |  |  |  |
| `CYCLOMYDRIL` | varchar(25) |  |  |  |
| `TROPICAMIDE` | varchar(25) |  |  |  |
| `CYCLOGYL` | varchar(25) |  |  |  |
| `NEO25` | varchar(25) |  |  |  |

Keys: `PRIMARY KEY `postseg_link` (`id`)`; `UNIQUE KEY `id_pid` (`id`,`pid`)`

## `form_eye_neuro` (80 columns)

| Column | Type | Default | Eye (guess) | Comment |
|---|---|---|---|---|
| `id` | bigint |  |  | Links to forms.form_id |
| `pid` | bigint(20) | NULL |  |  |
| `ACT` | char | 'on' |  |  |
| `ACT5CCDIST` | text |  |  |  |
| `ACT1CCDIST` | text |  |  |  |
| `ACT2CCDIST` | text |  |  |  |
| `ACT3CCDIST` | text |  |  |  |
| `ACT4CCDIST` | text |  |  |  |
| `ACT6CCDIST` | text |  |  |  |
| `ACT7CCDIST` | text |  |  |  |
| `ACT8CCDIST` | text |  |  |  |
| `ACT9CCDIST` | text |  |  |  |
| `ACT10CCDIST` | text |  |  |  |
| `ACT11CCDIST` | text |  |  |  |
| `ACT1SCDIST` | text |  |  |  |
| `ACT2SCDIST` | text |  |  |  |
| `ACT3SCDIST` | text |  |  |  |
| `ACT4SCDIST` | text |  |  |  |
| `ACT5SCDIST` | text |  |  |  |
| `ACT6SCDIST` | text |  |  |  |
| `ACT7SCDIST` | text |  |  |  |
| `ACT8SCDIST` | text |  |  |  |
| `ACT9SCDIST` | text |  |  |  |
| `ACT10SCDIST` | text |  |  |  |
| `ACT11SCDIST` | text |  |  |  |
| `ACT1SCNEAR` | text |  |  |  |
| `ACT2SCNEAR` | text |  |  |  |
| `ACT3SCNEAR` | text |  |  |  |
| `ACT4SCNEAR` | text |  |  |  |
| `ACT5CCNEAR` | text |  |  |  |
| `ACT6CCNEAR` | text |  |  |  |
| `ACT7CCNEAR` | text |  |  |  |
| `ACT8CCNEAR` | text |  |  |  |
| `ACT9CCNEAR` | text |  |  |  |
| `ACT10CCNEAR` | text |  |  |  |
| `ACT11CCNEAR` | text |  |  |  |
| `ACT5SCNEAR` | text |  |  |  |
| `ACT6SCNEAR` | text |  |  |  |
| `ACT7SCNEAR` | text |  |  |  |
| `ACT8SCNEAR` | text |  |  |  |
| `ACT9SCNEAR` | text |  |  |  |
| `ACT10SCNEAR` | text |  |  |  |
| `ACT11SCNEAR` | text |  |  |  |
| `ACT1CCNEAR` | text |  |  |  |
| `ACT2CCNEAR` | text |  |  |  |
| `ACT3CCNEAR` | text |  |  |  |
| `MOTILITYNORMAL` | char | 'on' |  |  |
| `MOTILITY_RS` | char | '0' |  |  |
| `MOTILITY_RI` | char | '0' |  |  |
| `MOTILITY_RR` | char | '0' |  |  |
| `MOTILITY_RL` | char | '0' |  |  |
| `MOTILITY_LS` | char | '0' |  |  |
| `MOTILITY_LI` | char | '0' |  |  |
| `MOTILITY_LR` | char | '0' |  |  |
| `MOTILITY_LL` | char | '0' |  |  |
| `MOTILITY_RRSO` | int | NULL |  |  |
| `MOTILITY_RLSO` | int | NULL |  |  |
| `MOTILITY_RRIO` | int | NULL |  |  |
| `MOTILITY_RLIO` | int | NULL |  |  |
| `MOTILITY_LRSO` | int | NULL |  |  |
| `MOTILITY_LLSO` | int | NULL |  |  |
| `MOTILITY_LRIO` | int | NULL |  |  |
| `MOTILITY_LLIO` | int | NULL |  |  |
| `NEURO_COMMENTS` | text |  |  |  |
| `STEREOPSIS` | varchar | NULL |  |  |
| `ODNPA` | text |  | OD |  |
| `OSNPA` | text |  | OS |  |
| `VERTFUSAMPS` | text |  |  |  |
| `DIVERGENCEAMPS` | text |  |  |  |
| `NPC` | varchar | NULL |  |  |
| `DACCDIST` | varchar | NULL |  |  |
| `DACCNEAR` | varchar | NULL |  |  |
| `CACCDIST` | varchar | NULL |  |  |
| `CACCNEAR` | varchar | NULL |  |  |
| `ODCOLOR` | text |  | OD |  |
| `OSCOLOR` | text |  | OS |  |
| `ODCOINS` | text |  | OD |  |
| `OSCOINS` | text |  | OS |  |
| `ODREDDESAT` | varchar | NULL | OD |  |
| `OSREDDESAT` | varchar | NULL | OS |  |

Keys: `PRIMARY KEY `neuro_link` (`id`)`; `UNIQUE KEY `id_pid` (`id`,`pid`)`

## `form_eye_locking` (9 columns)

| Column | Type | Default | Eye (guess) | Comment |
|---|---|---|---|---|
| `id` | bigint(20) |  |  | Links to forms.form_id |
| `pid` | bigint(20) | NULL |  |  |
| `IMP` | text |  |  |  |
| `PLAN` | text |  |  |  |
| `Resource` | varchar(50) | NULL | OD |  |
| `Technician` | varchar(50) | NULL |  |  |
| `LOCKED` | varchar(3) | NULL | OS |  |
| `LOCKEDDATE` | timestamp | CURRENT_TIMESTAMP | OS |  |
| `LOCKEDBY` | varchar(50) | NULL | OS |  |

Keys: `PRIMARY KEY `locking_link` (`id`)`; `UNIQUE KEY `id_pid` (`id`,`pid`)`

_Total: 17 tables, 509 columns._
