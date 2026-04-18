# CapDag-JS Test Catalog

**Total Tests:** 312

**Numbered Tests:** 163

**Unnumbered Tests:** 149

All numbered test numbers are unique.

This catalog lists all tests in the CapDag-JS codebase.

| Test # | Function Name | Description | File |
|--------|---------------|-------------|------|
| test001 | `test001_capUrnCreation` | TEST001: Test that cap URN is created with tags parsed correctly and direction specs accessible | capdag.test.js:155 |
| test002 | `test002_directionSpecsRequired` | TEST002: Test that missing 'in' or 'out' defaults to media: wildcard | capdag.test.js:165 |
| test003 | `test003_directionMatching` | TEST003: Test that direction specs must match exactly, different in/out types don't match, wildcard matches any | capdag.test.js:176 |
| test004 | `test004_unquotedValuesLowercased` | TEST004: Test that unquoted keys and values are normalized to lowercase | capdag.test.js:191 |
| test005 | `test005_quotedValuesPreserveCase` | TEST005: Test that quoted values preserve case while unquoted are lowercased | capdag.test.js:200 |
| test006 | `test006_quotedValueSpecialChars` | TEST006: Test that quoted values can contain special characters (semicolons, equals, spaces) | capdag.test.js:206 |
| test007 | `test007_quotedValueEscapeSequences` | TEST007: Test that escape sequences in quoted values (\" and \\) are parsed correctly | capdag.test.js:212 |
| test008 | `test008_mixedQuotedUnquoted` | TEST008: Test that mixed quoted and unquoted values in same URN parse correctly | capdag.test.js:219 |
| test009 | `test009_unterminatedQuoteError` | TEST009: Test that unterminated quote produces UnterminatedQuote error | capdag.test.js:226 |
| test010 | `test010_invalidEscapeSequenceError` | TEST010: Test that invalid escape sequences (like \n, \x) produce InvalidEscapeSequence error | capdag.test.js:239 |
| test011 | `test011_serializationSmartQuoting` | TEST011: Test that serialization uses smart quoting (no quotes for simple lowercase, quotes for special chars/uppercase) | capdag.test.js:253 |
| test012 | `test012_roundTripSimple` | TEST012: Test that simple cap URN round-trips (parse -> serialize -> parse equals original) | capdag.test.js:262 |
| test013 | `test013_roundTripQuoted` | TEST013: Test that quoted values round-trip preserving case and spaces | capdag.test.js:270 |
| test014 | `test014_roundTripEscapes` | TEST014: Test that escape sequences round-trip correctly | capdag.test.js:279 |
| test015 | `test015_capPrefixRequired` | TEST015: Test that cap: prefix is required and case-insensitive | capdag.test.js:289 |
| test016 | `test016_trailingSemicolonEquivalence` | TEST016: Test that trailing semicolon is equivalent (same hash, same string, matches) | capdag.test.js:301 |
| test017 | `test017_tagMatching` | TEST017: Test tag matching: exact match, subset match, wildcard match, value mismatch | capdag.test.js:309 |
| test018 | `test018_matchingCaseSensitiveValues` | TEST018: Test that quoted values with different case do NOT match (case-sensitive) | capdag.test.js:333 |
| test019 | `test019_missingTagHandling` | TEST019: Missing tag in instance causes rejection — pattern's tags are constraints | capdag.test.js:340 |
| test020 | `test020_specificity` | TEST020: Test specificity calculation (direction specs use MediaUrn tag count, wildcards don't count) | capdag.test.js:353 |
| test021 | `test021_builder` | TEST021: Test builder creates cap URN with correct tags and direction specs | capdag.test.js:372 |
| test022 | `test022_builderRequiresDirection` | TEST022: Test builder requires both in_spec and out_spec | capdag.test.js:386 |
| test023 | `test023_builderPreservesCase` | TEST023: Test builder lowercases keys but preserves value case | capdag.test.js:400 |
| test024 | `test024_compatibility` | TEST024: Directional accepts — pattern's tags are constraints, instance must satisfy | capdag.test.js:411 |
| test025 | `test025_bestMatch` | TEST025: Test find_best_match returns most specific matching cap | capdag.test.js:431 |
| test026 | `test026_mergeAndSubset` | TEST026: Test merge combines tags from both caps, subset keeps only specified tags | capdag.test.js:444 |
| test027 | `test027_wildcardTag` | TEST027: Test with_wildcard_tag sets tag to wildcard, including in/out | capdag.test.js:463 |
| test028 | `test028_emptyCapUrnNotAllowed` | TEST028: Test empty cap URN defaults to media: wildcard | capdag.test.js:476 |
| test029 | `test029_minimalCapUrn` | TEST029: Test minimal valid cap URN has just in and out, empty tags | capdag.test.js:483 |
| test030 | `test030_extendedCharacterSupport` | TEST030: Test extended characters (forward slashes, colons) in tag values | capdag.test.js:491 |
| test031 | `test031_wildcardRestrictions` | TEST031: Test wildcard rejected in keys but accepted in values | capdag.test.js:498 |
| test032 | `test032_duplicateKeyRejection` | TEST032: Test duplicate keys are rejected with DuplicateKey error | capdag.test.js:516 |
| test033 | `test033_numericKeyRestriction` | TEST033: Test pure numeric keys rejected, mixed alphanumeric allowed, numeric values allowed | capdag.test.js:525 |
| test034 | `test034_emptyValueError` | TEST034: Test empty values are rejected | capdag.test.js:539 |
| test035 | `test035_hasTagCaseSensitive` | TEST035: Test has_tag is case-sensitive for values, case-insensitive for keys, works for in/out | capdag.test.js:552 |
| test036 | `test036_withTagPreservesValue` | TEST036: Test with_tag preserves value case | capdag.test.js:564 |
| test037 | `test037_withTagRejectsEmptyValue` | TEST037: Test with_tag rejects empty value | capdag.test.js:571 |
| test038 | `test038_semanticEquivalence` | TEST038: Test semantic equivalence of unquoted and quoted simple lowercase values | capdag.test.js:581 |
| test039 | `test039_getTagReturnsDirectionSpecs` | TEST039: Test get_tag returns direction specs (in/out) with case-insensitive lookup | capdag.test.js:589 |
| test040 | `test040_matchingSemanticsExactMatch` | TEST040: Matching semantics - exact match succeeds | capdag.test.js:598 |
| test041 | `test041_matchingSemanticsCapMissingTag` | TEST041: Matching semantics - cap missing tag matches (implicit wildcard) | capdag.test.js:605 |
| test042 | `test042_matchingSemanticsCapHasExtraTag` | TEST042: Pattern rejects instance missing required tags | capdag.test.js:613 |
| test043 | `test043_matchingSemanticsRequestHasWildcard` | TEST043: Matching semantics - request wildcard matches specific cap value | capdag.test.js:621 |
| test044 | `test044_matchingSemanticsCapHasWildcard` | TEST044: Matching semantics - cap wildcard matches specific request value | capdag.test.js:628 |
| test045 | `test045_matchingSemanticsValueMismatch` | TEST045: Matching semantics - value mismatch does not match | capdag.test.js:635 |
| test046 | `test046_matchingSemanticsFallbackPattern` | TEST046: Matching semantics - fallback pattern (cap missing tag = implicit wildcard) | capdag.test.js:642 |
| test047 | `test047_matchingSemanticsThumbnailVoidInput` | TEST047: Matching semantics - thumbnail fallback with void input | capdag.test.js:650 |
| test048 | `test048_matchingSemanticsWildcardDirection` | TEST048: Matching semantics - wildcard direction matches anything | capdag.test.js:657 |
| test049 | `test049_matchingSemanticsCrossDimension` | TEST049: Non-overlapping tags — neither direction accepts | capdag.test.js:664 |
| test050 | `test050_matchingSemanticsDirectionMismatch` | TEST050: Matching semantics - direction mismatch prevents matching | capdag.test.js:672 |
| test054 | `test054_xv5InlineSpecRedefinitionDetected` | TEST054: XV5 - Test inline media spec redefinition of existing registry spec is detected and rejected | capdag.test.js:761 |
| test055 | `test055_xv5NewInlineSpecAllowed` | TEST055: XV5 - Test new inline media spec (not in registry) is allowed | capdag.test.js:778 |
| test056 | `test056_xv5EmptyMediaSpecsAllowed` | TEST056: XV5 - Test empty media_specs (no inline specs) passes XV5 validation | capdag.test.js:793 |
| test060 | `test060_wrongPrefixFails` | TEST060: Test wrong prefix fails with InvalidPrefix error showing expected and actual prefix | capdag.test.js:805 |
| test061 | `test061_isBinary` | TEST061: Test is_binary returns true when textable tag is absent (binary = not textable) | capdag.test.js:814 |
| test062 | `test062_isRecord` | TEST062: Test is_record returns true when record marker tag is present indicating key-value structure | capdag.test.js:830 |
| test063 | `test063_isScalar` | TEST063: Test is_scalar returns true when list marker tag is absent (scalar is default) | capdag.test.js:841 |
| test064 | `test064_isList` | TEST064: Test is_list returns true when list marker tag is present indicating ordered collection | capdag.test.js:854 |
| test065 | `test065_isOpaque` | TEST065: Test is_opaque returns true when record marker is absent (opaque is default) | capdag.test.js:863 |
| test066 | `test066_isJson` | TEST066: Test is_json returns true only when json marker tag is present for JSON representation | capdag.test.js:874 |
| test067 | `test067_isText` | TEST067: Test is_text returns true only when textable marker tag is present | capdag.test.js:880 |
| test068 | `test068_isVoid` | TEST068: Test is_void returns true when void flag or type=void tag is present | capdag.test.js:891 |
| test071 | `test071_toStringRoundtrip` | TEST071: Test to_string roundtrip ensures serialization and deserialization preserve URN structure | capdag.test.js:899 |
| test072 | `test072_constantsParse` | TEST072: Test all media URN constants parse successfully as valid media URNs | capdag.test.js:909 |
| test074 | `test074_mediaUrnMatching` | TEST074: Test media URN conforms_to using tagged URN semantics with specific and generic requirements | capdag.test.js:929 |
| test075 | `test075_accepts` | TEST075: Test accepts with implicit wildcards where handlers with fewer tags can handle more requests | capdag.test.js:943 |
| test076 | `test076_specificity` | TEST076: Test specificity increases with more tags for ranking conformance | capdag.test.js:954 |
| test077 | `test077_serdeRoundtrip` | TEST077: Test serde roundtrip serializes to JSON string and deserializes back correctly | capdag.test.js:963 |
| test078 | `test078_debugMatchingBehavior` | TEST078: conforms_to behavior between MEDIA_OBJECT and MEDIA_STRING | capdag.test.js:972 |
| test091 | `test091_resolveCustomMediaSpec` | TEST091: resolveMediaUrn resolves custom from local mediaSpecs | capdag.test.js:987 |
| test092 | `test092_resolveCustomWithSchema` | TEST092: resolveMediaUrn resolves with schema from local mediaSpecs | capdag.test.js:997 |
| test093 | `test093_resolveUnresolvableFailsHard` | TEST093: resolveMediaUrn fails hard on unknown URN | capdag.test.js:1014 |
| test099 | `test099_resolvedIsBinary` | TEST099: MediaSpec with media: (no textable tag) -> isBinary() true | capdag.test.js:1033 |
| test100 | `test100_resolvedIsRecord` | TEST100: MediaSpec with record -> isRecord() true | capdag.test.js:1039 |
| test101 | `test101_resolvedIsScalar` | TEST101: MediaSpec with form=scalar -> isScalar() true | capdag.test.js:1045 |
| test102 | `test102_resolvedIsList` | TEST102: MediaSpec with list -> isList() true | capdag.test.js:1051 |
| test103 | `test103_resolvedIsJson` | TEST103: MediaSpec with json tag -> isJSON() true | capdag.test.js:1057 |
| test104 | `test104_resolvedIsText` | TEST104: MediaSpec with textable tag -> isText() true | capdag.test.js:1063 |
| test105 | `test105_metadataPropagation` | TEST105: Metadata propagated from media spec definition | capdag.test.js:1069 |
| test106 | `test106_metadataWithValidation` | TEST106: Metadata and validation coexist | capdag.test.js:1092 |
| test107 | `test107_extensionsPropagation` | TEST107: Extensions field propagated | capdag.test.js:1111 |
| test108 | `test108_extensionsSerialization` | TEST108: N/A for JS (Rust serde) - but we test MediaSpec with extensions | capdag.test.js:1127 |
| test109 | `test109_extensionsWithMetadataAndValidation` | TEST109: Extensions coexist with metadata and validation | capdag.test.js:1135 |
| test110 | `test110_multipleExtensions` | TEST110: Multiple extensions in a media spec | capdag.test.js:1154 |
| test117 | `test117_capBlockMoreSpecificWins` | TEST117: CapBlock finds more specific cap across registries | capdag.test.js:1174 |
| test118 | `test118_capBlockTieGoesToFirst` | TEST118: CapBlock tie-breaking prefers first registry in order | capdag.test.js:1204 |
| test119 | `test119_capBlockPollsAll` | TEST119: CapBlock polls all registries to find best match | capdag.test.js:1225 |
| test120 | `test120_capBlockNoMatch` | TEST120: CapBlock returns error when no cap matches request | capdag.test.js:1252 |
| test121 | `test121_capBlockFallbackScenario` | TEST121: CapBlock fallback scenario where generic cap handles unknown file types | capdag.test.js:1267 |
| test122 | `test122_capBlockCanMethod` | TEST122: CapBlock can method returns execution info and acceptsRequest checks capability | capdag.test.js:1299 |
| test123 | `test123_capBlockRegistryManagement` | TEST123: CapBlock registry management add, get, remove operations | capdag.test.js:1316 |
| test124 | `test124_capGraphBasicConstruction` | TEST124: CapGraph basic construction builds nodes and edges from caps | capdag.test.js:1335 |
| test125 | `test125_capGraphOutgoingIncoming` | TEST125: CapGraph getOutgoing and getIncoming return correct edges for media URN | capdag.test.js:1354 |
| test126 | `test126_capGraphCanConvert` | TEST126: CapGraph canConvert checks direct and transitive conversion paths | capdag.test.js:1372 |
| test127 | `test127_capGraphFindPath` | TEST127: CapGraph findPath returns shortest path between media URNs | capdag.test.js:1393 |
| test128 | `test128_capGraphFindAllPaths` | TEST128: CapGraph findAllPaths returns all paths sorted by length | capdag.test.js:1426 |
| test129 | `test129_capGraphGetDirectEdges` | TEST129: CapGraph getDirectEdges returns edges sorted by specificity | capdag.test.js:1446 |
| test130 | `test130_capGraphStats` | TEST130: CapGraph stats returns node count, edge count, input/output URN counts | capdag.test.js:1471 |
| test131 | `test131_capGraphWithCapBlock` | TEST131: CapGraph with CapBlock builds graph from multiple registries | capdag.test.js:1492 |
| test156 | `test156_stdinSourceFromData` | TEST156: Creating StdinSource Data variant with byte vector | capdag.test.js:1526 |
| test157 | `test157_stdinSourceFromFileReference` | TEST157: Creating StdinSource FileReference variant with all required fields | capdag.test.js:1537 |
| test158 | `test158_stdinSourceWithEmptyData` | TEST158: StdinSource Data with empty vector stores and retrieves correctly | capdag.test.js:1554 |
| test159 | `test159_stdinSourceWithBinaryContent` | TEST159: StdinSource Data with binary content like PNG header bytes | capdag.test.js:1562 |
| test274 | `test274_capArgumentValueNew` | TEST274: CapArgumentValue constructor stores media_urn and raw byte value | capdag.test.js:1576 |
| test275 | `test275_capArgumentValueFromStr` | TEST275: CapArgumentValue.fromStr converts string to UTF-8 bytes | capdag.test.js:1583 |
| test276 | `test276_capArgumentValueAsStrValid` | TEST276: CapArgumentValue.valueAsStr succeeds for UTF-8 data | capdag.test.js:1590 |
| test277 | `test277_capArgumentValueAsStrInvalidUtf8` | TEST277: CapArgumentValue.valueAsStr fails for non-UTF-8 binary data | capdag.test.js:1596 |
| test278 | `test278_capArgumentValueEmpty` | TEST278: CapArgumentValue with empty value stores empty Uint8Array | capdag.test.js:1608 |
| test282 | `test282_capArgumentValueUnicode` | TEST282: CapArgumentValue.fromStr with Unicode string preserves all characters | capdag.test.js:1617 |
| test283 | `test283_capArgumentValueLargeBinary` | TEST283: CapArgumentValue with large binary payload preserves all bytes | capdag.test.js:1623 |
| test304 | `test304_mediaAvailabilityOutputConstant` | TEST304: MEDIA_AVAILABILITY_OUTPUT constant parses as valid media URN with correct tags | capdag.test.js:1642 |
| test305 | `test305_mediaPathOutputConstant` | TEST305: MEDIA_PATH_OUTPUT constant parses as valid media URN with correct tags | capdag.test.js:1652 |
| test306 | `test306_availabilityAndPathOutputDistinct` | TEST306: MEDIA_AVAILABILITY_OUTPUT and MEDIA_PATH_OUTPUT are distinct URNs | capdag.test.js:1662 |
| test307 | `test307_modelAvailabilityUrn` | TEST307: model_availability_urn builds valid cap URN with correct op and media specs | capdag.test.js:1676 |
| test308 | `test308_modelPathUrn` | TEST308: model_path_urn builds valid cap URN with correct op and media specs | capdag.test.js:1688 |
| test309 | `test309_modelAvailabilityAndPathAreDistinct` | TEST309: model_availability_urn and model_path_urn produce distinct URNs | capdag.test.js:1700 |
| test310 | `test310_llmGenerateTextUrn` | TEST310: llm_generate_text_urn has correct op and ml-model tags | capdag.test.js:1707 |
| test312 | `test312_allUrnBuildersProduceValidUrns` | TEST312: All URN builders produce parseable cap URNs | capdag.test.js:1726 |
| test320 | `test320_cartridgeInfoConstruction` | TEST320: Cartridge info construction | capdag.test.js:2091 |
| test321 | `test321_cartridgeInfoIsSigned` | TEST321: Cartridge info is signed check | capdag.test.js:2118 |
| test322 | `test322_cartridgeInfoBuildForPlatform` | TEST322: Cartridge info build for platform and available platforms | capdag.test.js:2130 |
| test323 | `test323_cartridgeRepoServerValidateRegistry` | TEST323: CartridgeRepoServer validate registry | capdag.test.js:2164 |
| test324 | `test324_cartridgeRepoServerTransformToArray` | TEST324: CartridgeRepoServer transform to array | capdag.test.js:2191 |
| test325 | `test325_cartridgeRepoServerGetCartridges` | TEST325: CartridgeRepoServer get cartridges | capdag.test.js:2216 |
| test326 | `test326_cartridgeRepoServerGetCartridgeById` | TEST326: CartridgeRepoServer get cartridge by ID | capdag.test.js:2226 |
| test327 | `test327_cartridgeRepoServerSearchCartridges` | TEST327: CartridgeRepoServer search cartridges | capdag.test.js:2238 |
| test328 | `test328_cartridgeRepoServerGetByCategory` | TEST328: CartridgeRepoServer get by category | capdag.test.js:2253 |
| test329 | `test329_cartridgeRepoServerGetByCap` | TEST329: CartridgeRepoServer get by cap | capdag.test.js:2266 |
| test330 | `test330_cartridgeRepoClientUpdateCache` | TEST330: CartridgeRepoClient update cache | capdag.test.js:2281 |
| test331 | `test331_cartridgeRepoClientGetSuggestions` | TEST331: CartridgeRepoClient get suggestions | capdag.test.js:2295 |
| test332 | `test332_cartridgeRepoClientGetCartridge` | TEST332: CartridgeRepoClient get cartridge | capdag.test.js:2312 |
| test333 | `test333_cartridgeRepoClientGetAllCaps` | TEST333: CartridgeRepoClient get all caps | capdag.test.js:2328 |
| test334 | `test334_cartridgeRepoClientNeedsSync` | TEST334: CartridgeRepoClient needs sync | capdag.test.js:2342 |
| test335 | `test335_cartridgeRepoServerClientIntegration` | TEST335: CartridgeRepoServer and Client integration | capdag.test.js:2363 |
| test546 | `test546_isImage` | TEST546: isImage returns true only when image marker tag is present | capdag.test.js:2396 |
| test547 | `test547_isAudio` | TEST547: isAudio returns true only when audio marker tag is present | capdag.test.js:2408 |
| test548 | `test548_isVideo` | TEST548: isVideo returns true only when video marker tag is present | capdag.test.js:2419 |
| test549 | `test549_isNumeric` | TEST549: isNumeric returns true only when numeric marker tag is present | capdag.test.js:2429 |
| test550 | `test550_isBool` | TEST550: isBool returns true only when bool marker tag is present | capdag.test.js:2441 |
| test551 | `test551_isFilePath` | TEST551: isFilePath returns true for scalar file-path, false for array | capdag.test.js:2453 |
| test552 | `test552_isFilePathArray` | TEST552: isFilePathArray returns true for list file-path, false for scalar | capdag.test.js:2463 |
| test553 | `test553_isAnyFilePath` | TEST553: isAnyFilePath returns true for both scalar and array file-path | capdag.test.js:2472 |
| test558 | `test558_predicateConstantConsistency` | TEST558: predicates are consistent with constants - every constant triggers exactly the expected predicates | capdag.test.js:2493 |
| test559 | `test559_withoutTag` | TEST559: without_tag removes tag, ignores in/out, case-insensitive for keys | capdag.test.js:2533 |
| test560 | `test560_withInOutSpec` | TEST560: with_in_spec and with_out_spec change direction specs | capdag.test.js:2555 |
| test563 | `test563_findAllMatches` | TEST563: CapMatcher::find_all_matches returns all matching caps sorted by specificity | capdag.test.js:2578 |
| test564 | `test564_areCompatible` | TEST564: CapMatcher::are_compatible detects bidirectional overlap | capdag.test.js:2596 |
| test566 | `test566_withTagIgnoresInOut` | TEST566: with_tag silently ignores in/out keys | capdag.test.js:2621 |
| test639 | `test639_emptyCapDefaultsToMediaWildcard` | TEST639: cap: (empty) defaults to in=media:;out=media: | capdag.test.js:2638 |
| test640 | `test640_inOnlyDefaultsOutToMedia` | TEST640: cap:in defaults out to media: | capdag.test.js:2646 |
| test641 | `test641_outOnlyDefaultsInToMedia` | TEST641: cap:out defaults in to media: | capdag.test.js:2653 |
| test642 | `test642_inOutWithoutValuesBecomeMedia` | TEST642: cap:in;out both become media: | capdag.test.js:2660 |
| test643 | `test643_explicitAsteriskIsWildcard` | TEST643: cap:in=*;out=* becomes media: | capdag.test.js:2667 |
| test644 | `test644_specificInWildcardOut` | TEST644: cap:in=media:;out=* has specific in, wildcard out | capdag.test.js:2674 |
| test645 | `test645_wildcardInSpecificOut` | TEST645: cap:in=*;out=media:text has wildcard in, specific out | capdag.test.js:2681 |
| test646 | `test646_invalidInSpecFails` | TEST646: cap:in=foo fails (invalid media URN) | capdag.test.js:2688 |
| test647 | `test647_invalidOutSpecFails` | TEST647: cap:in=media:;out=bar fails (invalid media URN) | capdag.test.js:2697 |
| test648 | `test648_wildcardAcceptsSpecific` | TEST648: Wildcard in/out match specific caps | capdag.test.js:2706 |
| test649 | `test649_specificityScoring` | TEST649: Specificity - wildcard has 0, specific has tag count | capdag.test.js:2715 |
| test651 | `test651_identityFormsEquivalent` | TEST651: All identity forms produce the same CapUrn | capdag.test.js:2726 |
| test653 | `test653_identityRoutingIsolation` | TEST653: Identity (no tags) does not match specific requests via routing | capdag.test.js:2746 |
| test890 | `test890_directionSemanticMatching` | TEST890: Semantic direction matching - generic provider matches specific request | capdag.test.js:683 |
| test891 | `test891_directionSemanticSpecificity` | TEST891: Semantic direction specificity - more media URN tags = higher specificity | capdag.test.js:733 |
| | | | |
| unnumbered | `testJS_argsPassedToExecuteCap` |  | capdag.test.js:1929 |
| unnumbered | `testJS_binaryArgPassedToExecuteCap` |  | capdag.test.js:1963 |
| unnumbered | `testJS_buildExtensionIndex` | These tests cover JS-specific functionality not in the Rust numbering scheme but are important for capdag-js correctness. | capdag.test.js:1746 |
| unnumbered | `testJS_capDocumentationOmittedWhenNull` | When documentation is null, toJSON must omit the field entirely. This matches the Rust serializer's skip-when-None semantics and the ObjC toDictionary behaviour. A regression where null is emitted as `documentation: null` would break the symmetric round-trip with Rust (which has no null sentinel) and pollute generated JSON. | capdag.test.js:1863 |
| unnumbered | `testJS_capDocumentationRoundTrip` | JS round-trip for the documentation field on Cap. Mirrors TEST920 in capdag/src/cap/definition.rs — the body is non-trivial (newlines, backticks, embedded quotes, Unicode) so escaping mismatches between JSON.stringify on this side and the Rust serializer on the other side surface as failures here. | capdag.test.js:1841 |
| unnumbered | `testJS_capJSONSerialization` |  | capdag.test.js:1814 |
| unnumbered | `testJS_capWithMediaSpecs` |  | capdag.test.js:1800 |
| unnumbered | `testJS_getExtensionMappings` |  | capdag.test.js:1790 |
| unnumbered | `testJS_mediaSpecConstruction` |  | capdag.test.js:1996 |
| unnumbered | `testJS_mediaSpecDocumentationPropagatesThroughResolve` | Documentation propagates from a mediaSpecs definition through resolveMediaUrn into the resolved MediaSpec. Mirrors TEST924 on the Rust side. This is the path every UI consumer uses, so a break here makes the new field invisible everywhere downstream. | capdag.test.js:1886 |
| unnumbered | `testJS_mediaUrnsForExtension` |  | capdag.test.js:1762 |
| unnumbered | `testJS_stdinSourceKindConstants` |  | capdag.test.js:1916 |
| unnumbered | `testJS_stdinSourceNullData` |  | capdag.test.js:1922 |
| unnumbered | `testLlmGenerateTextUrnSpecs` | Mirror-specific coverage: llm_generate_text_urn input/output specs conform to MEDIA_STRING | capdag.test.js:1715 |
| unnumbered | `testMachine_aliasFallbackWithoutOpTag` |  | capdag.test.js:3422 |
| unnumbered | `testMachine_aliasFromOpTag` |  | capdag.test.js:3411 |
| unnumbered | `testMachine_builderChaining` |  | capdag.test.js:3479 |
| unnumbered | `testMachine_builderEquivalentToParsed` |  | capdag.test.js:3487 |
| unnumbered | `testMachine_builderRoundTrip` |  | capdag.test.js:3499 |
| unnumbered | `testMachine_builderSingleEdge` | --- Machine builder tests --- | capdag.test.js:3455 |
| unnumbered | `testMachine_builderWithLoop` |  | capdag.test.js:3467 |
| unnumbered | `testMachine_capRegistryClient_construction` |  | capdag.test.js:3780 |
| unnumbered | `testMachine_capRegistryEntry_construction` | ============================================================================ Phase 0B: CapRegistryClient tests ============================================================================ | capdag.test.js:3744 |
| unnumbered | `testMachine_capRegistryEntry_defaults` |  | capdag.test.js:3787 |
| unnumbered | `testMachine_capUrnInMediaUrn` |  | capdag.test.js:3526 |
| unnumbered | `testMachine_capUrnIsComparable` |  | capdag.test.js:3519 |
| unnumbered | `testMachine_capUrnIsEquivalent` | --- CapUrn.isEquivalent/isComparable tests --- | capdag.test.js:3511 |
| unnumbered | `testMachine_capUrnOutMediaUrn` |  | capdag.test.js:3533 |
| unnumbered | `testMachine_conflictingMediaTypesFail` |  | capdag.test.js:2892 |
| unnumbered | `testMachine_differentAliasesSameGraph` |  | capdag.test.js:2914 |
| unnumbered | `testMachine_displayEdge` |  | capdag.test.js:3258 |
| unnumbered | `testMachine_displayGraph` |  | capdag.test.js:3269 |
| unnumbered | `testMachine_duplicateAlias` |  | capdag.test.js:2785 |
| unnumbered | `testMachine_duplicateOpTagsDisambiguated` |  | capdag.test.js:3433 |
| unnumbered | `testMachine_edgeEquivalenceDifferentCapUrns` |  | capdag.test.js:3069 |
| unnumbered | `testMachine_edgeEquivalenceDifferentLoopFlag` |  | capdag.test.js:3101 |
| unnumbered | `testMachine_edgeEquivalenceDifferentSourceCount` |  | capdag.test.js:3133 |
| unnumbered | `testMachine_edgeEquivalenceDifferentTargets` |  | capdag.test.js:3085 |
| unnumbered | `testMachine_edgeEquivalenceSameUrns` | --- Machine graph tests (mirrors graph.rs tests) --- | capdag.test.js:3053 |
| unnumbered | `testMachine_edgeEquivalenceSourceOrderIndependent` |  | capdag.test.js:3117 |
| unnumbered | `testMachine_emptyInput` | --- Machine parser tests (mirrors parser.rs tests) --- | capdag.test.js:2770 |
| unnumbered | `testMachine_errorLocation_duplicateAlias` |  | capdag.test.js:3653 |
| unnumbered | `testMachine_errorLocation_parseError` |  | capdag.test.js:3643 |
| unnumbered | `testMachine_errorLocation_undefinedAlias` |  | capdag.test.js:3667 |
| unnumbered | `testMachine_fanInSecondaryAssignedByPriorWiring` |  | capdag.test.js:2842 |
| unnumbered | `testMachine_fanInSecondaryUnassignedGetsWildcard` |  | capdag.test.js:2855 |
| unnumbered | `testMachine_fanOut` |  | capdag.test.js:2825 |
| unnumbered | `testMachine_graphEmpty` |  | capdag.test.js:3206 |
| unnumbered | `testMachine_graphEmptyEquivalence` |  | capdag.test.js:3212 |
| unnumbered | `testMachine_graphEquivalenceReorderedEdges` |  | capdag.test.js:3164 |
| unnumbered | `testMachine_graphEquivalenceSameEdges` |  | capdag.test.js:3149 |
| unnumbered | `testMachine_graphNotEquivalentDifferentCap` |  | capdag.test.js:3193 |
| unnumbered | `testMachine_graphNotEquivalentDifferentEdgeCount` |  | capdag.test.js:3179 |
| unnumbered | `testMachine_headerOnlyNoWirings` |  | capdag.test.js:2778 |
| unnumbered | `testMachine_leafTargetsLinearChain` |  | capdag.test.js:3232 |
| unnumbered | `testMachine_lineBasedAndBracketedParseSameGraph` |  | capdag.test.js:3027 |
| unnumbered | `testMachine_lineBasedEquivalentToBracketed` |  | capdag.test.js:2995 |
| unnumbered | `testMachine_lineBasedFanIn` |  | capdag.test.js:2974 |
| unnumbered | `testMachine_lineBasedFormatSerialization` |  | capdag.test.js:3007 |
| unnumbered | `testMachine_lineBasedLoop` |  | capdag.test.js:2965 |
| unnumbered | `testMachine_lineBasedSimpleChain` | --- Machine parser line-based mode tests --- | capdag.test.js:2942 |
| unnumbered | `testMachine_lineBasedTwoStepChain` |  | capdag.test.js:2955 |
| unnumbered | `testMachine_loopEdge` |  | capdag.test.js:2866 |
| unnumbered | `testMachine_malformedInputFails` |  | capdag.test.js:2926 |
| unnumbered | `testMachine_mediaRegistryEntry_construction` |  | capdag.test.js:3767 |
| unnumbered | `testMachine_mediaUrnIsComparable` |  | capdag.test.js:3550 |
| unnumbered | `testMachine_mediaUrnIsEquivalent` | --- MediaUrn.isEquivalent/isComparable tests --- | capdag.test.js:3542 |
| unnumbered | `testMachine_mixedBracketedAndLineBased` |  | capdag.test.js:2987 |
| unnumbered | `testMachine_multilineFormat` |  | capdag.test.js:2904 |
| unnumbered | `testMachine_multilineSerializeFormat` |  | capdag.test.js:3397 |
| unnumbered | `testMachine_nodeAliasCollision` |  | capdag.test.js:2882 |
| unnumbered | `testMachine_parseMachineWithAST_aliasMap` |  | capdag.test.js:3613 |
| unnumbered | `testMachine_parseMachineWithAST_fanInSourceLocations` |  | capdag.test.js:3602 |
| unnumbered | `testMachine_parseMachineWithAST_headerLocation` | ============================================================================ Phase 0A: Position tracking tests ============================================================================ | capdag.test.js:3563 |
| unnumbered | `testMachine_parseMachineWithAST_multilinePositions` |  | capdag.test.js:3593 |
| unnumbered | `testMachine_parseMachineWithAST_nodeMedia` |  | capdag.test.js:3631 |
| unnumbered | `testMachine_parseMachineWithAST_wiringLocation` |  | capdag.test.js:3579 |
| unnumbered | `testMachine_reorderedEdgesProduceSameNotation` |  | capdag.test.js:3381 |
| unnumbered | `testMachine_rootSourcesFanIn` |  | capdag.test.js:3246 |
| unnumbered | `testMachine_rootSourcesLinearChain` |  | capdag.test.js:3218 |
| unnumbered | `testMachine_roundtripFanOut` |  | capdag.test.js:3340 |
| unnumbered | `testMachine_roundtripLoopEdge` |  | capdag.test.js:3355 |
| unnumbered | `testMachine_roundtripSingleEdge` |  | capdag.test.js:3313 |
| unnumbered | `testMachine_roundtripTwoEdgeChain` |  | capdag.test.js:3326 |
| unnumbered | `testMachine_serializationIsDeterministic` |  | capdag.test.js:3368 |
| unnumbered | `testMachine_serializeEmptyGraph` |  | capdag.test.js:3309 |
| unnumbered | `testMachine_serializeSingleEdge` | --- Machine serializer tests (mirrors serializer.rs tests) --- | capdag.test.js:3282 |
| unnumbered | `testMachine_serializeTwoEdgeChain` |  | capdag.test.js:3296 |
| unnumbered | `testMachine_simpleLinearChain` |  | capdag.test.js:2796 |
| unnumbered | `testMachine_toMermaid_emptyGraph` |  | capdag.test.js:3707 |
| unnumbered | `testMachine_toMermaid_fanIn` |  | capdag.test.js:3713 |
| unnumbered | `testMachine_toMermaid_fanOut` |  | capdag.test.js:3724 |
| unnumbered | `testMachine_toMermaid_linearChain` | ============================================================================ Phase 0C: Machine.toMermaid() tests ============================================================================ | capdag.test.js:3681 |
| unnumbered | `testMachine_toMermaid_loopEdge` |  | capdag.test.js:3696 |
| unnumbered | `testMachine_twoStepChain` |  | capdag.test.js:2811 |
| unnumbered | `testMachine_undefinedAliasFails` |  | capdag.test.js:2875 |
| unnumbered | `testMachine_unterminatedBracketFails` |  | capdag.test.js:2933 |
| unnumbered | `testMachine_whitespaceOnly` |  | capdag.test.js:2774 |
| unnumbered | `testRenderer_buildEditorGraphData_capWithoutCompleteArgsIsDropped` |  | capdag.test.js:5004 |
| unnumbered | `testRenderer_buildEditorGraphData_cardinalityFromDataSlotSequenceFlags` |  | capdag.test.js:4985 |
| unnumbered | `testRenderer_buildEditorGraphData_collapsesCapsIntoLabeledEdges` |  | capdag.test.js:4929 |
| unnumbered | `testRenderer_buildEditorGraphData_loopMarkedEdgeGetsLoopClass` |  | capdag.test.js:4967 |
| unnumbered | `testRenderer_buildEditorGraphData_rejectsEdgeWithMissingSource` |  | capdag.test.js:5021 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_duplicateNodeIdAcrossStrandsFailsHard` |  | capdag.test.js:5224 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_fanInProducesEdgePerAssignment` |  | capdag.test.js:5125 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_loopEdgeGetsLoopClass` |  | capdag.test.js:5092 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_multiStrandKeepsStrandsDisjoint` |  | capdag.test.js:5164 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_singleStrandLinearChain` | ---------------- resolved-machine builder ---------------- | capdag.test.js:5037 |
| unnumbered | `testRenderer_buildRunGraphData_allFailedDropsTargetPlaceholder` |  | capdag.test.js:4750 |
| unnumbered | `testRenderer_buildRunGraphData_backboneHasNoForeachNode` |  | capdag.test.js:4701 |
| unnumbered | `testRenderer_buildRunGraphData_closedForeachSuccessMergesAtCollectTarget` |  | capdag.test.js:4866 |
| unnumbered | `testRenderer_buildRunGraphData_failureWithoutFailedCapRendersFullTrace` |  | capdag.test.js:4615 |
| unnumbered | `testRenderer_buildRunGraphData_pagesSuccessesAndFailures` |  | capdag.test.js:4551 |
| unnumbered | `testRenderer_buildRunGraphData_unclosedForeachSuccessNoMerge` |  | capdag.test.js:4810 |
| unnumbered | `testRenderer_buildRunGraphData_usesCapUrnIsEquivalentForFailedCap` |  | capdag.test.js:4648 |
| unnumbered | `testRenderer_buildStrandGraphData_foreachCollectSpan` |  | capdag.test.js:4146 |
| unnumbered | `testRenderer_buildStrandGraphData_nestedForEachThrows` |  | capdag.test.js:4249 |
| unnumbered | `testRenderer_buildStrandGraphData_sequenceShowsCardinality` |  | capdag.test.js:4129 |
| unnumbered | `testRenderer_buildStrandGraphData_singleCapPlain` |  | capdag.test.js:4105 |
| unnumbered | `testRenderer_buildStrandGraphData_standaloneCollect` |  | capdag.test.js:4193 |
| unnumbered | `testRenderer_buildStrandGraphData_unclosedForEachBody` |  | capdag.test.js:4216 |
| unnumbered | `testRenderer_canonicalMediaUrn_normalizesTagOrder` |  | capdag.test.js:3941 |
| unnumbered | `testRenderer_canonicalMediaUrn_preservesValueTags` |  | capdag.test.js:3950 |
| unnumbered | `testRenderer_canonicalMediaUrn_rejectsCapUrn` |  | capdag.test.js:3955 |
| unnumbered | `testRenderer_cardinalityFromCap_findsStdinArgNotFirstArg` |  | capdag.test.js:3866 |
| unnumbered | `testRenderer_cardinalityFromCap_outputOnlySequence` |  | capdag.test.js:3898 |
| unnumbered | `testRenderer_cardinalityFromCap_rejectsStringIsSequence` |  | capdag.test.js:3909 |
| unnumbered | `testRenderer_cardinalityFromCap_scalarDefaultsWhenFieldsMissing` |  | capdag.test.js:3890 |
| unnumbered | `testRenderer_cardinalityFromCap_throwsOnNonObject` |  | capdag.test.js:3922 |
| unnumbered | `testRenderer_cardinalityLabel_allFourCases` |  | capdag.test.js:3851 |
| unnumbered | `testRenderer_cardinalityLabel_usesUnicodeArrow` |  | capdag.test.js:3858 |
| unnumbered | `testRenderer_classifyStrandCapSteps_capFlags` |  | capdag.test.js:4060 |
| unnumbered | `testRenderer_classifyStrandCapSteps_nestedForks` |  | capdag.test.js:4081 |
| unnumbered | `testRenderer_collapseStrand_plainCapDistinctTargetNoMerge` |  | capdag.test.js:4506 |
| unnumbered | `testRenderer_collapseStrand_plainCapMergesTrailingOutput` |  | capdag.test.js:4473 |
| unnumbered | `testRenderer_collapseStrand_sequenceProducingCapBeforeForeach` |  | capdag.test.js:4413 |
| unnumbered | `testRenderer_collapseStrand_singleCapBodyKeepsCapOwnLabel` |  | capdag.test.js:4274 |
| unnumbered | `testRenderer_collapseStrand_standaloneCollectCollapses` |  | capdag.test.js:4374 |
| unnumbered | `testRenderer_collapseStrand_unclosedForEachBodyCollapses` |  | capdag.test.js:4322 |
| unnumbered | `testRenderer_mediaNodeLabel_oneLinePerTag_valueAndMarker` |  | capdag.test.js:3967 |
| unnumbered | `testRenderer_mediaNodeLabel_stableAcrossTagOrder` |  | capdag.test.js:3978 |
| unnumbered | `testRenderer_validateBodyOutcome_rejectsNegativeIndex` | ---------------- run builder ---------------- | capdag.test.js:4541 |
| unnumbered | `testRenderer_validateEditorGraphPayload_rejectsUnknownKind` | ---------------- editor-graph builder ---------------- | capdag.test.js:4915 |
| unnumbered | `testRenderer_validateResolvedMachinePayload_rejectsMissingFields` |  | capdag.test.js:5259 |
| unnumbered | `testRenderer_validateStrandPayload_missingSourceSpec` |  | capdag.test.js:4528 |
| unnumbered | `testRenderer_validateStrandStep_rejectsUnknownVariant` |  | capdag.test.js:4021 |
| unnumbered | `testRenderer_validateStrandStep_requiresBooleanIsSequence` |  | capdag.test.js:4038 |
| unnumbered | `testUrn` |  | capdag.test.js:108 |
| unnumbered | `testisCollection` | Mirror-specific coverage: isCollection returns true when collection marker tag is present Mirror-specific coverage: N/A for JS (MEDIA_COLLECTION constants removed - no longer exists) | capdag.test.js:2482 |
---

## Unnumbered Tests

The following tests are cataloged but do not currently participate in numeric test indexing.

- `testJS_argsPassedToExecuteCap` — capdag.test.js:1929
- `testJS_binaryArgPassedToExecuteCap` — capdag.test.js:1963
- `testJS_buildExtensionIndex` — capdag.test.js:1746
- `testJS_capDocumentationOmittedWhenNull` — capdag.test.js:1863
- `testJS_capDocumentationRoundTrip` — capdag.test.js:1841
- `testJS_capJSONSerialization` — capdag.test.js:1814
- `testJS_capWithMediaSpecs` — capdag.test.js:1800
- `testJS_getExtensionMappings` — capdag.test.js:1790
- `testJS_mediaSpecConstruction` — capdag.test.js:1996
- `testJS_mediaSpecDocumentationPropagatesThroughResolve` — capdag.test.js:1886
- `testJS_mediaUrnsForExtension` — capdag.test.js:1762
- `testJS_stdinSourceKindConstants` — capdag.test.js:1916
- `testJS_stdinSourceNullData` — capdag.test.js:1922
- `testLlmGenerateTextUrnSpecs` — capdag.test.js:1715
- `testMachine_aliasFallbackWithoutOpTag` — capdag.test.js:3422
- `testMachine_aliasFromOpTag` — capdag.test.js:3411
- `testMachine_builderChaining` — capdag.test.js:3479
- `testMachine_builderEquivalentToParsed` — capdag.test.js:3487
- `testMachine_builderRoundTrip` — capdag.test.js:3499
- `testMachine_builderSingleEdge` — capdag.test.js:3455
- `testMachine_builderWithLoop` — capdag.test.js:3467
- `testMachine_capRegistryClient_construction` — capdag.test.js:3780
- `testMachine_capRegistryEntry_construction` — capdag.test.js:3744
- `testMachine_capRegistryEntry_defaults` — capdag.test.js:3787
- `testMachine_capUrnInMediaUrn` — capdag.test.js:3526
- `testMachine_capUrnIsComparable` — capdag.test.js:3519
- `testMachine_capUrnIsEquivalent` — capdag.test.js:3511
- `testMachine_capUrnOutMediaUrn` — capdag.test.js:3533
- `testMachine_conflictingMediaTypesFail` — capdag.test.js:2892
- `testMachine_differentAliasesSameGraph` — capdag.test.js:2914
- `testMachine_displayEdge` — capdag.test.js:3258
- `testMachine_displayGraph` — capdag.test.js:3269
- `testMachine_duplicateAlias` — capdag.test.js:2785
- `testMachine_duplicateOpTagsDisambiguated` — capdag.test.js:3433
- `testMachine_edgeEquivalenceDifferentCapUrns` — capdag.test.js:3069
- `testMachine_edgeEquivalenceDifferentLoopFlag` — capdag.test.js:3101
- `testMachine_edgeEquivalenceDifferentSourceCount` — capdag.test.js:3133
- `testMachine_edgeEquivalenceDifferentTargets` — capdag.test.js:3085
- `testMachine_edgeEquivalenceSameUrns` — capdag.test.js:3053
- `testMachine_edgeEquivalenceSourceOrderIndependent` — capdag.test.js:3117
- `testMachine_emptyInput` — capdag.test.js:2770
- `testMachine_errorLocation_duplicateAlias` — capdag.test.js:3653
- `testMachine_errorLocation_parseError` — capdag.test.js:3643
- `testMachine_errorLocation_undefinedAlias` — capdag.test.js:3667
- `testMachine_fanInSecondaryAssignedByPriorWiring` — capdag.test.js:2842
- `testMachine_fanInSecondaryUnassignedGetsWildcard` — capdag.test.js:2855
- `testMachine_fanOut` — capdag.test.js:2825
- `testMachine_graphEmpty` — capdag.test.js:3206
- `testMachine_graphEmptyEquivalence` — capdag.test.js:3212
- `testMachine_graphEquivalenceReorderedEdges` — capdag.test.js:3164
- `testMachine_graphEquivalenceSameEdges` — capdag.test.js:3149
- `testMachine_graphNotEquivalentDifferentCap` — capdag.test.js:3193
- `testMachine_graphNotEquivalentDifferentEdgeCount` — capdag.test.js:3179
- `testMachine_headerOnlyNoWirings` — capdag.test.js:2778
- `testMachine_leafTargetsLinearChain` — capdag.test.js:3232
- `testMachine_lineBasedAndBracketedParseSameGraph` — capdag.test.js:3027
- `testMachine_lineBasedEquivalentToBracketed` — capdag.test.js:2995
- `testMachine_lineBasedFanIn` — capdag.test.js:2974
- `testMachine_lineBasedFormatSerialization` — capdag.test.js:3007
- `testMachine_lineBasedLoop` — capdag.test.js:2965
- `testMachine_lineBasedSimpleChain` — capdag.test.js:2942
- `testMachine_lineBasedTwoStepChain` — capdag.test.js:2955
- `testMachine_loopEdge` — capdag.test.js:2866
- `testMachine_malformedInputFails` — capdag.test.js:2926
- `testMachine_mediaRegistryEntry_construction` — capdag.test.js:3767
- `testMachine_mediaUrnIsComparable` — capdag.test.js:3550
- `testMachine_mediaUrnIsEquivalent` — capdag.test.js:3542
- `testMachine_mixedBracketedAndLineBased` — capdag.test.js:2987
- `testMachine_multilineFormat` — capdag.test.js:2904
- `testMachine_multilineSerializeFormat` — capdag.test.js:3397
- `testMachine_nodeAliasCollision` — capdag.test.js:2882
- `testMachine_parseMachineWithAST_aliasMap` — capdag.test.js:3613
- `testMachine_parseMachineWithAST_fanInSourceLocations` — capdag.test.js:3602
- `testMachine_parseMachineWithAST_headerLocation` — capdag.test.js:3563
- `testMachine_parseMachineWithAST_multilinePositions` — capdag.test.js:3593
- `testMachine_parseMachineWithAST_nodeMedia` — capdag.test.js:3631
- `testMachine_parseMachineWithAST_wiringLocation` — capdag.test.js:3579
- `testMachine_reorderedEdgesProduceSameNotation` — capdag.test.js:3381
- `testMachine_rootSourcesFanIn` — capdag.test.js:3246
- `testMachine_rootSourcesLinearChain` — capdag.test.js:3218
- `testMachine_roundtripFanOut` — capdag.test.js:3340
- `testMachine_roundtripLoopEdge` — capdag.test.js:3355
- `testMachine_roundtripSingleEdge` — capdag.test.js:3313
- `testMachine_roundtripTwoEdgeChain` — capdag.test.js:3326
- `testMachine_serializationIsDeterministic` — capdag.test.js:3368
- `testMachine_serializeEmptyGraph` — capdag.test.js:3309
- `testMachine_serializeSingleEdge` — capdag.test.js:3282
- `testMachine_serializeTwoEdgeChain` — capdag.test.js:3296
- `testMachine_simpleLinearChain` — capdag.test.js:2796
- `testMachine_toMermaid_emptyGraph` — capdag.test.js:3707
- `testMachine_toMermaid_fanIn` — capdag.test.js:3713
- `testMachine_toMermaid_fanOut` — capdag.test.js:3724
- `testMachine_toMermaid_linearChain` — capdag.test.js:3681
- `testMachine_toMermaid_loopEdge` — capdag.test.js:3696
- `testMachine_twoStepChain` — capdag.test.js:2811
- `testMachine_undefinedAliasFails` — capdag.test.js:2875
- `testMachine_unterminatedBracketFails` — capdag.test.js:2933
- `testMachine_whitespaceOnly` — capdag.test.js:2774
- `testRenderer_buildEditorGraphData_capWithoutCompleteArgsIsDropped` — capdag.test.js:5004
- `testRenderer_buildEditorGraphData_cardinalityFromDataSlotSequenceFlags` — capdag.test.js:4985
- `testRenderer_buildEditorGraphData_collapsesCapsIntoLabeledEdges` — capdag.test.js:4929
- `testRenderer_buildEditorGraphData_loopMarkedEdgeGetsLoopClass` — capdag.test.js:4967
- `testRenderer_buildEditorGraphData_rejectsEdgeWithMissingSource` — capdag.test.js:5021
- `testRenderer_buildResolvedMachineGraphData_duplicateNodeIdAcrossStrandsFailsHard` — capdag.test.js:5224
- `testRenderer_buildResolvedMachineGraphData_fanInProducesEdgePerAssignment` — capdag.test.js:5125
- `testRenderer_buildResolvedMachineGraphData_loopEdgeGetsLoopClass` — capdag.test.js:5092
- `testRenderer_buildResolvedMachineGraphData_multiStrandKeepsStrandsDisjoint` — capdag.test.js:5164
- `testRenderer_buildResolvedMachineGraphData_singleStrandLinearChain` — capdag.test.js:5037
- `testRenderer_buildRunGraphData_allFailedDropsTargetPlaceholder` — capdag.test.js:4750
- `testRenderer_buildRunGraphData_backboneHasNoForeachNode` — capdag.test.js:4701
- `testRenderer_buildRunGraphData_closedForeachSuccessMergesAtCollectTarget` — capdag.test.js:4866
- `testRenderer_buildRunGraphData_failureWithoutFailedCapRendersFullTrace` — capdag.test.js:4615
- `testRenderer_buildRunGraphData_pagesSuccessesAndFailures` — capdag.test.js:4551
- `testRenderer_buildRunGraphData_unclosedForeachSuccessNoMerge` — capdag.test.js:4810
- `testRenderer_buildRunGraphData_usesCapUrnIsEquivalentForFailedCap` — capdag.test.js:4648
- `testRenderer_buildStrandGraphData_foreachCollectSpan` — capdag.test.js:4146
- `testRenderer_buildStrandGraphData_nestedForEachThrows` — capdag.test.js:4249
- `testRenderer_buildStrandGraphData_sequenceShowsCardinality` — capdag.test.js:4129
- `testRenderer_buildStrandGraphData_singleCapPlain` — capdag.test.js:4105
- `testRenderer_buildStrandGraphData_standaloneCollect` — capdag.test.js:4193
- `testRenderer_buildStrandGraphData_unclosedForEachBody` — capdag.test.js:4216
- `testRenderer_canonicalMediaUrn_normalizesTagOrder` — capdag.test.js:3941
- `testRenderer_canonicalMediaUrn_preservesValueTags` — capdag.test.js:3950
- `testRenderer_canonicalMediaUrn_rejectsCapUrn` — capdag.test.js:3955
- `testRenderer_cardinalityFromCap_findsStdinArgNotFirstArg` — capdag.test.js:3866
- `testRenderer_cardinalityFromCap_outputOnlySequence` — capdag.test.js:3898
- `testRenderer_cardinalityFromCap_rejectsStringIsSequence` — capdag.test.js:3909
- `testRenderer_cardinalityFromCap_scalarDefaultsWhenFieldsMissing` — capdag.test.js:3890
- `testRenderer_cardinalityFromCap_throwsOnNonObject` — capdag.test.js:3922
- `testRenderer_cardinalityLabel_allFourCases` — capdag.test.js:3851
- `testRenderer_cardinalityLabel_usesUnicodeArrow` — capdag.test.js:3858
- `testRenderer_classifyStrandCapSteps_capFlags` — capdag.test.js:4060
- `testRenderer_classifyStrandCapSteps_nestedForks` — capdag.test.js:4081
- `testRenderer_collapseStrand_plainCapDistinctTargetNoMerge` — capdag.test.js:4506
- `testRenderer_collapseStrand_plainCapMergesTrailingOutput` — capdag.test.js:4473
- `testRenderer_collapseStrand_sequenceProducingCapBeforeForeach` — capdag.test.js:4413
- `testRenderer_collapseStrand_singleCapBodyKeepsCapOwnLabel` — capdag.test.js:4274
- `testRenderer_collapseStrand_standaloneCollectCollapses` — capdag.test.js:4374
- `testRenderer_collapseStrand_unclosedForEachBodyCollapses` — capdag.test.js:4322
- `testRenderer_mediaNodeLabel_oneLinePerTag_valueAndMarker` — capdag.test.js:3967
- `testRenderer_mediaNodeLabel_stableAcrossTagOrder` — capdag.test.js:3978
- `testRenderer_validateBodyOutcome_rejectsNegativeIndex` — capdag.test.js:4541
- `testRenderer_validateEditorGraphPayload_rejectsUnknownKind` — capdag.test.js:4915
- `testRenderer_validateResolvedMachinePayload_rejectsMissingFields` — capdag.test.js:5259
- `testRenderer_validateStrandPayload_missingSourceSpec` — capdag.test.js:4528
- `testRenderer_validateStrandStep_rejectsUnknownVariant` — capdag.test.js:4021
- `testRenderer_validateStrandStep_requiresBooleanIsSequence` — capdag.test.js:4038
- `testUrn` — capdag.test.js:108
- `testisCollection` — capdag.test.js:2482

---

*Generated from CapDag-JS source tree*
*Total tests: 312*
*Total numbered tests: 163*
*Total unnumbered tests: 149*
