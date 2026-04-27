# JS Test Catalog

**Total Tests:** 300

**Numbered Tests:** 150

**Unnumbered Tests:** 150

**Numbered Tests Missing Descriptions:** 0

**Numbering Mismatches:** 0

All numbered test numbers are unique.

This catalog lists all tests in the JS codebase.

| Test # | Function Name | Description | File |
|--------|---------------|-------------|------|
| test001 | `test001_capUrnCreation` | TEST001: Test that cap URN is created with tags parsed correctly and direction specs accessible | capdag.test.js:132 |
| test002 | `test002_directionSpecsRequired` | TEST002: Test that missing 'in' or 'out' defaults to media: wildcard | capdag.test.js:142 |
| test003 | `test003_directionMatching` | TEST003: Test that direction specs must match exactly, different in/out types don't match, wildcard matches any | capdag.test.js:153 |
| test004 | `test004_unquotedValuesLowercased` | TEST004: Test that unquoted keys and values are normalized to lowercase | capdag.test.js:168 |
| test005 | `test005_quotedValuesPreserveCase` | TEST005: Test that quoted values preserve case while unquoted are lowercased | capdag.test.js:177 |
| test006 | `test006_quotedValueSpecialChars` | TEST006: Test that quoted values can contain special characters (semicolons, equals, spaces) | capdag.test.js:183 |
| test007 | `test007_quotedValueEscapeSequences` | TEST007: Test that escape sequences in quoted values (\" and \\) are parsed correctly | capdag.test.js:189 |
| test008 | `test008_mixedQuotedUnquoted` | TEST008: Test that mixed quoted and unquoted values in same URN parse correctly | capdag.test.js:196 |
| test009 | `test009_unterminatedQuoteError` | TEST009: Test that unterminated quote produces UnterminatedQuote error | capdag.test.js:203 |
| test010 | `test010_invalidEscapeSequenceError` | TEST010: Test that invalid escape sequences (like \n, \x) produce InvalidEscapeSequence error | capdag.test.js:216 |
| test011 | `test011_serializationSmartQuoting` | TEST011: Test that serialization uses smart quoting (no quotes for simple lowercase, quotes for special chars/uppercase) | capdag.test.js:230 |
| test012 | `test012_roundTripSimple` | TEST012: Test that simple cap URN round-trips (parse -> serialize -> parse equals original) | capdag.test.js:239 |
| test013 | `test013_roundTripQuoted` | TEST013: Test that quoted values round-trip preserving case and spaces | capdag.test.js:247 |
| test014 | `test014_roundTripEscapes` | TEST014: Test that escape sequences round-trip correctly | capdag.test.js:256 |
| test015 | `test015_capPrefixRequired` | TEST015: Test that cap: prefix is required and case-insensitive | capdag.test.js:266 |
| test016 | `test016_trailingSemicolonEquivalence` | TEST016: Test that trailing semicolon is equivalent (same hash, same string, matches) | capdag.test.js:278 |
| test017 | `test017_tagMatching` | TEST017: Test tag matching: exact match, subset match, wildcard match, value mismatch | capdag.test.js:286 |
| test018 | `test018_matchingCaseSensitiveValues` | TEST018: Test that quoted values with different case do NOT match (case-sensitive) | capdag.test.js:310 |
| test019 | `test019_missingTagHandling` | TEST019: Missing tag in instance causes rejection — pattern's tags are constraints | capdag.test.js:317 |
| test020 | `test020_specificity` | TEST020: Test specificity calculation (direction specs use MediaUrn tag count, wildcards don't count) | capdag.test.js:330 |
| test021 | `test021_builder` | TEST021: Test builder creates cap URN with correct tags and direction specs | capdag.test.js:349 |
| test022 | `test022_builderRequiresDirection` | TEST022: Test builder requires both in_spec and out_spec | capdag.test.js:363 |
| test023 | `test023_builderPreservesCase` | TEST023: Test builder lowercases keys but preserves value case | capdag.test.js:377 |
| test024 | `test024_compatibility` | TEST024: Directional accepts — pattern's tags are constraints, instance must satisfy | capdag.test.js:388 |
| test025 | `test025_bestMatch` | TEST025: Test find_best_match returns most specific matching cap | capdag.test.js:408 |
| test026 | `test026_mergeAndSubset` | TEST026: Test merge combines tags from both caps, subset keeps only specified tags | capdag.test.js:421 |
| test027 | `test027_wildcardTag` | TEST027: Test with_wildcard_tag sets tag to wildcard, including in/out | capdag.test.js:440 |
| test028 | `test028_emptyCapUrnNotAllowed` | TEST028: Test empty cap URN defaults to media: wildcard | capdag.test.js:453 |
| test029 | `test029_minimalCapUrn` | TEST029: Test minimal valid cap URN has just in and out, empty tags | capdag.test.js:460 |
| test030 | `test030_extendedCharacterSupport` | TEST030: Test extended characters (forward slashes, colons) in tag values | capdag.test.js:468 |
| test031 | `test031_wildcardRestrictions` | TEST031: Test wildcard rejected in keys but accepted in values | capdag.test.js:475 |
| test032 | `test032_duplicateKeyRejection` | TEST032: Test duplicate keys are rejected with DuplicateKey error | capdag.test.js:493 |
| test033 | `test033_numericKeyRestriction` | TEST033: Test pure numeric keys rejected, mixed alphanumeric allowed, numeric values allowed | capdag.test.js:502 |
| test034 | `test034_emptyValueError` | TEST034: Test empty values are rejected | capdag.test.js:516 |
| test035 | `test035_hasTagCaseSensitive` | TEST035: Test has_tag is case-sensitive for values, case-insensitive for keys, works for in/out | capdag.test.js:529 |
| test036 | `test036_withTagPreservesValue` | TEST036: Test with_tag preserves value case | capdag.test.js:541 |
| test037 | `test037_withTagRejectsEmptyValue` | TEST037: Test with_tag rejects empty value | capdag.test.js:548 |
| test038 | `test038_semanticEquivalence` | TEST038: Test semantic equivalence of unquoted and quoted simple lowercase values | capdag.test.js:558 |
| test039 | `test039_getTagReturnsDirectionSpecs` | TEST039: Test get_tag returns direction specs (in/out) with case-insensitive lookup | capdag.test.js:566 |
| test040 | `test040_matchingSemanticsExactMatch` | TEST040: Matching semantics - exact match succeeds | capdag.test.js:575 |
| test041 | `test041_matchingSemanticsCapMissingTag` | TEST041: Matching semantics - cap missing tag matches (implicit wildcard) | capdag.test.js:582 |
| test042 | `test042_matchingSemanticsCapHasExtraTag` | TEST042: Pattern rejects instance missing required tags | capdag.test.js:590 |
| test043 | `test043_matchingSemanticsRequestHasWildcard` | TEST043: Matching semantics - request wildcard matches specific cap value | capdag.test.js:598 |
| test044 | `test044_matchingSemanticsCapHasWildcard` | TEST044: Matching semantics - cap wildcard matches specific request value | capdag.test.js:605 |
| test045 | `test045_matchingSemanticsValueMismatch` | TEST045: Matching semantics - value mismatch does not match | capdag.test.js:612 |
| test046 | `test046_matchingSemanticsFallbackPattern` | TEST046: Matching semantics - fallback pattern (cap missing tag = implicit wildcard) | capdag.test.js:619 |
| test047 | `test047_matchingSemanticsThumbnailVoidInput` | TEST047: Matching semantics - thumbnail fallback with void input | capdag.test.js:627 |
| test048 | `test048_matchingSemanticsWildcardDirection` | TEST048: Matching semantics - wildcard direction matches anything | capdag.test.js:634 |
| test049 | `test049_matchingSemanticsCrossDimension` | TEST049: Non-overlapping tags — neither direction accepts | capdag.test.js:641 |
| test050 | `test050_matchingSemanticsDirectionMismatch` | TEST050: Matching semantics - direction mismatch prevents matching | capdag.test.js:649 |
| test054 | `test054_xv5InlineSpecRedefinitionDetected` | TEST054: XV5 - Test inline media spec redefinition of existing registry spec is detected and rejected | capdag.test.js:738 |
| test055 | `test055_xv5NewInlineSpecAllowed` | TEST055: XV5 - Test new inline media spec (not in registry) is allowed | capdag.test.js:755 |
| test056 | `test056_xv5EmptyMediaSpecsAllowed` | TEST056: XV5 - Test empty media_specs (no inline specs) passes XV5 validation | capdag.test.js:770 |
| test060 | `test060_wrongPrefixFails` | TEST060: Test wrong prefix fails with InvalidPrefix error showing expected and actual prefix | capdag.test.js:782 |
| test061 | `test061_isBinary` | TEST061: Test is_binary returns true when textable tag is absent (binary = not textable) | capdag.test.js:791 |
| test062 | `test062_isRecord` | TEST062: Test is_record returns true when record marker tag is present indicating key-value structure | capdag.test.js:807 |
| test063 | `test063_isScalar` | TEST063: Test is_scalar returns true when list marker tag is absent (scalar is default) | capdag.test.js:818 |
| test064 | `test064_isList` | TEST064: Test is_list returns true when list marker tag is present indicating ordered collection | capdag.test.js:831 |
| test065 | `test065_isOpaque` | TEST065: Test is_opaque returns true when record marker is absent (opaque is default) | capdag.test.js:840 |
| test066 | `test066_isJson` | TEST066: Test is_json returns true only when json marker tag is present for JSON representation | capdag.test.js:851 |
| test067 | `test067_isText` | TEST067: Test is_text returns true only when textable marker tag is present | capdag.test.js:857 |
| test068 | `test068_isVoid` | TEST068: Test is_void returns true when void flag or type=void tag is present | capdag.test.js:868 |
| test071 | `test071_toStringRoundtrip` | TEST071: Test to_string roundtrip ensures serialization and deserialization preserve URN structure | capdag.test.js:876 |
| test072 | `test072_constantsParse` | TEST072: Test all media URN constants parse successfully as valid media URNs | capdag.test.js:886 |
| test074 | `test074_mediaUrnMatching` | TEST074: Test media URN conforms_to using tagged URN semantics with specific and generic requirements | capdag.test.js:906 |
| test075 | `test075_accepts` | TEST075: Test accepts with implicit wildcards where handlers with fewer tags can handle more requests | capdag.test.js:920 |
| test076 | `test076_specificity` | TEST076: Test specificity increases with more tags for ranking conformance | capdag.test.js:931 |
| test077 | `test077_serdeRoundtrip` | TEST077: Test serde roundtrip serializes to JSON string and deserializes back correctly | capdag.test.js:940 |
| test078 | `test078_debugMatchingBehavior` | TEST078: conforms_to behavior between MEDIA_OBJECT and MEDIA_STRING | capdag.test.js:949 |
| test091 | `test091_resolveCustomMediaSpec` | TEST091: Test resolving custom media URN from local media_specs takes precedence over registry | capdag.test.js:964 |
| test092 | `test092_resolveCustomWithSchema` | TEST092: Test resolving custom record media spec with schema from local media_specs | capdag.test.js:974 |
| test093 | `test093_resolveUnresolvableFailsHard` | TEST093: Test resolving unknown media URN fails with UnresolvableMediaUrn error | capdag.test.js:991 |
| test099 | `test099_resolvedIsBinary` | TEST099: Test ResolvedMediaSpec is_binary returns true when textable tag is absent | capdag.test.js:1010 |
| test100 | `test100_resolvedIsRecord` | TEST100: Test ResolvedMediaSpec is_record returns true when record marker is present | capdag.test.js:1016 |
| test101 | `test101_resolvedIsScalar` | TEST101: Test ResolvedMediaSpec is_scalar returns true when list marker is absent | capdag.test.js:1022 |
| test102 | `test102_resolvedIsList` | TEST102: Test ResolvedMediaSpec is_list returns true when list marker is present | capdag.test.js:1028 |
| test103 | `test103_resolvedIsJson` | TEST103: Test ResolvedMediaSpec is_json returns true when json tag is present | capdag.test.js:1034 |
| test104 | `test104_resolvedIsText` | TEST104: Test ResolvedMediaSpec is_text returns true when textable tag is present | capdag.test.js:1040 |
| test105 | `test105_metadataPropagation` | TEST105: Test metadata propagates from media spec def to resolved media spec | capdag.test.js:1046 |
| test106 | `test106_metadataWithValidation` | TEST106: Test metadata and validation can coexist in media spec definition | capdag.test.js:1069 |
| test107 | `test107_extensionsPropagation` | TEST107: Test extensions field propagates from media spec def to resolved | capdag.test.js:1088 |
| test108 | `test108_extensionsSerialization` | TEST108: Test creating new cap with URN, title, and command verifies correct initialization | capdag.test.js:1104 |
| test109 | `test109_extensionsWithMetadataAndValidation` | TEST109: Test creating cap with metadata initializes and retrieves metadata correctly | capdag.test.js:1112 |
| test110 | `test110_multipleExtensions` | TEST110: Test cap matching with subset semantics for request fulfillment | capdag.test.js:1131 |
| test156 | `test156_stdinSourceFromData` | TEST156: Test creating StdinSource Data variant with byte vector | capdag.test.js:1218 |
| test157 | `test157_stdinSourceFromFileReference` | TEST157: Test creating StdinSource FileReference variant with all required fields | capdag.test.js:1229 |
| test158 | `test158_stdinSourceWithEmptyData` | TEST158: Test StdinSource Data with empty vector stores and retrieves correctly | capdag.test.js:1246 |
| test159 | `test159_stdinSourceWithBinaryContent` | TEST159: Test StdinSource Data with binary content like PNG header bytes | capdag.test.js:1254 |
| test274 | `test274_capArgumentValueNew` | TEST274: Test CapArgumentValue::new stores media_urn and raw byte value | capdag.test.js:1268 |
| test275 | `test275_capArgumentValueFromStr` | TEST275: Test CapArgumentValue::from_str converts string to UTF-8 bytes | capdag.test.js:1275 |
| test276 | `test276_capArgumentValueAsStrValid` | TEST276: Test CapArgumentValue::value_as_str succeeds for UTF-8 data | capdag.test.js:1282 |
| test277 | `test277_capArgumentValueAsStrInvalidUtf8` | TEST277: Test CapArgumentValue::value_as_str fails for non-UTF-8 binary data | capdag.test.js:1288 |
| test278 | `test278_capArgumentValueEmpty` | TEST278: Test CapArgumentValue::new with empty value stores empty vec | capdag.test.js:1300 |
| test282 | `test282_capArgumentValueUnicode` | TEST282: Test CapArgumentValue::from_str with Unicode string preserves all characters | capdag.test.js:1309 |
| test283 | `test283_capArgumentValueLargeBinary` | TEST283: Test CapArgumentValue with large binary payload preserves all bytes | capdag.test.js:1315 |
| test304 | `test304_mediaAvailabilityOutputConstant` | TEST304: Test MEDIA_AVAILABILITY_OUTPUT constant parses as valid media URN with correct tags | capdag.test.js:1334 |
| test305 | `test305_mediaPathOutputConstant` | TEST305: Test MEDIA_PATH_OUTPUT constant parses as valid media URN with correct tags | capdag.test.js:1344 |
| test306 | `test306_availabilityAndPathOutputDistinct` | TEST306: Test MEDIA_AVAILABILITY_OUTPUT and MEDIA_PATH_OUTPUT are distinct URNs | capdag.test.js:1354 |
| test307 | `test307_modelAvailabilityUrn` | TEST307: Test model_availability_urn builds valid cap URN with correct op and media specs | capdag.test.js:1368 |
| test308 | `test308_modelPathUrn` | TEST308: Test model_path_urn builds valid cap URN with correct op and media specs | capdag.test.js:1380 |
| test309 | `test309_modelAvailabilityAndPathAreDistinct` | TEST309: Test model_availability_urn and model_path_urn produce distinct URNs | capdag.test.js:1392 |
| test310 | `test310_llmGenerateTextUrn` | TEST310: llm_generate_text_urn() produces a valid cap URN with textable in/out specs | capdag.test.js:1399 |
| test312 | `test312_allUrnBuildersProduceValidUrns` | TEST312: Test all URN builders produce parseable cap URNs | capdag.test.js:1422 |
| test320 | `test320_cartridgeInfoConstruction` | TEST320-335: CartridgeRepoServer and CartridgeRepoClient tests | capdag.test.js:1784 |
| test321 | `test321_cartridgeInfoIsSigned` | TEST321: CartridgeInfo.is_signed() returns true when signature is present | capdag.test.js:1817 |
| test322 | `test322_cartridgeInfoBuildForPlatform` | TEST322: CartridgeInfo.build_for_platform() returns the build matching the current platform | capdag.test.js:1829 |
| test323 | `test323_cartridgeRepoServerValidateRegistry` | TEST323: CartridgeRepoServer requires schema 5.0 and rejects older. | capdag.test.js:1863 |
| test324 | `test324_cartridgeRepoServerTransformToArray` | TEST324: CartridgeRepoServer walks both channels and emits a flat CartridgeInfo array preserving channel provenance. Release entries appear first. | capdag.test.js:1902 |
| test325 | `test325_cartridgeRepoServerGetCartridges` | TEST325: CartridgeRepoServer.getCartridges() wraps the transformed flat array (across both channels) in the response envelope. | capdag.test.js:1940 |
| test326 | `test326_cartridgeRepoServerGetCartridgeById` | TEST326: CartridgeRepoServer.getCartridgeById() requires (channel, id). Same id looked up in the wrong channel must miss — channels are independent namespaces. | capdag.test.js:1954 |
| test327 | `test327_cartridgeRepoServerSearchCartridges` | TEST327: CartridgeRepoServer.searchCartridges() filters across both channels by name/description/tags/cap titles. Cap URN strings are not substring-matched. | capdag.test.js:1986 |
| test328 | `test328_cartridgeRepoServerGetByCategory` | TEST328: CartridgeRepoServer.getCartridgesByCategory() filters cartridges by category across both channels. | capdag.test.js:2008 |
| test329 | `test329_cartridgeRepoServerGetByCap` | TEST329: CartridgeRepoServer.getCartridgesByCap() parses the input URN and matches each declared cap via `conformsTo`. Tag-order differences resolve because matching is order-theoretic, not string. | capdag.test.js:2027 |
| test330 | `test330_cartridgeRepoClientUpdateCache` | TEST330: CartridgeRepoClient updates its local cache keyed by "<channel>:<id>". The cache holds release and nightly entries independently — the same id is allowed in both. | capdag.test.js:2044 |
| test331 | `test331_cartridgeRepoClientGetSuggestions` | TEST331: CartridgeRepoClient.getSuggestionsForCap() returns cartridge suggestions with channel propagated onto each suggestion. | capdag.test.js:2061 |
| test332 | `test332_cartridgeRepoClientGetCartridge` | TEST332: CartridgeRepoClient.getCartridge() requires (channel, id). Same id in the wrong channel must miss. | capdag.test.js:2091 |
| test333 | `test333_cartridgeRepoClientGetAllCaps` | TEST333: CartridgeRepoClient.getAllAvailableCaps() returns the set of normalized URNs across both channels. | capdag.test.js:2125 |
| test334 | `test334_cartridgeRepoClientNeedsSync` | TEST334: CartridgeRepoClient.needsSync() returns true when cache is empty / stale, false right after a fresh update. | capdag.test.js:2142 |
| test335 | `test335_cartridgeRepoServerClientIntegration` | TEST335: Round-trip: server produces a v5.0 response, client consumes it, channel provenance is preserved end-to-end. | capdag.test.js:2161 |
| test639 | `test639_emptyCapDefaultsToMediaWildcard` | TEST639: cap: (empty) defaults to in=media:;out=media: | capdag.test.js:2469 |
| test640 | `test640_inOnlyDefaultsOutToMedia` | TEST640: cap:in defaults out to media: | capdag.test.js:2477 |
| test641 | `test641_outOnlyDefaultsInToMedia` | TEST641: cap:out defaults in to media: | capdag.test.js:2484 |
| test642 | `test642_inOutWithoutValuesBecomeMedia` | TEST642: cap:in;out both become media: | capdag.test.js:2491 |
| test643 | `test643_explicitAsteriskIsWildcard` | TEST643: cap:in=*;out=* becomes media: | capdag.test.js:2498 |
| test644 | `test644_specificInWildcardOut` | TEST644: cap:in=media:;out=* has specific in, wildcard out | capdag.test.js:2505 |
| test645 | `test645_wildcardInSpecificOut` | TEST645: cap:in=*;out=media:text has wildcard in, specific out | capdag.test.js:2512 |
| test646 | `test646_invalidInSpecFails` | TEST646: cap:in=foo fails (invalid media URN) | capdag.test.js:2519 |
| test647 | `test647_invalidOutSpecFails` | TEST647: cap:in=media:;out=bar fails (invalid media URN) | capdag.test.js:2528 |
| test648 | `test648_wildcardAcceptsSpecific` | TEST648: Wildcard in/out match specific caps | capdag.test.js:2537 |
| test649 | `test649_specificityScoring` | TEST649: Specificity - wildcard has 0, specific has tag count | capdag.test.js:2546 |
| test651 | `test651_identityFormsEquivalent` | TEST651: All identity forms produce the same CapUrn | capdag.test.js:2557 |
| test653 | `test653_identityRoutingIsolation` | TEST653: Identity (no tags) does not match specific requests via routing | capdag.test.js:2577 |
| test890 | `test890_directionSemanticMatching` | TEST890: Semantic direction matching - generic provider matches specific request | capdag.test.js:660 |
| test891 | `test891_directionSemanticSpecificity` | TEST891: Semantic direction specificity - more media URN tags = higher specificity | capdag.test.js:710 |
| test1294 | `test1294_rule11VoidInputWithStdinRejected` | TEST1294: RULE11 - void-input cap with stdin source rejected | capdag.test.js:2413 |
| test1295 | `test1295_rule11NonVoidInputWithoutStdinRejected` | TEST1295: RULE11 - non-void-input cap without stdin source rejected | capdag.test.js:2428 |
| test1296 | `test1296_rule11VoidInputCliFlagOnly` | TEST1296: RULE11 - void-input cap with only cli_flag sources passes | capdag.test.js:2443 |
| test1297 | `test1297_rule11NonVoidInputWithStdin` | TEST1297: RULE11 - non-void-input cap with stdin source passes | capdag.test.js:2453 |
| test1298 | `test1298_isBool` | TEST1298: is_bool returns true only when bool marker tag is present | capdag.test.js:2241 |
| test1299 | `test1299_isFilePath` | TEST1299: isFilePath returns true for the single file-path media URN, false for everything else. There is no "array" variant — cardinality is carried by is_sequence on the wire, not by URN tags. | capdag.test.js:2255 |
| test1302 | `test1302_predicateConstantConsistency` | TEST1302: predicates are consistent with constants — every constant triggers exactly the expected predicates | capdag.test.js:2274 |
| test1303 | `test1303_withoutTag` | TEST1303: without_tag removes tag, ignores in/out, case-insensitive for keys | capdag.test.js:2314 |
| test1304 | `test1304_withInOutSpec` | TEST1304: with_in_spec and with_out_spec change direction specs | capdag.test.js:2336 |
| test1305 | `test1305_findAllMatches` | TEST1305: CapMatcher::find_all_matches returns all matching caps sorted by specificity | capdag.test.js:2359 |
| test1306 | `test1306_areCompatible` | TEST1306: CapMatcher::are_compatible detects bidirectional overlap | capdag.test.js:2377 |
| test1307 | `test1307_withTagIgnoresInOut` | TEST1307: with_tag silently ignores in/out keys | capdag.test.js:2402 |
| test1312 | `test1312_isImage` | TEST1312: is_image returns true only when image marker tag is present | capdag.test.js:2196 |
| test1313 | `test1313_isAudio` | TEST1313: is_audio returns true only when audio marker tag is present | capdag.test.js:2208 |
| test1314 | `test1314_isVideo` | TEST1314: is_video returns true only when video marker tag is present | capdag.test.js:2219 |
| test1315 | `test1315_isNumeric` | TEST1315: is_numeric returns true only when numeric marker tag is present | capdag.test.js:2229 |
| | | | |
| unnumbered | `testCapGraphAddCapPopulatesEdgesAndNodes` | Add a cap and check it becomes an edge with from/to nodes and carries the registry name we passed. This is exactly the shape the renderer depends on. | capdag.test.js:1161 |
| unnumbered | `testCapGraphDistinctRegistryNames` | Each edge must carry the registry name it was added with. This is how the renderer colours/groups edges by provenance in browse mode. | capdag.test.js:1200 |
| unnumbered | `testCapGraphGetOutgoingConformsToMatching` | getOutgoing takes a concrete source URN and returns edges whose from_spec the source conforms to. It must NOT be a plain string lookup. | capdag.test.js:1179 |
| unnumbered | `testJS_buildExtensionIndex` | These tests cover JS-specific functionality not in the Rust numbering scheme but are important for capdag-js correctness. | capdag.test.js:1442 |
| unnumbered | `testJS_capDocumentationOmittedWhenNull` | When documentation is null, toJSON must omit the field entirely. This matches the Rust serializer's skip-when-None semantics and the ObjC toDictionary behaviour. A regression where null is emitted as `documentation: null` would break the symmetric round-trip with Rust (which has no null sentinel) and pollute generated JSON. | capdag.test.js:1559 |
| unnumbered | `testJS_capDocumentationRoundTrip` | JS round-trip for the documentation field on Cap. Mirrors TEST920 in capdag/src/cap/definition.rs — the body is non-trivial (newlines, backticks, embedded quotes, Unicode) so escaping mismatches between JSON.stringify on this side and the Rust serializer on the other side surface as failures here. | capdag.test.js:1537 |
| unnumbered | `testJS_capJSONSerialization` |  | capdag.test.js:1510 |
| unnumbered | `testJS_capWithMediaSpecs` |  | capdag.test.js:1496 |
| unnumbered | `testJS_getExtensionMappings` |  | capdag.test.js:1486 |
| unnumbered | `testJS_mediaSpecConstruction` |  | capdag.test.js:1625 |
| unnumbered | `testJS_mediaSpecDocumentationPropagatesThroughResolve` | Documentation propagates from a mediaSpecs definition through resolveMediaUrn into the resolved MediaSpec. Mirrors TEST924 on the Rust side. This is the path every UI consumer uses, so a break here makes the new field invisible everywhere downstream. | capdag.test.js:1582 |
| unnumbered | `testJS_mediaUrnsForExtension` |  | capdag.test.js:1458 |
| unnumbered | `testJS_stdinSourceKindConstants` |  | capdag.test.js:1612 |
| unnumbered | `testJS_stdinSourceNullData` |  | capdag.test.js:1618 |
| unnumbered | `testLlmGenerateTextUrnSpecs` | Mirror-specific coverage: llm_generate_text_urn input/output specs conform to MEDIA_STRING | capdag.test.js:1411 |
| unnumbered | `testMachine_aliasFallbackWithoutOpTag` |  | capdag.test.js:3253 |
| unnumbered | `testMachine_aliasFromOpTag` |  | capdag.test.js:3242 |
| unnumbered | `testMachine_builderChaining` |  | capdag.test.js:3310 |
| unnumbered | `testMachine_builderEquivalentToParsed` |  | capdag.test.js:3318 |
| unnumbered | `testMachine_builderRoundTrip` |  | capdag.test.js:3330 |
| unnumbered | `testMachine_builderSingleEdge` | --- Machine builder tests --- | capdag.test.js:3286 |
| unnumbered | `testMachine_builderWithLoop` |  | capdag.test.js:3298 |
| unnumbered | `testMachine_capRegistryClient_construction` |  | capdag.test.js:3611 |
| unnumbered | `testMachine_capRegistryEntry_construction` | Phase 0B: CapRegistryClient tests | capdag.test.js:3575 |
| unnumbered | `testMachine_capRegistryEntry_defaults` |  | capdag.test.js:3618 |
| unnumbered | `testMachine_capUrnInMediaUrn` |  | capdag.test.js:3357 |
| unnumbered | `testMachine_capUrnIsComparable` |  | capdag.test.js:3350 |
| unnumbered | `testMachine_capUrnIsEquivalent` | --- CapUrn.isEquivalent/isComparable tests --- | capdag.test.js:3342 |
| unnumbered | `testMachine_capUrnOutMediaUrn` |  | capdag.test.js:3364 |
| unnumbered | `testMachine_conflictingMediaTypesFail` |  | capdag.test.js:2723 |
| unnumbered | `testMachine_differentAliasesSameGraph` |  | capdag.test.js:2745 |
| unnumbered | `testMachine_displayEdge` |  | capdag.test.js:3089 |
| unnumbered | `testMachine_displayGraph` |  | capdag.test.js:3100 |
| unnumbered | `testMachine_duplicateAlias` |  | capdag.test.js:2616 |
| unnumbered | `testMachine_duplicateOpTagsDisambiguated` |  | capdag.test.js:3264 |
| unnumbered | `testMachine_edgeEquivalenceDifferentCapUrns` |  | capdag.test.js:2900 |
| unnumbered | `testMachine_edgeEquivalenceDifferentLoopFlag` |  | capdag.test.js:2932 |
| unnumbered | `testMachine_edgeEquivalenceDifferentSourceCount` |  | capdag.test.js:2964 |
| unnumbered | `testMachine_edgeEquivalenceDifferentTargets` |  | capdag.test.js:2916 |
| unnumbered | `testMachine_edgeEquivalenceSameUrns` | --- Machine graph tests (mirrors graph.rs tests) --- | capdag.test.js:2884 |
| unnumbered | `testMachine_edgeEquivalenceSourceOrderIndependent` |  | capdag.test.js:2948 |
| unnumbered | `testMachine_emptyInput` | --- Machine parser tests (mirrors parser.rs tests) --- | capdag.test.js:2601 |
| unnumbered | `testMachine_errorLocation_duplicateAlias` |  | capdag.test.js:3484 |
| unnumbered | `testMachine_errorLocation_parseError` |  | capdag.test.js:3474 |
| unnumbered | `testMachine_errorLocation_undefinedAlias` |  | capdag.test.js:3498 |
| unnumbered | `testMachine_fanInSecondaryAssignedByPriorWiring` |  | capdag.test.js:2673 |
| unnumbered | `testMachine_fanInSecondaryUnassignedGetsWildcard` |  | capdag.test.js:2686 |
| unnumbered | `testMachine_fanOut` |  | capdag.test.js:2656 |
| unnumbered | `testMachine_graphEmpty` |  | capdag.test.js:3037 |
| unnumbered | `testMachine_graphEmptyEquivalence` |  | capdag.test.js:3043 |
| unnumbered | `testMachine_graphEquivalenceReorderedEdges` |  | capdag.test.js:2995 |
| unnumbered | `testMachine_graphEquivalenceSameEdges` |  | capdag.test.js:2980 |
| unnumbered | `testMachine_graphNotEquivalentDifferentCap` |  | capdag.test.js:3024 |
| unnumbered | `testMachine_graphNotEquivalentDifferentEdgeCount` |  | capdag.test.js:3010 |
| unnumbered | `testMachine_headerOnlyNoWirings` |  | capdag.test.js:2609 |
| unnumbered | `testMachine_leafTargetsLinearChain` |  | capdag.test.js:3063 |
| unnumbered | `testMachine_lineBasedAndBracketedParseSameGraph` |  | capdag.test.js:2858 |
| unnumbered | `testMachine_lineBasedEquivalentToBracketed` |  | capdag.test.js:2826 |
| unnumbered | `testMachine_lineBasedFanIn` |  | capdag.test.js:2805 |
| unnumbered | `testMachine_lineBasedFormatSerialization` |  | capdag.test.js:2838 |
| unnumbered | `testMachine_lineBasedLoop` |  | capdag.test.js:2796 |
| unnumbered | `testMachine_lineBasedSimpleChain` | --- Machine parser line-based mode tests --- | capdag.test.js:2773 |
| unnumbered | `testMachine_lineBasedTwoStepChain` |  | capdag.test.js:2786 |
| unnumbered | `testMachine_loopEdge` |  | capdag.test.js:2697 |
| unnumbered | `testMachine_malformedInputFails` |  | capdag.test.js:2757 |
| unnumbered | `testMachine_mediaRegistryEntry_construction` |  | capdag.test.js:3598 |
| unnumbered | `testMachine_mediaUrnIsComparable` |  | capdag.test.js:3381 |
| unnumbered | `testMachine_mediaUrnIsEquivalent` | --- MediaUrn.isEquivalent/isComparable tests --- | capdag.test.js:3373 |
| unnumbered | `testMachine_mixedBracketedAndLineBased` |  | capdag.test.js:2818 |
| unnumbered | `testMachine_multilineFormat` |  | capdag.test.js:2735 |
| unnumbered | `testMachine_multilineSerializeFormat` |  | capdag.test.js:3228 |
| unnumbered | `testMachine_nodeAliasCollision` |  | capdag.test.js:2713 |
| unnumbered | `testMachine_parseMachineWithAST_aliasMap` |  | capdag.test.js:3444 |
| unnumbered | `testMachine_parseMachineWithAST_fanInSourceLocations` |  | capdag.test.js:3433 |
| unnumbered | `testMachine_parseMachineWithAST_headerLocation` | Phase 0A: Position tracking tests | capdag.test.js:3394 |
| unnumbered | `testMachine_parseMachineWithAST_multilinePositions` |  | capdag.test.js:3424 |
| unnumbered | `testMachine_parseMachineWithAST_nodeMedia` |  | capdag.test.js:3462 |
| unnumbered | `testMachine_parseMachineWithAST_wiringLocation` |  | capdag.test.js:3410 |
| unnumbered | `testMachine_reorderedEdgesProduceSameNotation` |  | capdag.test.js:3212 |
| unnumbered | `testMachine_rootSourcesFanIn` |  | capdag.test.js:3077 |
| unnumbered | `testMachine_rootSourcesLinearChain` |  | capdag.test.js:3049 |
| unnumbered | `testMachine_roundtripFanOut` |  | capdag.test.js:3171 |
| unnumbered | `testMachine_roundtripLoopEdge` |  | capdag.test.js:3186 |
| unnumbered | `testMachine_roundtripSingleEdge` |  | capdag.test.js:3144 |
| unnumbered | `testMachine_roundtripTwoEdgeChain` |  | capdag.test.js:3157 |
| unnumbered | `testMachine_serializationIsDeterministic` |  | capdag.test.js:3199 |
| unnumbered | `testMachine_serializeEmptyGraph` |  | capdag.test.js:3140 |
| unnumbered | `testMachine_serializeSingleEdge` | --- Machine serializer tests (mirrors serializer.rs tests) --- | capdag.test.js:3113 |
| unnumbered | `testMachine_serializeTwoEdgeChain` |  | capdag.test.js:3127 |
| unnumbered | `testMachine_simpleLinearChain` |  | capdag.test.js:2627 |
| unnumbered | `testMachine_toMermaid_emptyGraph` |  | capdag.test.js:3538 |
| unnumbered | `testMachine_toMermaid_fanIn` |  | capdag.test.js:3544 |
| unnumbered | `testMachine_toMermaid_fanOut` |  | capdag.test.js:3555 |
| unnumbered | `testMachine_toMermaid_linearChain` | Phase 0C: Machine.toMermaid() tests | capdag.test.js:3512 |
| unnumbered | `testMachine_toMermaid_loopEdge` |  | capdag.test.js:3527 |
| unnumbered | `testMachine_twoStepChain` |  | capdag.test.js:2642 |
| unnumbered | `testMachine_undefinedAliasFails` |  | capdag.test.js:2706 |
| unnumbered | `testMachine_unterminatedBracketFails` |  | capdag.test.js:2764 |
| unnumbered | `testMachine_whitespaceOnly` |  | capdag.test.js:2605 |
| unnumbered | `testRenderer_buildBrowseGraphData_rejectsMissingMediaTitles` |  | capdag.test.js:3813 |
| unnumbered | `testRenderer_buildEditorGraphData_capWithoutCompleteArgsIsDropped` |  | capdag.test.js:4941 |
| unnumbered | `testRenderer_buildEditorGraphData_cardinalityFromDataSlotSequenceFlags` |  | capdag.test.js:4922 |
| unnumbered | `testRenderer_buildEditorGraphData_collapsesCapsIntoLabeledEdges` |  | capdag.test.js:4866 |
| unnumbered | `testRenderer_buildEditorGraphData_loopMarkedEdgeGetsLoopClass` |  | capdag.test.js:4904 |
| unnumbered | `testRenderer_buildEditorGraphData_rejectsEdgeWithMissingSource` |  | capdag.test.js:4958 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_duplicateNodeIdAcrossStrandsFailsHard` |  | capdag.test.js:5168 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_fanInProducesEdgePerAssignment` |  | capdag.test.js:5066 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_loopEdgeGetsLoopClass` |  | capdag.test.js:5032 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_multiStrandKeepsStrandsDisjoint` |  | capdag.test.js:5106 |
| unnumbered | `testRenderer_buildResolvedMachineGraphData_singleStrandLinearChain` | ---------------- resolved-machine builder ---------------- | capdag.test.js:4974 |
| unnumbered | `testRenderer_buildRunGraphData_allFailedDropsTargetPlaceholder` |  | capdag.test.js:4671 |
| unnumbered | `testRenderer_buildRunGraphData_backboneHasNoForeachNode` |  | capdag.test.js:4617 |
| unnumbered | `testRenderer_buildRunGraphData_closedForeachSuccessMergesAtCollectTarget` |  | capdag.test.js:4797 |
| unnumbered | `testRenderer_buildRunGraphData_failureWithoutFailedCapRendersFullTrace` |  | capdag.test.js:4520 |
| unnumbered | `testRenderer_buildRunGraphData_pagesSuccessesAndFailures` |  | capdag.test.js:4450 |
| unnumbered | `testRenderer_buildRunGraphData_unclosedForeachSuccessNoMerge` |  | capdag.test.js:4736 |
| unnumbered | `testRenderer_buildRunGraphData_usesCapUrnIsEquivalentForFailedCap` |  | capdag.test.js:4558 |
| unnumbered | `testRenderer_buildStrandGraphData_foreachCollectSpan` |  | capdag.test.js:4007 |
| unnumbered | `testRenderer_buildStrandGraphData_nestedForEachThrows` |  | capdag.test.js:4122 |
| unnumbered | `testRenderer_buildStrandGraphData_sequenceShowsCardinality` |  | capdag.test.js:3987 |
| unnumbered | `testRenderer_buildStrandGraphData_singleCapPlain` |  | capdag.test.js:3960 |
| unnumbered | `testRenderer_buildStrandGraphData_standaloneCollect` |  | capdag.test.js:4058 |
| unnumbered | `testRenderer_buildStrandGraphData_unclosedForEachBody` |  | capdag.test.js:4085 |
| unnumbered | `testRenderer_canonicalMediaUrn_normalizesTagOrder` |  | capdag.test.js:3773 |
| unnumbered | `testRenderer_canonicalMediaUrn_preservesValueTags` |  | capdag.test.js:3782 |
| unnumbered | `testRenderer_canonicalMediaUrn_rejectsCapUrn` |  | capdag.test.js:3787 |
| unnumbered | `testRenderer_cardinalityFromCap_findsStdinArgNotFirstArg` |  | capdag.test.js:3698 |
| unnumbered | `testRenderer_cardinalityFromCap_outputOnlySequence` |  | capdag.test.js:3730 |
| unnumbered | `testRenderer_cardinalityFromCap_rejectsStringIsSequence` |  | capdag.test.js:3741 |
| unnumbered | `testRenderer_cardinalityFromCap_scalarDefaultsWhenFieldsMissing` |  | capdag.test.js:3722 |
| unnumbered | `testRenderer_cardinalityFromCap_throwsOnNonObject` |  | capdag.test.js:3754 |
| unnumbered | `testRenderer_cardinalityLabel_allFourCases` |  | capdag.test.js:3683 |
| unnumbered | `testRenderer_cardinalityLabel_usesUnicodeArrow` |  | capdag.test.js:3690 |
| unnumbered | `testRenderer_classifyStrandCapSteps_capFlags` |  | capdag.test.js:3909 |
| unnumbered | `testRenderer_classifyStrandCapSteps_nestedForks` |  | capdag.test.js:3930 |
| unnumbered | `testRenderer_collapseStrand_plainCapDistinctTargetNoMerge` |  | capdag.test.js:4401 |
| unnumbered | `testRenderer_collapseStrand_plainCapMergesTrailingOutput` |  | capdag.test.js:4365 |
| unnumbered | `testRenderer_collapseStrand_sequenceProducingCapBeforeForeach` |  | capdag.test.js:4301 |
| unnumbered | `testRenderer_collapseStrand_singleCapBodyKeepsCapOwnLabel` |  | capdag.test.js:4150 |
| unnumbered | `testRenderer_collapseStrand_standaloneCollectCollapses` |  | capdag.test.js:4258 |
| unnumbered | `testRenderer_collapseStrand_unclosedForEachBodyCollapses` |  | capdag.test.js:4202 |
| unnumbered | `testRenderer_mediaNodeLabel_rejectsUrnDerivedLabels` |  | capdag.test.js:3799 |
| unnumbered | `testRenderer_validateBodyOutcome_rejectsNegativeIndex` | ---------------- run builder ---------------- | capdag.test.js:4440 |
| unnumbered | `testRenderer_validateEditorGraphPayload_rejectsUnknownKind` | ---------------- editor-graph builder ---------------- | capdag.test.js:4852 |
| unnumbered | `testRenderer_validateResolvedMachinePayload_rejectsMissingFields` |  | capdag.test.js:5203 |
| unnumbered | `testRenderer_validateStrandPayload_missingSourceSpec` |  | capdag.test.js:4427 |
| unnumbered | `testRenderer_validateStrandStep_rejectsUnknownVariant` |  | capdag.test.js:3870 |
| unnumbered | `testRenderer_validateStrandStep_requiresBooleanIsSequence` |  | capdag.test.js:3887 |
| unnumbered | `testUrn` |  | capdag.test.js:107 |
| unnumbered | `testisCollection` | Mirror-specific coverage: isCollection returns true when collection marker tag is present Mirror-specific coverage: N/A for JS (MEDIA_COLLECTION constants removed - no longer exists) | capdag.test.js:2263 |
---

## Unnumbered Tests

The following tests are cataloged but do not currently participate in numeric test indexing.

- `testCapGraphAddCapPopulatesEdgesAndNodes` — capdag.test.js:1161
- `testCapGraphDistinctRegistryNames` — capdag.test.js:1200
- `testCapGraphGetOutgoingConformsToMatching` — capdag.test.js:1179
- `testJS_buildExtensionIndex` — capdag.test.js:1442
- `testJS_capDocumentationOmittedWhenNull` — capdag.test.js:1559
- `testJS_capDocumentationRoundTrip` — capdag.test.js:1537
- `testJS_capJSONSerialization` — capdag.test.js:1510
- `testJS_capWithMediaSpecs` — capdag.test.js:1496
- `testJS_getExtensionMappings` — capdag.test.js:1486
- `testJS_mediaSpecConstruction` — capdag.test.js:1625
- `testJS_mediaSpecDocumentationPropagatesThroughResolve` — capdag.test.js:1582
- `testJS_mediaUrnsForExtension` — capdag.test.js:1458
- `testJS_stdinSourceKindConstants` — capdag.test.js:1612
- `testJS_stdinSourceNullData` — capdag.test.js:1618
- `testLlmGenerateTextUrnSpecs` — capdag.test.js:1411
- `testMachine_aliasFallbackWithoutOpTag` — capdag.test.js:3253
- `testMachine_aliasFromOpTag` — capdag.test.js:3242
- `testMachine_builderChaining` — capdag.test.js:3310
- `testMachine_builderEquivalentToParsed` — capdag.test.js:3318
- `testMachine_builderRoundTrip` — capdag.test.js:3330
- `testMachine_builderSingleEdge` — capdag.test.js:3286
- `testMachine_builderWithLoop` — capdag.test.js:3298
- `testMachine_capRegistryClient_construction` — capdag.test.js:3611
- `testMachine_capRegistryEntry_construction` — capdag.test.js:3575
- `testMachine_capRegistryEntry_defaults` — capdag.test.js:3618
- `testMachine_capUrnInMediaUrn` — capdag.test.js:3357
- `testMachine_capUrnIsComparable` — capdag.test.js:3350
- `testMachine_capUrnIsEquivalent` — capdag.test.js:3342
- `testMachine_capUrnOutMediaUrn` — capdag.test.js:3364
- `testMachine_conflictingMediaTypesFail` — capdag.test.js:2723
- `testMachine_differentAliasesSameGraph` — capdag.test.js:2745
- `testMachine_displayEdge` — capdag.test.js:3089
- `testMachine_displayGraph` — capdag.test.js:3100
- `testMachine_duplicateAlias` — capdag.test.js:2616
- `testMachine_duplicateOpTagsDisambiguated` — capdag.test.js:3264
- `testMachine_edgeEquivalenceDifferentCapUrns` — capdag.test.js:2900
- `testMachine_edgeEquivalenceDifferentLoopFlag` — capdag.test.js:2932
- `testMachine_edgeEquivalenceDifferentSourceCount` — capdag.test.js:2964
- `testMachine_edgeEquivalenceDifferentTargets` — capdag.test.js:2916
- `testMachine_edgeEquivalenceSameUrns` — capdag.test.js:2884
- `testMachine_edgeEquivalenceSourceOrderIndependent` — capdag.test.js:2948
- `testMachine_emptyInput` — capdag.test.js:2601
- `testMachine_errorLocation_duplicateAlias` — capdag.test.js:3484
- `testMachine_errorLocation_parseError` — capdag.test.js:3474
- `testMachine_errorLocation_undefinedAlias` — capdag.test.js:3498
- `testMachine_fanInSecondaryAssignedByPriorWiring` — capdag.test.js:2673
- `testMachine_fanInSecondaryUnassignedGetsWildcard` — capdag.test.js:2686
- `testMachine_fanOut` — capdag.test.js:2656
- `testMachine_graphEmpty` — capdag.test.js:3037
- `testMachine_graphEmptyEquivalence` — capdag.test.js:3043
- `testMachine_graphEquivalenceReorderedEdges` — capdag.test.js:2995
- `testMachine_graphEquivalenceSameEdges` — capdag.test.js:2980
- `testMachine_graphNotEquivalentDifferentCap` — capdag.test.js:3024
- `testMachine_graphNotEquivalentDifferentEdgeCount` — capdag.test.js:3010
- `testMachine_headerOnlyNoWirings` — capdag.test.js:2609
- `testMachine_leafTargetsLinearChain` — capdag.test.js:3063
- `testMachine_lineBasedAndBracketedParseSameGraph` — capdag.test.js:2858
- `testMachine_lineBasedEquivalentToBracketed` — capdag.test.js:2826
- `testMachine_lineBasedFanIn` — capdag.test.js:2805
- `testMachine_lineBasedFormatSerialization` — capdag.test.js:2838
- `testMachine_lineBasedLoop` — capdag.test.js:2796
- `testMachine_lineBasedSimpleChain` — capdag.test.js:2773
- `testMachine_lineBasedTwoStepChain` — capdag.test.js:2786
- `testMachine_loopEdge` — capdag.test.js:2697
- `testMachine_malformedInputFails` — capdag.test.js:2757
- `testMachine_mediaRegistryEntry_construction` — capdag.test.js:3598
- `testMachine_mediaUrnIsComparable` — capdag.test.js:3381
- `testMachine_mediaUrnIsEquivalent` — capdag.test.js:3373
- `testMachine_mixedBracketedAndLineBased` — capdag.test.js:2818
- `testMachine_multilineFormat` — capdag.test.js:2735
- `testMachine_multilineSerializeFormat` — capdag.test.js:3228
- `testMachine_nodeAliasCollision` — capdag.test.js:2713
- `testMachine_parseMachineWithAST_aliasMap` — capdag.test.js:3444
- `testMachine_parseMachineWithAST_fanInSourceLocations` — capdag.test.js:3433
- `testMachine_parseMachineWithAST_headerLocation` — capdag.test.js:3394
- `testMachine_parseMachineWithAST_multilinePositions` — capdag.test.js:3424
- `testMachine_parseMachineWithAST_nodeMedia` — capdag.test.js:3462
- `testMachine_parseMachineWithAST_wiringLocation` — capdag.test.js:3410
- `testMachine_reorderedEdgesProduceSameNotation` — capdag.test.js:3212
- `testMachine_rootSourcesFanIn` — capdag.test.js:3077
- `testMachine_rootSourcesLinearChain` — capdag.test.js:3049
- `testMachine_roundtripFanOut` — capdag.test.js:3171
- `testMachine_roundtripLoopEdge` — capdag.test.js:3186
- `testMachine_roundtripSingleEdge` — capdag.test.js:3144
- `testMachine_roundtripTwoEdgeChain` — capdag.test.js:3157
- `testMachine_serializationIsDeterministic` — capdag.test.js:3199
- `testMachine_serializeEmptyGraph` — capdag.test.js:3140
- `testMachine_serializeSingleEdge` — capdag.test.js:3113
- `testMachine_serializeTwoEdgeChain` — capdag.test.js:3127
- `testMachine_simpleLinearChain` — capdag.test.js:2627
- `testMachine_toMermaid_emptyGraph` — capdag.test.js:3538
- `testMachine_toMermaid_fanIn` — capdag.test.js:3544
- `testMachine_toMermaid_fanOut` — capdag.test.js:3555
- `testMachine_toMermaid_linearChain` — capdag.test.js:3512
- `testMachine_toMermaid_loopEdge` — capdag.test.js:3527
- `testMachine_twoStepChain` — capdag.test.js:2642
- `testMachine_undefinedAliasFails` — capdag.test.js:2706
- `testMachine_unterminatedBracketFails` — capdag.test.js:2764
- `testMachine_whitespaceOnly` — capdag.test.js:2605
- `testRenderer_buildBrowseGraphData_rejectsMissingMediaTitles` — capdag.test.js:3813
- `testRenderer_buildEditorGraphData_capWithoutCompleteArgsIsDropped` — capdag.test.js:4941
- `testRenderer_buildEditorGraphData_cardinalityFromDataSlotSequenceFlags` — capdag.test.js:4922
- `testRenderer_buildEditorGraphData_collapsesCapsIntoLabeledEdges` — capdag.test.js:4866
- `testRenderer_buildEditorGraphData_loopMarkedEdgeGetsLoopClass` — capdag.test.js:4904
- `testRenderer_buildEditorGraphData_rejectsEdgeWithMissingSource` — capdag.test.js:4958
- `testRenderer_buildResolvedMachineGraphData_duplicateNodeIdAcrossStrandsFailsHard` — capdag.test.js:5168
- `testRenderer_buildResolvedMachineGraphData_fanInProducesEdgePerAssignment` — capdag.test.js:5066
- `testRenderer_buildResolvedMachineGraphData_loopEdgeGetsLoopClass` — capdag.test.js:5032
- `testRenderer_buildResolvedMachineGraphData_multiStrandKeepsStrandsDisjoint` — capdag.test.js:5106
- `testRenderer_buildResolvedMachineGraphData_singleStrandLinearChain` — capdag.test.js:4974
- `testRenderer_buildRunGraphData_allFailedDropsTargetPlaceholder` — capdag.test.js:4671
- `testRenderer_buildRunGraphData_backboneHasNoForeachNode` — capdag.test.js:4617
- `testRenderer_buildRunGraphData_closedForeachSuccessMergesAtCollectTarget` — capdag.test.js:4797
- `testRenderer_buildRunGraphData_failureWithoutFailedCapRendersFullTrace` — capdag.test.js:4520
- `testRenderer_buildRunGraphData_pagesSuccessesAndFailures` — capdag.test.js:4450
- `testRenderer_buildRunGraphData_unclosedForeachSuccessNoMerge` — capdag.test.js:4736
- `testRenderer_buildRunGraphData_usesCapUrnIsEquivalentForFailedCap` — capdag.test.js:4558
- `testRenderer_buildStrandGraphData_foreachCollectSpan` — capdag.test.js:4007
- `testRenderer_buildStrandGraphData_nestedForEachThrows` — capdag.test.js:4122
- `testRenderer_buildStrandGraphData_sequenceShowsCardinality` — capdag.test.js:3987
- `testRenderer_buildStrandGraphData_singleCapPlain` — capdag.test.js:3960
- `testRenderer_buildStrandGraphData_standaloneCollect` — capdag.test.js:4058
- `testRenderer_buildStrandGraphData_unclosedForEachBody` — capdag.test.js:4085
- `testRenderer_canonicalMediaUrn_normalizesTagOrder` — capdag.test.js:3773
- `testRenderer_canonicalMediaUrn_preservesValueTags` — capdag.test.js:3782
- `testRenderer_canonicalMediaUrn_rejectsCapUrn` — capdag.test.js:3787
- `testRenderer_cardinalityFromCap_findsStdinArgNotFirstArg` — capdag.test.js:3698
- `testRenderer_cardinalityFromCap_outputOnlySequence` — capdag.test.js:3730
- `testRenderer_cardinalityFromCap_rejectsStringIsSequence` — capdag.test.js:3741
- `testRenderer_cardinalityFromCap_scalarDefaultsWhenFieldsMissing` — capdag.test.js:3722
- `testRenderer_cardinalityFromCap_throwsOnNonObject` — capdag.test.js:3754
- `testRenderer_cardinalityLabel_allFourCases` — capdag.test.js:3683
- `testRenderer_cardinalityLabel_usesUnicodeArrow` — capdag.test.js:3690
- `testRenderer_classifyStrandCapSteps_capFlags` — capdag.test.js:3909
- `testRenderer_classifyStrandCapSteps_nestedForks` — capdag.test.js:3930
- `testRenderer_collapseStrand_plainCapDistinctTargetNoMerge` — capdag.test.js:4401
- `testRenderer_collapseStrand_plainCapMergesTrailingOutput` — capdag.test.js:4365
- `testRenderer_collapseStrand_sequenceProducingCapBeforeForeach` — capdag.test.js:4301
- `testRenderer_collapseStrand_singleCapBodyKeepsCapOwnLabel` — capdag.test.js:4150
- `testRenderer_collapseStrand_standaloneCollectCollapses` — capdag.test.js:4258
- `testRenderer_collapseStrand_unclosedForEachBodyCollapses` — capdag.test.js:4202
- `testRenderer_mediaNodeLabel_rejectsUrnDerivedLabels` — capdag.test.js:3799
- `testRenderer_validateBodyOutcome_rejectsNegativeIndex` — capdag.test.js:4440
- `testRenderer_validateEditorGraphPayload_rejectsUnknownKind` — capdag.test.js:4852
- `testRenderer_validateResolvedMachinePayload_rejectsMissingFields` — capdag.test.js:5203
- `testRenderer_validateStrandPayload_missingSourceSpec` — capdag.test.js:4427
- `testRenderer_validateStrandStep_rejectsUnknownVariant` — capdag.test.js:3870
- `testRenderer_validateStrandStep_requiresBooleanIsSequence` — capdag.test.js:3887
- `testUrn` — capdag.test.js:107
- `testisCollection` — capdag.test.js:2263

---

*Generated from JS source tree*
*Total tests: 300*
*Total numbered tests: 150*
*Total unnumbered tests: 150*
*Total numbered tests missing descriptions: 0*
*Total numbering mismatches: 0*
