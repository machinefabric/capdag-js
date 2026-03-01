# Capns-JS Test Catalog

**Total Tests:** 236

This catalog lists all numbered tests in the capdag-js codebase.

| Test # | Function Name | Description | Location |
|--------|---------------|-------------|----------|
| test001 | `test001_capUrnCreation` | Cap URN created with tags, direction specs accessible | capdag.test.js:153 |
| test002 | `test002_directionSpecsRequired` | Missing in -> MissingInSpec, missing out -> MissingOutSpec | capdag.test.js:163 |
| test003 | `test003_directionMatching` | Direction specs must match exactly; wildcard matches any | capdag.test.js:177 |
| test004 | `test004_unquotedValuesLowercased` | Unquoted keys/values normalized to lowercase | capdag.test.js:192 |
| test005 | `test005_quotedValuesPreserveCase` | Quoted values preserve case | capdag.test.js:201 |
| test006 | `test006_quotedValueSpecialChars` | Semicolons, equals, spaces in quoted values | capdag.test.js:207 |
| test007 | `test007_quotedValueEscapeSequences` | Escaped quotes and backslashes in quoted values | capdag.test.js:213 |
| test008 | `test008_mixedQuotedUnquoted` | Mix of quoted and unquoted values | capdag.test.js:220 |
| test009 | `test009_unterminatedQuoteError` | Unterminated quote produces error | capdag.test.js:227 |
| test010 | `test010_invalidEscapeSequenceError` | Invalid escape sequences produce error | capdag.test.js:240 |
| test011 | `test011_serializationSmartQuoting` | Smart quoting: no quotes for simple lowercase, quotes for special | capdag.test.js:254 |
| test012 | `test012_roundTripSimple` | Simple cap URN parse -> serialize -> parse equals original | capdag.test.js:263 |
| test013 | `test013_roundTripQuoted` | Quoted values round-trip preserving case | capdag.test.js:271 |
| test014 | `test014_roundTripEscapes` | Escape sequences round-trip correctly | capdag.test.js:280 |
| test015 | `test015_capPrefixRequired` | cap: prefix required, case-insensitive | capdag.test.js:290 |
| test016 | `test016_trailingSemicolonEquivalence` | With/without trailing semicolon are equivalent | capdag.test.js:302 |
| test017 | `test017_tagMatching` | Exact match, subset match, wildcard match, value mismatch | capdag.test.js:310 |
| test018 | `test018_matchingCaseSensitiveValues` | Quoted uppercase values don't match lowercase (case sensitive) | capdag.test.js:331 |
| test019 | `test019_missingTagHandling` | Missing tags treated as wildcards | capdag.test.js:338 |
| test020 | `test020_specificity` | Direction specs use MediaUrn tag count, other tags count non-wildcard | capdag.test.js:352 |
| test021 | `test021_builder` | CapUrnBuilder creates valid URN | capdag.test.js:371 |
| test022 | `test022_builderRequiresDirection` | Builder requires both inSpec and outSpec | capdag.test.js:385 |
| test023 | `test023_builderPreservesCase` | Builder lowercases keys but preserves value case | capdag.test.js:399 |
| test024 | `test024_compatibility` | Directional accepts checks | capdag.test.js:410 |
| test025 | `test025_bestMatch` | CapMatcher.findBestMatch returns most specific | capdag.test.js:430 |
| test026 | `test026_mergeAndSubset` | merge combines tags, subset keeps only specified | capdag.test.js:443 |
| test027 | `test027_wildcardTag` | withWildcardTag sets tag to wildcard including in/out | capdag.test.js:462 |
| test028 | `test028_emptyCapUrnNotAllowed` | Empty cap URN without in/out fails (MissingInSpec) | capdag.test.js:475 |
| test029 | `test029_minimalCapUrn` | Minimal valid cap URN: just in and out, empty tags | capdag.test.js:484 |
| test030 | `test030_extendedCharacterSupport` | Forward slashes and colons in tag values | capdag.test.js:492 |
| test031 | `test031_wildcardRestrictions` | Wildcard rejected in keys, accepted in values | capdag.test.js:499 |
| test032 | `test032_duplicateKeyRejection` | Duplicate keys rejected | capdag.test.js:517 |
| test033 | `test033_numericKeyRestriction` | Pure numeric keys rejected, mixed alphanumeric OK | capdag.test.js:526 |
| test034 | `test034_emptyValueError` | key= (empty value) is rejected | capdag.test.js:540 |
| test035 | `test035_hasTagCaseSensitive` | hasTag case-sensitive for values, case-insensitive for keys, works for in/out | capdag.test.js:553 |
| test036 | `test036_withTagPreservesValue` | withTag preserves value case | capdag.test.js:565 |
| test037 | `test037_withTagRejectsEmptyValue` | withTag('key', '') -> error Note: In JS, withTag does not currently reject empty values (it stores them). The Rust implementation rejects empty values. We test the JS behavior as-is. | capdag.test.js:574 |
| test038 | `test038_semanticEquivalence` | Unquoted 'simple' == quoted '"simple"' (lowercase) | capdag.test.js:584 |
| test039 | `test039_getTagReturnsDirectionSpecs` | getTag('in') and getTag('out') work, case-insensitive | capdag.test.js:592 |
| test040 | `test040_matchingSemanticsExactMatch` | Cap and request same tags -> accepts=true | capdag.test.js:601 |
| test041 | `test041_matchingSemanticsCapMissingTag` | Cap missing tag -> implicit wildcard -> accepts=true | capdag.test.js:608 |
| test042 | `test042_matchingSemanticsCapHasExtraTag` | Cap extra tag -> still matches | capdag.test.js:615 |
| test043 | `test043_matchingSemanticsRequestHasWildcard` | Request ext=* matches cap ext=pdf | capdag.test.js:622 |
| test044 | `test044_matchingSemanticsCapHasWildcard` | Cap ext=* matches request ext=pdf | capdag.test.js:629 |
| test045 | `test045_matchingSemanticsValueMismatch` | ext=pdf vs ext=docx -> no match | capdag.test.js:636 |
| test046 | `test046_matchingSemanticsFallbackPattern` | Cap without ext matches request with ext=wav (uses media:binary directions) | capdag.test.js:643 |
| test047 | `test047_matchingSemanticsThumbnailVoidInput` | Thumbnail with void input matches specific ext request | capdag.test.js:650 |
| test048 | `test048_matchingSemanticsWildcardDirection` | Cap in=* out=* matches any request | capdag.test.js:657 |
| test049 | `test049_matchingSemanticsCrossDimension` | Cap op=generate accepts request ext=pdf (independent tags) | capdag.test.js:664 |
| test050 | `test050_matchingSemanticsDirectionMismatch` | media:string vs media: (wildcard) -> no match | capdag.test.js:671 |
| test054 | `test054_xv5InlineSpecRedefinitionDetected` | Inline media spec redefinition of registry spec is detected | capdag.test.js:760 |
| test055 | `test055_xv5NewInlineSpecAllowed` | New inline media spec not in registry is allowed | capdag.test.js:777 |
| test056 | `test056_xv5EmptyMediaSpecsAllowed` | Empty/null media_specs passes validation | capdag.test.js:792 |
| test060 | `test060_wrongPrefixFails` | MediaUrn.fromString('cap:string') -> INVALID_PREFIX error | capdag.test.js:804 |
| test061 | `test061_isBinary` | isBinary true when textable tag is absent (binary = not textable) | capdag.test.js:813 |
| test062 | `test062_isRecord` | isMap true for MEDIA_OBJECT (record); false for MEDIA_STRING (form=scalar), MEDIA_STRING_ARRAY (list) is_record returns true if record marker tag is present (key-value structure) | capdag.test.js:830 |
| test063 | `test063_isScalar` | is_scalar returns true if NO list marker (scalar is default cardinality) | capdag.test.js:841 |
| test064 | `test064_isList` | isList true for MEDIA_STRING_ARRAY, MEDIA_INTEGER_ARRAY, MEDIA_OBJECT_ARRAY; false for MEDIA_STRING, MEDIA_OBJECT | capdag.test.js:855 |
| test065 | `test065_isOpaque` | is_opaque returns true if NO record marker (opaque is default structure) | capdag.test.js:864 |
| test066 | `test066_isJson` | isJson true for MEDIA_JSON; false for MEDIA_OBJECT (map but not json) | capdag.test.js:875 |
| test067 | `test067_isText` | is_text returns true only if "textable" marker tag is present | capdag.test.js:881 |
| test068 | `test068_isVoid` | isVoid true for media:void; false for media:string | capdag.test.js:892 |
| test071 | `test071_toStringRoundtrip` | Parse -> toString -> parse equals original | capdag.test.js:900 |
| test072 | `test072_constantsParse` | All MEDIA_* constants parse as valid MediaUrns | capdag.test.js:910 |
| test074 | `test074_mediaUrnMatching` | MEDIA_PDF (media:pdf) conformsTo media:pdf; MEDIA_MD conformsTo media:md; same URNs conform | capdag.test.js:930 |
| test075 | `test075_accepts` | handler accepts same request, general handler accepts request | capdag.test.js:944 |
| test076 | `test076_specificity` | More tags = higher specificity | capdag.test.js:955 |
| test077 | `test077_serdeRoundtrip` | N/A for JS (Rust serde) - but we test JSON.stringify round-trip | capdag.test.js:964 |
| test078 | `test078_debugMatchingBehavior` | MEDIA_OBJECT does NOT conform to MEDIA_STRING | capdag.test.js:973 |
| test091 | `test091_resolveCustomMediaSpec` | resolveMediaUrn resolves custom from local mediaSpecs | capdag.test.js:988 |
| test092 | `test092_resolveCustomWithSchema` | resolveMediaUrn resolves with schema from local mediaSpecs | capdag.test.js:998 |
| test093 | `test093_resolveUnresolvableFailsHard` | resolveMediaUrn fails hard on unknown URN | capdag.test.js:1015 |
| test099 | `test099_resolvedIsBinary` | MediaSpec with media: (no textable tag) -> isBinary() true | capdag.test.js:1034 |
| test100 | `test100_resolvedIsRecord` | MediaSpec with record -> isRecord() true | capdag.test.js:1040 |
| test101 | `test101_resolvedIsScalar` | MediaSpec with form=scalar -> isScalar() true | capdag.test.js:1046 |
| test102 | `test102_resolvedIsList` | MediaSpec with list -> isList() true | capdag.test.js:1052 |
| test103 | `test103_resolvedIsJson` | MediaSpec with json tag -> isJSON() true | capdag.test.js:1058 |
| test104 | `test104_resolvedIsText` | MediaSpec with textable tag -> isText() true | capdag.test.js:1064 |
| test105 | `test105_metadataPropagation` | Metadata propagated from media spec definition | capdag.test.js:1070 |
| test106 | `test106_metadataWithValidation` | Metadata and validation coexist | capdag.test.js:1093 |
| test107 | `test107_extensionsPropagation` | Extensions field propagated | capdag.test.js:1112 |
| test108 | `test108_extensionsSerialization` | N/A for JS (Rust serde) - but we test MediaSpec with extensions | capdag.test.js:1128 |
| test109 | `test109_extensionsWithMetadataAndValidation` | Extensions coexist with metadata and validation | capdag.test.js:1136 |
| test110 | `test110_multipleExtensions` | Multiple extensions in a media spec | capdag.test.js:1155 |
| test117 | `test117_capBlockMoreSpecificWins` | CapBlock finds more specific cap across registries | capdag.test.js:1175 |
| test118 | `test118_capBlockTieGoesToFirst` | CapBlock tie-breaking prefers first registry in order | capdag.test.js:1205 |
| test119 | `test119_capBlockPollsAll` | CapBlock polls all registries to find best match | capdag.test.js:1226 |
| test120 | `test120_capBlockNoMatch` | CapBlock returns error when no cap matches request | capdag.test.js:1253 |
| test121 | `test121_capBlockFallbackScenario` | CapBlock fallback scenario where generic cap handles unknown file types | capdag.test.js:1268 |
| test122 | `test122_capBlockCanMethod` | CapBlock can method returns execution info and acceptsRequest checks capability | capdag.test.js:1300 |
| test123 | `test123_capBlockRegistryManagement` | CapBlock registry management add, get, remove operations | capdag.test.js:1317 |
| test124 | `test124_capGraphBasicConstruction` | CapGraph basic construction builds nodes and edges from caps | capdag.test.js:1336 |
| test125 | `test125_capGraphOutgoingIncoming` | CapGraph getOutgoing and getIncoming return correct edges for media URN | capdag.test.js:1355 |
| test126 | `test126_capGraphCanConvert` | CapGraph canConvert checks direct and transitive conversion paths | capdag.test.js:1373 |
| test127 | `test127_capGraphFindPath` | CapGraph findPath returns shortest path between media URNs | capdag.test.js:1394 |
| test128 | `test128_capGraphFindAllPaths` | CapGraph findAllPaths returns all paths sorted by length | capdag.test.js:1427 |
| test129 | `test129_capGraphGetDirectEdges` | CapGraph getDirectEdges returns edges sorted by specificity | capdag.test.js:1447 |
| test130 | `test130_capGraphStats` | CapGraph stats returns node count, edge count, input/output URN counts | capdag.test.js:1472 |
| test131 | `test131_capGraphWithCapBlock` | CapGraph with CapBlock builds graph from multiple registries | capdag.test.js:1493 |
| test156 | `test156_stdinSourceFromData` | Creating StdinSource Data variant with byte vector | capdag.test.js:1527 |
| test157 | `test157_stdinSourceFromFileReference` | Creating StdinSource FileReference variant with all required fields | capdag.test.js:1538 |
| test158 | `test158_stdinSourceWithEmptyData` | StdinSource Data with empty vector stores and retrieves correctly | capdag.test.js:1555 |
| test159 | `test159_stdinSourceWithBinaryContent` | StdinSource Data with binary content like PNG header bytes | capdag.test.js:1563 |
| test274 | `test274_capArgumentValueNew` | CapArgumentValue constructor stores media_urn and raw byte value | capdag.test.js:1577 |
| test275 | `test275_capArgumentValueFromStr` | CapArgumentValue.fromStr converts string to UTF-8 bytes | capdag.test.js:1584 |
| test276 | `test276_capArgumentValueAsStrValid` | CapArgumentValue.valueAsStr succeeds for UTF-8 data | capdag.test.js:1591 |
| test277 | `test277_capArgumentValueAsStrInvalidUtf8` | CapArgumentValue.valueAsStr fails for non-UTF-8 binary data | capdag.test.js:1597 |
| test278 | `test278_capArgumentValueEmpty` | CapArgumentValue with empty value stores empty Uint8Array | capdag.test.js:1609 |
| test282 | `test282_capArgumentValueUnicode` | CapArgumentValue.fromStr with Unicode string preserves all characters | capdag.test.js:1618 |
| test283 | `test283_capArgumentValueLargeBinary` | CapArgumentValue with large binary payload preserves all bytes | capdag.test.js:1624 |
| test304 | `test304_mediaAvailabilityOutputConstant` | MEDIA_AVAILABILITY_OUTPUT constant parses as valid media URN with correct tags | capdag.test.js:1643 |
| test305 | `test305_mediaPathOutputConstant` | MEDIA_PATH_OUTPUT constant parses as valid media URN with correct tags | capdag.test.js:1653 |
| test306 | `test306_availabilityAndPathOutputDistinct` | MEDIA_AVAILABILITY_OUTPUT and MEDIA_PATH_OUTPUT are distinct URNs | capdag.test.js:1663 |
| test307 | `test307_modelAvailabilityUrn` | model_availability_urn builds valid cap URN with correct op and media specs | capdag.test.js:1677 |
| test308 | `test308_modelPathUrn` | model_path_urn builds valid cap URN with correct op and media specs | capdag.test.js:1689 |
| test309 | `test309_modelAvailabilityAndPathAreDistinct` | model_availability_urn and model_path_urn produce distinct URNs | capdag.test.js:1701 |
| test310 | `test310_llmConversationUrnUnconstrained` | llm_conversation_urn uses unconstrained tag (not constrained) | capdag.test.js:1708 |
| test311 | `test311_llmConversationUrnSpecs` | llm_conversation_urn in/out specs match the expected media URNs semantically | capdag.test.js:1716 |
| test312 | `test312_allUrnBuildersProduceValidUrns` | All URN builders produce parseable cap URNs | capdag.test.js:1727 |
| test320 | `test320_pluginInfoConstruction` | Plugin info construction | capdag.test.js:2018 |
| test321 | `test321_pluginInfoIsSigned` | Plugin info is signed check | capdag.test.js:2038 |
| test322 | `test322_pluginInfoHasBinary` | Plugin info has binary check | capdag.test.js:2050 |
| test323 | `test323_pluginRepoServerValidateRegistry` | PluginRepoServer validate registry | capdag.test.js:2062 |
| test324 | `test324_pluginRepoServerTransformToArray` | PluginRepoServer transform to array | capdag.test.js:2089 |
| test325 | `test325_pluginRepoServerGetPlugins` | PluginRepoServer get plugins | capdag.test.js:2108 |
| test326 | `test326_pluginRepoServerGetPluginById` | PluginRepoServer get plugin by ID | capdag.test.js:2118 |
| test327 | `test327_pluginRepoServerSearchPlugins` | PluginRepoServer search plugins | capdag.test.js:2130 |
| test328 | `test328_pluginRepoServerGetByCategory` | PluginRepoServer get by category | capdag.test.js:2145 |
| test329 | `test329_pluginRepoServerGetByCap` | PluginRepoServer get by cap | capdag.test.js:2158 |
| test330 | `test330_pluginRepoClientUpdateCache` | PluginRepoClient update cache | capdag.test.js:2173 |
| test331 | `test331_pluginRepoClientGetSuggestions` | PluginRepoClient get suggestions | capdag.test.js:2187 |
| test332 | `test332_pluginRepoClientGetPlugin` | PluginRepoClient get plugin | capdag.test.js:2204 |
| test333 | `test333_pluginRepoClientGetAllCaps` | PluginRepoClient get all caps | capdag.test.js:2220 |
| test334 | `test334_pluginRepoClientNeedsSync` | PluginRepoClient needs sync | capdag.test.js:2234 |
| test335 | `test335_pluginRepoServerClientIntegration` | PluginRepoServer and Client integration | capdag.test.js:2255 |
| test501 | `test501_tagged_urn_creation` | Verify basic URN creation from string with multiple tags | tagged-urn.test.js:63 |
| test502 | `test502_custom_prefix` | Verify custom prefixes work and tags are sorted alphabetically | tagged-urn.test.js:72 |
| test503 | `test503_prefix_case_insensitive` | Verify prefix is case-insensitive (CAP, cap, Cap all equal) | tagged-urn.test.js:80 |
| test504 | `test504_prefix_mismatch_error` | Verify error when comparing URNs with different prefixes | tagged-urn.test.js:93 |
| test505 | `test505_builder_with_prefix` | Verify builder pattern works with custom prefix | tagged-urn.test.js:105 |
| test506 | `test506_unquoted_values_lowercased` | Verify unquoted values are normalized to lowercase | tagged-urn.test.js:115 |
| test507 | `test507_quoted_values_preserve_case` | Verify quoted values preserve their case exactly | tagged-urn.test.js:134 |
| test508 | `test508_quoted_value_special_chars` | Verify semicolons, equals, and spaces in quoted values are allowed | tagged-urn.test.js:151 |
| test509 | `test509_quoted_value_escape_sequences` | Verify escape sequences in quoted values are parsed correctly | tagged-urn.test.js:163 |
| test510 | `test510_mixed_quoted_unquoted` | Verify mixing quoted and unquoted values in same URN | tagged-urn.test.js:178 |
| test511 | `test511_unterminated_quote_error` | Verify error on unterminated quoted value | tagged-urn.test.js:185 |
| test512 | `test512_invalid_escape_sequence_error` | Verify error on invalid escape sequences (only \\" and \\\\ allowed) | tagged-urn.test.js:194 |
| test513 | `test513_serialization_smart_quoting` | Verify smart quoting: quotes only when necessary | tagged-urn.test.js:209 |
| test514 | `test514_round_trip_simple` | Verify simple URN round-trips correctly (parse -> serialize -> parse) | tagged-urn.test.js:238 |
| test515 | `test515_round_trip_quoted` | Verify quoted values round-trip correctly | tagged-urn.test.js:247 |
| test516 | `test516_round_trip_escapes` | Verify escape sequences round-trip correctly | tagged-urn.test.js:257 |
| test517 | `test517_prefix_required` | Verify missing prefix causes error | tagged-urn.test.js:267 |
| test518 | `test518_trailing_semicolon_equivalence` | Verify trailing semicolon is optional and doesn't affect equality | tagged-urn.test.js:289 |
| test519 | `test519_canonical_string_format` | Verify canonical form: alphabetically sorted tags, no trailing semicolon | tagged-urn.test.js:304 |
| test520 | `test520_tag_matching` | Verify hasTag and getTag methods work correctly | tagged-urn.test.js:314 |
| test521 | `test521_matching_case_sensitive_values` | Verify value matching is case-sensitive | tagged-urn.test.js:331 |
| test522 | `test522_missing_tag_handling` | Verify handling of missing tags in conformsTo semantics | tagged-urn.test.js:347 |
| test523 | `test523_specificity` | Verify graded specificity scoring | tagged-urn.test.js:373 |
| test524 | `test524_builder` | Verify builder creates correct URN | tagged-urn.test.js:394 |
| test525 | `test525_builder_preserves_case` | Verify builder preserves case in quoted values | tagged-urn.test.js:407 |
| test526 | `test526_compatibility` | Verify two URNs can be checked for compatibility | tagged-urn.test.js:419 |
| test527 | `test527_best_match` | Verify UrnMatcher finds best match among candidates | tagged-urn.test.js:434 |
| test528 | `test528_merge_and_subset` | Verify merge and subset operations | tagged-urn.test.js:455 |
| test529 | `test529_merge_prefix_mismatch` | Verify error when merging URNs with different prefixes | tagged-urn.test.js:468 |
| test530 | `test530_wildcard_tag` | Verify wildcard value matching behavior | tagged-urn.test.js:484 |
| test531 | `test531_empty_tagged_urn` | Verify empty URN (no tags) is valid and matches everything | tagged-urn.test.js:495 |
| test532 | `test532_empty_with_custom_prefix` | Verify empty URN works with custom prefix | tagged-urn.test.js:513 |
| test533 | `test533_extended_character_support` | Verify forward slashes and colons in tag components | tagged-urn.test.js:524 |
| test534 | `test534_wildcard_restrictions` | Verify wildcard cannot be used as a key | tagged-urn.test.js:531 |
| test535 | `test535_duplicate_key_rejection` | Verify duplicate keys are rejected with error | tagged-urn.test.js:543 |
| test536 | `test536_numeric_key_restriction` | Verify purely numeric keys are rejected | tagged-urn.test.js:552 |
| test537 | `test537_empty_value_error` | Verify empty values (key=) cause error | tagged-urn.test.js:570 |
| test538 | `test538_has_tag_case_sensitive` | Verify hasTag value comparison is case-sensitive | tagged-urn.test.js:584 |
| test539 | `test539_with_tag_preserves_value` | Verify withTag preserves value case | tagged-urn.test.js:600 |
| test540 | `test540_with_tag_rejects_empty_value` | Verify withTag rejects empty value | tagged-urn.test.js:606 |
| test541 | `test541_builder_rejects_empty_value` | Verify builder rejects empty value | tagged-urn.test.js:615 |
| test542 | `test542_semantic_equivalence` | Verify unquoted and quoted simple lowercase values are equivalent | tagged-urn.test.js:624 |
| test543 | `test543_matching_semantics_exact_match` | Instance and pattern have same tag/value - matches | tagged-urn.test.js:639 |
| test544 | `test544_matching_semantics_instance_missing_tag` | Pattern requires tag but instance doesn't have it - no match | tagged-urn.test.js:646 |
| test545 | `test545_matching_semantics_extra_tag` | Instance has extra tag not in pattern - still matches | tagged-urn.test.js:656 |
| test546 | `test546_isImage` | isImage returns true only when image marker tag is present | capdag.test.js:2288 |
| test546 | `test546_matching_semantics_request_wildcard` | Pattern has wildcard - matches any value | tagged-urn.test.js:663 |
| test547 | `test547_isAudio` | isAudio returns true only when audio marker tag is present | capdag.test.js:2300 |
| test547 | `test547_matching_semantics_cap_wildcard` | Instance has wildcard - matches any pattern constraint | tagged-urn.test.js:670 |
| test548 | `test548_isVideo` | isVideo returns true only when video marker tag is present | capdag.test.js:2311 |
| test548 | `test548_matching_semantics_value_mismatch` | Instance and pattern have same key but different values - no match | tagged-urn.test.js:677 |
| test549 | `test549_isNumeric` | isNumeric returns true only when numeric marker tag is present | capdag.test.js:2321 |
| test549 | `test549_matching_semantics_pattern_extra_tag` | Pattern has constraint instance doesn't have - no match | tagged-urn.test.js:684 |
| test550 | `test550_isBool` | isBool returns true only when bool marker tag is present | capdag.test.js:2333 |
| test550 | `test550_matching_semantics_empty_pattern` | Empty pattern matches any instance | tagged-urn.test.js:694 |
| test551 | `test551_isFilePath` | isFilePath returns true for scalar file-path, false for array | capdag.test.js:2345 |
| test551 | `test551_matching_semantics_cross_dimension` | Multiple independent tag constraints work correctly | tagged-urn.test.js:705 |
| test552 | `test552_isFilePathArray` | isFilePathArray returns true for list file-path, false for scalar | capdag.test.js:2355 |
| test552 | `test552_matching_different_prefixes_error` | Matching URNs with different prefixes returns error | tagged-urn.test.js:716 |
| test553 | `test553_isAnyFilePath` | isAnyFilePath returns true for both scalar and array file-path | capdag.test.js:2364 |
| test553 | `test553_valueless_tag_parsing_single` | Single value-less tag parses as wildcard | tagged-urn.test.js:744 |
| test554 | `test554_isCollection` | isCollection returns true when collection marker tag is present N/A for JS (MEDIA_COLLECTION constants removed - no longer exists) | capdag.test.js:2374 |
| test554 | `test554_valueless_tag_parsing_multiple` | Multiple value-less tags parse correctly | tagged-urn.test.js:751 |
| test555 | `test555_valueless_tag_mixed_with_valued` | Mix of valueless and valued tags works | tagged-urn.test.js:760 |
| test556 | `test556_valueless_tag_at_end` | Valueless tag at end (no trailing semicolon) works | tagged-urn.test.js:770 |
| test557 | `test557_valueless_tag_equivalence_to_wildcard` | Valueless tag is equivalent to explicit wildcard | tagged-urn.test.js:778 |
| test558 | `test558_predicateConstantConsistency` | predicates are consistent with constants - every constant triggers exactly the expected predicates | capdag.test.js:2385 |
| test558 | `test558_valueless_tag_matching` | Valueless tag (wildcard) matches any value | tagged-urn.test.js:787 |
| test559 | `test559_withoutTag` | withoutTag removes tag, ignores in/out, case-insensitive for keys | capdag.test.js:2425 |
| test559 | `test559_valueless_tag_in_pattern` | Pattern with valueless tag requires instance to have tag (any value) | tagged-urn.test.js:799 |
| test560 | `test560_withInOutSpec` | withInSpec and withOutSpec change direction specs | capdag.test.js:2447 |
| test560 | `test560_valueless_tag_specificity` | Valueless tag contributes 2 points to specificity | tagged-urn.test.js:814 |
| test561 | `test561_valueless_tag_roundtrip` | Valueless tags round-trip correctly (serialize as just key) | tagged-urn.test.js:825 |
| test562 | `test562_valueless_tag_case_normalization` | Valueless tags normalized to lowercase | tagged-urn.test.js:835 |
| test563 | `test563_findAllMatches` | CapMatcher.findAllMatches returns all matching caps sorted by specificity | capdag.test.js:2470 |
| test563 | `test563_empty_value_still_error` | Empty value with = is still error (different from valueless) | tagged-urn.test.js:844 |
| test564 | `test564_areCompatible` | CapMatcher.areCompatible detects bidirectional overlap | capdag.test.js:2488 |
| test564 | `test564_valueless_tag_compatibility` | Valueless tags compatible with any value | tagged-urn.test.js:858 |
| test565 | `test565_valueless_numeric_key_still_rejected` | Purely numeric keys still rejected for valueless tags | tagged-urn.test.js:869 |
| test566 | `test566_withTagIgnoresInOut` | withTag silently ignores in/out keys | capdag.test.js:2513 |
| test566 | `test566_whitespace_in_input_rejected` | Leading/trailing whitespace in input is rejected | tagged-urn.test.js:883 |
| test567 | `test567_unspecified_question_mark_parsing` | ? parses as unspecified value | tagged-urn.test.js:919 |
| test568 | `test568_must_not_have_exclamation_parsing` | ! parses as must-not-have value | tagged-urn.test.js:926 |
| test569 | `test569_question_mark_pattern_matches_anything` | Pattern with K=? matches any instance (with or without K) | tagged-urn.test.js:933 |
| test570 | `test570_question_mark_in_instance` | Instance with K=? matches any pattern constraint | tagged-urn.test.js:950 |
| test571 | `test571_must_not_have_pattern_requires_absent` | Pattern with K=! requires instance to NOT have K | tagged-urn.test.js:967 |
| test572 | `test572_must_not_have_in_instance` | Instance with K=! conflicts with patterns requiring K | tagged-urn.test.js:982 |
| test573 | `test573_full_cross_product_matching` | Comprehensive test of all instance/pattern combinations | tagged-urn.test.js:999 |
| test574 | `test574_mixed_special_values` | URNs with multiple special values work correctly | tagged-urn.test.js:1047 |
| test575 | `test575_serialization_round_trip_special_values` | All special values round-trip correctly | tagged-urn.test.js:1068 |
| test576 | `test576_compatibility_with_special_values` | ! is incompatible with * and specific values, ? compatible with everything | tagged-urn.test.js:1085 |
| test577 | `test577_specificity_with_special_values` | Verify graded specificity with special values | tagged-urn.test.js:1109 |
| test643 | `test643_explicitAsteriskIsWildcard` | cap:in=*;out=* treated as wildcards | capdag.test.js:2536 |
| test644 | `test644_specificInWildcardOut` | cap:in=media:;out=* has specific in, wildcard out | capdag.test.js:2543 |
| test645 | `test645_wildcardInSpecificOut` | cap:in=*;out=media:text has wildcard in, specific out | capdag.test.js:2550 |
| test648 | `test648_wildcardAcceptsSpecific` | Wildcard in/out match specific caps | capdag.test.js:2560 |
| test649 | `test649_specificityScoring` | Specificity - wildcard has 0, specific has tag count | capdag.test.js:2569 |
| test651 | `test651_identityFormsEquivalent` | All identity forms with explicit wildcards produce the same CapUrn | capdag.test.js:2580 |
| test653 | `test653_identityRoutingIsolation` | Identity (no extra tags) does not steal routes from specific handlers | capdag.test.js:2600 |
| test890 | `test890_directionSemanticMatching` | Semantic direction matching - generic provider matches specific request | capdag.test.js:682 |
| test891 | `test891_directionSemanticSpecificity` | Semantic direction specificity - more media URN tags = higher specificity | capdag.test.js:732 |

---

*Generated from capdag-js source tree*
*Total numbered tests: 236*
