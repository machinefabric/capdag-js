# CapDag-JS Test Catalog

**Total Tests:** 316

**Numbered Tests:** 167

**Unnumbered Tests:** 149

**Numbered Tests Missing Descriptions:** 0

**Numbering Mismatches:** 0

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
| test091 | `test091_resolveCustomMediaSpec` | TEST091: Test resolving custom media URN from local media_specs takes precedence over registry | capdag.test.js:987 |
| test092 | `test092_resolveCustomWithSchema` | TEST092: Test resolving custom record media spec with schema from local media_specs | capdag.test.js:997 |
| test093 | `test093_resolveUnresolvableFailsHard` | TEST093: Test resolving unknown media URN fails with UnresolvableMediaUrn error | capdag.test.js:1014 |
| test099 | `test099_resolvedIsBinary` | TEST099: Test ResolvedMediaSpec is_binary returns true when textable tag is absent | capdag.test.js:1033 |
| test100 | `test100_resolvedIsRecord` | TEST100: Test ResolvedMediaSpec is_record returns true when record marker is present | capdag.test.js:1039 |
| test101 | `test101_resolvedIsScalar` | TEST101: Test ResolvedMediaSpec is_scalar returns true when list marker is absent | capdag.test.js:1045 |
| test102 | `test102_resolvedIsList` | TEST102: Test ResolvedMediaSpec is_list returns true when list marker is present | capdag.test.js:1051 |
| test103 | `test103_resolvedIsJson` | TEST103: Test ResolvedMediaSpec is_json returns true when json tag is present | capdag.test.js:1057 |
| test104 | `test104_resolvedIsText` | TEST104: Test ResolvedMediaSpec is_text returns true when textable tag is present | capdag.test.js:1063 |
| test105 | `test105_metadataPropagation` | TEST105: Test metadata propagates from media spec def to resolved media spec | capdag.test.js:1069 |
| test106 | `test106_metadataWithValidation` | TEST106: Test metadata and validation can coexist in media spec definition | capdag.test.js:1092 |
| test107 | `test107_extensionsPropagation` | TEST107: Test extensions field propagates from media spec def to resolved | capdag.test.js:1111 |
| test108 | `test108_extensionsSerialization` | TEST108: Test creating new cap with URN, title, and command verifies correct initialization | capdag.test.js:1127 |
| test109 | `test109_extensionsWithMetadataAndValidation` | TEST109: Test creating cap with metadata initializes and retrieves metadata correctly | capdag.test.js:1135 |
| test110 | `test110_multipleExtensions` | TEST110: Test cap matching with subset semantics for request fulfillment | capdag.test.js:1154 |
| test117 | `test117_capBlockMoreSpecificWins` | TEST117: Test registering cap set and finding by exact and subset matching | capdag.test.js:1174 |
| test118 | `test118_capBlockTieGoesToFirst` | TEST118: Test selecting best cap set based on specificity ranking With is_dispatchable semantics: - Provider must satisfy ALL request constraints - General request matches specific provider (provider refines request) - Specific request does NOT match general provider (provider lacks constraints) | capdag.test.js:1204 |
| test119 | `test119_capBlockPollsAll` | TEST119: Test invalid URN returns InvalidUrn error | capdag.test.js:1225 |
| test120 | `test120_capBlockNoMatch` | TEST120: Test accepts_request checks if registry can handle a capability request | capdag.test.js:1252 |
| test121 | `test121_capBlockFallbackScenario` | TEST121: Test CapBlock selects more specific cap over less specific regardless of registry order | capdag.test.js:1267 |
| test122 | `test122_capBlockCanMethod` | TEST122: Test CapBlock breaks specificity ties by first registered registry | capdag.test.js:1299 |
| test123 | `test123_capBlockRegistryManagement` | TEST123: Test CapBlock polls all registries to find most specific match | capdag.test.js:1316 |
| test124 | `test124_capGraphBasicConstruction` | TEST124: Test CapBlock returns error when no registries match the request | capdag.test.js:1335 |
| test125 | `test125_capGraphOutgoingIncoming` | TEST125: Test CapBlock prefers specific cartridge over generic provider fallback | capdag.test.js:1354 |
| test126 | `test126_capGraphCanConvert` | TEST126: Test composite can method returns CapCaller for capability execution | capdag.test.js:1372 |
| test127 | `test127_capGraphFindPath` | TEST127: Test CapGraph adds nodes and edges from capability definitions | capdag.test.js:1393 |
| test128 | `test128_capGraphFindAllPaths` | TEST128: Test CapGraph tracks outgoing and incoming edges for spec conversions | capdag.test.js:1426 |
| test129 | `test129_capGraphGetDirectEdges` | TEST129: Test CapGraph detects direct and indirect conversion paths between specs | capdag.test.js:1446 |
| test130 | `test130_capGraphStats` | TEST130: Test CapGraph finds shortest path for spec conversion chain | capdag.test.js:1471 |
| test131 | `test131_capGraphWithCapBlock` | TEST131: Test CapGraph finds all conversion paths sorted by length | capdag.test.js:1492 |
| test156 | `test156_stdinSourceFromData` | TEST156: Test creating StdinSource Data variant with byte vector | capdag.test.js:1526 |
| test157 | `test157_stdinSourceFromFileReference` | TEST157: Test creating StdinSource FileReference variant with all required fields | capdag.test.js:1537 |
| test158 | `test158_stdinSourceWithEmptyData` | TEST158: Test StdinSource Data with empty vector stores and retrieves correctly | capdag.test.js:1554 |
| test159 | `test159_stdinSourceWithBinaryContent` | TEST159: Test StdinSource Data with binary content like PNG header bytes | capdag.test.js:1562 |
| test274 | `test274_capArgumentValueNew` | TEST274: Test CapArgumentValue::new stores media_urn and raw byte value | capdag.test.js:1576 |
| test275 | `test275_capArgumentValueFromStr` | TEST275: Test CapArgumentValue::from_str converts string to UTF-8 bytes | capdag.test.js:1583 |
| test276 | `test276_capArgumentValueAsStrValid` | TEST276: Test CapArgumentValue::value_as_str succeeds for UTF-8 data | capdag.test.js:1590 |
| test277 | `test277_capArgumentValueAsStrInvalidUtf8` | TEST277: Test CapArgumentValue::value_as_str fails for non-UTF-8 binary data | capdag.test.js:1596 |
| test278 | `test278_capArgumentValueEmpty` | TEST278: Test CapArgumentValue::new with empty value stores empty vec | capdag.test.js:1608 |
| test282 | `test282_capArgumentValueUnicode` | TEST282: Test CapArgumentValue::from_str with Unicode string preserves all characters | capdag.test.js:1617 |
| test283 | `test283_capArgumentValueLargeBinary` | TEST283: Test CapArgumentValue with large binary payload preserves all bytes | capdag.test.js:1623 |
| test304 | `test304_mediaAvailabilityOutputConstant` | TEST304: Test MEDIA_AVAILABILITY_OUTPUT constant parses as valid media URN with correct tags | capdag.test.js:1642 |
| test305 | `test305_mediaPathOutputConstant` | TEST305: Test MEDIA_PATH_OUTPUT constant parses as valid media URN with correct tags | capdag.test.js:1652 |
| test306 | `test306_availabilityAndPathOutputDistinct` | TEST306: Test MEDIA_AVAILABILITY_OUTPUT and MEDIA_PATH_OUTPUT are distinct URNs | capdag.test.js:1662 |
| test307 | `test307_modelAvailabilityUrn` | TEST307: Test model_availability_urn builds valid cap URN with correct op and media specs | capdag.test.js:1676 |
| test308 | `test308_modelPathUrn` | TEST308: Test model_path_urn builds valid cap URN with correct op and media specs | capdag.test.js:1688 |
| test309 | `test309_modelAvailabilityAndPathAreDistinct` | TEST309: Test model_availability_urn and model_path_urn produce distinct URNs | capdag.test.js:1700 |
| test310 | `test310_llmGenerateTextUrn` | TEST310: llm_generate_text_urn() produces a valid cap URN with textable in/out specs | capdag.test.js:1707 |
| test312 | `test312_allUrnBuildersProduceValidUrns` | TEST312: Test all URN builders produce parseable cap URNs | capdag.test.js:1730 |
| test320 | `test320_cartridgeInfoConstruction` | TEST320-335: CartridgeRepoServer and CartridgeRepoClient tests | capdag.test.js:2095 |
| test321 | `test321_cartridgeInfoIsSigned` | TEST321: CartridgeInfo.is_signed() returns true when signature is present | capdag.test.js:2122 |
| test322 | `test322_cartridgeInfoBuildForPlatform` | TEST322: CartridgeInfo.build_for_platform() returns the build matching the current platform | capdag.test.js:2134 |
| test323 | `test323_cartridgeRepoServerValidateRegistry` | TEST323: CartridgeRepoServer validates registry JSON schema version | capdag.test.js:2168 |
| test324 | `test324_cartridgeRepoServerTransformToArray` | TEST324: CartridgeRepoServer transforms v3 registry JSON into flat cartridge array | capdag.test.js:2195 |
| test325 | `test325_cartridgeRepoServerGetCartridges` | TEST325: CartridgeRepoServer.get_cartridges() returns all parsed cartridges | capdag.test.js:2220 |
| test326 | `test326_cartridgeRepoServerGetCartridgeById` | TEST326: CartridgeRepoServer.get_cartridge() returns cartridge matching the given ID | capdag.test.js:2230 |
| test327 | `test327_cartridgeRepoServerSearchCartridges` | TEST327: CartridgeRepoServer.search_cartridges() filters by text query against name and description | capdag.test.js:2242 |
| test328 | `test328_cartridgeRepoServerGetByCategory` | TEST328: CartridgeRepoServer.get_by_category() filters cartridges by category tag | capdag.test.js:2257 |
| test329 | `test329_cartridgeRepoServerGetByCap` | TEST329: CartridgeRepoServer.get_suggestions_for_cap() finds cartridges providing a given cap URN | capdag.test.js:2270 |
| test330 | `test330_cartridgeRepoClientUpdateCache` | TEST330: CartridgeRepoClient updates its local cache from server response | capdag.test.js:2285 |
| test331 | `test331_cartridgeRepoClientGetSuggestions` | TEST331: CartridgeRepoClient.get_suggestions_for_cap() returns cartridge suggestions for a cap URN | capdag.test.js:2299 |
| test332 | `test332_cartridgeRepoClientGetCartridge` | TEST332: CartridgeRepoClient.get_cartridge() retrieves a specific cartridge by ID from cache | capdag.test.js:2316 |
| test333 | `test333_cartridgeRepoClientGetAllCaps` | TEST333: CartridgeRepoClient.get_all_caps() returns aggregate cap URNs from all cached cartridges | capdag.test.js:2332 |
| test334 | `test334_cartridgeRepoClientNeedsSync` | TEST334: CartridgeRepoClient.needs_sync() returns true when cache TTL has expired | capdag.test.js:2346 |
| test335 | `test335_cartridgeRepoServerClientIntegration` | TEST335: Server creates registry response and client consumes it end-to-end | capdag.test.js:2367 |
| test639 | `test639_emptyCapDefaultsToMediaWildcard` | TEST639: cap: (empty) defaults to in=media:;out=media: | capdag.test.js:2692 |
| test640 | `test640_inOnlyDefaultsOutToMedia` | TEST640: cap:in defaults out to media: | capdag.test.js:2700 |
| test641 | `test641_outOnlyDefaultsInToMedia` | TEST641: cap:out defaults in to media: | capdag.test.js:2707 |
| test642 | `test642_inOutWithoutValuesBecomeMedia` | TEST642: cap:in;out both become media: | capdag.test.js:2714 |
| test643 | `test643_explicitAsteriskIsWildcard` | TEST643: cap:in=*;out=* becomes media: | capdag.test.js:2721 |
| test644 | `test644_specificInWildcardOut` | TEST644: cap:in=media:;out=* has specific in, wildcard out | capdag.test.js:2728 |
| test645 | `test645_wildcardInSpecificOut` | TEST645: cap:in=*;out=media:text has wildcard in, specific out | capdag.test.js:2735 |
| test646 | `test646_invalidInSpecFails` | TEST646: cap:in=foo fails (invalid media URN) | capdag.test.js:2742 |
| test647 | `test647_invalidOutSpecFails` | TEST647: cap:in=media:;out=bar fails (invalid media URN) | capdag.test.js:2751 |
| test648 | `test648_wildcardAcceptsSpecific` | TEST648: Wildcard in/out match specific caps | capdag.test.js:2760 |
| test649 | `test649_specificityScoring` | TEST649: Specificity - wildcard has 0, specific has tag count | capdag.test.js:2769 |
| test651 | `test651_identityFormsEquivalent` | TEST651: All identity forms produce the same CapUrn | capdag.test.js:2780 |
| test653 | `test653_identityRoutingIsolation` | TEST653: Identity (no tags) does not match specific requests via routing | capdag.test.js:2800 |
| test890 | `test890_directionSemanticMatching` | TEST890: Semantic direction matching - generic provider matches specific request | capdag.test.js:683 |
| test891 | `test891_directionSemanticSpecificity` | TEST891: Semantic direction specificity - more media URN tags = higher specificity | capdag.test.js:733 |
| test1294 | `test1294_rule11VoidInputWithStdinRejected` | TEST1294: RULE11 - void-input cap with stdin source rejected | capdag.test.js:2636 |
| test1295 | `test1295_rule11NonVoidInputWithoutStdinRejected` | TEST1295: RULE11 - non-void-input cap without stdin source rejected | capdag.test.js:2651 |
| test1296 | `test1296_rule11VoidInputCliFlagOnly` | TEST1296: RULE11 - void-input cap with only cli_flag sources passes | capdag.test.js:2666 |
| test1297 | `test1297_rule11NonVoidInputWithStdin` | TEST1297: RULE11 - non-void-input cap with stdin source passes | capdag.test.js:2676 |
| test1298 | `test1298_isBool` | TEST1298: is_bool returns true only when bool marker tag is present | capdag.test.js:2445 |
| test1299 | `test1299_isFilePath` | TEST1299: is_file_path returns true for scalar file-path, false for array | capdag.test.js:2457 |
| test1300 | `test1300_isFilePathArray` | TEST1300: is_file_path_array returns true for list file-path, false for scalar | capdag.test.js:2467 |
| test1301 | `test1301_isAnyFilePath` | TEST1301: is_any_file_path returns true for both scalar and array file-path | capdag.test.js:2476 |
| test1302 | `test1302_predicateConstantConsistency` | TEST1302: predicates are consistent with constants — every constant triggers exactly the expected predicates | capdag.test.js:2497 |
| test1303 | `test1303_withoutTag` | TEST1303: without_tag removes tag, ignores in/out, case-insensitive for keys | capdag.test.js:2537 |
| test1304 | `test1304_withInOutSpec` | TEST1304: with_in_spec and with_out_spec change direction specs | capdag.test.js:2559 |
| test1305 | `test1305_findAllMatches` | TEST1305: CapMatcher::find_all_matches returns all matching caps sorted by specificity | capdag.test.js:2582 |
| test1306 | `test1306_areCompatible` | TEST1306: CapMatcher::are_compatible detects bidirectional overlap | capdag.test.js:2600 |
| test1307 | `test1307_withTagIgnoresInOut` | TEST1307: with_tag silently ignores in/out keys | capdag.test.js:2625 |
| test1312 | `test1312_isImage` | TEST1312: is_image returns true only when image marker tag is present | capdag.test.js:2400 |
| test1313 | `test1313_isAudio` | TEST1313: is_audio returns true only when audio marker tag is present | capdag.test.js:2412 |
| test1314 | `test1314_isVideo` | TEST1314: is_video returns true only when video marker tag is present | capdag.test.js:2423 |
| test1315 | `test1315_isNumeric` | TEST1315: is_numeric returns true only when numeric marker tag is present | capdag.test.js:2433 |
| | | | |
| unnumbered | `testJS_argsPassedToExecuteCap` |  | capdag.test.js:1933 |
| unnumbered | `testJS_binaryArgPassedToExecuteCap` |  | capdag.test.js:1967 |
| unnumbered | `testJS_buildExtensionIndex` | These tests cover JS-specific functionality not in the Rust numbering scheme but are important for capdag-js correctness. | capdag.test.js:1750 |
| unnumbered | `testJS_capDocumentationOmittedWhenNull` | When documentation is null, toJSON must omit the field entirely. This matches the Rust serializer's skip-when-None semantics and the ObjC toDictionary behaviour. A regression where null is emitted as `documentation: null` would break the symmetric round-trip with Rust (which has no null sentinel) and pollute generated JSON. | capdag.test.js:1867 |
| unnumbered | `testJS_capDocumentationRoundTrip` | JS round-trip for the documentation field on Cap. Mirrors TEST920 in capdag/src/cap/definition.rs — the body is non-trivial (newlines, backticks, embedded quotes, Unicode) so escaping mismatches between JSON.stringify on this side and the Rust serializer on the other side surface as failures here. | capdag.test.js:1845 |
| unnumbered | `testJS_capJSONSerialization` |  | capdag.test.js:1818 |
| unnumbered | `testJS_capWithMediaSpecs` |  | capdag.test.js:1804 |
| unnumbered | `testJS_getExtensionMappings` |  | capdag.test.js:1794 |
| unnumbered | `testJS_mediaSpecConstruction` |  | capdag.test.js:2000 |
| unnumbered | `testJS_mediaSpecDocumentationPropagatesThroughResolve` | Documentation propagates from a mediaSpecs definition through resolveMediaUrn into the resolved MediaSpec. Mirrors TEST924 on the Rust side. This is the path every UI consumer uses, so a break here makes the new field invisible everywhere downstream. | capdag.test.js:1890 |
| unnumbered | `testJS_mediaUrnsForExtension` |  | capdag.test.js:1766 |
| unnumbered | `testJS_stdinSourceKindConstants` |  | capdag.test.js:1920 |
| unnumbered | `testJS_stdinSourceNullData` |  | capdag.test.js:1926 |
| unnumbered | `testLlmGenerateTextUrnSpecs` | Mirror-specific coverage: llm_generate_text_urn input/output specs conform to MEDIA_STRING | capdag.test.js:1719 |
| unnumbered | `testMachine_aliasFallbackWithoutOpTag` |  | capdag.test.js:3476 |
| unnumbered | `testMachine_aliasFromOpTag` |  | capdag.test.js:3465 |
| unnumbered | `testMachine_builderChaining` |  | capdag.test.js:3533 |
| unnumbered | `testMachine_builderEquivalentToParsed` |  | capdag.test.js:3541 |
| unnumbered | `testMachine_builderRoundTrip` |  | capdag.test.js:3553 |
| unnumbered | `testMachine_builderSingleEdge` | --- Machine builder tests --- | capdag.test.js:3509 |
| unnumbered | `testMachine_builderWithLoop` |  | capdag.test.js:3521 |
| unnumbered | `testMachine_capRegistryClient_construction` |  | capdag.test.js:3834 |
| unnumbered | `testMachine_capRegistryEntry_construction` | Phase 0B: CapRegistryClient tests | capdag.test.js:3798 |
| unnumbered | `testMachine_capRegistryEntry_defaults` |  | capdag.test.js:3841 |
| unnumbered | `testMachine_capUrnInMediaUrn` |  | capdag.test.js:3580 |
| unnumbered | `testMachine_capUrnIsComparable` |  | capdag.test.js:3573 |
| unnumbered | `testMachine_capUrnIsEquivalent` | --- CapUrn.isEquivalent/isComparable tests --- | capdag.test.js:3565 |
| unnumbered | `testMachine_capUrnOutMediaUrn` |  | capdag.test.js:3587 |
| unnumbered | `testMachine_conflictingMediaTypesFail` |  | capdag.test.js:2946 |
| unnumbered | `testMachine_differentAliasesSameGraph` |  | capdag.test.js:2968 |
| unnumbered | `testMachine_displayEdge` |  | capdag.test.js:3312 |
| unnumbered | `testMachine_displayGraph` |  | capdag.test.js:3323 |
| unnumbered | `testMachine_duplicateAlias` |  | capdag.test.js:2839 |
| unnumbered | `testMachine_duplicateOpTagsDisambiguated` |  | capdag.test.js:3487 |
| unnumbered | `testMachine_edgeEquivalenceDifferentCapUrns` |  | capdag.test.js:3123 |
| unnumbered | `testMachine_edgeEquivalenceDifferentLoopFlag` |  | capdag.test.js:3155 |
| unnumbered | `testMachine_edgeEquivalenceDifferentSourceCount` |  | capdag.test.js:3187 |
| unnumbered | `testMachine_edgeEquivalenceDifferentTargets` |  | capdag.test.js:3139 |
| unnumbered | `testMachine_edgeEquivalenceSameUrns` | --- Machine graph tests (mirrors graph.rs tests) --- | capdag.test.js:3107 |
| unnumbered | `testMachine_edgeEquivalenceSourceOrderIndependent` |  | capdag.test.js:3171 |
| unnumbered | `testMachine_emptyInput` | --- Machine parser tests (mirrors parser.rs tests) --- | capdag.test.js:2824 |
| unnumbered | `testMachine_errorLocation_duplicateAlias` |  | capdag.test.js:3707 |
| unnumbered | `testMachine_errorLocation_parseError` |  | capdag.test.js:3697 |
| unnumbered | `testMachine_errorLocation_undefinedAlias` |  | capdag.test.js:3721 |
| unnumbered | `testMachine_fanInSecondaryAssignedByPriorWiring` |  | capdag.test.js:2896 |
| unnumbered | `testMachine_fanInSecondaryUnassignedGetsWildcard` |  | capdag.test.js:2909 |
| unnumbered | `testMachine_fanOut` |  | capdag.test.js:2879 |
| unnumbered | `testMachine_graphEmpty` |  | capdag.test.js:3260 |
| unnumbered | `testMachine_graphEmptyEquivalence` |  | capdag.test.js:3266 |
| unnumbered | `testMachine_graphEquivalenceReorderedEdges` |  | capdag.test.js:3218 |
| unnumbered | `testMachine_graphEquivalenceSameEdges` |  | capdag.test.js:3203 |
| unnumbered | `testMachine_graphNotEquivalentDifferentCap` |  | capdag.test.js:3247 |
| unnumbered | `testMachine_graphNotEquivalentDifferentEdgeCount` |  | capdag.test.js:3233 |
| unnumbered | `testMachine_headerOnlyNoWirings` |  | capdag.test.js:2832 |
| unnumbered | `testMachine_leafTargetsLinearChain` |  | capdag.test.js:3286 |
| unnumbered | `testMachine_lineBasedAndBracketedParseSameGraph` |  | capdag.test.js:3081 |
| unnumbered | `testMachine_lineBasedEquivalentToBracketed` |  | capdag.test.js:3049 |
| unnumbered | `testMachine_lineBasedFanIn` |  | capdag.test.js:3028 |
| unnumbered | `testMachine_lineBasedFormatSerialization` |  | capdag.test.js:3061 |
| unnumbered | `testMachine_lineBasedLoop` |  | capdag.test.js:3019 |
| unnumbered | `testMachine_lineBasedSimpleChain` | --- Machine parser line-based mode tests --- | capdag.test.js:2996 |
| unnumbered | `testMachine_lineBasedTwoStepChain` |  | capdag.test.js:3009 |
| unnumbered | `testMachine_loopEdge` |  | capdag.test.js:2920 |
| unnumbered | `testMachine_malformedInputFails` |  | capdag.test.js:2980 |
| unnumbered | `testMachine_mediaRegistryEntry_construction` |  | capdag.test.js:3821 |
| unnumbered | `testMachine_mediaUrnIsComparable` |  | capdag.test.js:3604 |
| unnumbered | `testMachine_mediaUrnIsEquivalent` | --- MediaUrn.isEquivalent/isComparable tests --- | capdag.test.js:3596 |
| unnumbered | `testMachine_mixedBracketedAndLineBased` |  | capdag.test.js:3041 |
| unnumbered | `testMachine_multilineFormat` |  | capdag.test.js:2958 |
| unnumbered | `testMachine_multilineSerializeFormat` |  | capdag.test.js:3451 |
| unnumbered | `testMachine_nodeAliasCollision` |  | capdag.test.js:2936 |
| unnumbered | `testMachine_parseMachineWithAST_aliasMap` |  | capdag.test.js:3667 |
| unnumbered | `testMachine_parseMachineWithAST_fanInSourceLocations` |  | capdag.test.js:3656 |
| unnumbered | `testMachine_parseMachineWithAST_headerLocation` | Phase 0A: Position tracking tests | capdag.test.js:3617 |
| unnumbered | `testMachine_parseMachineWithAST_multilinePositions` |  | capdag.test.js:3647 |
| unnumbered | `testMachine_parseMachineWithAST_nodeMedia` |  | capdag.test.js:3685 |
| unnumbered | `testMachine_parseMachineWithAST_wiringLocation` |  | capdag.test.js:3633 |
| unnumbered | `testMachine_reorderedEdgesProduceSameNotation` |  | capdag.test.js:3435 |
| unnumbered | `testMachine_rootSourcesFanIn` |  | capdag.test.js:3300 |
| unnumbered | `testMachine_rootSourcesLinearChain` |  | capdag.test.js:3272 |
| unnumbered | `testMachine_roundtripFanOut` |  | capdag.test.js:3394 |
| unnumbered | `testMachine_roundtripLoopEdge` |  | capdag.test.js:3409 |
| unnumbered | `testMachine_roundtripSingleEdge` |  | capdag.test.js:3367 |
| unnumbered | `testMachine_roundtripTwoEdgeChain` |  | capdag.test.js:3380 |
| unnumbered | `testMachine_serializationIsDeterministic` |  | capdag.test.js:3422 |
| unnumbered | `testMachine_serializeEmptyGraph` |  | capdag.test.js:3363 |
| unnumbered | `testMachine_serializeSingleEdge` | --- Machine serializer tests (mirrors serializer.rs tests) --- | capdag.test.js:3336 |
| unnumbered | `testMachine_serializeTwoEdgeChain` |  | capdag.test.js:3350 |
| unnumbered | `testMachine_simpleLinearChain` |  | capdag.test.js:2850 |
| unnumbered | `testMachine_toMermaid_emptyGraph` |  | capdag.test.js:3761 |
| unnumbered | `testMachine_toMermaid_fanIn` |  | capdag.test.js:3767 |
| unnumbered | `testMachine_toMermaid_fanOut` |  | capdag.test.js:3778 |
| unnumbered | `testMachine_toMermaid_linearChain` | Phase 0C: Machine.toMermaid() tests | capdag.test.js:3735 |
| unnumbered | `testMachine_toMermaid_loopEdge` |  | capdag.test.js:3750 |
| unnumbered | `testMachine_twoStepChain` |  | capdag.test.js:2865 |
| unnumbered | `testMachine_undefinedAliasFails` |  | capdag.test.js:2929 |
| unnumbered | `testMachine_unterminatedBracketFails` |  | capdag.test.js:2987 |
| unnumbered | `testMachine_whitespaceOnly` |  | capdag.test.js:2828 |
| unnumbered | `testRenderer_buildEditorGraphData_capWithoutCompleteArgsIsDropped` |  | capdag.test.js:5058 |
| unnumbered | `testRenderer_buildEditorGraphData_cardinalityFromDataSlotSequenceFlags` |  | capdag.test.js:5039 |
| unnumbered | `testRenderer_buildEditorGraphData_collapsesCapsIntoLabeledEdges` |  | capdag.test.js:4983 |
| unnumbered | `testRenderer_buildEditorGraphData_loopMarkedEdgeGetsLoopClass` |  | capdag.test.js:5021 |
| unnumbered | `testRenderer_buildEditorGraphData_rejectsEdgeWithMissingSource` |  | capdag.test.js:5075 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_duplicateNodeIdAcrossStrandsFailsHard` |  | capdag.test.js:5278 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_fanInProducesEdgePerAssignment` |  | capdag.test.js:5179 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_loopEdgeGetsLoopClass` |  | capdag.test.js:5146 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_multiStrandKeepsStrandsDisjoint` |  | capdag.test.js:5218 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_singleStrandLinearChain` | ---------------- resolved-machine builder ---------------- | capdag.test.js:5091 |
| unnumbered | `testRenderer_buildRunGraphData_allFailedDropsTargetPlaceholder` |  | capdag.test.js:4804 |
| unnumbered | `testRenderer_buildRunGraphData_backboneHasNoForeachNode` |  | capdag.test.js:4755 |
| unnumbered | `testRenderer_buildRunGraphData_closedForeachSuccessMergesAtCollectTarget` |  | capdag.test.js:4920 |
| unnumbered | `testRenderer_buildRunGraphData_failureWithoutFailedCapRendersFullTrace` |  | capdag.test.js:4669 |
| unnumbered | `testRenderer_buildRunGraphData_pagesSuccessesAndFailures` |  | capdag.test.js:4605 |
| unnumbered | `testRenderer_buildRunGraphData_unclosedForeachSuccessNoMerge` |  | capdag.test.js:4864 |
| unnumbered | `testRenderer_buildRunGraphData_usesCapUrnIsEquivalentForFailedCap` |  | capdag.test.js:4702 |
| unnumbered | `testRenderer_buildStrandGraphData_foreachCollectSpan` |  | capdag.test.js:4200 |
| unnumbered | `testRenderer_buildStrandGraphData_nestedForEachThrows` |  | capdag.test.js:4303 |
| unnumbered | `testRenderer_buildStrandGraphData_sequenceShowsCardinality` |  | capdag.test.js:4183 |
| unnumbered | `testRenderer_buildStrandGraphData_singleCapPlain` |  | capdag.test.js:4159 |
| unnumbered | `testRenderer_buildStrandGraphData_standaloneCollect` |  | capdag.test.js:4247 |
| unnumbered | `testRenderer_buildStrandGraphData_unclosedForEachBody` |  | capdag.test.js:4270 |
| unnumbered | `testRenderer_canonicalMediaUrn_normalizesTagOrder` |  | capdag.test.js:3995 |
| unnumbered | `testRenderer_canonicalMediaUrn_preservesValueTags` |  | capdag.test.js:4004 |
| unnumbered | `testRenderer_canonicalMediaUrn_rejectsCapUrn` |  | capdag.test.js:4009 |
| unnumbered | `testRenderer_cardinalityFromCap_findsStdinArgNotFirstArg` |  | capdag.test.js:3920 |
| unnumbered | `testRenderer_cardinalityFromCap_outputOnlySequence` |  | capdag.test.js:3952 |
| unnumbered | `testRenderer_cardinalityFromCap_rejectsStringIsSequence` |  | capdag.test.js:3963 |
| unnumbered | `testRenderer_cardinalityFromCap_scalarDefaultsWhenFieldsMissing` |  | capdag.test.js:3944 |
| unnumbered | `testRenderer_cardinalityFromCap_throwsOnNonObject` |  | capdag.test.js:3976 |
| unnumbered | `testRenderer_cardinalityLabel_allFourCases` |  | capdag.test.js:3905 |
| unnumbered | `testRenderer_cardinalityLabel_usesUnicodeArrow` |  | capdag.test.js:3912 |
| unnumbered | `testRenderer_classifyStrandCapSteps_capFlags` |  | capdag.test.js:4114 |
| unnumbered | `testRenderer_classifyStrandCapSteps_nestedForks` |  | capdag.test.js:4135 |
| unnumbered | `testRenderer_collapseStrand_plainCapDistinctTargetNoMerge` |  | capdag.test.js:4560 |
| unnumbered | `testRenderer_collapseStrand_plainCapMergesTrailingOutput` |  | capdag.test.js:4527 |
| unnumbered | `testRenderer_collapseStrand_sequenceProducingCapBeforeForeach` |  | capdag.test.js:4467 |
| unnumbered | `testRenderer_collapseStrand_singleCapBodyKeepsCapOwnLabel` |  | capdag.test.js:4328 |
| unnumbered | `testRenderer_collapseStrand_standaloneCollectCollapses` |  | capdag.test.js:4428 |
| unnumbered | `testRenderer_collapseStrand_unclosedForEachBodyCollapses` |  | capdag.test.js:4376 |
| unnumbered | `testRenderer_mediaNodeLabel_oneLinePerTag_valueAndMarker` |  | capdag.test.js:4021 |
| unnumbered | `testRenderer_mediaNodeLabel_stableAcrossTagOrder` |  | capdag.test.js:4032 |
| unnumbered | `testRenderer_validateBodyOutcome_rejectsNegativeIndex` | ---------------- run builder ---------------- | capdag.test.js:4595 |
| unnumbered | `testRenderer_validateEditorGraphPayload_rejectsUnknownKind` | ---------------- editor-graph builder ---------------- | capdag.test.js:4969 |
| unnumbered | `testRenderer_validateResolvedMachinePayload_rejectsMissingFields` |  | capdag.test.js:5313 |
| unnumbered | `testRenderer_validateStrandPayload_missingSourceSpec` |  | capdag.test.js:4582 |
| unnumbered | `testRenderer_validateStrandStep_rejectsUnknownVariant` |  | capdag.test.js:4075 |
| unnumbered | `testRenderer_validateStrandStep_requiresBooleanIsSequence` |  | capdag.test.js:4092 |
| unnumbered | `testUrn` |  | capdag.test.js:108 |
| unnumbered | `testisCollection` | Mirror-specific coverage: isCollection returns true when collection marker tag is present Mirror-specific coverage: N/A for JS (MEDIA_COLLECTION constants removed - no longer exists) | capdag.test.js:2486 |
---

## Unnumbered Tests

The following tests are cataloged but do not currently participate in numeric test indexing.

- `testJS_argsPassedToExecuteCap` — capdag.test.js:1933
- `testJS_binaryArgPassedToExecuteCap` — capdag.test.js:1967
- `testJS_buildExtensionIndex` — capdag.test.js:1750
- `testJS_capDocumentationOmittedWhenNull` — capdag.test.js:1867
- `testJS_capDocumentationRoundTrip` — capdag.test.js:1845
- `testJS_capJSONSerialization` — capdag.test.js:1818
- `testJS_capWithMediaSpecs` — capdag.test.js:1804
- `testJS_getExtensionMappings` — capdag.test.js:1794
- `testJS_mediaSpecConstruction` — capdag.test.js:2000
- `testJS_mediaSpecDocumentationPropagatesThroughResolve` — capdag.test.js:1890
- `testJS_mediaUrnsForExtension` — capdag.test.js:1766
- `testJS_stdinSourceKindConstants` — capdag.test.js:1920
- `testJS_stdinSourceNullData` — capdag.test.js:1926
- `testLlmGenerateTextUrnSpecs` — capdag.test.js:1719
- `testMachine_aliasFallbackWithoutOpTag` — capdag.test.js:3476
- `testMachine_aliasFromOpTag` — capdag.test.js:3465
- `testMachine_builderChaining` — capdag.test.js:3533
- `testMachine_builderEquivalentToParsed` — capdag.test.js:3541
- `testMachine_builderRoundTrip` — capdag.test.js:3553
- `testMachine_builderSingleEdge` — capdag.test.js:3509
- `testMachine_builderWithLoop` — capdag.test.js:3521
- `testMachine_capRegistryClient_construction` — capdag.test.js:3834
- `testMachine_capRegistryEntry_construction` — capdag.test.js:3798
- `testMachine_capRegistryEntry_defaults` — capdag.test.js:3841
- `testMachine_capUrnInMediaUrn` — capdag.test.js:3580
- `testMachine_capUrnIsComparable` — capdag.test.js:3573
- `testMachine_capUrnIsEquivalent` — capdag.test.js:3565
- `testMachine_capUrnOutMediaUrn` — capdag.test.js:3587
- `testMachine_conflictingMediaTypesFail` — capdag.test.js:2946
- `testMachine_differentAliasesSameGraph` — capdag.test.js:2968
- `testMachine_displayEdge` — capdag.test.js:3312
- `testMachine_displayGraph` — capdag.test.js:3323
- `testMachine_duplicateAlias` — capdag.test.js:2839
- `testMachine_duplicateOpTagsDisambiguated` — capdag.test.js:3487
- `testMachine_edgeEquivalenceDifferentCapUrns` — capdag.test.js:3123
- `testMachine_edgeEquivalenceDifferentLoopFlag` — capdag.test.js:3155
- `testMachine_edgeEquivalenceDifferentSourceCount` — capdag.test.js:3187
- `testMachine_edgeEquivalenceDifferentTargets` — capdag.test.js:3139
- `testMachine_edgeEquivalenceSameUrns` — capdag.test.js:3107
- `testMachine_edgeEquivalenceSourceOrderIndependent` — capdag.test.js:3171
- `testMachine_emptyInput` — capdag.test.js:2824
- `testMachine_errorLocation_duplicateAlias` — capdag.test.js:3707
- `testMachine_errorLocation_parseError` — capdag.test.js:3697
- `testMachine_errorLocation_undefinedAlias` — capdag.test.js:3721
- `testMachine_fanInSecondaryAssignedByPriorWiring` — capdag.test.js:2896
- `testMachine_fanInSecondaryUnassignedGetsWildcard` — capdag.test.js:2909
- `testMachine_fanOut` — capdag.test.js:2879
- `testMachine_graphEmpty` — capdag.test.js:3260
- `testMachine_graphEmptyEquivalence` — capdag.test.js:3266
- `testMachine_graphEquivalenceReorderedEdges` — capdag.test.js:3218
- `testMachine_graphEquivalenceSameEdges` — capdag.test.js:3203
- `testMachine_graphNotEquivalentDifferentCap` — capdag.test.js:3247
- `testMachine_graphNotEquivalentDifferentEdgeCount` — capdag.test.js:3233
- `testMachine_headerOnlyNoWirings` — capdag.test.js:2832
- `testMachine_leafTargetsLinearChain` — capdag.test.js:3286
- `testMachine_lineBasedAndBracketedParseSameGraph` — capdag.test.js:3081
- `testMachine_lineBasedEquivalentToBracketed` — capdag.test.js:3049
- `testMachine_lineBasedFanIn` — capdag.test.js:3028
- `testMachine_lineBasedFormatSerialization` — capdag.test.js:3061
- `testMachine_lineBasedLoop` — capdag.test.js:3019
- `testMachine_lineBasedSimpleChain` — capdag.test.js:2996
- `testMachine_lineBasedTwoStepChain` — capdag.test.js:3009
- `testMachine_loopEdge` — capdag.test.js:2920
- `testMachine_malformedInputFails` — capdag.test.js:2980
- `testMachine_mediaRegistryEntry_construction` — capdag.test.js:3821
- `testMachine_mediaUrnIsComparable` — capdag.test.js:3604
- `testMachine_mediaUrnIsEquivalent` — capdag.test.js:3596
- `testMachine_mixedBracketedAndLineBased` — capdag.test.js:3041
- `testMachine_multilineFormat` — capdag.test.js:2958
- `testMachine_multilineSerializeFormat` — capdag.test.js:3451
- `testMachine_nodeAliasCollision` — capdag.test.js:2936
- `testMachine_parseMachineWithAST_aliasMap` — capdag.test.js:3667
- `testMachine_parseMachineWithAST_fanInSourceLocations` — capdag.test.js:3656
- `testMachine_parseMachineWithAST_headerLocation` — capdag.test.js:3617
- `testMachine_parseMachineWithAST_multilinePositions` — capdag.test.js:3647
- `testMachine_parseMachineWithAST_nodeMedia` — capdag.test.js:3685
- `testMachine_parseMachineWithAST_wiringLocation` — capdag.test.js:3633
- `testMachine_reorderedEdgesProduceSameNotation` — capdag.test.js:3435
- `testMachine_rootSourcesFanIn` — capdag.test.js:3300
- `testMachine_rootSourcesLinearChain` — capdag.test.js:3272
- `testMachine_roundtripFanOut` — capdag.test.js:3394
- `testMachine_roundtripLoopEdge` — capdag.test.js:3409
- `testMachine_roundtripSingleEdge` — capdag.test.js:3367
- `testMachine_roundtripTwoEdgeChain` — capdag.test.js:3380
- `testMachine_serializationIsDeterministic` — capdag.test.js:3422
- `testMachine_serializeEmptyGraph` — capdag.test.js:3363
- `testMachine_serializeSingleEdge` — capdag.test.js:3336
- `testMachine_serializeTwoEdgeChain` — capdag.test.js:3350
- `testMachine_simpleLinearChain` — capdag.test.js:2850
- `testMachine_toMermaid_emptyGraph` — capdag.test.js:3761
- `testMachine_toMermaid_fanIn` — capdag.test.js:3767
- `testMachine_toMermaid_fanOut` — capdag.test.js:3778
- `testMachine_toMermaid_linearChain` — capdag.test.js:3735
- `testMachine_toMermaid_loopEdge` — capdag.test.js:3750
- `testMachine_twoStepChain` — capdag.test.js:2865
- `testMachine_undefinedAliasFails` — capdag.test.js:2929
- `testMachine_unterminatedBracketFails` — capdag.test.js:2987
- `testMachine_whitespaceOnly` — capdag.test.js:2828
- `testRenderer_buildEditorGraphData_capWithoutCompleteArgsIsDropped` — capdag.test.js:5058
- `testRenderer_buildEditorGraphData_cardinalityFromDataSlotSequenceFlags` — capdag.test.js:5039
- `testRenderer_buildEditorGraphData_collapsesCapsIntoLabeledEdges` — capdag.test.js:4983
- `testRenderer_buildEditorGraphData_loopMarkedEdgeGetsLoopClass` — capdag.test.js:5021
- `testRenderer_buildEditorGraphData_rejectsEdgeWithMissingSource` — capdag.test.js:5075
- `testRenderer_buildResolvedMachineGraphData_duplicateNodeIdAcrossStrandsFailsHard` — capdag.test.js:5278
- `testRenderer_buildResolvedMachineGraphData_fanInProducesEdgePerAssignment` — capdag.test.js:5179
- `testRenderer_buildResolvedMachineGraphData_loopEdgeGetsLoopClass` — capdag.test.js:5146
- `testRenderer_buildResolvedMachineGraphData_multiStrandKeepsStrandsDisjoint` — capdag.test.js:5218
- `testRenderer_buildResolvedMachineGraphData_singleStrandLinearChain` — capdag.test.js:5091
- `testRenderer_buildRunGraphData_allFailedDropsTargetPlaceholder` — capdag.test.js:4804
- `testRenderer_buildRunGraphData_backboneHasNoForeachNode` — capdag.test.js:4755
- `testRenderer_buildRunGraphData_closedForeachSuccessMergesAtCollectTarget` — capdag.test.js:4920
- `testRenderer_buildRunGraphData_failureWithoutFailedCapRendersFullTrace` — capdag.test.js:4669
- `testRenderer_buildRunGraphData_pagesSuccessesAndFailures` — capdag.test.js:4605
- `testRenderer_buildRunGraphData_unclosedForeachSuccessNoMerge` — capdag.test.js:4864
- `testRenderer_buildRunGraphData_usesCapUrnIsEquivalentForFailedCap` — capdag.test.js:4702
- `testRenderer_buildStrandGraphData_foreachCollectSpan` — capdag.test.js:4200
- `testRenderer_buildStrandGraphData_nestedForEachThrows` — capdag.test.js:4303
- `testRenderer_buildStrandGraphData_sequenceShowsCardinality` — capdag.test.js:4183
- `testRenderer_buildStrandGraphData_singleCapPlain` — capdag.test.js:4159
- `testRenderer_buildStrandGraphData_standaloneCollect` — capdag.test.js:4247
- `testRenderer_buildStrandGraphData_unclosedForEachBody` — capdag.test.js:4270
- `testRenderer_canonicalMediaUrn_normalizesTagOrder` — capdag.test.js:3995
- `testRenderer_canonicalMediaUrn_preservesValueTags` — capdag.test.js:4004
- `testRenderer_canonicalMediaUrn_rejectsCapUrn` — capdag.test.js:4009
- `testRenderer_cardinalityFromCap_findsStdinArgNotFirstArg` — capdag.test.js:3920
- `testRenderer_cardinalityFromCap_outputOnlySequence` — capdag.test.js:3952
- `testRenderer_cardinalityFromCap_rejectsStringIsSequence` — capdag.test.js:3963
- `testRenderer_cardinalityFromCap_scalarDefaultsWhenFieldsMissing` — capdag.test.js:3944
- `testRenderer_cardinalityFromCap_throwsOnNonObject` — capdag.test.js:3976
- `testRenderer_cardinalityLabel_allFourCases` — capdag.test.js:3905
- `testRenderer_cardinalityLabel_usesUnicodeArrow` — capdag.test.js:3912
- `testRenderer_classifyStrandCapSteps_capFlags` — capdag.test.js:4114
- `testRenderer_classifyStrandCapSteps_nestedForks` — capdag.test.js:4135
- `testRenderer_collapseStrand_plainCapDistinctTargetNoMerge` — capdag.test.js:4560
- `testRenderer_collapseStrand_plainCapMergesTrailingOutput` — capdag.test.js:4527
- `testRenderer_collapseStrand_sequenceProducingCapBeforeForeach` — capdag.test.js:4467
- `testRenderer_collapseStrand_singleCapBodyKeepsCapOwnLabel` — capdag.test.js:4328
- `testRenderer_collapseStrand_standaloneCollectCollapses` — capdag.test.js:4428
- `testRenderer_collapseStrand_unclosedForEachBodyCollapses` — capdag.test.js:4376
- `testRenderer_mediaNodeLabel_oneLinePerTag_valueAndMarker` — capdag.test.js:4021
- `testRenderer_mediaNodeLabel_stableAcrossTagOrder` — capdag.test.js:4032
- `testRenderer_validateBodyOutcome_rejectsNegativeIndex` — capdag.test.js:4595
- `testRenderer_validateEditorGraphPayload_rejectsUnknownKind` — capdag.test.js:4969
- `testRenderer_validateResolvedMachinePayload_rejectsMissingFields` — capdag.test.js:5313
- `testRenderer_validateStrandPayload_missingSourceSpec` — capdag.test.js:4582
- `testRenderer_validateStrandStep_rejectsUnknownVariant` — capdag.test.js:4075
- `testRenderer_validateStrandStep_requiresBooleanIsSequence` — capdag.test.js:4092
- `testUrn` — capdag.test.js:108
- `testisCollection` — capdag.test.js:2486

---

*Generated from CapDag-JS source tree*
*Total tests: 316*
*Total numbered tests: 167*
*Total unnumbered tests: 149*
*Total numbered tests missing descriptions: 0*
*Total numbering mismatches: 0*
