# CapDag-JS Test Catalog

**Total Tests:** 306

**Numbered Tests:** 159

**Unnumbered Tests:** 147

All numbered test numbers are unique.

This catalog lists all tests in the CapDag-JS codebase.

| Test # | Function Name | Description | File |
|--------|---------------|-------------|------|
| test001 | `test001_capUrnCreation` | TEST001: Cap URN created with tags, direction specs accessible | capdag.test.js:155 |
| test002 | `test002_directionSpecsRequired` | TEST002: Missing in -> MissingInSpec, missing out -> MissingOutSpec | capdag.test.js:165 |
| test003 | `test003_directionMatching` | TEST003: Direction specs must match exactly; wildcard matches any | capdag.test.js:179 |
| test004 | `test004_unquotedValuesLowercased` | TEST004: Unquoted keys/values normalized to lowercase | capdag.test.js:194 |
| test005 | `test005_quotedValuesPreserveCase` | TEST005: Quoted values preserve case | capdag.test.js:203 |
| test006 | `test006_quotedValueSpecialChars` | TEST006: Semicolons, equals, spaces in quoted values | capdag.test.js:209 |
| test007 | `test007_quotedValueEscapeSequences` | TEST007: Escaped quotes and backslashes in quoted values | capdag.test.js:215 |
| test008 | `test008_mixedQuotedUnquoted` | TEST008: Mix of quoted and unquoted values | capdag.test.js:222 |
| test009 | `test009_unterminatedQuoteError` | TEST009: Unterminated quote produces error | capdag.test.js:229 |
| test010 | `test010_invalidEscapeSequenceError` | TEST010: Invalid escape sequences produce error | capdag.test.js:242 |
| test011 | `test011_serializationSmartQuoting` | TEST011: Smart quoting: no quotes for simple lowercase, quotes for special | capdag.test.js:256 |
| test012 | `test012_roundTripSimple` | TEST012: Simple cap URN parse -> serialize -> parse equals original | capdag.test.js:265 |
| test013 | `test013_roundTripQuoted` | TEST013: Quoted values round-trip preserving case | capdag.test.js:273 |
| test014 | `test014_roundTripEscapes` | TEST014: Escape sequences round-trip correctly | capdag.test.js:282 |
| test015 | `test015_capPrefixRequired` | TEST015: cap: prefix required, case-insensitive | capdag.test.js:292 |
| test016 | `test016_trailingSemicolonEquivalence` | TEST016: With/without trailing semicolon are equivalent | capdag.test.js:304 |
| test017 | `test017_tagMatching` | TEST017: Exact match, subset match, wildcard match, value mismatch | capdag.test.js:312 |
| test018 | `test018_matchingCaseSensitiveValues` | TEST018: Quoted uppercase values don't match lowercase (case sensitive) | capdag.test.js:333 |
| test019 | `test019_missingTagHandling` | TEST019: Missing tags treated as wildcards | capdag.test.js:340 |
| test020 | `test020_specificity` | TEST020: Direction specs use MediaUrn tag count, other tags count non-wildcard | capdag.test.js:354 |
| test021 | `test021_builder` | TEST021: CapUrnBuilder creates valid URN | capdag.test.js:373 |
| test022 | `test022_builderRequiresDirection` | TEST022: Builder requires both inSpec and outSpec | capdag.test.js:387 |
| test023 | `test023_builderPreservesCase` | TEST023: Builder lowercases keys but preserves value case | capdag.test.js:401 |
| test024 | `test024_compatibility` | TEST024: Directional accepts checks | capdag.test.js:412 |
| test025 | `test025_bestMatch` | TEST025: CapMatcher.findBestMatch returns most specific | capdag.test.js:432 |
| test026 | `test026_mergeAndSubset` | TEST026: merge combines tags, subset keeps only specified | capdag.test.js:445 |
| test027 | `test027_wildcardTag` | TEST027: withWildcardTag sets tag to wildcard including in/out | capdag.test.js:464 |
| test028 | `test028_emptyCapUrnNotAllowed` | TEST028: Empty cap URN without in/out fails (MissingInSpec) | capdag.test.js:477 |
| test029 | `test029_minimalCapUrn` | TEST029: Minimal valid cap URN: just in and out, empty tags | capdag.test.js:486 |
| test030 | `test030_extendedCharacterSupport` | TEST030: Forward slashes and colons in tag values | capdag.test.js:494 |
| test031 | `test031_wildcardRestrictions` | TEST031: Wildcard rejected in keys, accepted in values | capdag.test.js:501 |
| test032 | `test032_duplicateKeyRejection` | TEST032: Duplicate keys rejected | capdag.test.js:519 |
| test033 | `test033_numericKeyRestriction` | TEST033: Pure numeric keys rejected, mixed alphanumeric OK | capdag.test.js:528 |
| test034 | `test034_emptyValueError` | TEST034: key= (empty value) is rejected | capdag.test.js:542 |
| test035 | `test035_hasTagCaseSensitive` | TEST035: hasTag case-sensitive for values, case-insensitive for keys, works for in/out | capdag.test.js:555 |
| test036 | `test036_withTagPreservesValue` | TEST036: withTag preserves value case | capdag.test.js:567 |
| test037 | `test037_withTagRejectsEmptyValue` | TEST037: withTag('key', '') -> error Note: In JS, withTag does not currently reject empty values (it stores them). The Rust implementation rejects empty values. We test the JS behavior as-is. | capdag.test.js:576 |
| test038 | `test038_semanticEquivalence` | TEST038: Unquoted 'simple' == quoted '"simple"' (lowercase) | capdag.test.js:586 |
| test039 | `test039_getTagReturnsDirectionSpecs` | TEST039: getTag('in') and getTag('out') work, case-insensitive | capdag.test.js:594 |
| test040 | `test040_matchingSemanticsExactMatch` | TEST040: Cap and request same tags -> accepts=true | capdag.test.js:603 |
| test041 | `test041_matchingSemanticsCapMissingTag` | TEST041: Cap missing tag -> implicit wildcard -> accepts=true | capdag.test.js:610 |
| test042 | `test042_matchingSemanticsCapHasExtraTag` | TEST042: Cap extra tag -> still matches | capdag.test.js:617 |
| test043 | `test043_matchingSemanticsRequestHasWildcard` | TEST043: Request ext=* matches cap ext=pdf | capdag.test.js:624 |
| test044 | `test044_matchingSemanticsCapHasWildcard` | TEST044: Cap ext=* matches request ext=pdf | capdag.test.js:631 |
| test045 | `test045_matchingSemanticsValueMismatch` | TEST045: ext=pdf vs ext=docx -> no match | capdag.test.js:638 |
| test046 | `test046_matchingSemanticsFallbackPattern` | TEST046: Cap without ext matches request with ext=wav (uses media:binary directions) | capdag.test.js:645 |
| test047 | `test047_matchingSemanticsThumbnailVoidInput` | TEST047: Thumbnail with void input matches specific ext request | capdag.test.js:652 |
| test048 | `test048_matchingSemanticsWildcardDirection` | TEST048: Cap in=* out=* matches any request | capdag.test.js:659 |
| test049 | `test049_matchingSemanticsCrossDimension` | TEST049: Cap op=generate accepts request ext=pdf (independent tags) | capdag.test.js:666 |
| test050 | `test050_matchingSemanticsDirectionMismatch` | TEST050: media:string vs media: (wildcard) -> no match | capdag.test.js:673 |
| test054 | `test054_xv5InlineSpecRedefinitionDetected` | TEST054: Inline media spec redefinition of registry spec is detected | capdag.test.js:762 |
| test055 | `test055_xv5NewInlineSpecAllowed` | TEST055: New inline media spec not in registry is allowed | capdag.test.js:779 |
| test056 | `test056_xv5EmptyMediaSpecsAllowed` | TEST056: Empty/null media_specs passes validation | capdag.test.js:794 |
| test060 | `test060_wrongPrefixFails` | TEST060: MediaUrn.fromString('cap:string') -> INVALID_PREFIX error | capdag.test.js:806 |
| test061 | `test061_isBinary` | TEST061: isBinary true when textable tag is absent (binary = not textable) | capdag.test.js:815 |
| test062 | `test062_isRecord` | TEST062: isMap true for MEDIA_OBJECT (record); false for MEDIA_STRING (form=scalar), MEDIA_STRING_LIST (list) TEST062: is_record returns true if record marker tag is present (key-value structure) | capdag.test.js:832 |
| test063 | `test063_isScalar` | TEST063: is_scalar returns true if NO list marker (scalar is default cardinality) | capdag.test.js:843 |
| test064 | `test064_isList` | TEST064: isList true for MEDIA_STRING_LIST, MEDIA_INTEGER_LIST, MEDIA_OBJECT_LIST; false for MEDIA_STRING, MEDIA_OBJECT | capdag.test.js:857 |
| test065 | `test065_isOpaque` | TEST065: is_opaque returns true if NO record marker (opaque is default structure) | capdag.test.js:866 |
| test066 | `test066_isJson` | TEST066: isJson true for MEDIA_JSON; false for MEDIA_OBJECT (map but not json) | capdag.test.js:877 |
| test067 | `test067_isText` | TEST067: is_text returns true only if "textable" marker tag is present | capdag.test.js:883 |
| test068 | `test068_isVoid` | TEST068: isVoid true for media:void; false for media:string | capdag.test.js:894 |
| test071 | `test071_toStringRoundtrip` | TEST071: Parse -> toString -> parse equals original | capdag.test.js:902 |
| test072 | `test072_constantsParse` | TEST072: All MEDIA_* constants parse as valid MediaUrns | capdag.test.js:912 |
| test074 | `test074_mediaUrnMatching` | TEST074: MEDIA_PDF (media:pdf) conformsTo media:pdf; MEDIA_MD conformsTo media:md; same URNs conform | capdag.test.js:932 |
| test075 | `test075_accepts` | TEST075: handler accepts same request, general handler accepts request | capdag.test.js:946 |
| test076 | `test076_specificity` | TEST076: More tags = higher specificity | capdag.test.js:957 |
| test077 | `test077_serdeRoundtrip` | TEST077: N/A for JS (Rust serde) - but we test JSON.stringify round-trip | capdag.test.js:966 |
| test078 | `test078_debugMatchingBehavior` | TEST078: MEDIA_OBJECT does NOT conform to MEDIA_STRING | capdag.test.js:975 |
| test091 | `test091_resolveCustomMediaSpec` | TEST091: resolveMediaUrn resolves custom from local mediaSpecs | capdag.test.js:990 |
| test092 | `test092_resolveCustomWithSchema` | TEST092: resolveMediaUrn resolves with schema from local mediaSpecs | capdag.test.js:1000 |
| test093 | `test093_resolveUnresolvableFailsHard` | TEST093: resolveMediaUrn fails hard on unknown URN | capdag.test.js:1017 |
| test099 | `test099_resolvedIsBinary` | TEST099: MediaSpec with media: (no textable tag) -> isBinary() true | capdag.test.js:1036 |
| test100 | `test100_resolvedIsRecord` | TEST100: MediaSpec with record -> isRecord() true | capdag.test.js:1042 |
| test101 | `test101_resolvedIsScalar` | TEST101: MediaSpec with form=scalar -> isScalar() true | capdag.test.js:1048 |
| test102 | `test102_resolvedIsList` | TEST102: MediaSpec with list -> isList() true | capdag.test.js:1054 |
| test103 | `test103_resolvedIsJson` | TEST103: MediaSpec with json tag -> isJSON() true | capdag.test.js:1060 |
| test104 | `test104_resolvedIsText` | TEST104: MediaSpec with textable tag -> isText() true | capdag.test.js:1066 |
| test105 | `test105_metadataPropagation` | TEST105: Metadata propagated from media spec definition | capdag.test.js:1072 |
| test106 | `test106_metadataWithValidation` | TEST106: Metadata and validation coexist | capdag.test.js:1095 |
| test107 | `test107_extensionsPropagation` | TEST107: Extensions field propagated | capdag.test.js:1114 |
| test108 | `test108_extensionsSerialization` | TEST108: N/A for JS (Rust serde) - but we test MediaSpec with extensions | capdag.test.js:1130 |
| test109 | `test109_extensionsWithMetadataAndValidation` | TEST109: Extensions coexist with metadata and validation | capdag.test.js:1138 |
| test110 | `test110_multipleExtensions` | TEST110: Multiple extensions in a media spec | capdag.test.js:1157 |
| test117 | `test117_capBlockMoreSpecificWins` | TEST117: CapBlock finds more specific cap across registries | capdag.test.js:1177 |
| test118 | `test118_capBlockTieGoesToFirst` | TEST118: CapBlock tie-breaking prefers first registry in order | capdag.test.js:1207 |
| test119 | `test119_capBlockPollsAll` | TEST119: CapBlock polls all registries to find best match | capdag.test.js:1228 |
| test120 | `test120_capBlockNoMatch` | TEST120: CapBlock returns error when no cap matches request | capdag.test.js:1255 |
| test121 | `test121_capBlockFallbackScenario` | TEST121: CapBlock fallback scenario where generic cap handles unknown file types | capdag.test.js:1270 |
| test122 | `test122_capBlockCanMethod` | TEST122: CapBlock can method returns execution info and acceptsRequest checks capability | capdag.test.js:1302 |
| test123 | `test123_capBlockRegistryManagement` | TEST123: CapBlock registry management add, get, remove operations | capdag.test.js:1319 |
| test124 | `test124_capGraphBasicConstruction` | TEST124: CapGraph basic construction builds nodes and edges from caps | capdag.test.js:1338 |
| test125 | `test125_capGraphOutgoingIncoming` | TEST125: CapGraph getOutgoing and getIncoming return correct edges for media URN | capdag.test.js:1357 |
| test126 | `test126_capGraphCanConvert` | TEST126: CapGraph canConvert checks direct and transitive conversion paths | capdag.test.js:1375 |
| test127 | `test127_capGraphFindPath` | TEST127: CapGraph findPath returns shortest path between media URNs | capdag.test.js:1396 |
| test128 | `test128_capGraphFindAllPaths` | TEST128: CapGraph findAllPaths returns all paths sorted by length | capdag.test.js:1429 |
| test129 | `test129_capGraphGetDirectEdges` | TEST129: CapGraph getDirectEdges returns edges sorted by specificity | capdag.test.js:1449 |
| test130 | `test130_capGraphStats` | TEST130: CapGraph stats returns node count, edge count, input/output URN counts | capdag.test.js:1474 |
| test131 | `test131_capGraphWithCapBlock` | TEST131: CapGraph with CapBlock builds graph from multiple registries | capdag.test.js:1495 |
| test156 | `test156_stdinSourceFromData` | TEST156: Creating StdinSource Data variant with byte vector | capdag.test.js:1529 |
| test157 | `test157_stdinSourceFromFileReference` | TEST157: Creating StdinSource FileReference variant with all required fields | capdag.test.js:1540 |
| test158 | `test158_stdinSourceWithEmptyData` | TEST158: StdinSource Data with empty vector stores and retrieves correctly | capdag.test.js:1557 |
| test159 | `test159_stdinSourceWithBinaryContent` | TEST159: StdinSource Data with binary content like PNG header bytes | capdag.test.js:1565 |
| test274 | `test274_capArgumentValueNew` | TEST274: CapArgumentValue constructor stores media_urn and raw byte value | capdag.test.js:1579 |
| test275 | `test275_capArgumentValueFromStr` | TEST275: CapArgumentValue.fromStr converts string to UTF-8 bytes | capdag.test.js:1586 |
| test276 | `test276_capArgumentValueAsStrValid` | TEST276: CapArgumentValue.valueAsStr succeeds for UTF-8 data | capdag.test.js:1593 |
| test277 | `test277_capArgumentValueAsStrInvalidUtf8` | TEST277: CapArgumentValue.valueAsStr fails for non-UTF-8 binary data | capdag.test.js:1599 |
| test278 | `test278_capArgumentValueEmpty` | TEST278: CapArgumentValue with empty value stores empty Uint8Array | capdag.test.js:1611 |
| test282 | `test282_capArgumentValueUnicode` | TEST282: CapArgumentValue.fromStr with Unicode string preserves all characters | capdag.test.js:1620 |
| test283 | `test283_capArgumentValueLargeBinary` | TEST283: CapArgumentValue with large binary payload preserves all bytes | capdag.test.js:1626 |
| test304 | `test304_mediaAvailabilityOutputConstant` | TEST304: MEDIA_AVAILABILITY_OUTPUT constant parses as valid media URN with correct tags | capdag.test.js:1645 |
| test305 | `test305_mediaPathOutputConstant` | TEST305: MEDIA_PATH_OUTPUT constant parses as valid media URN with correct tags | capdag.test.js:1655 |
| test306 | `test306_availabilityAndPathOutputDistinct` | TEST306: MEDIA_AVAILABILITY_OUTPUT and MEDIA_PATH_OUTPUT are distinct URNs | capdag.test.js:1665 |
| test307 | `test307_modelAvailabilityUrn` | TEST307: model_availability_urn builds valid cap URN with correct op and media specs | capdag.test.js:1679 |
| test308 | `test308_modelPathUrn` | TEST308: model_path_urn builds valid cap URN with correct op and media specs | capdag.test.js:1691 |
| test309 | `test309_modelAvailabilityAndPathAreDistinct` | TEST309: model_availability_urn and model_path_urn produce distinct URNs | capdag.test.js:1703 |
| test310 | `test310_llmGenerateTextUrn` | TEST310: llm_generate_text_urn has correct op and ml-model tags | capdag.test.js:1710 |
| test311 | `test311_llmGenerateTextUrnSpecs` | TEST311: llm_generate_text_urn in/out specs match MEDIA_STRING | capdag.test.js:1718 |
| test312 | `test312_allUrnBuildersProduceValidUrns` | TEST312: All URN builders produce parseable cap URNs | capdag.test.js:1729 |
| test320 | `test320_cartridgeInfoConstruction` | TEST320: Cartridge info construction | capdag.test.js:2094 |
| test321 | `test321_cartridgeInfoIsSigned` | TEST321: Cartridge info is signed check | capdag.test.js:2121 |
| test322 | `test322_cartridgeInfoBuildForPlatform` | TEST322: Cartridge info build for platform and available platforms | capdag.test.js:2133 |
| test323 | `test323_cartridgeRepoServerValidateRegistry` | TEST323: CartridgeRepoServer validate registry | capdag.test.js:2167 |
| test324 | `test324_cartridgeRepoServerTransformToArray` | TEST324: CartridgeRepoServer transform to array | capdag.test.js:2194 |
| test325 | `test325_cartridgeRepoServerGetCartridges` | TEST325: CartridgeRepoServer get cartridges | capdag.test.js:2219 |
| test326 | `test326_cartridgeRepoServerGetCartridgeById` | TEST326: CartridgeRepoServer get cartridge by ID | capdag.test.js:2229 |
| test327 | `test327_cartridgeRepoServerSearchCartridges` | TEST327: CartridgeRepoServer search cartridges | capdag.test.js:2241 |
| test328 | `test328_cartridgeRepoServerGetByCategory` | TEST328: CartridgeRepoServer get by category | capdag.test.js:2256 |
| test329 | `test329_cartridgeRepoServerGetByCap` | TEST329: CartridgeRepoServer get by cap | capdag.test.js:2269 |
| test330 | `test330_cartridgeRepoClientUpdateCache` | TEST330: CartridgeRepoClient update cache | capdag.test.js:2284 |
| test331 | `test331_cartridgeRepoClientGetSuggestions` | TEST331: CartridgeRepoClient get suggestions | capdag.test.js:2298 |
| test332 | `test332_cartridgeRepoClientGetCartridge` | TEST332: CartridgeRepoClient get cartridge | capdag.test.js:2315 |
| test333 | `test333_cartridgeRepoClientGetAllCaps` | TEST333: CartridgeRepoClient get all caps | capdag.test.js:2331 |
| test334 | `test334_cartridgeRepoClientNeedsSync` | TEST334: CartridgeRepoClient needs sync | capdag.test.js:2345 |
| test335 | `test335_cartridgeRepoServerClientIntegration` | TEST335: CartridgeRepoServer and Client integration | capdag.test.js:2366 |
| test546 | `test546_isImage` | TEST546: isImage returns true only when image marker tag is present | capdag.test.js:2399 |
| test547 | `test547_isAudio` | TEST547: isAudio returns true only when audio marker tag is present | capdag.test.js:2411 |
| test548 | `test548_isVideo` | TEST548: isVideo returns true only when video marker tag is present | capdag.test.js:2422 |
| test549 | `test549_isNumeric` | TEST549: isNumeric returns true only when numeric marker tag is present | capdag.test.js:2432 |
| test550 | `test550_isBool` | TEST550: isBool returns true only when bool marker tag is present | capdag.test.js:2444 |
| test551 | `test551_isFilePath` | TEST551: isFilePath returns true for scalar file-path, false for array | capdag.test.js:2456 |
| test552 | `test552_isFilePathArray` | TEST552: isFilePathArray returns true for list file-path, false for scalar | capdag.test.js:2466 |
| test553 | `test553_isAnyFilePath` | TEST553: isAnyFilePath returns true for both scalar and array file-path | capdag.test.js:2475 |
| test554 | `test554_isCollection` | TEST554: isCollection returns true when collection marker tag is present TEST554: N/A for JS (MEDIA_COLLECTION constants removed - no longer exists) | capdag.test.js:2485 |
| test558 | `test558_predicateConstantConsistency` | TEST558: predicates are consistent with constants - every constant triggers exactly the expected predicates | capdag.test.js:2496 |
| test559 | `test559_withoutTag` | TEST559: withoutTag removes tag, ignores in/out, case-insensitive for keys | capdag.test.js:2536 |
| test560 | `test560_withInOutSpec` | TEST560: withInSpec and withOutSpec change direction specs | capdag.test.js:2558 |
| test563 | `test563_findAllMatches` | TEST563: CapMatcher.findAllMatches returns all matching caps sorted by specificity | capdag.test.js:2581 |
| test564 | `test564_areCompatible` | TEST564: CapMatcher.areCompatible detects bidirectional overlap | capdag.test.js:2599 |
| test566 | `test566_withTagIgnoresInOut` | TEST566: withTag silently ignores in/out keys | capdag.test.js:2624 |
| test643 | `test643_explicitAsteriskIsWildcard` | TEST643: cap:in=*;out=* treated as wildcards | capdag.test.js:2647 |
| test644 | `test644_specificInWildcardOut` | TEST644: cap:in=media:;out=* has specific in, wildcard out | capdag.test.js:2654 |
| test645 | `test645_wildcardInSpecificOut` | TEST645: cap:in=*;out=media:text has wildcard in, specific out | capdag.test.js:2661 |
| test648 | `test648_wildcardAcceptsSpecific` | TEST648: Wildcard in/out match specific caps | capdag.test.js:2671 |
| test649 | `test649_specificityScoring` | TEST649: Specificity - wildcard has 0, specific has tag count | capdag.test.js:2680 |
| test651 | `test651_identityFormsEquivalent` | TEST651: All identity forms with explicit wildcards produce the same CapUrn | capdag.test.js:2691 |
| test653 | `test653_identityRoutingIsolation` | TEST653: Identity (no extra tags) does not steal routes from specific handlers | capdag.test.js:2711 |
| test890 | `test890_directionSemanticMatching` | TEST890: Semantic direction matching - generic provider matches specific request | capdag.test.js:684 |
| test891 | `test891_directionSemanticSpecificity` | TEST891: Semantic direction specificity - more media URN tags = higher specificity | capdag.test.js:734 |
| | | | |
| unnumbered | `testJS_argsPassedToExecuteCap` |  | capdag.test.js:1932 |
| unnumbered | `testJS_binaryArgPassedToExecuteCap` |  | capdag.test.js:1966 |
| unnumbered | `testJS_buildExtensionIndex` | These tests cover JS-specific functionality not in the Rust numbering scheme but are important for capdag-js correctness. | capdag.test.js:1749 |
| unnumbered | `testJS_capDocumentationOmittedWhenNull` | When documentation is null, toJSON must omit the field entirely. This matches the Rust serializer's skip-when-None semantics and the ObjC toDictionary behaviour. A regression where null is emitted as `documentation: null` would break the symmetric round-trip with Rust (which has no null sentinel) and pollute generated JSON. | capdag.test.js:1866 |
| unnumbered | `testJS_capDocumentationRoundTrip` | JS round-trip for the documentation field on Cap. Mirrors TEST920 in capdag/src/cap/definition.rs — the body is non-trivial (newlines, backticks, embedded quotes, Unicode) so escaping mismatches between JSON.stringify on this side and the Rust serializer on the other side surface as failures here. | capdag.test.js:1844 |
| unnumbered | `testJS_capJSONSerialization` |  | capdag.test.js:1817 |
| unnumbered | `testJS_capWithMediaSpecs` |  | capdag.test.js:1803 |
| unnumbered | `testJS_getExtensionMappings` |  | capdag.test.js:1793 |
| unnumbered | `testJS_mediaSpecConstruction` |  | capdag.test.js:1999 |
| unnumbered | `testJS_mediaSpecDocumentationPropagatesThroughResolve` | Documentation propagates from a mediaSpecs definition through resolveMediaUrn into the resolved MediaSpec. Mirrors TEST924 on the Rust side. This is the path every UI consumer uses, so a break here makes the new field invisible everywhere downstream. | capdag.test.js:1889 |
| unnumbered | `testJS_mediaUrnsForExtension` |  | capdag.test.js:1765 |
| unnumbered | `testJS_stdinSourceKindConstants` |  | capdag.test.js:1919 |
| unnumbered | `testJS_stdinSourceNullData` |  | capdag.test.js:1925 |
| unnumbered | `testMachine_aliasFallbackWithoutOpTag` |  | capdag.test.js:3387 |
| unnumbered | `testMachine_aliasFromOpTag` |  | capdag.test.js:3376 |
| unnumbered | `testMachine_builderChaining` |  | capdag.test.js:3444 |
| unnumbered | `testMachine_builderEquivalentToParsed` |  | capdag.test.js:3452 |
| unnumbered | `testMachine_builderRoundTrip` |  | capdag.test.js:3464 |
| unnumbered | `testMachine_builderSingleEdge` | --- Machine builder tests --- | capdag.test.js:3420 |
| unnumbered | `testMachine_builderWithLoop` |  | capdag.test.js:3432 |
| unnumbered | `testMachine_capRegistryClient_construction` |  | capdag.test.js:3745 |
| unnumbered | `testMachine_capRegistryEntry_construction` | ============================================================================ Phase 0B: CapRegistryClient tests ============================================================================ | capdag.test.js:3709 |
| unnumbered | `testMachine_capRegistryEntry_defaults` |  | capdag.test.js:3752 |
| unnumbered | `testMachine_capUrnInMediaUrn` |  | capdag.test.js:3491 |
| unnumbered | `testMachine_capUrnIsComparable` |  | capdag.test.js:3484 |
| unnumbered | `testMachine_capUrnIsEquivalent` | --- CapUrn.isEquivalent/isComparable tests --- | capdag.test.js:3476 |
| unnumbered | `testMachine_capUrnOutMediaUrn` |  | capdag.test.js:3498 |
| unnumbered | `testMachine_conflictingMediaTypesFail` |  | capdag.test.js:2857 |
| unnumbered | `testMachine_differentAliasesSameGraph` |  | capdag.test.js:2879 |
| unnumbered | `testMachine_displayEdge` |  | capdag.test.js:3223 |
| unnumbered | `testMachine_displayGraph` |  | capdag.test.js:3234 |
| unnumbered | `testMachine_duplicateAlias` |  | capdag.test.js:2750 |
| unnumbered | `testMachine_duplicateOpTagsDisambiguated` |  | capdag.test.js:3398 |
| unnumbered | `testMachine_edgeEquivalenceDifferentCapUrns` |  | capdag.test.js:3034 |
| unnumbered | `testMachine_edgeEquivalenceDifferentLoopFlag` |  | capdag.test.js:3066 |
| unnumbered | `testMachine_edgeEquivalenceDifferentSourceCount` |  | capdag.test.js:3098 |
| unnumbered | `testMachine_edgeEquivalenceDifferentTargets` |  | capdag.test.js:3050 |
| unnumbered | `testMachine_edgeEquivalenceSameUrns` | --- Machine graph tests (mirrors graph.rs tests) --- | capdag.test.js:3018 |
| unnumbered | `testMachine_edgeEquivalenceSourceOrderIndependent` |  | capdag.test.js:3082 |
| unnumbered | `testMachine_emptyInput` | --- Machine parser tests (mirrors parser.rs tests) --- | capdag.test.js:2735 |
| unnumbered | `testMachine_errorLocation_duplicateAlias` |  | capdag.test.js:3618 |
| unnumbered | `testMachine_errorLocation_parseError` |  | capdag.test.js:3608 |
| unnumbered | `testMachine_errorLocation_undefinedAlias` |  | capdag.test.js:3632 |
| unnumbered | `testMachine_fanInSecondaryAssignedByPriorWiring` |  | capdag.test.js:2807 |
| unnumbered | `testMachine_fanInSecondaryUnassignedGetsWildcard` |  | capdag.test.js:2820 |
| unnumbered | `testMachine_fanOut` |  | capdag.test.js:2790 |
| unnumbered | `testMachine_graphEmpty` |  | capdag.test.js:3171 |
| unnumbered | `testMachine_graphEmptyEquivalence` |  | capdag.test.js:3177 |
| unnumbered | `testMachine_graphEquivalenceReorderedEdges` |  | capdag.test.js:3129 |
| unnumbered | `testMachine_graphEquivalenceSameEdges` |  | capdag.test.js:3114 |
| unnumbered | `testMachine_graphNotEquivalentDifferentCap` |  | capdag.test.js:3158 |
| unnumbered | `testMachine_graphNotEquivalentDifferentEdgeCount` |  | capdag.test.js:3144 |
| unnumbered | `testMachine_headerOnlyNoWirings` |  | capdag.test.js:2743 |
| unnumbered | `testMachine_leafTargetsLinearChain` |  | capdag.test.js:3197 |
| unnumbered | `testMachine_lineBasedAndBracketedParseSameGraph` |  | capdag.test.js:2992 |
| unnumbered | `testMachine_lineBasedEquivalentToBracketed` |  | capdag.test.js:2960 |
| unnumbered | `testMachine_lineBasedFanIn` |  | capdag.test.js:2939 |
| unnumbered | `testMachine_lineBasedFormatSerialization` |  | capdag.test.js:2972 |
| unnumbered | `testMachine_lineBasedLoop` |  | capdag.test.js:2930 |
| unnumbered | `testMachine_lineBasedSimpleChain` | --- Machine parser line-based mode tests --- | capdag.test.js:2907 |
| unnumbered | `testMachine_lineBasedTwoStepChain` |  | capdag.test.js:2920 |
| unnumbered | `testMachine_loopEdge` |  | capdag.test.js:2831 |
| unnumbered | `testMachine_malformedInputFails` |  | capdag.test.js:2891 |
| unnumbered | `testMachine_mediaRegistryEntry_construction` |  | capdag.test.js:3732 |
| unnumbered | `testMachine_mediaUrnIsComparable` |  | capdag.test.js:3515 |
| unnumbered | `testMachine_mediaUrnIsEquivalent` | --- MediaUrn.isEquivalent/isComparable tests --- | capdag.test.js:3507 |
| unnumbered | `testMachine_mixedBracketedAndLineBased` |  | capdag.test.js:2952 |
| unnumbered | `testMachine_multilineFormat` |  | capdag.test.js:2869 |
| unnumbered | `testMachine_multilineSerializeFormat` |  | capdag.test.js:3362 |
| unnumbered | `testMachine_nodeAliasCollision` |  | capdag.test.js:2847 |
| unnumbered | `testMachine_parseMachineWithAST_aliasMap` |  | capdag.test.js:3578 |
| unnumbered | `testMachine_parseMachineWithAST_fanInSourceLocations` |  | capdag.test.js:3567 |
| unnumbered | `testMachine_parseMachineWithAST_headerLocation` | ============================================================================ Phase 0A: Position tracking tests ============================================================================ | capdag.test.js:3528 |
| unnumbered | `testMachine_parseMachineWithAST_multilinePositions` |  | capdag.test.js:3558 |
| unnumbered | `testMachine_parseMachineWithAST_nodeMedia` |  | capdag.test.js:3596 |
| unnumbered | `testMachine_parseMachineWithAST_wiringLocation` |  | capdag.test.js:3544 |
| unnumbered | `testMachine_reorderedEdgesProduceSameNotation` |  | capdag.test.js:3346 |
| unnumbered | `testMachine_rootSourcesFanIn` |  | capdag.test.js:3211 |
| unnumbered | `testMachine_rootSourcesLinearChain` |  | capdag.test.js:3183 |
| unnumbered | `testMachine_roundtripFanOut` |  | capdag.test.js:3305 |
| unnumbered | `testMachine_roundtripLoopEdge` |  | capdag.test.js:3320 |
| unnumbered | `testMachine_roundtripSingleEdge` |  | capdag.test.js:3278 |
| unnumbered | `testMachine_roundtripTwoEdgeChain` |  | capdag.test.js:3291 |
| unnumbered | `testMachine_serializationIsDeterministic` |  | capdag.test.js:3333 |
| unnumbered | `testMachine_serializeEmptyGraph` |  | capdag.test.js:3274 |
| unnumbered | `testMachine_serializeSingleEdge` | --- Machine serializer tests (mirrors serializer.rs tests) --- | capdag.test.js:3247 |
| unnumbered | `testMachine_serializeTwoEdgeChain` |  | capdag.test.js:3261 |
| unnumbered | `testMachine_simpleLinearChain` |  | capdag.test.js:2761 |
| unnumbered | `testMachine_toMermaid_emptyGraph` |  | capdag.test.js:3672 |
| unnumbered | `testMachine_toMermaid_fanIn` |  | capdag.test.js:3678 |
| unnumbered | `testMachine_toMermaid_fanOut` |  | capdag.test.js:3689 |
| unnumbered | `testMachine_toMermaid_linearChain` | ============================================================================ Phase 0C: Machine.toMermaid() tests ============================================================================ | capdag.test.js:3646 |
| unnumbered | `testMachine_toMermaid_loopEdge` |  | capdag.test.js:3661 |
| unnumbered | `testMachine_twoStepChain` |  | capdag.test.js:2776 |
| unnumbered | `testMachine_undefinedAliasFails` |  | capdag.test.js:2840 |
| unnumbered | `testMachine_unterminatedBracketFails` |  | capdag.test.js:2898 |
| unnumbered | `testMachine_whitespaceOnly` |  | capdag.test.js:2739 |
| unnumbered | `testRenderer_buildEditorGraphData_capWithoutCompleteArgsIsDropped` |  | capdag.test.js:4969 |
| unnumbered | `testRenderer_buildEditorGraphData_cardinalityFromDataSlotSequenceFlags` |  | capdag.test.js:4950 |
| unnumbered | `testRenderer_buildEditorGraphData_collapsesCapsIntoLabeledEdges` |  | capdag.test.js:4894 |
| unnumbered | `testRenderer_buildEditorGraphData_loopMarkedEdgeGetsLoopClass` |  | capdag.test.js:4932 |
| unnumbered | `testRenderer_buildEditorGraphData_rejectsEdgeWithMissingSource` |  | capdag.test.js:4986 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_duplicateNodeIdAcrossStrandsFailsHard` |  | capdag.test.js:5189 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_fanInProducesEdgePerAssignment` |  | capdag.test.js:5090 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_loopEdgeGetsLoopClass` |  | capdag.test.js:5057 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_multiStrandKeepsStrandsDisjoint` |  | capdag.test.js:5129 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_singleStrandLinearChain` | ---------------- resolved-machine builder ---------------- | capdag.test.js:5002 |
| unnumbered | `testRenderer_buildRunGraphData_allFailedDropsTargetPlaceholder` |  | capdag.test.js:4715 |
| unnumbered | `testRenderer_buildRunGraphData_backboneHasNoForeachNode` |  | capdag.test.js:4666 |
| unnumbered | `testRenderer_buildRunGraphData_closedForeachSuccessMergesAtCollectTarget` |  | capdag.test.js:4831 |
| unnumbered | `testRenderer_buildRunGraphData_failureWithoutFailedCapRendersFullTrace` |  | capdag.test.js:4580 |
| unnumbered | `testRenderer_buildRunGraphData_pagesSuccessesAndFailures` |  | capdag.test.js:4516 |
| unnumbered | `testRenderer_buildRunGraphData_unclosedForeachSuccessNoMerge` |  | capdag.test.js:4775 |
| unnumbered | `testRenderer_buildRunGraphData_usesCapUrnIsEquivalentForFailedCap` |  | capdag.test.js:4613 |
| unnumbered | `testRenderer_buildStrandGraphData_foreachCollectSpan` |  | capdag.test.js:4111 |
| unnumbered | `testRenderer_buildStrandGraphData_nestedForEachThrows` |  | capdag.test.js:4214 |
| unnumbered | `testRenderer_buildStrandGraphData_sequenceShowsCardinality` |  | capdag.test.js:4094 |
| unnumbered | `testRenderer_buildStrandGraphData_singleCapPlain` |  | capdag.test.js:4070 |
| unnumbered | `testRenderer_buildStrandGraphData_standaloneCollect` |  | capdag.test.js:4158 |
| unnumbered | `testRenderer_buildStrandGraphData_unclosedForEachBody` |  | capdag.test.js:4181 |
| unnumbered | `testRenderer_canonicalMediaUrn_normalizesTagOrder` |  | capdag.test.js:3906 |
| unnumbered | `testRenderer_canonicalMediaUrn_preservesValueTags` |  | capdag.test.js:3915 |
| unnumbered | `testRenderer_canonicalMediaUrn_rejectsCapUrn` |  | capdag.test.js:3920 |
| unnumbered | `testRenderer_cardinalityFromCap_findsStdinArgNotFirstArg` |  | capdag.test.js:3831 |
| unnumbered | `testRenderer_cardinalityFromCap_outputOnlySequence` |  | capdag.test.js:3863 |
| unnumbered | `testRenderer_cardinalityFromCap_rejectsStringIsSequence` |  | capdag.test.js:3874 |
| unnumbered | `testRenderer_cardinalityFromCap_scalarDefaultsWhenFieldsMissing` |  | capdag.test.js:3855 |
| unnumbered | `testRenderer_cardinalityFromCap_throwsOnNonObject` |  | capdag.test.js:3887 |
| unnumbered | `testRenderer_cardinalityLabel_allFourCases` |  | capdag.test.js:3816 |
| unnumbered | `testRenderer_cardinalityLabel_usesUnicodeArrow` |  | capdag.test.js:3823 |
| unnumbered | `testRenderer_classifyStrandCapSteps_capFlags` |  | capdag.test.js:4025 |
| unnumbered | `testRenderer_classifyStrandCapSteps_nestedForks` |  | capdag.test.js:4046 |
| unnumbered | `testRenderer_collapseStrand_plainCapDistinctTargetNoMerge` |  | capdag.test.js:4471 |
| unnumbered | `testRenderer_collapseStrand_plainCapMergesTrailingOutput` |  | capdag.test.js:4438 |
| unnumbered | `testRenderer_collapseStrand_sequenceProducingCapBeforeForeach` |  | capdag.test.js:4378 |
| unnumbered | `testRenderer_collapseStrand_singleCapBodyKeepsCapOwnLabel` |  | capdag.test.js:4239 |
| unnumbered | `testRenderer_collapseStrand_standaloneCollectCollapses` |  | capdag.test.js:4339 |
| unnumbered | `testRenderer_collapseStrand_unclosedForEachBodyCollapses` |  | capdag.test.js:4287 |
| unnumbered | `testRenderer_mediaNodeLabel_oneLinePerTag_valueAndMarker` |  | capdag.test.js:3932 |
| unnumbered | `testRenderer_mediaNodeLabel_stableAcrossTagOrder` |  | capdag.test.js:3943 |
| unnumbered | `testRenderer_validateBodyOutcome_rejectsNegativeIndex` | ---------------- run builder ---------------- | capdag.test.js:4506 |
| unnumbered | `testRenderer_validateEditorGraphPayload_rejectsUnknownKind` | ---------------- editor-graph builder ---------------- | capdag.test.js:4880 |
| unnumbered | `testRenderer_validateResolvedMachinePayload_rejectsMissingFields` |  | capdag.test.js:5224 |
| unnumbered | `testRenderer_validateStrandPayload_missingSourceSpec` |  | capdag.test.js:4493 |
| unnumbered | `testRenderer_validateStrandStep_rejectsUnknownVariant` |  | capdag.test.js:3986 |
| unnumbered | `testRenderer_validateStrandStep_requiresBooleanIsSequence` |  | capdag.test.js:4003 |
| unnumbered | `testUrn` |  | capdag.test.js:108 |
---

## Unnumbered Tests

The following tests are cataloged but do not currently participate in numeric test indexing.

- `testJS_argsPassedToExecuteCap` — capdag.test.js:1932
- `testJS_binaryArgPassedToExecuteCap` — capdag.test.js:1966
- `testJS_buildExtensionIndex` — capdag.test.js:1749
- `testJS_capDocumentationOmittedWhenNull` — capdag.test.js:1866
- `testJS_capDocumentationRoundTrip` — capdag.test.js:1844
- `testJS_capJSONSerialization` — capdag.test.js:1817
- `testJS_capWithMediaSpecs` — capdag.test.js:1803
- `testJS_getExtensionMappings` — capdag.test.js:1793
- `testJS_mediaSpecConstruction` — capdag.test.js:1999
- `testJS_mediaSpecDocumentationPropagatesThroughResolve` — capdag.test.js:1889
- `testJS_mediaUrnsForExtension` — capdag.test.js:1765
- `testJS_stdinSourceKindConstants` — capdag.test.js:1919
- `testJS_stdinSourceNullData` — capdag.test.js:1925
- `testMachine_aliasFallbackWithoutOpTag` — capdag.test.js:3387
- `testMachine_aliasFromOpTag` — capdag.test.js:3376
- `testMachine_builderChaining` — capdag.test.js:3444
- `testMachine_builderEquivalentToParsed` — capdag.test.js:3452
- `testMachine_builderRoundTrip` — capdag.test.js:3464
- `testMachine_builderSingleEdge` — capdag.test.js:3420
- `testMachine_builderWithLoop` — capdag.test.js:3432
- `testMachine_capRegistryClient_construction` — capdag.test.js:3745
- `testMachine_capRegistryEntry_construction` — capdag.test.js:3709
- `testMachine_capRegistryEntry_defaults` — capdag.test.js:3752
- `testMachine_capUrnInMediaUrn` — capdag.test.js:3491
- `testMachine_capUrnIsComparable` — capdag.test.js:3484
- `testMachine_capUrnIsEquivalent` — capdag.test.js:3476
- `testMachine_capUrnOutMediaUrn` — capdag.test.js:3498
- `testMachine_conflictingMediaTypesFail` — capdag.test.js:2857
- `testMachine_differentAliasesSameGraph` — capdag.test.js:2879
- `testMachine_displayEdge` — capdag.test.js:3223
- `testMachine_displayGraph` — capdag.test.js:3234
- `testMachine_duplicateAlias` — capdag.test.js:2750
- `testMachine_duplicateOpTagsDisambiguated` — capdag.test.js:3398
- `testMachine_edgeEquivalenceDifferentCapUrns` — capdag.test.js:3034
- `testMachine_edgeEquivalenceDifferentLoopFlag` — capdag.test.js:3066
- `testMachine_edgeEquivalenceDifferentSourceCount` — capdag.test.js:3098
- `testMachine_edgeEquivalenceDifferentTargets` — capdag.test.js:3050
- `testMachine_edgeEquivalenceSameUrns` — capdag.test.js:3018
- `testMachine_edgeEquivalenceSourceOrderIndependent` — capdag.test.js:3082
- `testMachine_emptyInput` — capdag.test.js:2735
- `testMachine_errorLocation_duplicateAlias` — capdag.test.js:3618
- `testMachine_errorLocation_parseError` — capdag.test.js:3608
- `testMachine_errorLocation_undefinedAlias` — capdag.test.js:3632
- `testMachine_fanInSecondaryAssignedByPriorWiring` — capdag.test.js:2807
- `testMachine_fanInSecondaryUnassignedGetsWildcard` — capdag.test.js:2820
- `testMachine_fanOut` — capdag.test.js:2790
- `testMachine_graphEmpty` — capdag.test.js:3171
- `testMachine_graphEmptyEquivalence` — capdag.test.js:3177
- `testMachine_graphEquivalenceReorderedEdges` — capdag.test.js:3129
- `testMachine_graphEquivalenceSameEdges` — capdag.test.js:3114
- `testMachine_graphNotEquivalentDifferentCap` — capdag.test.js:3158
- `testMachine_graphNotEquivalentDifferentEdgeCount` — capdag.test.js:3144
- `testMachine_headerOnlyNoWirings` — capdag.test.js:2743
- `testMachine_leafTargetsLinearChain` — capdag.test.js:3197
- `testMachine_lineBasedAndBracketedParseSameGraph` — capdag.test.js:2992
- `testMachine_lineBasedEquivalentToBracketed` — capdag.test.js:2960
- `testMachine_lineBasedFanIn` — capdag.test.js:2939
- `testMachine_lineBasedFormatSerialization` — capdag.test.js:2972
- `testMachine_lineBasedLoop` — capdag.test.js:2930
- `testMachine_lineBasedSimpleChain` — capdag.test.js:2907
- `testMachine_lineBasedTwoStepChain` — capdag.test.js:2920
- `testMachine_loopEdge` — capdag.test.js:2831
- `testMachine_malformedInputFails` — capdag.test.js:2891
- `testMachine_mediaRegistryEntry_construction` — capdag.test.js:3732
- `testMachine_mediaUrnIsComparable` — capdag.test.js:3515
- `testMachine_mediaUrnIsEquivalent` — capdag.test.js:3507
- `testMachine_mixedBracketedAndLineBased` — capdag.test.js:2952
- `testMachine_multilineFormat` — capdag.test.js:2869
- `testMachine_multilineSerializeFormat` — capdag.test.js:3362
- `testMachine_nodeAliasCollision` — capdag.test.js:2847
- `testMachine_parseMachineWithAST_aliasMap` — capdag.test.js:3578
- `testMachine_parseMachineWithAST_fanInSourceLocations` — capdag.test.js:3567
- `testMachine_parseMachineWithAST_headerLocation` — capdag.test.js:3528
- `testMachine_parseMachineWithAST_multilinePositions` — capdag.test.js:3558
- `testMachine_parseMachineWithAST_nodeMedia` — capdag.test.js:3596
- `testMachine_parseMachineWithAST_wiringLocation` — capdag.test.js:3544
- `testMachine_reorderedEdgesProduceSameNotation` — capdag.test.js:3346
- `testMachine_rootSourcesFanIn` — capdag.test.js:3211
- `testMachine_rootSourcesLinearChain` — capdag.test.js:3183
- `testMachine_roundtripFanOut` — capdag.test.js:3305
- `testMachine_roundtripLoopEdge` — capdag.test.js:3320
- `testMachine_roundtripSingleEdge` — capdag.test.js:3278
- `testMachine_roundtripTwoEdgeChain` — capdag.test.js:3291
- `testMachine_serializationIsDeterministic` — capdag.test.js:3333
- `testMachine_serializeEmptyGraph` — capdag.test.js:3274
- `testMachine_serializeSingleEdge` — capdag.test.js:3247
- `testMachine_serializeTwoEdgeChain` — capdag.test.js:3261
- `testMachine_simpleLinearChain` — capdag.test.js:2761
- `testMachine_toMermaid_emptyGraph` — capdag.test.js:3672
- `testMachine_toMermaid_fanIn` — capdag.test.js:3678
- `testMachine_toMermaid_fanOut` — capdag.test.js:3689
- `testMachine_toMermaid_linearChain` — capdag.test.js:3646
- `testMachine_toMermaid_loopEdge` — capdag.test.js:3661
- `testMachine_twoStepChain` — capdag.test.js:2776
- `testMachine_undefinedAliasFails` — capdag.test.js:2840
- `testMachine_unterminatedBracketFails` — capdag.test.js:2898
- `testMachine_whitespaceOnly` — capdag.test.js:2739
- `testRenderer_buildEditorGraphData_capWithoutCompleteArgsIsDropped` — capdag.test.js:4969
- `testRenderer_buildEditorGraphData_cardinalityFromDataSlotSequenceFlags` — capdag.test.js:4950
- `testRenderer_buildEditorGraphData_collapsesCapsIntoLabeledEdges` — capdag.test.js:4894
- `testRenderer_buildEditorGraphData_loopMarkedEdgeGetsLoopClass` — capdag.test.js:4932
- `testRenderer_buildEditorGraphData_rejectsEdgeWithMissingSource` — capdag.test.js:4986
- `testRenderer_buildResolvedMachineGraphData_duplicateNodeIdAcrossStrandsFailsHard` — capdag.test.js:5189
- `testRenderer_buildResolvedMachineGraphData_fanInProducesEdgePerAssignment` — capdag.test.js:5090
- `testRenderer_buildResolvedMachineGraphData_loopEdgeGetsLoopClass` — capdag.test.js:5057
- `testRenderer_buildResolvedMachineGraphData_multiStrandKeepsStrandsDisjoint` — capdag.test.js:5129
- `testRenderer_buildResolvedMachineGraphData_singleStrandLinearChain` — capdag.test.js:5002
- `testRenderer_buildRunGraphData_allFailedDropsTargetPlaceholder` — capdag.test.js:4715
- `testRenderer_buildRunGraphData_backboneHasNoForeachNode` — capdag.test.js:4666
- `testRenderer_buildRunGraphData_closedForeachSuccessMergesAtCollectTarget` — capdag.test.js:4831
- `testRenderer_buildRunGraphData_failureWithoutFailedCapRendersFullTrace` — capdag.test.js:4580
- `testRenderer_buildRunGraphData_pagesSuccessesAndFailures` — capdag.test.js:4516
- `testRenderer_buildRunGraphData_unclosedForeachSuccessNoMerge` — capdag.test.js:4775
- `testRenderer_buildRunGraphData_usesCapUrnIsEquivalentForFailedCap` — capdag.test.js:4613
- `testRenderer_buildStrandGraphData_foreachCollectSpan` — capdag.test.js:4111
- `testRenderer_buildStrandGraphData_nestedForEachThrows` — capdag.test.js:4214
- `testRenderer_buildStrandGraphData_sequenceShowsCardinality` — capdag.test.js:4094
- `testRenderer_buildStrandGraphData_singleCapPlain` — capdag.test.js:4070
- `testRenderer_buildStrandGraphData_standaloneCollect` — capdag.test.js:4158
- `testRenderer_buildStrandGraphData_unclosedForEachBody` — capdag.test.js:4181
- `testRenderer_canonicalMediaUrn_normalizesTagOrder` — capdag.test.js:3906
- `testRenderer_canonicalMediaUrn_preservesValueTags` — capdag.test.js:3915
- `testRenderer_canonicalMediaUrn_rejectsCapUrn` — capdag.test.js:3920
- `testRenderer_cardinalityFromCap_findsStdinArgNotFirstArg` — capdag.test.js:3831
- `testRenderer_cardinalityFromCap_outputOnlySequence` — capdag.test.js:3863
- `testRenderer_cardinalityFromCap_rejectsStringIsSequence` — capdag.test.js:3874
- `testRenderer_cardinalityFromCap_scalarDefaultsWhenFieldsMissing` — capdag.test.js:3855
- `testRenderer_cardinalityFromCap_throwsOnNonObject` — capdag.test.js:3887
- `testRenderer_cardinalityLabel_allFourCases` — capdag.test.js:3816
- `testRenderer_cardinalityLabel_usesUnicodeArrow` — capdag.test.js:3823
- `testRenderer_classifyStrandCapSteps_capFlags` — capdag.test.js:4025
- `testRenderer_classifyStrandCapSteps_nestedForks` — capdag.test.js:4046
- `testRenderer_collapseStrand_plainCapDistinctTargetNoMerge` — capdag.test.js:4471
- `testRenderer_collapseStrand_plainCapMergesTrailingOutput` — capdag.test.js:4438
- `testRenderer_collapseStrand_sequenceProducingCapBeforeForeach` — capdag.test.js:4378
- `testRenderer_collapseStrand_singleCapBodyKeepsCapOwnLabel` — capdag.test.js:4239
- `testRenderer_collapseStrand_standaloneCollectCollapses` — capdag.test.js:4339
- `testRenderer_collapseStrand_unclosedForEachBodyCollapses` — capdag.test.js:4287
- `testRenderer_mediaNodeLabel_oneLinePerTag_valueAndMarker` — capdag.test.js:3932
- `testRenderer_mediaNodeLabel_stableAcrossTagOrder` — capdag.test.js:3943
- `testRenderer_validateBodyOutcome_rejectsNegativeIndex` — capdag.test.js:4506
- `testRenderer_validateEditorGraphPayload_rejectsUnknownKind` — capdag.test.js:4880
- `testRenderer_validateResolvedMachinePayload_rejectsMissingFields` — capdag.test.js:5224
- `testRenderer_validateStrandPayload_missingSourceSpec` — capdag.test.js:4493
- `testRenderer_validateStrandStep_rejectsUnknownVariant` — capdag.test.js:3986
- `testRenderer_validateStrandStep_requiresBooleanIsSequence` — capdag.test.js:4003
- `testUrn` — capdag.test.js:108

---

*Generated from CapDag-JS source tree*
*Total tests: 306*
*Total numbered tests: 159*
*Total unnumbered tests: 147*
