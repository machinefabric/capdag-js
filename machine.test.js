// Tests of machine notation: the syntax, the resolver, iteration, gathers,
// machines in step position and the canonical form
// (capdag/docs/09-machine-notation.md). The cases and their numbers are the
// ones every implementation runs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  Cap,
  CapUrn,
  CapArg,
  CapOutput,
  ArgSource,
  MediaUrn,
  MediaDef,
  validateCapDefinition,
  CapDefinitions,
  FabricRegistryClient,
  StoredAlias,
  MachineSyntaxError,
  MachineSyntaxErrorCodes,
  MachineAbstractionError,
  MachineAbstractionErrorCodes,
  UndecidedMember,
  SYNTAX_CAP_HEADER,
  SYNTAX_MACHINE_HEADER,
  SYNTAX_WIRING,
  parseSyntax,
  decodeConstant,
  constantText,
  constantsEqual,
  StepPolicy,
  ON_ERROR_FAIL,
  ON_ERROR_ABSENT,
  NodeBijection,
  Machine,
  compareMediaUrns,
  compareCapUrns,
  BindingSource,
  MatchFailure,
  matchSourcesToArgs,
  resolvePreInterned,
  iterationOf,
  CyclicSteps,
  SCOPE_ROOT,
  MachineSourceError,
  MapMachineSource,
  FileMachineSource,
  fileMachineId,
  parseMachine,
  parseMachineWithAST,
  NOTATION_FORMAT_LINE_BASED,
} from './capdag.js';

// ============================================================================
// Harness
// ============================================================================

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual, (_, v) => (typeof v === 'bigint' ? `${v}n` : v));
  const e = JSON.stringify(expected, (_, v) => (typeof v === 'bigint' ? `${v}n` : v));
  if (a !== e) throw new Error(`Assertion failed: ${message}. Expected: ${e}, Actual: ${a}`);
}

function runTest(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`  PASS ${name}`);
  } catch (err) {
    failCount++;
    console.log(`  FAIL ${name}: ${err.stack || err.message}`);
  }
}

/** The error `fn` throws; a call that succeeds fails the test. */
function thrown(fn, what) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error(`Assertion failed: ${what}: expected a refusal, and the call succeeded`);
}

// ============================================================================
// Fixtures: cap definitions and the definitions the tests read against. A
// fixture is held to the definition rules: one that breaks one is not a
// fixture.
// ============================================================================

const media = text => MediaUrn.fromString(text);
/** A media URN as the library writes it. */
const canonical = text => MediaUrn.fromString(text).toString();

function definition(capUrn, title, args, outputs) {
  const cap = new Cap(CapUrn.fromString(capUrn), title, [title]);
  for (const arg of args) cap.addArg(arg);
  cap.setOutputs(outputs);
  validateCapDefinition(cap);
  return cap;
}

const flagArg = (mediaUrn, name, isSequence = false) =>
  new CapArg(mediaUrn, name, false, [new ArgSource({ cli_flag: '--' + name })], { is_sequence: isSequence });
const stdinArg = (mediaUrn, name, isSequence = false) =>
  new CapArg(mediaUrn, name, true, [new ArgSource({ stdin: mediaUrn })], { is_sequence: isSequence });
const outputOf = (mediaUrn, name, description = '', isSequence = false) =>
  new CapOutput(mediaUrn, name, description, { is_sequence: isSequence });

/** A cap of one arg, its main input, and its one output. */
const stdinCap = (capUrn, title, inUrn, outUrn) =>
  definition(capUrn, title, [stdinArg(inUrn, 'input')], [outputOf(outUrn, 'output', title)]);

const mediaDef = (mediaUrn, validation = null, schema = null) =>
  new MediaDef('application/json', null, schema, mediaUrn, null, mediaUrn, validation);

const definitionsOf = caps => new CapDefinitions().addCaps(caps);

const allEdges = machine => machine.strands().flatMap(strand => strand.edges());

/** Every edge of the machine whose cap URN bears the tag `step`. */
const edgesOf = (machine, step) =>
  allEdges(machine).filter(edge => edge.capUrn.toString().slice('cap:'.length).split(';').includes(step));

function oneEdgeOf(machine, step) {
  const edges = edgesOf(machine, step);
  assert(edges.length === 1, `one ${step} step, got ${edges.length}`);
  return edges[0];
}

const isSyntax = (error, code) => error instanceof MachineSyntaxError && error.code === code;
const isAbstraction = (error, code) => error instanceof MachineAbstractionError && error.code === code;
const SE = MachineSyntaxErrorCodes;
const AE = MachineAbstractionErrorCodes;

// ============================================================================
// The syntax
// ============================================================================

const wiringsOf = input => parseSyntax(input).filter(s => s.kind === SYNTAX_WIRING).map(s => s.wiring);

function oneWiring(input) {
  const wirings = wiringsOf(input);
  assert(wirings.length === 1, input);
  return wirings[0];
}

// A member or a target as the tests read it: the name it bears (null for
// none) and its node, or `=` and its constant's text.
const named = (name, value) => [name, value];
const bare = value => [null, value];
const membersOf = wiring => wiring.sources.map(member =>
  [member.name, member.isConstant ? '=' + constantText(member.constant) : member.node]);
const targetsOf = wiring => wiring.targets.map(target => [target.name, target.node]);

// TEST12732: every form of a wiring's sources and targets reads as the spec
// writes it: a bare node, a group of nodes, named members, constants of every
// JSON kind, an empty group on either side, and several targets with at most
// one unnamed. Both statement forms read alike.
function test12732_theFormsOfAWiring() {
  let w = oneWiring('doc -> extract -> text');
  assertEqual(membersOf(w), [bare('doc')], 'a bare member');
  assertEqual(w.step, 'extract', 'the step');
  assertEqual(targetsOf(w), [bare('text')], 'a bare target');
  assert(w.policy.isDefault(), 'no policy');

  w = oneWiring('[(thumbnail, model_spec) -> describe -> description]');
  assertEqual(membersOf(w), [bare('thumbnail'), bare('model_spec')], 'a group');

  w = oneWiring('(path, benchmark=bench) -> compare -> result');
  assertEqual(membersOf(w), [bare('path'), named('benchmark', 'bench')], 'a named member');

  w = oneWiring('(prices, window=20, statistic="mean") -> rolling -> smooth');
  assertEqual(membersOf(w), [bare('prices'), named('window', '=20'), named('statistic', '="mean"')], 'constants');

  // A source fed only by constants, and one fed nothing at all.
  w = oneWiring('(reference="fred/UNRATE") -> fetch -> series');
  assertEqual(membersOf(w), [named('reference', '="fred/UNRATE"')], 'only constants');
  w = oneWiring('() -> now -> stamp');
  assertEqual(w.sources, [], 'given nothing');
  assertEqual(targetsOf(w), [bare('stamp')], 'its target');

  // A sink, and several outputs.
  w = oneWiring('report -> publish -> ()');
  assertEqual(w.targets, [], 'a sink');
  w = oneWiring('obs -> regress -> (fit, residuals=res)');
  assertEqual(targetsOf(w), [bare('fit'), named('residuals', 'res')], 'several outputs');
  w = oneWiring('item -> route -> (yes=kept, no=dropped)');
  assertEqual(targetsOf(w), [named('yes', 'kept'), named('no', 'dropped')], 'named outputs');

  // A group of one is a group.
  assertEqual(membersOf(oneWiring('(x) -> f -> y')), [bare('x')], 'a group of one member');
  assertEqual(targetsOf(oneWiring('x -> f -> (y)')), [bare('y')], 'a group of one target');

  // Every JSON kind is a constant, nested ones too, and a string may hold
  // what would end a statement.
  w = oneWiring('[(a=true, b=false, c=null, d=-1.5e3, e=[1, "two", {"k": [3]}], ' +
    'f={"x": {"y": null}}, g="a ] \\" \\n b") -> f -> y]');
  const want = [true, false, null, -1500.0, [1n, 'two', { k: [3n] }], { x: { y: null } }, 'a ] " \n b'];
  assertEqual(w.sources.length, want.length, 'every constant');
  w.sources.forEach((member, index) => {
    assert(member.isConstant, `member ${index} is a constant`);
    assert(constantsEqual(member.constant, want[index]), `member ${index}: ${constantText(member.constant)}`);
  });
  // A whole number and a float are kept apart, as they are written.
  assertEqual(typeof w.sources[3].constant, 'number', 'a float');
  assertEqual(typeof w.sources[4].constant[0], 'bigint', 'a whole number');

  // A word that only starts like a constant is a node.
  assertEqual(membersOf(oneWiring('(a=truely, b=nullable) -> f -> y')),
    [named('a', 'truely'), named('b', 'nullable')], 'words that start like constants');

  // Statements need no separator beyond their own shape.
  const every = wiringsOf('a -> f -> b\n(b, k=1) -> g -> (c, d=e)\n[e -> h -> ()] [() -> i -> z]');
  assertEqual(every.length, 4, 'four statements');
  assertEqual(every[1].step, 'g', 'the second');
  assertEqual(every[3].step, 'i', 'the fourth');
}

// TEST12734: the two headers. A cap header reads its URN to the end of the
// statement; a machine header names another machine by an opaque reference,
// written as a string with JSON's escapes; and the word `machine` is only a
// keyword where a header puts it.
function test12734_capHeadersAndMachineHeaders() {
  const statements = parseSyntax(
    'extract cap:in="media:document;ext=pdf";extract;out="media:enc=utf-8"\n' +
    'clean machine "lib/clean \\"v2\\".machine"\n' +
    '[machine cap:in=media:;machine;out=media:]\n' +
    'machine -> machine -> machinery');
  assertEqual(statements.length, 4, 'four statements');

  assertEqual(statements[0].kind, SYNTAX_CAP_HEADER, 'a cap header');
  assertEqual(statements[0].alias, 'extract', 'its alias');
  assertEqual(statements[0].capUrn, 'cap:in="media:document;ext=pdf";extract;out="media:enc=utf-8"', 'its URN');

  assertEqual(statements[1].kind, SYNTAX_MACHINE_HEADER, 'a machine header');
  assertEqual(statements[1].alias, 'clean', 'its alias');
  assertEqual(statements[1].reference, 'lib/clean "v2".machine', 'the reference is unescaped');

  // An alias may be the word `machine`, and so may a node and a step.
  assertEqual(statements[2].kind, SYNTAX_CAP_HEADER, 'a cap header named machine');
  assertEqual(statements[2].alias, 'machine', 'its alias');
  assertEqual(statements[3].kind, SYNTAX_WIRING, 'a wiring');
  assertEqual(membersOf(statements[3].wiring), [bare('machine')], 'a node named machine');
  assertEqual(statements[3].wiring.step, 'machine', 'a step named machine');
  assertEqual(targetsOf(statements[3].wiring), [bare('machinery')], 'its target');
  assertEqual(statements.map(statement => statement.position), [0, 1, 2, 3], 'positions');
}

// TEST12735: a step's policy. It is read from the braces after the step,
// either key or both, in any order; and what it writes back is one form.
function test12735_aStepPolicy() {
  const policy = input => oneWiring(input).policy;
  const same = (a, b, what) => assert(a.equals(b), `${what}: ${a.toNotation()} vs ${b.toNotation()}`);

  assert(policy('a -> f -> b').isDefault(), 'no braces');
  assert(policy('a -> f{} -> b').isDefault(), 'empty braces');
  same(policy('a -> f{retry=3} -> b'), new StepPolicy(3), 'retry');
  same(policy('a -> f{on_error=absent} -> b'), new StepPolicy(0, ON_ERROR_ABSENT), 'on_error');
  const both = new StepPolicy(2, ON_ERROR_ABSENT);
  same(policy('a -> f{retry=2, on_error=absent} -> b'), both, 'both');
  same(policy('a -> f { on_error = absent , retry = 2 } -> b'), both, 'both, spaced, the other order');
  assertEqual(oneWiring('a -> f{retry=2} -> b').step, 'f', "the policy is not part of the step's name");

  assertEqual(new StepPolicy().toNotation(), '', 'the default writes nothing');
  assertEqual(new StepPolicy(3).toNotation(), '{retry=3}', 'retry');
  assertEqual(new StepPolicy(0, ON_ERROR_ABSENT).toNotation(), '{on_error=absent}', 'on_error');
  assertEqual(both.toNotation(), '{retry=2, on_error=absent}', 'both');
  // A policy that says `fail` in so many words is the default, and writes
  // nothing.
  assert(new StepPolicy(0, ON_ERROR_FAIL).isDefault(), 'fail is the default');
  // Either key said is no default.
  assert(!new StepPolicy(0, ON_ERROR_ABSENT).isDefault(), 'absent is said');
  assert(!new StepPolicy(1).isDefault(), 'a retry is said');
  same(new StepPolicy(0, ON_ERROR_FAIL), new StepPolicy(), 'fail is the default');
  assert(!both.equals(new StepPolicy(2)), 'on_error differs');
  assert(!both.equals(new StepPolicy(3, ON_ERROR_ABSENT)), 'retry differs');
  // What is written back reads as what it was.
  for (const each of [new StepPolicy(), both, new StepPolicy(7)]) {
    same(policy(`a -> f${each.toNotation()} -> b`), each, each.toNotation());
  }
}

const refusedSyntax = input => thrown(() => parseSyntax(input), input);

// TEST12736: what the text alone decides is refused by name, with the
// statement it is in: a constant that names no arg, a node named as a
// constant is, a second unnamed target, and a policy outside its table.
function test12736_whatTheTextAloneRefuses() {
  for (const input of ['(prices, 20) -> rolling -> s', '("mean") -> rolling -> s', '(true) -> f -> y', '(a, [1]) -> f -> y']) {
    assert(isSyntax(refusedSyntax(input), SE.UNNAMED_CONSTANT), input);
  }
  const unnamed = refusedSyntax('a -> f -> b\n(prices, 20) -> rolling -> s');
  assert(isSyntax(unnamed, SE.UNNAMED_CONSTANT), 'an unnamed constant');
  assert(unnamed.message.includes('constant 20 in statement 1 '), unnamed.message);
  assert(unnamed.message.includes('name=20'), unnamed.message);

  for (const [input, word] of [
    ['true -> f -> y', 'true'], ['x -> f -> null', 'null'], ['x -> f -> (out=false)', 'false'], ['x -> f -> (a, b=null)', 'null'],
  ]) {
    const error = refusedSyntax(input);
    assert(isSyntax(error, SE.RESERVED_NODE_NAME), input);
    assert(error.message.includes(`'${word}'`), input);
  }
  // As a member's value those words are constants, which is what they are.
  assertEqual(membersOf(oneWiring('(a=null) -> f -> y')), [named('a', '=null')], 'null as a constant');

  const several = refusedSyntax('x -> f -> (a, b, c=d)');
  assert(isSyntax(several, SE.SEVERAL_UNNAMED_TARGETS), 'several unnamed targets');
  assert(several.message.includes('(a, b)'), several.message);

  for (const [input, said] of [
    ['a -> f{retries=3} -> b', 'retries'],
    ['a -> f{retry=-1} -> b', '-1'],
    ['a -> f{retry=1.5} -> b', '1.5'],
    ['a -> f{retry=many} -> b', 'many'],
    ['a -> f{retry=4294967296} -> b', '4294967296'],
    ['a -> f{on_error=ignore} -> b', 'ignore'],
    ['a -> f{on_error=3} -> b', '3'],
    ['a -> f{retry=1, retry=2} -> b', 'twice'],
  ]) {
    const error = refusedSyntax(input);
    assert(isSyntax(error, SE.INVALID_POLICY), input);
    assert(error.message.includes("step 'f'"), `${input}: ${error.message}`);
    assert(error.message.includes(said), `${input}: ${error.message}`);
  }
  // The largest count a policy holds is read.
  assertEqual(oneWiring('a -> f{retry=4294967295} -> b').policy.retry, 4294967295, 'the largest count');

  // What the grammar does not accept at all.
  for (const input of [
    'a -> f', 'a -> -> b', '(a,) -> f -> b', 'a -> f -> (b', '(a b) -> f -> c',
    'x machine clean', '(a=) -> f -> b',
    // A string that is not a JSON string: an escape JSON does not have, and a
    // raw line break.
    '(a="\\q") -> f -> b', '(a="x\ny") -> f -> b', 'x machine "bad \\q ref"',
    // A number no constant can hold.
    '(a=1e999) -> f -> b',
    // An escape that names half a character: text has no such thing.
    '(a="\\ud800") -> f -> b', '(a="\\udc00x") -> f -> b', '(a="\\ud83d\\ud83d") -> f -> b',
    '(a={"k\\ud800": 1}) -> f -> b', '(a=["\\udc00"]) -> f -> b', '(a={"k": "\\ud800"}) -> f -> b',
    'x machine "\\ud800"',
  ]) {
    assert(isSyntax(refusedSyntax(input), SE.PARSE_ERROR), input);
  }
  // Both halves of a character, written as their two escapes, are it; and an
  // escaped backslash before a `u` is no escape of a character.
  assertEqual(membersOf(oneWiring('(a="\\ud83d\\ude00") -> f -> b')), [named('a', '="\u{1F600}"')], 'a pair');
  assertEqual(membersOf(oneWiring('(a="\\\\ud800") -> f -> b')), [named('a', '="\\\\ud800"')], 'an escaped backslash');
}

// TEST12832: a constant has one text, the same in every implementation: an
// object's keys in order, a whole number without a point, a float with one
// (or an exponent beyond sixteen digits and below five zeros), and only the
// escapes JSON requires. Two constants are equal as JSON values: `1` and
// `1.0` are not, and an object's key order is not part of it.
function test12832_aConstantHasOneText() {
  const text = written => constantText(decodeConstant(written));
  // Each spelling below is what the reference writes for that text.
  for (const [written, want] of [
    ['20', '20'],
    ['-7', '-7'],
    ['18446744073709551615', '18446744073709551615'],
    ['18446744073709551616', '1.8446744073709552e+19'],
    ['-9223372036854775809', '-9.223372036854776e+18'],
    ['1.0', '1.0'],
    ['1.50', '1.5'],
    ['-1.5e3', '-1500.0'],
    ['1e3', '1000.0'],
    ['0.0001', '0.0001'],
    ['0.00001', '0.00001'],
    ['0.000001', '1e-6'],
    ['1.25e-7', '1.25e-7'],
    ['1e15', '1000000000000000.0'],
    ['1e16', '1e+16'],
    ['1234567890123456.0', '1234567890123456.0'],
    // Seventeen digits: the nearest float, not the one below it.
    ['12345678901234567.0', '1.2345678901234568e+16'],
    ['1e21', '1e+21'],
    ['1.5e300', '1.5e+300'],
    ['5e-324', '5e-324'],
    ['0.0', '0.0'],
    ['-0.0', '-0.0'],
    // A whole number has no sign to keep at zero: `-0` is the float.
    ['0', '0'],
    ['-0', '-0.0'],
    ['-9223372036854775808', '-9223372036854775808'],
    ['1E3', '1000.0'],
    ['2.50e0', '2.5'],
    ['123.456', '123.456'],
    ['{"b": 1, "a": [true, null]}', '{"a":[true,null],"b":1}'],
    ['"a<b>&c é"', '"a<b>&c é"'],
    ['"tab\\there \\u0001 \\" \\\\ \\/ \\u007f"', '"tab\\there \\u0001 \\" \\\\ / \u007f"'],
    ['"line\\u2028sep"', '"line sep"'],
  ]) {
    assertEqual(text(written), want, written);
    // The text reads back as the value it was written from.
    assert(constantsEqual(decodeConstant(written), decodeConstant(text(written))), written);
  }

  const value = decodeConstant;
  assert(constantsEqual(value('{"a":1,"b":[2,"x"]}'), value('{"b":[2,"x"],"a":1}')), 'key order is no part of it');
  for (const [left, right] of [
    ['1', '1.0'], ['1', '2'], ['"1"', '1'], ['null', 'false'], ['[1,2]', '[2,1]'],
    ['[1]', '[1,1]'], ['{"a":1}', '{"a":2}'], ['{"a":1}', '{"b":1}'],
    ['{"a":1}', '{"a":1,"b":2}'], ['true', 'false'], ['"a"', '"b"'], ['1.5', '2.5'],
    ['null', '0'], ['true', '1'], ['false', '0'], ['true', '1.0'],
  ]) {
    assert(!constantsEqual(value(left), value(right)), `${left} and ${right}`);
    assert(!constantsEqual(value(right), value(left)), `${right} and ${left}`);
  }

  for (const refused of ['1 2', '1e999', 'NaN', 'Infinity', '"tab\tinside"', '', '"\\ud800"']) {
    thrown(() => decodeConstant(refused), refused);
  }
  // A value that is no JSON value has no text.
  assert(thrown(() => constantText(new Date()), 'a date') instanceof TypeError, 'a date is no constant');
  thrown(() => constantText(Infinity), 'an infinite float');
  thrown(() => constantText(undefined), 'undefined');
}

// ============================================================================
// Notation end to end: named members, constants, taken outputs, sources and
// sinks, step policy, the URN of a node, and the canonical form.
// ============================================================================

const SERIES = 'media:fmt=json;list;record;time-series';
const BENCHMARK = 'media:benchmark;fmt=json;list;record;time-series';
const WINDOW = 'media:integer;window';
const LABEL = 'media:enc=utf-8;label';
const TAG = 'media:enc=utf-8;tag';
const COMPARISON = 'media:comparison;fmt=json;record';
const RESIDUALS = 'media:fmt=json;list;record;residual';
const NOTE = 'media:enc=utf-8;note';
const REFERENCE = 'media:enc=utf-8;series-ref';

/**
 * A main input and a second arg that accepts the same type, two constants'
 * worth of options, a sequence arg, and three outputs.
 */
const compareCap = () => definition(`cap:in="${SERIES}";compare;out="${COMPARISON}"`, 'compare', [
  stdinArg(SERIES, 'series'),
  flagArg(BENCHMARK, 'benchmark').accepting(SERIES),
  flagArg(WINDOW, 'window'),
  flagArg(LABEL, 'label'),
  flagArg(TAG, 'tags', true),
], [
  outputOf(RESIDUALS, 'residuals', 'Residuals', true),
  outputOf(COMPARISON, 'comparison', 'The comparison'),
  outputOf(NOTE, 'note', 'A note').asOptional(true),
]);

/** A source. Its `in=` is void; it is given a reference and nothing else. */
const fetchCap = () => definition(`cap:in=media:void;fetch;out="${SERIES}"`, 'fetch',
  [flagArg(REFERENCE, 'reference')], [outputOf(SERIES, 'series', 'The series')]);

/** A sink. Its `out=` is void. */
const publishCap = () => definition(`cap:in="${COMPARISON}";publish;out=media:void`, 'publish',
  [stdinArg(COMPARISON, 'report')], []);

/** One value from a sequence of residuals — maps nothing. */
const meanCap = () => definition(`cap:in="${RESIDUALS}";mean;out="media:mean;numeric"`, 'mean',
  [stdinArg(RESIDUALS, 'rows', true)], [outputOf('media:mean;numeric', 'mean', 'The mean')]);

/** One value per residual — a sequence of them maps it. */
const scoreCap = () => definition(`cap:in="${RESIDUALS}";score;out="media:numeric;score"`, 'score',
  [stdinArg(RESIDUALS, 'row')], [outputOf('media:numeric;score', 'score', 'The score')]);

/**
 * The caps above and the media definitions their constants are held to: a
 * window of 1 to 365, a label that is a string of three allowed words, tags
 * that are strings, and references of at most twelve bytes.
 */
function notationDefinitions() {
  return definitionsOf([compareCap(), fetchCap(), publishCap(), meanCap(), scoreCap()]).addMediaDefs([
    mediaDef(WINDOW, { min: 1, max: 365 }, { type: 'integer' }),
    mediaDef(LABEL, { allowed_values: ['mean', 'median', 'max'] }, { type: 'string' }),
    mediaDef(TAG, null, { type: 'string' }),
    mediaDef(REFERENCE, { max_length: 12 }),
  ]);
}

/**
 * The notation definitions with a media definition, and so a title, for every
 * media a node of the tests' machines holds: what a render payload needs.
 */
const titledDefinitions = () => notationDefinitions().addMediaDefs(
  [SERIES, BENCHMARK, COMPARISON, RESIDUALS, NOTE, 'media:mean;numeric', 'media:numeric;score'].map(urn => mediaDef(urn)));

const HEADERS =
  '[compare cap:in="media:fmt=json;list;record;time-series";compare;' +
  'out="media:comparison;fmt=json;record"]' +
  '[fetch cap:in=media:void;fetch;out="media:fmt=json;list;record;time-series"]' +
  '[publish cap:in="media:comparison;fmt=json;record";publish;out=media:void]' +
  '[mean cap:in="media:fmt=json;list;record;residual";mean;out="media:mean;numeric"]' +
  '[score cap:in="media:fmt=json;list;record;residual";score;out="media:numeric;score"]';

const machineOf = wirings => parseMachine(HEADERS + wirings, notationDefinitions());

function resolutionError(wirings, definitions = null, headers = HEADERS) {
  const error = thrown(() => parseMachine(headers + wirings, definitions || notationDefinitions()), wirings);
  assert(error instanceof MachineAbstractionError, `${wirings}: expected a resolution error, got ${error.stack}`);
  return error;
}

/** The one edge of a one-step machine. */
function onlyEdge(machine) {
  assertEqual(machine.strandCount(), 1, 'one strand');
  assertEqual(machine.strands()[0].edges().length, 1, 'one edge');
  return machine.strands()[0].edges()[0];
}

/** What each arg of an edge is bound to, by the arg's name: a node's URN, or a constant. */
function bindingsOf(machine, edge) {
  const strand = machine.strands()[0];
  return edge.assignment.map(binding => [binding.argName, binding.source.isConstant
    ? `constant ${constantText(binding.source.constant)}`
    : `node ${binding.source.node} ${strand.nodeUrn(binding.source.node)}`]);
}

const sourcesOf = (bound, arg) => bound.filter(([name]) => name === arg).map(([, source]) => source);

function bindingNamed(edge, arg) {
  const found = edge.assignment.find(binding => binding.argName === arg);
  assert(found !== undefined, `no binding of arg '${arg}'`);
  return found;
}

const equivalent = (a, b) => machineOf(a).isEquivalent(machineOf(b));

/** A machine and the names its notation gave each strand's nodes. */
function withNames(text, definitions) {
  const parsed = parseMachineWithAST(text, definitions);
  return [parsed.machine, parsed.nodeNames.map(names => Object.fromEntries(names))];
}

// TEST12737: a member that names its arg binds that arg, whatever its type
// could also fit. Two inputs of one type are told apart only so: unnamed they
// are refused, and naming the other one is another machine. A name is the
// definition's label for the arg; the binding records the arg's media URN.
function test12737_aNamedMemberBindsTheArgItNames() {
  const [machine, names] = withNames(HEADERS + '[(path, benchmark=bench) -> compare -> result]', notationDefinitions());
  const edge = onlyEdge(machine);
  assertEqual(edge.assignment.length, 2, 'two bindings');
  // Both are inputs of the machine and both hold a series: the benchmark arg
  // ACCEPTS a series, and is identified by its own URN.
  const series = bindingNamed(edge, 'series');
  const benchmark = bindingNamed(edge, 'benchmark');
  for (const each of [series, benchmark]) {
    assert(!each.source.isConstant, each.argName);
    assert(machine.strands()[0].nodeUrn(each.source.node).isEquivalent(media(SERIES)), each.argName);
  }
  assert(series.source.node !== benchmark.source.node, 'two nodes');
  assert(benchmark.capArgMediaUrn.isEquivalent(media(BENCHMARK)), 'the benchmark is its own URN');
  assert(series.capArgMediaUrn.isEquivalent(media(SERIES)), 'the series is its own URN');

  // Which node is the benchmark is what the machine says, and a host
  // addresses the two by the names as written.
  assertEqual(names[0].bench, benchmark.source.node, 'bench');
  assertEqual(names[0].path, series.source.node, 'path');
  // Two inputs that hold one type come in the order their nodes were made.
  assertEqual(machine.strands()[0].inputAnchorIds(), [names[0].path, names[0].bench], 'input order');

  // Unnamed, nothing says which of the two series is the benchmark.
  const untyped = resolutionError('[(path, bench) -> compare -> result]');
  assert(isAbstraction(untyped, AE.UNTYPED_MACHINE_INPUT), untyped.message);
  assert(untyped.message.includes('(path, bench)'), untyped.message);

  // The same two, produced by steps: each has a type, and it fits two args.
  const produced = '[(reference="a") -> fetch -> a][(reference="b") -> fetch -> b]';
  // The refusal says which members to name, by the names the text gave them,
  // and the args each could be for.
  const seriesUrn = canonical(SERIES);
  const ambiguous = resolutionError(produced + '[(a, b) -> compare -> result]');
  assert(isAbstraction(ambiguous, AE.AMBIGUOUS_MACHINE_NOTATION), ambiguous.message);
  assertEqual(ambiguous.members, [
    new UndecidedMember('a', seriesUrn, ['series', 'benchmark']),
    new UndecidedMember('b', seriesUrn, ['series', 'benchmark']),
  ], 'the undecided members');
  assert(ambiguous.message.includes(`name them: 'a' (${seriesUrn}) could be series or benchmark; 'b' (`), ambiguous.message);
  // A member is named by the name the text gave it, wherever it stands in its
  // group and whichever node was written first.
  const swapped = resolutionError(produced + '[(b, a) -> compare -> result]');
  assert(isAbstraction(swapped, AE.AMBIGUOUS_MACHINE_NOTATION), swapped.message);
  assertEqual(swapped.members.map(member => member.node), ['b', 'a'], 'named as written');
  // The args a member could be for are the ones no name took: with the first
  // of three bound by name, the other two are what is left to say.
  const mixUrn = `cap:in="${SERIES}";mix;out="${COMPARISON}"`;
  const withMix = notationDefinitions().addCaps([definition(mixUrn, 'mix', [
    stdinArg(SERIES, 'first'),
    flagArg('media:second;fmt=json;list;record;time-series', 'second').accepting(SERIES),
    flagArg('media:third;fmt=json;list;record;time-series', 'third').accepting(SERIES),
  ], [outputOf(COMPARISON, 'mixed', 'The mix')])]);
  const mixed = resolutionError(produced + '[(reference="c") -> fetch -> c][(first=c, a, b) -> mix -> result]',
    withMix, HEADERS + '[mix ' + mixUrn + ']');
  assertEqual(mixed.members, [
    new UndecidedMember('a', seriesUrn, ['second', 'third']),
    new UndecidedMember('b', seriesUrn, ['second', 'third']),
  ], 'what is left to say');
  const said = machineOf(produced + '[(a, benchmark=b) -> compare -> result]');
  assertEqual(said.strands()[0].edges().length, 3, 'three steps');
  // An arg a member named is said: an unnamed member is not matched into it as
  // well. Two unnamed series beside a named benchmark have one arg left
  // between them, and that is what the refusal says — not that they tie.
  const third = '[(reference="c") -> fetch -> c]';
  assert(isAbstraction(resolutionError(produced + third + '[(a, c, benchmark=b) -> compare -> result]'),
    AE.UNMATCHED_SOURCE_IN_CAP_ARGS), 'one arg left for two');

  // A member that fits no arg at all is the one the refusal names, wherever
  // it stands: here the second, a comparison where a series is taken.
  const unfit = resolutionError(produced + '[a -> compare -> made][(b, made) -> compare -> result]');
  assert(isAbstraction(unfit, AE.UNMATCHED_SOURCE_IN_CAP_ARGS), unfit.message);
  assert(unfit.message.includes(`source URN '${canonical(COMPARISON)}'`), unfit.message);

  // A name the cap does not declare, with the names it does.
  const unknown = resolutionError('[(path, baseline=bench) -> compare -> result]');
  assert(isAbstraction(unknown, AE.UNKNOWN_ARG_NAME), unknown.message);
  assert(unknown.message.includes("'baseline'"), unknown.message);
  assert(unknown.message.includes('(it declares: series, benchmark, window, label, tags)'), unknown.message);
  // A name is not read out of a URN: `time-series` is a tag of the arg's
  // type, and no arg is called that.
  assert(isAbstraction(resolutionError('[(time-series=path) -> compare -> result]'), AE.UNKNOWN_ARG_NAME), 'time-series');
  // A produced node of another type, named into an arg that does not accept it.
  const mismatch = resolutionError('[path -> compare -> r][(series=p2, benchmark=r) -> compare -> r2]');
  assert(isAbstraction(mismatch, AE.SOURCE_DOES_NOT_CONFORM_TO_ARG), mismatch.message);
  assert(mismatch.message.includes(`arg 'benchmark' accepts '${canonical(SERIES)}'`), mismatch.message);
  assert(mismatch.message.includes(`its source is '${canonical(COMPARISON)}'`), mismatch.message);
  // An arg that takes one value, named twice.
  const twice = resolutionError('[(path, benchmark=b1, benchmark=b2) -> compare -> result]');
  assert(isAbstraction(twice, AE.ARG_BOUND_TWICE), twice.message);
  assert(twice.message.includes("arg 'benchmark' takes one value and is named by 2 members"), twice.message);
}

// TEST12738: a constant is the arg's value, written in the machine. It is held
// to the validation of the arg's media definition when the machine is
// resolved, and a sequence arg gathers the constants named into it, in order.
function test12738_aConstantIsBoundAndValidated() {
  const machine = machineOf('[(path, window=20, label="mean", tags="a", tags="b") -> compare -> result]');
  const bound = bindingsOf(machine, onlyEdge(machine));
  assertEqual(sourcesOf(bound, 'window'), ['constant 20'], 'window');
  assertEqual(sourcesOf(bound, 'label'), ['constant "mean"'], 'label');
  assertEqual(sourcesOf(bound, 'tags'), ['constant "a"', 'constant "b"'], 'gathered in the order written');
  // A constant is no node: the machine has one input and one output.
  assertEqual(machine.strands()[0].nodes().length, 2, 'two nodes');
  assertEqual(machine.strands()[0].inputAnchorIds().length, 1, 'one input');

  const refused = wiring => {
    const error = resolutionError(wiring);
    assert(isAbstraction(error, AE.CONSTANT_FAILS_VALIDATION), `${wiring}: ${error.message}`);
    return error.message;
  };
  // Outside the range the media definition gives.
  const low = refused('[(path, window=0) -> compare -> result]');
  assert(low.includes("arg 'window' refuses the constant 0: "), low);
  assert(low.includes('minimum value 1'), low);
  assert(refused('[(path, window=366) -> compare -> result]').includes('maximum value 365'), 'the maximum');
  // Inside the range and not the kind of value the schema asks for.
  assert(refused('[(path, window=2.5) -> compare -> result]').includes('schema'), 'a float for an integer');
  assert(refused('[(path, window="20") -> compare -> result]').includes('schema'), 'a string for an integer');
  // A word the definition does not allow.
  assert(refused('[(path, label="mode") -> compare -> result]').includes('allowed values: ["mean", "median", "max"]'), 'mode');
  // An arg whose media definition is not at hand cannot be given a constant
  // nobody could check.
  const unchecked = refused('[(path, benchmark=[1, 2]) -> compare -> result]');
  assert(unchecked.includes("arg 'benchmark' refuses the constant [1,2]"), unchecked);
  assert(unchecked.includes('not available'), unchecked);

  // The bounds themselves are allowed.
  machineOf('[(path, window=1) -> compare -> result]');
  machineOf('[(path, window=365) -> compare -> result]');

  // A string's length is its UTF-8 bytes: six two-byte characters fill a
  // reference of twelve, and a seventh breaks it.
  machineOf('[(reference="éééééé") -> fetch -> s]');
  const long = refused('[(reference="ééééééé") -> fetch -> s]');
  assert(long.includes('maximum length 12'), long);

  // A schema's required properties are held: a benchmark written as an object
  // says its points.
  const withBenchmarkSchema = notationDefinitions().addMediaDefs([mediaDef(BENCHMARK, null,
    { type: 'object', required: ['points'], properties: { points: { type: 'array' } } })]);
  parseMachine(HEADERS + '[(path, benchmark={"points": [1, 2]}) -> compare -> r]', withBenchmarkSchema);
  const missing = resolutionError('[(path, benchmark={"scale": 2}) -> compare -> r]', withBenchmarkSchema);
  assert(isAbstraction(missing, AE.CONSTANT_FAILS_VALIDATION), missing.message);
  assert(missing.message.includes('schema'), missing.message);

  // A constant is not a node. One input feeding two args, and the same input
  // feeding one of them beside a constant for the other, have the same nodes
  // and are different machines.
  const withBenchmarkDef = notationDefinitions().addMediaDefs([mediaDef(BENCHMARK)]);
  const inDefinitions = wirings => parseMachine(HEADERS + wirings, withBenchmarkDef);
  const twice = inDefinitions('[(series=p, benchmark=p) -> compare -> r]');
  const once = inDefinitions('[(series=p, benchmark=[1, 2]) -> compare -> r]');
  assertEqual(twice.strands()[0].nodes().length, once.strands()[0].nodes().length, 'the same nodes');
  assert(!twice.isEquivalent(once), 'a node is no constant');
  assert(!once.isEquivalent(twice), 'a constant is no node');

  // Two machines that give an arg different constants are different machines.
  assert(equivalent('[(path, window=20) -> compare -> r]', '[(p, window=20) -> compare -> out]'), 'one constant');
  assert(!equivalent('[(path, window=20) -> compare -> r]', '[(path, window=21) -> compare -> r]'), 'two constants');
  assert(!equivalent('[(path, window=20) -> compare -> r]', '[path -> compare -> r]'), 'a constant and none');
}

// TEST12739: the outputs a wiring takes. An unnamed target takes the step's
// main output, a named one the output of that name; one that is not taken is
// discarded; a sink takes none and a source is given nothing.
function test12739_outputsSourcesAndSinks() {
  const both = machineOf('[path -> compare -> (result, residuals=res)]');
  const edge = onlyEdge(both);
  // Sorted by output URN, each node holding what its output is declared to be.
  assertEqual(edge.outputs.length, 2, 'two outputs');
  const urns = edge.outputs.map(output => output.outputMediaUrn);
  assert(compareMediaUrns(urns[0], urns[1]) < 0, 'sorted by URN');
  const isSequence = Object.fromEntries(edge.outputs.map(output =>
    [output.outputName, both.strands()[0].nodeIsSequence(output.node)]));
  assertEqual(isSequence, { comparison: false, residuals: true }, 'each node holds what its output is');
  const main = edge.mainTarget();
  assert(main !== null, 'the main output is taken');
  assert(both.strands()[0].nodeUrn(main).isEquivalent(media(COMPARISON)), 'the main output');
  assertEqual(both.strands()[0].outputAnchorIds().length, 2, 'two outputs of the machine');

  // The main output need not be taken, and the one that is, is still named.
  const residualsOnly = machineOf('[path -> compare -> (residuals=res)]');
  assertEqual(onlyEdge(residualsOnly).mainTarget(), null, 'no main output');
  assertEqual(onlyEdge(residualsOnly).outputs.length, 1, 'one output');
  assert(!residualsOnly.isEquivalent(both), 'another machine');
  // Which outputs are taken is not their order in the text.
  assert(equivalent('[path -> compare -> (result, residuals=res)]', '[p -> compare -> (residuals=r, out)]'), 'any order');

  const unknown = resolutionError('[path -> compare -> (result, errors=e)]');
  assert(isAbstraction(unknown, AE.UNKNOWN_OUTPUT_NAME), unknown.message);
  assert(unknown.message.includes("'errors'"), unknown.message);
  assert(unknown.message.includes('(it declares: residuals, comparison, note)'), unknown.message);
  assert(isAbstraction(resolutionError('[path -> compare -> (residuals=a, residuals=b)]'), AE.OUTPUT_TAKEN_TWICE), 'twice by name');
  // The main output taken unnamed and by its name is the same output twice.
  assert(isAbstraction(resolutionError('[path -> compare -> (a, comparison=b)]'), AE.OUTPUT_TAKEN_TWICE), 'unnamed and named');

  // A sink: nothing is taken, and its strand has no output.
  const sink = machineOf('[report -> publish -> ()]');
  assertEqual(onlyEdge(sink).outputs, [], 'nothing taken');
  assertEqual(sink.strands()[0].outputAnchorIds(), [], 'no output');
  assertEqual(sink.strands()[0].inputAnchorIds().length, 1, 'one input');
  // A sink has no main output to take.
  assert(isAbstraction(resolutionError('[report -> publish -> done]'), AE.NO_MAIN_OUTPUT), 'no main output');

  // A source: given nothing, or only what its constants say.
  const source = machineOf('[() -> fetch -> s]');
  assertEqual(onlyEdge(source).assignment, [], 'given nothing');
  assertEqual(source.strands()[0].inputAnchorIds(), [], 'no input');
  const referenced = machineOf('[(reference="fred/UNRATE") -> fetch -> s]');
  assertEqual(bindingsOf(referenced, onlyEdge(referenced)), [['reference', 'constant "fred/UNRATE"']], 'a constant');
  assert(!referenced.isEquivalent(source), 'another machine');
  // A source cannot be given an input, and a cap that takes one is given it.
  assert(isAbstraction(resolutionError('[x -> fetch -> s]'), AE.UNTYPED_MACHINE_INPUT), 'a source given an input');
  const unbound = resolutionError('[() -> compare -> r]');
  assert(isAbstraction(unbound, AE.MAIN_INPUT_UNBOUND), unbound.message);
  assert(unbound.message.includes("('series')"), unbound.message);
  assert(isAbstraction(resolutionError('[(benchmark=b) -> compare -> r]'), AE.MAIN_INPUT_UNBOUND), 'only the benchmark');

  // What a sequence output feeds: a step that takes the sequence runs once,
  // one that takes a single value runs once per item.
  const folded = machineOf('[path -> compare -> (residuals=res)][res -> mean -> m]');
  const mapped = machineOf('[path -> compare -> (residuals=res)][res -> score -> s]');
  assert(!oneEdgeOf(folded, 'mean').isLoop, 'a fold');
  assert(oneEdgeOf(mapped, 'score').isLoop, 'a map');
  assert(!oneEdgeOf(mapped, 'compare').isLoop, 'the producer');
  // Whether a step maps is part of what the machine is: the same text, read
  // where the residuals are one value, is another machine.
  const single = compareCap();
  single.outputNamed('residuals').is_sequence = false;
  const oneValue = notationDefinitions().addCaps([single]);
  const unmapped = parseMachine(HEADERS + '[path -> compare -> (residuals=res)][res -> score -> s]', oneValue);
  assert(!oneEdgeOf(unmapped, 'score').isLoop, 'one value maps nothing');
  assert(!unmapped.isEquivalent(mapped), 'another machine');
  assert(!mapped.isEquivalent(unmapped), 'another machine');
}

// TEST12740: the media URN of a node comes from the wirings that touch it and
// never from where a member stands or which wiring comes first.
function test12740_theUrnOfANodeIsPositionFree() {
  // Members in either order, wirings in either order: one machine.
  const a = '[(path, benchmark=bench, window=20) -> compare -> (r, residuals=res)][res -> score -> s]';
  const b = '[res -> score -> s][(window=20, benchmark=bench, path) -> compare -> (residuals=res, r)]';
  assert(equivalent(a, b), 'one machine');
  // And one text: the canonical notation names its nodes by what they are
  // for, not by which was written first.
  assertEqual(machineOf(a).toMachineNotation(), machineOf(b).toMachineNotation(), 'one text');
  // The two inputs are not interchangeable: a machine that names a DIFFERENT
  // pairing of its nodes to a second step is another machine.
  assert(!equivalent(
    '[(path, benchmark=bench) -> compare -> (residuals=r)][(path, benchmark=bench) -> compare -> (note=n)]',
    '[(path, benchmark=bench) -> compare -> (residuals=r)][(bench, benchmark=path) -> compare -> (note=n)]'), 'another pairing');

  // An input of the machine named into an arg holds what that arg accepts,
  // and the unnamed one beside it holds what the main input accepts.
  const [machine, names] = withNames(HEADERS + '[(benchmark=bench, path) -> compare -> r]', notationDefinitions());
  for (const name of ['bench', 'path']) {
    assert(machine.strands()[0].nodeUrn(names[0][name]).isEquivalent(media(SERIES)), name);
  }

  // Naming the main input is allowed; then an unnamed input beside it has no
  // arg anything decides.
  machineOf('[(series=path, benchmark=bench) -> compare -> r]');
  assert(isAbstraction(resolutionError('[(series=path, bench) -> compare -> r]'), AE.UNTYPED_MACHINE_INPUT), 'untyped');

  // An input of the machine given two types that are not on one chain.
  const conflict = resolutionError('[(series=x) -> compare -> r][(report=x) -> publish -> ()]');
  assert(isAbstraction(conflict, AE.NODE_MEDIA_CONFLICT), conflict.message);
  assert(conflict.message.includes("node 'x'"), conflict.message);
  // A node a step produces has that output's type, and a name does not change
  // it: named into an arg that does not accept it, it is refused there.
  assert(isAbstraction(resolutionError('[path -> compare -> r][(series=r) -> compare -> r2]'),
    AE.SOURCE_DOES_NOT_CONFORM_TO_ARG), 'a produced node keeps its type');
}

// TEST12741: the canonical notation. Every binding and every taken output is
// written under its name, so nothing in it is matched by type; a machine
// written out and read back is the same machine, and the text does not change
// on a second pass. A policy is part of what a machine is.
function test12741_canonicalNotationRoundTrips() {
  for (const wirings of [
    '[path -> compare -> result]',
    '[(path, benchmark=bench) -> compare -> result]',
    '[(path, window=20, label="max", tags="b", tags="a") -> compare -> (result, residuals=res, note=n)]',
    '[(reference="fred/UNRATE") -> fetch{retry=3} -> s][s -> compare{retry=1, on_error=absent} -> (residuals=res)][res -> score -> x]',
    '[() -> fetch -> s]',
    '[report -> publish{on_error=absent} -> ()]',
  ]) {
    const first = machineOf(wirings);
    const text = first.toMachineNotation();
    const second = parseMachine(text, notationDefinitions());
    assert(first.isEquivalent(second), `${wirings}\n${text}`);
    assertEqual(second.toMachineNotation(), text, 'a fixed point');
    const lineBased = first.toMachineNotationFormatted(NOTATION_FORMAT_LINE_BASED);
    assert(!lineBased.split('\n').some(line => line.startsWith('[')), 'no statement of the line-based form is bracketed');
    assert(first.isEquivalent(parseMachine(lineBased, notationDefinitions())), lineBased);
    // The multi-line form is the canonical statements, one to a line.
    const multiline = first.toMachineNotationMultiline();
    assertEqual(multiline.split(']\n[').join(']['), text, 'the multi-line form');
    assert(first.isEquivalent(parseMachine(multiline, notationDefinitions())), multiline);
  }

  const text = machineOf('[(path, benchmark=bench, window=20) -> compare{retry=2} -> (result, residuals=res)]').toMachineNotation();
  // Named throughout, and the policy on the step.
  for (const part of ['series=n', 'benchmark=n', 'window=20', 'comparison=n', 'residuals=n', 'edge_0{retry=2}']) {
    assert(text.includes(part), `${part} in ${text}`);
  }
  // A gather keeps the order its members were written in.
  assert(machineOf('[(path, tags="b", tags="a") -> compare -> r]').toMachineNotation().includes('tags="b", tags="a"'), 'gather order');

  // The policy is read onto the edge, and two machines that differ in it differ.
  const policy = wirings => onlyEdge(machineOf(wirings)).policy;
  assert(policy('[p -> compare -> r]').isDefault(), 'no policy');
  assert(policy('[p -> compare{retry=2, on_error=absent} -> r]').equals(new StepPolicy(2, ON_ERROR_ABSENT)), 'the policy');
  assert(!equivalent('[p -> compare{retry=2} -> r]', '[p -> compare -> r]'), 'retry or not');
  assert(!equivalent('[p -> compare{retry=2} -> r]', '[p -> compare{retry=3} -> r]'), 'two counts');
  assert(!equivalent('[p -> compare{on_error=absent} -> r]', '[p -> compare -> r]'), 'on_error or not');
  assert(equivalent('[p -> compare{retry=2} -> r]', '[q -> compare { retry = 2 } -> s]'), 'one policy, two spellings');

  // Two machines of the same nodes, steps and anchors, whose steps take their
  // outputs differently: which step makes the residuals is part of what each is.
  const first = '[p -> compare -> r1][(p, window=20) -> compare -> (r2, residuals=x)]';
  const second = '[p -> compare -> (r1, residuals=x)][(p, window=20) -> compare -> r2]';
  assert(!equivalent(first, second), 'which step makes the residuals');
  assert(!equivalent(second, first), 'which step makes the residuals');

  // A machine is not the machine it is the first steps of.
  const one = '[p -> compare -> (residuals=res)]';
  const two = '[p -> compare -> (residuals=res)][res -> score -> s]';
  assert(!equivalent(one, two), 'a prefix');
  assert(!equivalent(two, one), 'a prefix');

  // Two steps of one cap that differ only in what feeds an arg have one order
  // in the canonical text, whichever was written first: the one fed by a
  // node, then the one fed by a constant.
  const withBenchmarkDef = notationDefinitions().addMediaDefs([mediaDef(BENCHMARK)]);
  const byNode = '[(series=p, benchmark=q) -> compare -> (note=a)]';
  const byConstant = '[(series=p, benchmark=[1, 2]) -> compare -> (note=b)]';
  const texts = new Set([byNode + byConstant, byConstant + byNode].map(wirings =>
    parseMachine(HEADERS + wirings, withBenchmarkDef).toMachineNotation()));
  assertEqual(texts.size, 1, 'one text');
  const [only] = texts;
  assert(only.indexOf('benchmark=n') < only.indexOf('benchmark=[1,2]'), only);

  // A format nobody writes is refused, not read as one of the two.
  thrown(() => machineOf(one).toMachineNotationFormatted('tabular'), 'a format nobody writes');
}

// TEST12742: a machine header names another machine. Read with nothing to
// resolve the reference against, it is refused by name rather than ignored.
function test12742_aMachineReferenceNeedsASource() {
  const error = thrown(() => parseMachine(HEADERS + '[clean machine "lib/clean.machine"][path -> compare -> r]',
    notationDefinitions()), 'a machine header with no source');
  assert(isSyntax(error, SE.MACHINE_REFERENCE_WITHOUT_SOURCE), error.stack);
  assert(error.message.includes('machine header \'clean\' refers to "lib/clean.machine"'), error.message);
}

// TEST12743: the render payload carries what the graph view needs of the new
// forms: each binding's arg name and its node or its constant, each taken
// output with its name, and the step's policy.
function test12743_renderPayloadCarriesNamesConstantsAndOutputs() {
  const machine = machineOf('[(path, window=20, label="max") -> compare{retry=2, on_error=absent} -> (result, residuals=res)]');
  const payload = JSON.parse(machine.toRenderPayloadJson(titledDefinitions()));
  assertEqual(payload.strands.length, 1, 'one strand');
  const strand = payload.strands[0];
  assertEqual(strand.edges.length, 1, 'one edge');
  const edge = strand.edges[0];
  assertEqual(edge.retry, 2, 'retry');
  assertEqual(edge.on_error, 'absent', 'on_error');
  assertEqual(edge.alias, 'edge_0', 'alias');
  assertEqual(edge.title, 'compare', "the cap's title");
  assertEqual(edge.is_loop, false, 'is_loop');
  assertEqual(edge.included_as, [], 'a step the machine wrote itself');
  assert(!('target_node' in edge), 'one target is not the shape any more');

  const byArg = Object.fromEntries(edge.assignment.map(binding => [binding.arg_name, binding]));
  assertEqual(Object.keys(byArg).length, 3, 'three bindings');
  assertEqual(byArg.window.constant, 20, 'the window');
  assertEqual(byArg.label.constant, 'max', 'the label');
  assert(!('source_node' in byArg.window), 'a constant has no node');
  assertEqual(byArg.series.source_node, strand.input_anchor_nodes[0], "the series is the machine's one input");
  assert(!('constant' in byArg.series), 'a node is no constant');
  assertEqual(byArg.window.cap_arg_media_urn, canonical(WINDOW), "the arg's URN");

  assertEqual(edge.outputs.length, 2, 'two outputs');
  const nodeUrn = Object.fromEntries(strand.nodes.map(node => [node.id, node.urn]));
  for (const output of edge.outputs) {
    // Each output goes to the node that holds its type.
    assertEqual(nodeUrn[output.node], output.output_media_urn, output.output_name);
  }
  for (const node of strand.nodes) assertEqual(node.title, node.urn, "the media definition's title");
  assertEqual(edge.outputs.map(output => output.output_name).sort(), ['comparison', 'residuals'], 'the outputs');
  assertEqual([...strand.output_anchor_nodes].sort(), edge.outputs.map(output => output.node).sort(), 'the anchors');
  // An empty machine draws nothing.
  assertEqual(new Machine([]).toRenderPayloadJson(definitionsOf([])), '{"strands":[]}', 'an empty machine');
}

// TEST12867: the render payload says which binding feeds a step's main input
// and which output is its main one, by the step's definition, so a view can
// draw the main wires plain and name the others.
function test12867_renderPayloadMarksTheMainInputAndOutput() {
  const machine = machineOf('[(path, benchmark=bench) -> compare -> (result, residuals=res)]');
  const edge = JSON.parse(machine.toRenderPayloadJson(titledDefinitions())).strands[0].edges[0];
  assertEqual(
    edge.assignment.map(binding => [binding.arg_name, binding.is_main_input]).sort(),
    [['benchmark', false], ['series', true]],
    'the main input is marked, the named argument is not',
  );
  assertEqual(
    edge.outputs.map(output => [output.output_name, output.is_main_output]).sort(),
    [['comparison', true], ['residuals', false]],
    'the main output is marked, the other output is not',
  );
}

// TEST12833: an output that carries the input holds the input's type, not the
// URN that names it: a router's branches are typed by what was routed, so a
// step that takes that type can be wired to one. Which branch a wiring takes
// is part of what the machine is, although both hold one type.
function test12833_aCarriedOutputHoldsTheInputsType() {
  const verdict = 'media:enc=utf-8;verdict';
  const kept = 'media:kept;marker';
  const dropped = 'media:dropped;marker';
  const routeUrn = `cap:in="${SERIES}";route;out="${verdict}"`;
  const definitions = notationDefinitions().addCaps([definition(routeUrn, 'route', [stdinArg(SERIES, 'series')], [
    outputOf(verdict, 'verdict', 'The verdict'),
    outputOf(kept, 'kept', 'What was kept').asOptional(true).carryingInput(),
    outputOf(dropped, 'dropped', 'What was dropped').asOptional(true).carryingInput(),
  ])]);
  const headers = HEADERS + '[route ' + routeUrn + ']';
  const parse = wirings => withNames(headers + wirings, definitions);

  const [machine, names] = parse('[s -> route -> (v, kept=k, dropped=d)][k -> compare -> r]');
  const held = name => machine.strands()[0].nodeUrn(names[0][name]).toString();
  assertEqual(held('k'), canonical(SERIES), 'the branch holds what was routed');
  assertEqual(held('d'), canonical(SERIES), 'the branch holds what was routed');
  assertEqual(held('v'), canonical(verdict), 'the main output holds its own type');
  // The edge still records which output each is, by the output's own URN.
  const route = oneEdgeOf(machine, 'route');
  assertEqual(route.outputs.map(output => [output.outputName, output.outputMediaUrn.toString()]).sort(),
    [['dropped', canonical(dropped)], ['kept', canonical(kept)], ['verdict', canonical(verdict)]], 'the outputs by their URNs');

  // An output that carries nothing holds the URN it declares.
  const [plain, plainNames] = parse('[p -> compare -> (note=n)]');
  assertEqual(plain.strands()[0].nodeUrn(plainNames[0].n).toString(), canonical(NOTE), 'a declared output');

  // The two branches hold one type and are two outputs.
  const [keptOnly] = parse('[s -> route -> (kept=x)]');
  const [keptAgain] = parse('[t -> route -> (kept=y)]');
  const [droppedOnly] = parse('[s -> route -> (dropped=x)]');
  assert(keptOnly.isEquivalent(keptAgain), 'one branch');
  assert(!keptOnly.isEquivalent(droppedOnly), 'two branches');
  assert(!droppedOnly.isEquivalent(keptOnly), 'two branches');
}

// TEST12834: the correspondence between the nodes of two strands is one to
// one in both directions: a pair made once is confirmed, and a node of either
// strand paired with a second node of the other is refused.
function test12834_aNodeStandsForOneNode() {
  const nodes = new NodeBijection(3, 3);
  assert(nodes.bind(0, 2), 'a pair');
  assert(nodes.bind(0, 2), 'the same pair again');
  assert(!nodes.bind(0, 1), 'one node of this strand, two of the other');
  assert(!nodes.bind(1, 2), 'two nodes of this strand, one of the other');
  // A refused pair leaves nothing behind: both nodes it named are still free.
  assert(nodes.bind(1, 1), 'still free');
  assert(nodes.bind(2, 0), 'still free');
  assert(nodes.bind(1, 1), 'and a pair made stays made');
}

// TEST12838: what a machine sorts by URN, it sorts by the URN's parts — the
// prefix, then the tags by key and value; for a cap its input, its output, its
// effect and then its tags — and never by the URN's text. The two orders
// differ wherever one tag key is the beginning of another (`file`,
// `file-path`), and the canonical form is the same in every implementation
// only because all of them use the first.
function test12838_urnsAreOrderedByTheirPartsNotTheirText() {
  const standsBefore = (first, second) => compareMediaUrns(media(first), media(second)) < 0;
  const sample = 'media:file;sample';
  const pathUrn = 'media:file-path';
  assert(standsBefore(sample, pathUrn), 'file before file-path');
  assert(!standsBefore(pathUrn, sample), 'file before file-path');
  assert(canonical(pathUrn) < canonical(sample), 'the text orders them the other way');
  // A URN that is the beginning of another stands first; a tag with any value
  // before the same tag with one; values in their own order.
  assert(standsBefore('media:file', 'media:file;sample'), 'a beginning');
  assert(standsBefore('media:enc', 'media:enc=ascii'), 'any value first');
  assert(standsBefore('media:enc=ascii', 'media:enc=utf-8'), 'values in order');
  assertEqual(compareMediaUrns(media('media:sample;file'), media(sample)), 0, 'tag order is no part of it');

  const capBefore = (first, second) => compareCapUrns(CapUrn.fromString(first), CapUrn.fromString(second)) < 0;
  // A cap's input decides before anything else it says.
  assert(capBefore(`cap:in="${sample}";zz;out="media:x"`, `cap:in="${pathUrn}";aa;out="media:x"`), 'the input');
  // Then its output — and only then.
  assert(capBefore(`cap:in="media:x";zz;out="${sample}"`, `cap:in="media:x";aa;out="${pathUrn}"`), 'the output');
  assert(capBefore(`cap:in="${sample}";op;out="${pathUrn}"`, `cap:in="${pathUrn}";op;out="${sample}"`), 'input before output');
  // Then its effect, in the order: declared, none, patch, unspecified.
  const effects = [
    'cap:in="media:x";op;out="media:x"',
    'cap:effect=none;in="media:x";op;out="media:x"',
    'cap:effect=patch;in="media:x";op;out="media:x"',
    'cap:effect=?;in="media:x";op;out="media:x"',
  ];
  for (let i = 0; i + 1 < effects.length; i += 1) {
    assert(capBefore(effects[i], effects[i + 1]), `${effects[i]} before ${effects[i + 1]}`);
    assert(!capBefore(effects[i + 1], effects[i]), `${effects[i + 1]} after ${effects[i]}`);
  }
  // Then its other tags — after the effect, whatever they say.
  assert(capBefore('cap:in="media:x";aa;out="media:x"', 'cap:in="media:x";zz;out="media:x"'), 'the tags');
  assert(capBefore('cap:in="media:x";zz;out="media:x"', 'cap:effect=patch;in="media:x";aa;out="media:x"'), 'the effect first');

  // In a machine: the bindings of a step, the outputs it takes, the inputs of
  // the strand and the steps themselves all stand in that order.
  const result = 'media:file;result';
  const where = 'media:file-path;written';
  const pairUrn = `cap:in="${sample}";pair;out="${result}"`;
  const firstUrn = `cap:in="${sample}";zz-first;out="media:file;a"`;
  const secondUrn = `cap:in="${sample}";aa-second;out="${pathUrn}"`;
  const definitions = definitionsOf([
    definition(pairUrn, 'pair', [stdinArg(sample, 'sample'), flagArg(pathUrn, 'path')],
      [outputOf(result, 'result'), outputOf(where, 'where')]),
    definition(firstUrn, 'first', [stdinArg(sample, 'sample')], [outputOf('media:file;a', 'made')]),
    definition(secondUrn, 'second', [stdinArg(sample, 'sample')], [outputOf(pathUrn, 'made')]),
  ]);
  const [machine, names] = withNames(`[pair ${pairUrn}][(path=p, s) -> pair -> (where=w, r)]`, definitions);
  const edge = onlyEdge(machine);
  assertEqual(edge.assignment.map(binding => binding.argName), ['sample', 'path'], 'bindings by URN');
  assertEqual(edge.outputs.map(output => output.outputName), ['result', 'where'], 'outputs by URN');
  assertEqual(machine.strands()[0].inputAnchorIds(), [names[0].s, names[0].p], 'inputs by URN');
  assertEqual(machine.strands()[0].outputAnchorIds(), [names[0].r, names[0].w], 'outputs of the strand by URN');
  assert(machine.toMachineNotation().includes('[(sample=n0, path=n1) -> edge_0 -> (result=n2, where=n3)]'), machine.toMachineNotation());

  const headers = `[first ${firstUrn}][second ${secondUrn}]`;
  for (const wirings of ['[x -> first -> a][x -> second -> b]', '[x -> second -> b][x -> first -> a]']) {
    const steps = parseMachine(headers + wirings, definitions).strands()[0].edges();
    assertEqual(steps.map(step => step.capUrn.toString().includes('zz-first')), [true, false], wirings);
  }
}

// ============================================================================
// Gathering: several sources bound to one sequence arg.
// ============================================================================

function refusedMatch(sources, args, argIsSequence) {
  const error = thrown(() => matchSourcesToArgs(sources, args, argIsSequence, null), 'the matching');
  assert(error instanceof MatchFailure, error.stack);
  return error;
}

// TEST1400: N sources gather into a single sequence arg when no injection
// exists. Three page sources feed a one-arg concat cap whose arg is a sequence
// — all three land on the same arg, in source-declaration order.
function test1400_gatherNSourcesIntoSequenceArg() {
  const sources = [1, 2, 3].map(() => media('media:enc=utf-8;page'));
  const args = [media('media:enc=utf-8')];
  const pairs = matchSourcesToArgs(sources, args, [true], null);
  assertEqual(pairs.length, 3, 'one binding per gathered source');
  for (const [arg, source] of pairs) {
    assert(arg.isEquivalent(media('media:enc=utf-8')), 'the arg');
    assert(source.isEquivalent(media('media:enc=utf-8;page')), 'the source');
  }
  // The same three with an arg that takes one value have nowhere to go.
  const failure = refusedMatch(sources, args, [false]);
  assertEqual([failure.ambiguous, failure.source], [false, 0], 'nowhere to go');
}

// TEST1401: product precedence — when a valid injection exists it wins, even
// though gathering everything into the sequence arg is also valid. s1 exactly
// fits the scalar page arg; s2 only fits the sequence arg.
function test1401_productPrecedenceOverGather() {
  const sources = [media('media:enc=utf-8;page'), media('media:enc=utf-8;summary')];
  const args = [media('media:enc=utf-8;page'), media('media:enc=utf-8')];
  const pairs = matchSourcesToArgs(sources, args, [false, true], null);
  assertEqual(pairs.length, 2, 'two pairs');
  // The page source must claim the scalar page arg (injection), NOT be
  // gathered into the sequence arg alongside the summary.
  assertEqual(pairs.map(([arg, source]) => [arg.toString(), source.toString()]).sort(), [
    [canonical('media:enc=utf-8'), canonical('media:enc=utf-8;summary')],
    [canonical('media:enc=utf-8;page'), canonical('media:enc=utf-8;page')],
  ], 'the injection');

  // Two pages, a sequence arg that takes pages and a scalar arg that takes any
  // text: each page can take either arg, at one cost — a tie. Gathering both
  // into the sequence arg would be cheaper and unique, and it is not what is
  // asked: a tied product is ambiguous, it does not become a gather.
  const pages = [media('media:enc=utf-8;page'), media('media:enc=utf-8;page')];
  const failure = refusedMatch(pages, args, [true, false]);
  assert(failure.ambiguous, 'a tie');
  assertEqual(failure.undecided, [[0, [0, 1]], [1, [0, 1]]], 'the undecided sources');
}

// TEST1402: a gather tie between two sequence args is ambiguous, not silently
// ordered.
function test1402_gatherAmbiguityAndScalarPigeonholeFailHard() {
  // Two equally-costed sequence args (each drops a different one of the
  // source's tags → the same absolute specificity gap) → every distribution
  // of the three sources ties → ambiguous.
  const chunk = media('media:chunk;enc=utf-8;page');
  const args = [media('media:enc=utf-8;page'), media('media:chunk;enc=utf-8')];
  const failure = refusedMatch([chunk, chunk, chunk], args, [true, true]);
  assert(failure.ambiguous, 'tied gather distributions must be ambiguous');
  assertEqual(failure.undecided, [[0, [0, 1]], [1, [0, 1]], [2, [0, 1]]], 'the undecided sources');
}

const URN_A = 'cap:in="media:document;ext=pdf";op-a;out="media:enc=utf-8;page"';
const URN_B = 'cap:in="media:ext=md";op-b;out="media:enc=utf-8;page"';
const URN_CONCAT = 'cap:in="media:enc=utf-8";concat;out="media:enc=utf-8;ext=txt"';

/** A wiring numbered against a nodes list, with no names and the default policy. */
const preInterned = (tokenId, capUrn, sourceNodeIds, targets) => ({
  tokenId,
  capUrn: CapUrn.fromString(capUrn),
  namedSources: [],
  sourceNodeIds,
  targets: targets.map(node => ({ node, name: null })),
  policy: new StepPolicy(),
  includedAs: [],
});

/**
 * Two producers of a page and a `concat` whose one arg takes a sequence,
 * wired `(page from a, page from b) -> concat`.
 */
function gatherFixture(firstProducesSequence) {
  const capA = stdinCap(URN_A, 'op_a', 'media:document;ext=pdf', 'media:enc=utf-8;page');
  capA.mainOutput().is_sequence = firstProducesSequence;
  const capB = stdinCap(URN_B, 'op_b', 'media:ext=md', 'media:enc=utf-8;page');
  const concat = stdinCap(URN_CONCAT, 'concat', 'media:enc=utf-8', 'media:enc=utf-8;ext=txt');
  concat.args[0].is_sequence = true;
  const definitions = definitionsOf([capA, capB, concat]);
  // nodes: 0=pdf, 1=md, 2=page(from a), 3=page(from b), 4=txt
  const nodes = [
    media('media:document;ext=pdf'),
    media('media:ext=md'),
    media('media:enc=utf-8;page'),
    media('media:enc=utf-8;page'),
    media('media:enc=utf-8;ext=txt'),
  ];
  return resolvePreInterned(nodes, [
    preInterned('tok-a', URN_A, [0], [2]),
    preInterned('tok-b', URN_B, [1], [3]),
    preInterned('tok-concat', URN_CONCAT, [2, 3], [4]),
  ], definitions, 0);
}

// TEST1403: resolvePreInterned emits N bindings on ONE sequence arg for a
// fan-in gather `(x, y) -> concat`, with isLoop false (the gathered value IS
// the sequence the arg consumes) and stable source order.
function test1403_resolveGatherEmitsNBindingsOnSequenceArg() {
  const strand = gatherFixture(false);
  const machine = new Machine([strand]);
  const edge = oneEdgeOf(machine, 'concat');
  assertEqual(edge.assignment.length, 2, 'the sequence arg gathers BOTH producers as two bindings');
  // Both bindings target the same slot.
  assert(edge.assignment[0].capArgMediaUrn.isEquivalent(edge.assignment[1].capArgMediaUrn), 'one slot');
  assertEqual(edge.assignment.map(binding => binding.argName), ['input', 'input'], 'one arg');
  // Deterministic gather order = source declaration order (node 2 then 3).
  assertEqual(edge.assignment.map(b => [b.source.isConstant, b.source.node]), [[false, 2], [false, 3]], 'gather order');
  // The gathered value IS the sequence the arg consumes — no map.
  assert(!edge.isLoop, 'gather-fed sequence arg must not loop');
  // The step keeps the identity it was given.
  assertEqual(edge.tokenId, 'tok-concat', 'the identity');
  // Anchors: two inputs (pdf, md), one output (txt).
  assertEqual(strand.inputAnchors().length, 2, 'two inputs');
  assertEqual(strand.outputAnchors().length, 1, 'one output');
  // Anchors come by the URN they hold, not by when their node was made.
  assertEqual(strand.inputAnchors().map(anchor => anchor.toString()),
    [canonical('media:document;ext=pdf'), canonical('media:ext=md')], 'inputs by URN');
  assertEqual(strand.inputAnchorIds(), [0, 1], 'their ids');
  // The gather is written as its arg's name once per member, in item order.
  // Nodes are named in the order the canonical walk meets them.
  const text = machine.toMachineNotation();
  assert(text.includes('[(input=n0) -> edge_0 -> (output=n1)][(input=n2) -> edge_1 -> (output=n3)]'), text);
  assert(text.includes('[(input=n1, input=n3) -> edge_2 -> (output=n4)]'), text);
}

// TEST1404: a sequence PRODUCER inside a gather resolves — the gather flattens
// at execution (each member contributes its item(s) in binding order). This is
// the batch-plus-single convergence shape: one leg yields a sequence, the
// other one item, and the fold consumes them all as one sequence.
function test1404_sequenceProducerInGatherFlattens() {
  const strand = gatherFixture(true);
  const edge = oneEdgeOf(new Machine([strand]), 'concat');
  assertEqual(edge.assignment.length, 2, 'both members bound to the sequence arg');
  assert(!edge.isLoop, 'the gathered value IS the sequence the arg consumes — no map');
  assert(strand.nodeIsSequence(2), 'the node op-a produces holds a sequence');
  assert(!strand.nodeIsSequence(3), 'the node op-b produces holds one value');
  // A binding source is a node or a constant, never both.
  assertEqual(BindingSource.ofNode(2).isConstant, false, 'a node');
  assert(constantsEqual(BindingSource.ofConstant([1n, 'a']).constant, [1n, 'a']), 'a constant');
  thrown(() => BindingSource.ofConstant(new Date()), 'an object that is no JSON value');
  thrown(() => BindingSource.ofConstant(NaN), 'a number no constant holds');
  thrown(() => BindingSource.ofConstant(2n ** 64n), 'a whole number no constant holds');
  thrown(() => BindingSource.ofConstant(undefined), 'nothing');
}

// ============================================================================
// Iteration: which steps of a machine run once per item, and inside which map
// (capdag/docs/09-machine-notation.md §Iteration).
// ============================================================================

const member = (node, argIsSequence) => ({ node, argIsSequence });
const shape = (members, ...outputs) => ({ members, outputs });
const single = node => ({ node, isSequence: false });
const sequence = node => ({ node, isSequence: true });
const placed = (steps, ...sequences) => iterationOf(steps, node => sequences.includes(node));

/** Whether a step runs once in `scope` and maps nothing. */
const isOnce = (placement, scope) =>
  placement.placedIn === scope && placement.map === null && placement.mapped.length === 0;

function assertOnce(placement, scope, what) {
  assert(isOnce(placement, scope),
    `${what}: expected once in ${scope}, got placed in ${placement.placedIn}, map ${placement.map}, mapped [${placement.mapped}]`);
}

/** The map a step runs in; the step must map. */
function mapOf(structure, step) {
  const placement = structure.steps()[step];
  assert(placement.maps, `step ${step} maps`);
  assert(placement.map !== SCOPE_ROOT, 'a map is never the machine itself');
  return placement.map;
}

// TEST12746: a step given single values runs once, in the machine; a step
// given a sequence on an arg that takes one value maps over it, and what it
// produces lives in that map. A sequence on an arg that takes a sequence is
// given whole and maps nothing.
function test12746_aSequenceOnAScalarArgOpensAMap() {
  // 0 -> a -> 1 ; 1 is a declared sequence ; 1 -> b -> 2 ; 1 -> count(seq arg) -> 3
  let steps = [
    shape([member(0, false)], sequence(1)),
    shape([member(1, false)], single(2)),
    shape([member(1, true)], single(3)),
  ];
  let s = placed(steps);
  assertOnce(s.steps()[0], SCOPE_ROOT, 'the producer');
  let scope = mapOf(s, 1);
  assertEqual(s.steps()[1].placedIn, SCOPE_ROOT, 'placed in the machine');
  assertEqual(s.steps()[1].mapped, [1], 'mapping the sequence');
  assertEqual(s.steps()[1].scope(), scope, 'running in the map');
  assertEqual(s.parent(scope), SCOPE_ROOT, 'the map is in the machine');
  assertEqual(s.sources(scope), [1], 'the map iterates the sequence');
  assertEqual(s.openedBy(scope), 1, 'opened by the step');
  assertEqual(s.openedBy(SCOPE_ROOT), null, 'nothing opens the machine itself');
  assertEqual(s.nodeScope(2), scope, 'what it produces lives in the map');
  assertEqual(s.nodeScope(1), SCOPE_ROOT, 'the sequence lives in the machine');
  assertOnce(s.steps()[2], SCOPE_ROOT, 'given the sequence whole');
  assertEqual(s.steps()[2].scope(), SCOPE_ROOT, 'runs in the machine');
  assert(!s.steps()[2].maps, 'maps nothing');
  assertEqual(s.scopeCount(), 2, 'two scopes');

  // The same machine with a single value where the sequence was: no map.
  steps = [
    shape([member(0, false)], single(1)),
    shape([member(1, false)], single(2)),
  ];
  s = placed(steps);
  assertOnce(s.steps()[0], SCOPE_ROOT, 'first');
  assertOnce(s.steps()[1], SCOPE_ROOT, 'second');
  assertEqual(s.scopeCount(), 1, 'no map');
  // And a run that binds the machine's input to a sequence maps the first
  // step over it, the second joining that map.
  s = placed(steps, 0);
  scope = mapOf(s, 0);
  assertEqual(s.steps()[0].mapped, [0], 'mapping the input');
  assertOnce(s.steps()[1], scope, 'joining the map');
  assertEqual(s.nodeScope(2), scope, 'in the map');
}

// TEST12747: a step given a value a map produces joins that map; a step that
// takes a sequence and is given such a value folds what the map collected, in
// the scope that encloses the map. Where a step lands does not depend on the
// order the steps are given in.
function test12747_aStepJoinsTheMapItsValueIsProducedInAndAFoldClosesIt() {
  // 0 (sequence) -> ocr -> 1 ; 1 -> summarize -> 2 ; 2 -> join(seq arg) -> 3 ; 3 -> title -> 4
  const steps = [
    shape([member(0, false)], single(1)),
    shape([member(1, false)], single(2)),
    shape([member(2, true)], single(3)),
    shape([member(3, false)], single(4)),
  ];
  const s = placed(steps, 0);
  let scope = mapOf(s, 0);
  assertOnce(s.steps()[1], scope, 'joins the map');
  assertOnce(s.steps()[2], SCOPE_ROOT, 'the fold');
  assertOnce(s.steps()[3], SCOPE_ROOT, 'after the fold');
  assertEqual(s.nodeScope(3), SCOPE_ROOT, 'the fold is in the machine');

  const reordered = [steps[3], steps[2], steps[1], steps[0]];
  const r = placed(reordered, 0);
  scope = mapOf(r, 3);
  assertOnce(r.steps()[2], scope, 'joins the map');
  assertOnce(r.steps()[1], SCOPE_ROOT, 'the fold');
  assertOnce(r.steps()[0], SCOPE_ROOT, 'after the fold');
  assertEqual(r.openedBy(scope), 3, 'opened by the mapping step');
}

// TEST12748: several sequences on args that take one value are zipped by one
// map; a single value beside them is given whole and does not move the step.
// The same node on two such args is one zipped member.
function test12748_severalMappedMembersOpenOneMap() {
  // 0, 1 sequences; 2 a single value. (1, b=0, c=2) -> compare -> 3
  const steps = [shape([member(1, false), member(0, false), member(2, false)], single(3))];
  const s = placed(steps, 0, 1);
  assertEqual(s.steps()[0].placedIn, SCOPE_ROOT, 'in the machine');
  assertEqual(s.steps()[0].mapped, [1, 0], 'in the order the step lists them');
  assertEqual(s.sources(mapOf(s, 0)), [0, 1], "a map's sources have one fixed order");
  assertEqual(s.scopeCount(), 2, 'one map');

  const twice = [shape([member(0, false), member(0, false)], single(1))];
  assertEqual(placed(twice, 0).steps()[0].mapped, [0], 'one zipped member');
}

// TEST12749: a sequence produced inside a map and bound to an arg that takes
// one value opens a map inside that map. A fold of what the inner map produces
// is placed in the outer map: one value per outer item. From the machine the
// inner value is one flat sequence.
function test12749_aMapNestsAndAFoldClosesOneLevel() {
  // 0 docs (sequence) -> split -> 1 pages (declared sequence, per doc)
  // 1 -> ocr -> 2 text ; 2 -> join(seq arg) -> 3 doc text ; 3 -> all(seq arg) -> 4
  let steps = [
    shape([member(0, false)], sequence(1)),
    shape([member(1, false)], single(2)),
    shape([member(2, true)], single(3)),
    shape([member(3, true)], single(4)),
  ];
  let s = placed(steps, 0);
  let outer = mapOf(s, 0);
  let inner = mapOf(s, 1);
  assertEqual(s.steps()[1].placedIn, outer, 'placed in the outer map');
  assertEqual(s.parent(inner), outer, 'nested');
  assertEqual(s.depth(inner), 2, 'two deep');
  assertEqual(s.depth(outer), 1, 'one deep');
  assertEqual(s.depth(SCOPE_ROOT), 0, 'the machine');
  assertOnce(s.steps()[2], outer, 'the fold of the inner map');
  assertOnce(s.steps()[3], SCOPE_ROOT, 'the fold of the outer map');
  assert(s.isSequenceFrom(2, SCOPE_ROOT), 'a sequence from the machine');
  assert(s.isSequenceFrom(2, outer), 'a sequence from the outer map');
  assert(!s.isSequenceFrom(2, inner), 'one value in the inner map');
  assert(s.encloses(outer, inner), 'outer encloses inner');
  assert(!s.encloses(inner, outer), 'inner does not enclose outer');
  assert(s.encloses(SCOPE_ROOT, inner), 'the machine encloses everything');

  // A step of the inner map that is also given the sequence the OUTER map
  // iterates takes the outer item — the doc its page came from — from inside
  // the inner map, two levels down.
  // (1, source=0) -> stamp -> 5
  steps = [...steps, shape([member(1, false), member(0, false)], single(5))];
  s = placed(steps, 0);
  outer = mapOf(s, 0);
  inner = mapOf(s, 1);
  assertEqual(s.steps()[4].placedIn, outer, 'placed in the outer map');
  assertEqual(mapOf(s, 4), inner, 'it maps over the same pages: the same inner map');
  assertEqual(s.steps()[4].mapped, [1], 'mapping the pages');
  assertEqual(s.itemMap(0, inner), outer, "the outer map's item, seen from the inner one");
  assertEqual(s.itemMap(1, inner), inner, "the inner map's item");
  assertEqual(s.itemMap(1, outer), null, 'from the outer map the pages are a sequence, given whole');
}

// TEST12750: two steps that map over the same sequence run in one map, so a
// third step given what each produced is given both for the same item — it
// joins the map and zips nothing. A step given a value of the map and the
// sequence the map iterates joins it too, taking the item.
function test12750_stepsOverOneSequenceShareAMap() {
  // 0 docs (sequence). 0 -> text -> 1 ; 0 -> meta -> 2 ; (1, meta=2) -> index -> 3
  // (1, original=0) -> compare -> 4
  let steps = [
    shape([member(0, false)], single(1)),
    shape([member(0, false)], single(2)),
    shape([member(1, false), member(2, false)], single(3)),
    shape([member(1, false), member(0, false)], single(4)),
  ];
  let s = placed(steps, 0);
  const scope = mapOf(s, 0);
  assertEqual(mapOf(s, 1), scope, 'the same map, not a second one over docs');
  assertEqual(s.openedBy(scope), 0, 'opened by the first');
  assertEqual(s.scopeCount(), 2, 'one map');
  assertOnce(s.steps()[2], scope, 'joins the map');
  assertOnce(s.steps()[3], scope, 'joins the map, taking the item');
  // Inside the map the sequence it iterates is its item; a value the map
  // produces is not an item of anything, and from the machine the sequence is
  // given whole.
  assertEqual(s.itemMap(0, scope), scope, 'the item');
  assertEqual(s.itemMap(1, scope), null, 'not an item');
  assertEqual(s.itemMap(0, SCOPE_ROOT), null, 'given whole');

  // A step joins the map whichever of its members is listed first: a value of
  // the machine beside a value of the map, in either order.
  for (const members of [[member(8, false), member(1, false)], [member(1, false), member(8, false)]]) {
    const joined = placed([...steps, shape(members, single(9))], 0);
    assertOnce(joined.steps()[4], mapOf(joined, 0), JSON.stringify(members));
  }

  // A map is opened by the first of the steps that map in it, whichever of
  // them was placed first. Step 0 maps over the docs and waits for a value
  // step 2 makes, so step 1 — which maps over the docs too — is placed before
  // it.
  // (0, with=5) -> a -> 1 ; 0 -> b -> 2 ; 7 -> c -> 5
  const waiting = [
    shape([member(0, false), member(5, false)], single(1)),
    shape([member(0, false)], single(2)),
    shape([member(7, false)], single(5)),
  ];
  const w = placed(waiting, 0);
  assertEqual(mapOf(w, 0), mapOf(w, 1), 'one map');
  assertEqual(w.openedBy(mapOf(w, 0)), 0, 'opened by the first step that maps in it');

  // A map is what it iterates IN THE SCOPE IT IS OPENED IN: the same sequence
  // mapped from two scopes is two maps.
  steps = [
    shape([member(0, false)], sequence(1)),
    shape([member(1, false)], single(2)),
    shape([member(5, false)], sequence(6)),
    shape([member(1, false), member(6, true)], single(7)),
  ];
  s = placed(steps, 0, 5);
  const perDoc = mapOf(s, 1);
  const flatMap = mapOf(s, 3);
  assertEqual(s.sources(perDoc), [1], 'over the pages');
  assertEqual(s.sources(flatMap), [1], 'over the pages');
  assertEqual(s.parent(perDoc), mapOf(s, 0), 'inside the map over docs');
  assertEqual(s.parent(flatMap), SCOPE_ROOT, 'in the machine');
  assert(perDoc !== flatMap, 'two maps');
}

// TEST12751: there is no cross product. A step given a value of a map and a
// sequence the map does not iterate is not run for every pair: it is placed
// where that sequence lives, and the map's values are collected and zipped
// with it. Values of two maps that are not nested are zipped the same way,
// where both are seen.
function test12751_anOutsideSequenceIsZippedNeverCrossed() {
  // 0 files, 5 keywords: sequences. 0 -> ocr -> 1 ; (1, k=5) -> tag -> 2
  let steps = [
    shape([member(0, false)], single(1)),
    shape([member(1, false), member(5, false)], single(2)),
  ];
  let s = placed(steps, 0, 5);
  const first = mapOf(s, 0);
  const zipped = mapOf(s, 1);
  assertEqual(s.steps()[1].placedIn, SCOPE_ROOT, 'not inside the map over files');
  assertEqual(s.steps()[1].mapped, [1, 5], 'zipping both');
  assertEqual(s.parent(zipped), SCOPE_ROOT, 'in the machine');
  assert(first !== zipped, 'two maps');

  // 0, 1 sequences. 0 -> a -> 2 ; 1 -> b -> 3 ; (2, other=3) -> compare -> 4
  steps = [
    shape([member(0, false)], single(2)),
    shape([member(1, false)], single(3)),
    shape([member(2, false), member(3, false)], single(4)),
  ];
  s = placed(steps, 0, 1);
  const a = mapOf(s, 0);
  const b = mapOf(s, 1);
  assert(a !== b, 'two maps');
  assertEqual(s.steps()[2].placedIn, SCOPE_ROOT, 'where both are seen');
  assertEqual(s.steps()[2].mapped, [2, 3], 'zipping both');
  assertEqual(s.commonScope(a, b), SCOPE_ROOT, 'the machine holds both');
  assertEqual(s.commonScope(a, a), a, 'a map holds itself');

  // Inside a nested map the same holds one level down: a page's text and a
  // sequence of the machine are zipped in the machine, not run once per page
  // per item.
  steps = [
    shape([member(0, false)], sequence(1)),
    shape([member(1, false)], single(2)),
    shape([member(2, false), member(9, false)], single(3)),
  ];
  s = placed(steps, 0, 9);
  assertEqual(s.steps()[2].placedIn, SCOPE_ROOT, 'in the machine');
  assertEqual(s.steps()[2].mapped, [2, 9], 'zipped');
}

// TEST12793: where a step lands does not depend on the order its members are
// listed in. A value of one map bound to an arg that takes one value, beside a
// sequence of an unrelated map bound to an arg that takes a sequence: neither
// map contains the other, so the step is placed where both are seen — mapping
// over the first, given the second whole — whichever is listed first.
function test12793_placementDoesNotDependOnMemberOrder() {
  for (const members of [[member(2, false), member(3, true)], [member(3, true), member(2, false)]]) {
    const steps = [
      shape([member(0, false)], single(2)),
      shape([member(1, false)], sequence(3)),
      shape(members, single(4)),
    ];
    const s = placed(steps, 0, 1);
    assertEqual(s.steps()[2].placedIn, SCOPE_ROOT, JSON.stringify(members));
    assertEqual(s.steps()[2].mapped, [2], 'mapping the value');
    const scope = mapOf(s, 2);
    assert(scope !== mapOf(s, 0), 'not the map the value was produced in');
    assertEqual(s.parent(scope), SCOPE_ROOT, 'in the machine');
  }
}

// TEST12752: steps that wait on one another cannot be placed, and the refusal
// names them.
function test12752_stepsOnACycleAreNamed() {
  const steps = [
    shape([member(0, false)], single(1)),
    shape([member(3, false)], single(2)),
    shape([member(2, false)], single(3)),
  ];
  const error = thrown(() => iterationOf(steps, () => false), 'a cycle');
  assert(error instanceof CyclicSteps, error.stack);
  assertEqual(error.steps, [1, 2], 'the steps on the cycle');
}

// ============================================================================
// Machines in step position: a header names another machine, and its steps
// are written into the machine that includes it
// (capdag/docs/09-machine-notation.md, §Machines in step position).
// ============================================================================

// Two inputs of ONE type — `series`, and `bench` — and two outputs: `cmp`, and
// `scores`, one per residual. `res` is a node inside.
const ANALYSE = '[(series, benchmark=bench, window=20) -> compare -> (cmp, residuals=res)][res -> score -> scores]';
// Two inputs of different types, in two strands, and one output.
const PUB = '[report -> publish -> ()][res -> mean -> m]';
// An input that feeds an arg a constant can be written for.
const WIN = '[(series, window=w) -> compare -> cmp]';
// A machine that includes `analyse`.
const OUTER = '[analyse machine "analyse"][(series=x, bench=y) -> analyse -> (cmp=c, scores=s)][c -> publish -> ()]';
const FETCH_TWO = '[(reference="a") -> fetch -> a][(reference="b") -> fetch -> b]';

const withHeaders = wirings => HEADERS + wirings;

/** The machines above, each under its name. */
function library() {
  const source = new MapMachineSource();
  for (const [name, wirings] of [['analyse', ANALYSE], ['pub', PUB], ['win', WIN], ['outer', OUTER]]) {
    source.insert(name, withHeaders(wirings));
  }
  return source;
}

/** A machine read against `source`, with the names its notation gave each strand's nodes. */
function parsedWith(notation, definitions, source, id) {
  const parsed = parseMachineWithAST(notation, definitions, { source, id });
  return [parsed.machine, parsed.nodeNames.map(names => Object.fromEntries(names))];
}

const including = wirings => parsedWith(withHeaders(wirings), notationDefinitions(), library(), undefined);

/** The same wirings with no machine in them, for what an inclusion must equal. */
const flat = wirings => parseMachine(withHeaders(wirings), notationDefinitions());

function refusal(wirings, code) {
  const error = thrown(() => including(wirings), wirings);
  assert(isAbstraction(error, code) || isSyntax(error, code), `${wirings}: expected ${code}, got ${error.stack}`);
  return error;
}

/** Sorted, the names of the nodes `ids` picks out of each strand. */
function namesOfNodes(machine, names, ids) {
  const picked = [];
  machine.strands().forEach((strand, index) => {
    const wanted = new Set(ids(strand));
    for (const [name, id] of Object.entries(names[index])) if (wanted.has(id)) picked.push(name);
  });
  return picked.sort();
}

const outputAnchors = strand => strand.outputAnchorIds();
const inputAnchors = strand => strand.inputAnchorIds();

// TEST12803: a machine in step position is written out as its own steps: the
// including machine is the machine one would have written by hand with those
// steps in it. Its inputs are bound by the names its notation wrote — and by
// nothing else: binding the other way round is another machine. A node inside
// it is no input or output of the whole, and each of its steps says which
// machine step it came through.
function test12803_anIncludedMachineIsItsStepsWrittenIn() {
  const [inlined, names] = including('[analyse machine "analyse"]' + FETCH_TWO +
    '[(series=a, bench=b) -> analyse -> (cmp=c, scores=s)][c -> publish -> ()]');
  const byHand = flat(FETCH_TWO +
    '[(a, benchmark=b, window=20) -> compare -> (c, residuals=r)][r -> score -> s][c -> publish -> ()]');
  assert(inlined.isEquivalent(byHand), 'the machine written by hand');
  assertEqual(allEdges(inlined).length, 5, 'five steps');

  const [swapped] = including('[analyse machine "analyse"]' + FETCH_TWO +
    '[(series=b, bench=a) -> analyse -> (cmp=c, scores=s)][c -> publish -> ()]');
  assert(!swapped.isEquivalent(byHand), 'the names say which input each source is for');

  // What the whole gives and takes is what was written in it.
  assertEqual(namesOfNodes(inlined, names, outputAnchors), ['s'], 'its outputs');
  assertEqual(namesOfNodes(inlined, names, inputAnchors), [], 'its inputs');
  // The node inside the included machine is a node of the whole, under a name
  // nothing written can bear.
  assert('analyse#1/res' in names[0], 'the node inside');
  assert(!('res' in names[0]), 'not under its own name');

  for (const step of ['compare', 'score']) {
    assertEqual(oneEdgeOf(inlined, step).includedAs, ['analyse#1'], step);
  }
  for (const edge of [...edgesOf(inlined, 'fetch'), ...edgesOf(inlined, 'publish')]) {
    assertEqual(edge.includedAs, [], 'a step the machine wrote itself');
  }

  // The graph view is told the same.
  const payload = JSON.parse(inlined.toRenderPayloadJson(titledDefinitions()));
  const cameThrough = payload.strands[0].edges.filter(edge => JSON.stringify(edge.included_as) === '["analyse#1"]');
  assertEqual(cameThrough.length, 2, 'two steps came through the machine');
}

// TEST12804: a machine used twice is written in twice. Each use has nodes of
// its own: nothing of one use is a node of the other.
function test12804_eachUseOfAMachineHasNodesOfItsOwn() {
  let [inlined, names] = including('[analyse machine "analyse"]' + FETCH_TWO +
    '[(series=a, bench=b) -> analyse -> (cmp=c1, scores=s1)][(series=b, bench=a) -> analyse -> (cmp=c2, scores=s2)]');
  assertEqual(allEdges(inlined).length, 6, 'six steps');
  const first = names[0]['analyse#1/res'];
  const second = names[0]['analyse#2/res'];
  assert(first !== second, 'two nodes');
  const through = {};
  for (const edge of allEdges(inlined)) {
    if (edge.includedAs.length === 1) through[edge.includedAs[0]] = (through[edge.includedAs[0]] || 0) + 1;
  }
  assertEqual(Object.entries(through).sort(), [['analyse#1', 2], ['analyse#2', 2]], 'two uses of two steps');
  // Each use's scoring step reads its own residuals.
  const reads = edgesOf(inlined, 'score').map(edge => {
    assert(!edge.assignment[0].source.isConstant, 'a node');
    return edge.assignment[0].source.node;
  });
  assertEqual(reads.sort(), [first, second].sort(), 'each its own residuals');
  assertEqual(namesOfNodes(inlined, names, outputAnchors), ['c1', 'c2', 's1', 's2'], 'the outputs');

  // Two headers may name one machine: reading it for the first does not make
  // the second a circle, and each alias counts its own uses.
  let aliased;
  [aliased, names] = including('[one machine "analyse"][two machine "analyse"]' + FETCH_TWO +
    '[(series=a, bench=b) -> one -> (cmp=c1, scores=s1)][(series=b, bench=a) -> two -> (cmp=c2, scores=s2)]');
  assert(aliased.isEquivalent(inlined), 'one machine under two aliases');
  assert('one#1/res' in names[0] && 'two#1/res' in names[0], 'each alias counts its own uses');
}

// TEST12805: an unnamed member of a machine step is matched to an input by
// type alone, and an unnamed target takes the one output the other targets
// leave. Where the types leave more than one answer, or a member has no type
// to be matched by, or fits nothing, the wiring is refused by name.
function test12805_unnamedMembersOfAMachineStepAreMatchedByType() {
  const produce = '[(reference="a") -> fetch -> a][a -> compare -> (c, residuals=r)]';
  const [unnamed] = including('[pub machine "pub"]' + produce + '[(c, r) -> pub -> m]');
  const [namedOnes] = including('[pub machine "pub"]' + produce + '[(res=r, report=c) -> pub -> (m=m)]');
  const byHand = flat(produce + '[c -> publish -> ()][r -> mean -> m]');
  assert(unnamed.isEquivalent(namedOnes), 'unnamed and named');
  assert(unnamed.isEquivalent(byHand), 'and by hand');

  // What one machine step makes is typed for the next: the comparison
  // `analyse` gives is matched to the input of `pub` that takes one.
  const [chained] = including('[analyse machine "analyse"][pub machine "pub"]' + FETCH_TWO +
    '[(series=a, bench=b) -> analyse -> (cmp=c, scores=s)][a -> compare -> (c0, residuals=r)][(c, r) -> pub -> m]');
  assert(chained.isEquivalent(flat(FETCH_TWO +
    '[(a, benchmark=b, window=20) -> compare -> (c, residuals=r1)][r1 -> score -> s]' +
    '[a -> compare -> (c0, residuals=r)][c -> publish -> ()][r -> mean -> m]')), 'chained');

  // `analyse` has two outputs: an unnamed target beside a named one takes the other.
  const [oneNamed] = including('[analyse machine "analyse"]' + FETCH_TWO + '[(series=a, bench=b) -> analyse -> (c, scores=s)]');
  const [bothNamed] = including('[analyse machine "analyse"]' + FETCH_TWO + '[(series=a, bench=b) -> analyse -> (cmp=c, scores=s)]');
  assert(oneNamed.isEquivalent(bothNamed), 'the output left');
  // An input a member named is said: the unnamed member beside it has the
  // other input, though both hold one type.
  const [oneUnnamed] = including('[analyse machine "analyse"]' + FETCH_TWO + '[(series=a, b) -> analyse -> (cmp=c, scores=s)]');
  assert(oneUnnamed.isEquivalent(bothNamed), 'the input left');
  const [otherUnnamed] = including('[analyse machine "analyse"]' + FETCH_TWO + '[(a, series=b) -> analyse -> (cmp=c, scores=s)]');
  assert(!otherUnnamed.isEquivalent(bothNamed), 'the other input left');

  // Two sources of the one type its two inputs hold.
  const ambiguous = refusal('[analyse machine "analyse"]' + FETCH_TWO + '[(a, b) -> analyse -> (cmp=c, scores=s)]',
    AE.AMBIGUOUS_MACHINE_MEMBERS);
  assert(ambiguous.message.includes("machine 'analyse'"), ambiguous.message);
  // Which members to name, and the inputs each could be.
  const series = canonical(SERIES);
  assertEqual(ambiguous.members, [
    new UndecidedMember('a', series, ['bench', 'series']),
    new UndecidedMember('b', series, ['bench', 'series']),
  ], 'the undecided members');
  // An input of the including machine, unnamed: nothing says what it is.
  const untyped = refusal('[analyse machine "analyse"]' + FETCH_TWO + '[(x, bench=b) -> analyse -> (cmp=c, scores=s)]',
    AE.UNTYPED_MACHINE_MEMBER);
  assert(untyped.message.includes("machine 'analyse'"), untyped.message);
  assert(untyped.message.includes('(x)'), untyped.message);
  // A comparison, where the input left takes a series.
  const unmatched = refusal('[analyse machine "analyse"]' + produce + '[(c, bench=a) -> analyse -> (cmp=c2, scores=s)]',
    AE.UNMATCHED_MACHINE_MEMBER);
  assert(unmatched.message.includes(`a member of type '${canonical(COMPARISON)}' fits no input left of machine 'analyse'`), unmatched.message);
  // The member that fits no input is the one named, wherever it stands.
  const second = refusal('[analyse machine "analyse"]' + produce + '[(a, c) -> analyse -> (cmp=c2, scores=s)]',
    AE.UNMATCHED_MACHINE_MEMBER);
  assert(second.message.includes(`a member of type '${canonical(COMPARISON)}'`), second.message);
  // Two outputs left for one unnamed target, and none left for it.
  const twoLeft = refusal('[analyse machine "analyse"]' + FETCH_TWO + '[(series=a, bench=b) -> analyse -> c]',
    AE.UNNAMED_MACHINE_TARGET);
  assert(twoLeft.message.includes('has 2 output(s) left to take (cmp, scores)'), twoLeft.message);
  const noneLeft = refusal('[analyse machine "analyse"]' + FETCH_TWO + '[(series=a, bench=b) -> analyse -> (x, cmp=c, scores=s)]',
    AE.UNNAMED_MACHINE_TARGET);
  assert(noneLeft.message.includes('has 0 output(s) left to take ()'), noneLeft.message);
}

// TEST12806: what a machine step may not be given, each refused by name: a
// name that is no input or no output of it, an input given nothing or given
// twice, an output taken twice, a source of the wrong type, and a policy.
function test12806_aMachineStepIsHeldToTheMachinesInputsAndOutputs() {
  const step = (wiring, code) =>
    refusal('[analyse machine "analyse"]' + FETCH_TWO + '[a -> compare -> made]' + wiring, code).message;
  const has = (message, part) => assert(message.includes(part), `${part} in ${message}`);

  has(step('[(serie=a, bench=b) -> analyse -> (cmp=c, scores=s)]', AE.UNKNOWN_MACHINE_INPUT),
    "machine 'analyse' has no input named 'serie' (its inputs: bench, series)");
  has(step('[(series=a, bench=b) -> analyse -> (cmp=c, score=s)]', AE.UNKNOWN_MACHINE_OUTPUT),
    "has no output named 'score' (its outputs: cmp, scores)");
  has(step('[(series=a) -> analyse -> (cmp=c, scores=s)]', AE.MACHINE_INPUT_BINDING),
    "input 'bench' of machine 'analyse' is given 0 members");
  has(step('[(series=a, series=b, bench=b) -> analyse -> (cmp=c, scores=s)]', AE.MACHINE_INPUT_BINDING),
    "input 'series' of machine 'analyse' is given 2 members");
  has(step('[(series=a, bench=b) -> analyse -> (cmp=c, cmp=d)]', AE.MACHINE_OUTPUT_TAKEN_TWICE),
    "output 'cmp' of machine 'analyse' is taken twice");
  has(step('[(series=made, bench=b) -> analyse -> (cmp=c, scores=s)]', AE.SOURCE_DOES_NOT_CONFORM_TO_MACHINE_INPUT),
    `input 'series' of machine 'analyse' holds '${canonical(SERIES)}', and its source is '${canonical(COMPARISON)}'`);
  has(step('[(series=a, bench=b) -> analyse{retry=2} -> (cmp=c, scores=s)]', AE.POLICY_ON_MACHINE),
    "'analyse' is a machine, and a policy is written on it");

  // A cap header and a machine header name steps in one space: one alias is
  // declared once, whichever kind declares it first.
  for (const headers of ['[fetch machine "analyse"]', '[twice machine "analyse"][twice machine "pub"]']) {
    assert(isSyntax(thrown(() => including(headers + FETCH_TWO), headers), SE.DUPLICATE_ALIAS), headers);
  }
  // A machine header is a declaration like any other: with no wiring after
  // it, the machine has headers and no steps.
  const noEdges = thrown(() => parsedWith('[analyse machine "analyse"]', notationDefinitions(), library(), undefined), 'no wirings');
  assert(isSyntax(noEdges, SE.NO_EDGES), noEdges.stack);
}

// TEST12807: a reference that does not resolve, a machine that is not a valid
// machine, and a circle of inclusions are each refused — a header nothing uses
// included. A circle is one failure of the whole, naming every machine on the
// way round, whichever machine the reading started from.
function test12807_aReferenceMustResolveToAValidMachineAndNeverToItself() {
  const lost = refusal('[lost machine "nowhere"][(reference="a") -> fetch -> a]', AE.UNKNOWN_MACHINE_REFERENCE);
  assert(lost.message.includes('machine header \'lost\' refers to "nowhere", which does not resolve: '), lost.message);
  assert(lost.message.includes('no machine is held under "nowhere"'), lost.message);
  // With nothing to resolve against at all, the refusal says that.
  const without = thrown(() => parseMachine(withHeaders('[lost machine "nowhere"][(reference="a") -> fetch -> a]'),
    notationDefinitions()), 'no source');
  assert(isSyntax(without, SE.MACHINE_REFERENCE_WITHOUT_SOURCE), without.stack);

  const source = library();
  source.insert('broken', withHeaders('[p -> nothing -> q]'));
  source.insert('a', withHeaders('[inner machine "b"][(reference="x") -> fetch -> s]'));
  source.insert('b', withHeaders('[back machine "a"][(reference="y") -> fetch -> t]'));
  const parseFrom = (notation, id) => {
    const error = thrown(() => parseMachine(notation, notationDefinitions(), { source, id }), notation);
    assert(error instanceof MachineAbstractionError, error.stack);
    return error;
  };

  const invalid = parseFrom(withHeaders('[bad machine "broken"][(reference="a") -> fetch -> a]'), undefined);
  assert(isAbstraction(invalid, AE.INVALID_INCLUDED_MACHINE), invalid.message);
  assert(invalid.message.includes('machine \'bad\' ("broken") is not a valid machine: '), invalid.message);
  assert(isSyntax(invalid.cause, SE.UNDEFINED_ALIAS), 'the cause');
  assert(invalid.cause.message.includes("'nothing'"), invalid.cause.message);

  const a = withHeaders('[inner machine "b"][(reference="x") -> fetch -> s]');
  let circle = parseFrom(a, 'a');
  assert(isAbstraction(circle, AE.CYCLIC_MACHINE_REFERENCE), circle.message);
  assertEqual(circle.chain, ['a', 'b', 'a'], 'the circle');
  assert(circle.message.includes('a -> b -> a'), circle.message);
  // Read as notation the source does not know: the circle is found one step
  // later, and is the same circle.
  circle = parseFrom(a, undefined);
  assert(isAbstraction(circle, AE.CYCLIC_MACHINE_REFERENCE), circle.message);
  assertEqual(circle.chain, ['b', 'a', 'b'], 'the same circle');
  // A machine that only leads to the circle is not on it.
  circle = parseFrom(withHeaders('[first machine "a"][(reference="z") -> fetch -> u]'), 'top');
  assert(isAbstraction(circle, AE.CYCLIC_MACHINE_REFERENCE), circle.message);
  assertEqual(circle.chain, ['a', 'b', 'a'], 'only the circle');
}

// TEST12808: a constant written for an input of a machine step is the value of
// every arg that input feeds inside, and is held to that arg's validation
// there.
function test12808_aConstantForAMachineInputReachesTheArgInside() {
  const fetch = '[(reference="a") -> fetch -> a]';
  const [inlined] = including('[win machine "win"]' + fetch + '[(series=a, w=30) -> win -> c]');
  assert(inlined.isEquivalent(flat(fetch + '[(a, window=30) -> compare -> c]')), 'the constant reaches the arg');
  const window = bindingNamed(oneEdgeOf(inlined, 'compare'), 'window');
  assert(window.source.isConstant, 'a constant');
  assertEqual(window.source.constant, 30n, 'a whole number');

  const refused = refusal('[win machine "win"]' + fetch + '[(series=a, w=1000) -> win -> c]', AE.CONSTANT_FAILS_VALIDATION);
  assert(refused.message.includes("arg 'window' refuses the constant 1000"), refused.message);
}

// TEST12818: a policy written on a step inside an included machine is that
// step's policy in the whole: the step is attempted again, or its failure
// tolerated, exactly as it would be where it was written.
function test12818_aStepKeepsItsPolicyWhereItIsIncluded() {
  const source = library();
  source.insert('careful', withHeaders('[(series, benchmark=bench) -> compare{retry=2, on_error=absent} -> cmp]'));
  const [inlined] = parsedWith(withHeaders('[careful machine "careful"]' + FETCH_TWO + '[(series=a, bench=b) -> careful -> c]'),
    notationDefinitions(), source, undefined);
  assert(oneEdgeOf(inlined, 'compare').policy.equals(new StepPolicy(2, ON_ERROR_ABSENT)), 'the policy');
  assert(inlined.isEquivalent(flat(FETCH_TWO + '[(a, benchmark=b) -> compare{retry=2, on_error=absent} -> c]')), 'by hand');
  for (const fetch of edgesOf(inlined, 'fetch')) assert(fetch.policy.isDefault(), 'the steps around it');
}

// TEST12809: a machine that includes a machine that includes a machine is one
// flat machine: a step says every machine step it came through, outermost
// first. An output of an included machine that nothing takes is not an output
// of the whole — the step that makes it still runs.
function test12809_inclusionNestsAndAnUntakenOutputIsNotTheWholes() {
  let [inlined, names] = including('[deep machine "outer"]' + FETCH_TWO + '[(x=a, y=b) -> deep -> (s=out)]');
  const byHand = flat(FETCH_TWO +
    '[(a, benchmark=b, window=20) -> compare -> (c, residuals=r)][r -> score -> s][c -> publish -> ()]');
  assert(inlined.isEquivalent(byHand), 'one flat machine');
  assertEqual(oneEdgeOf(inlined, 'compare').includedAs, ['deep#1', 'analyse#1'], 'outermost first');
  assertEqual(oneEdgeOf(inlined, 'publish').includedAs, ['deep#1'], 'one level');
  assertEqual(namesOfNodes(inlined, names, outputAnchors), ['out'], 'the outputs');

  let partial;
  [partial, names] = including('[analyse machine "analyse"]' + FETCH_TWO +
    '[(series=a, bench=b) -> analyse -> (cmp=c)][c -> publish -> ()]');
  assertEqual(namesOfNodes(partial, names, outputAnchors), [], 'no outputs');
  assertEqual(oneEdgeOf(partial, 'score').outputs, [], 'what it makes is taken by nothing');
  assert(partial.isEquivalent(flat(FETCH_TWO +
    '[(a, benchmark=b, window=20) -> compare -> (c, residuals=r)][r -> score -> ()][c -> publish -> ()]')), 'by hand');
}

const LOOSE = 'cap:in="media:fmt=json;list;record;time-series";loose;out="media:enc=utf-8"';
const TIGHT = 'cap:in="media:enc=utf-8;note";tight;out="media:tightened"';

/**
 * The definitions of the tests above, with a step whose output is declared
 * more loosely than the step after it asks for.
 */
const definitionsWithARefinement = () => notationDefinitions().addCaps([
  definition(LOOSE, 'loose', [stdinArg(SERIES, 'series')], [outputOf('media:enc=utf-8', 'text', 'Some text')]),
  definition(TIGHT, 'tight', [stdinArg(NOTE, 'note')], [outputOf('media:tightened', 'tightened', 'Tightened')]),
]);

// TEST12810: an included machine is what it is alone. Inside `refine`, the
// second step asks for a tighter type than the first declares, which makes the
// node between them hold the tighter type; written into another machine that
// node holds it still, and the machine resolves as it did alone.
function test12810_aNodeOfAnIncludedMachineHoldsTheTypeItHeldAlone() {
  const definitions = definitionsWithARefinement();
  const headers = HEADERS + '[loose ' + LOOSE + '][tight ' + TIGHT + ']';
  const refine = headers + '[s -> loose -> t][t -> tight -> u]';
  const alone = parseMachine(refine, definitions);
  const note = media(NOTE);
  assert(alone.strands()[0].nodes().some(held => held.isEquivalent(note)), 'the node between the steps holds the tighter type');

  const source = new MapMachineSource().insert('refine', refine);
  const [inlined, names] = parsedWith(headers + '[refine machine "refine"][(reference="a") -> fetch -> a][a -> refine -> u]',
    definitions, source, undefined);
  assert('refine#1/t' in names[0], 'the node inside');
  assert(inlined.strands()[0].nodeUrn(names[0]['refine#1/t']).isEquivalent(note), 'holds the tighter type still');
  const byHand = parseMachine(headers + '[(reference="a") -> fetch -> a][a -> loose -> t][t -> tight -> u]', definitions);
  assert(inlined.isEquivalent(byHand), 'by hand');
}

// TEST12811: machines in files. A reference is a path relative to the file
// that wrote it — not to where the reading started — and a machine is known by
// its file, however the path to it is spelled: a file that reaches itself
// through another spelling is a circle.
function test12811_fileReferencesAreRelativeToTheIncludingFile() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capdag-machine-'));
  try {
    const root = path.join(tmp, 'root');
    const lib = path.join(root, 'lib');
    fs.mkdirSync(lib, { recursive: true });
    const elsewhere = path.join(tmp, 'elsewhere');
    fs.mkdirSync(elsewhere);

    const top = path.join(root, 'top.machine');
    const topNotation = withHeaders('[deep machine "lib/outer.machine"]' + FETCH_TWO + '[(x=a, y=b) -> deep -> (s=out)]');
    fs.writeFileSync(top, topNotation, 'utf-8');
    // `outer` names `analyse` beside itself, in `lib/`.
    fs.writeFileSync(path.join(lib, 'outer.machine'), withHeaders(OUTER.replace('"analyse"', '"analyse.machine"')), 'utf-8');
    fs.writeFileSync(path.join(lib, 'analyse.machine'), withHeaders(ANALYSE), 'utf-8');

    const source = new FileMachineSource(elsewhere);
    const inlined = parseMachine(topNotation, notationDefinitions(), { source, id: fileMachineId(top) });
    assertEqual(allEdges(inlined).length, 5, 'every reference is read relative to the file that wrote it');

    // Notation from no file reads its references relative to the base.
    parseMachine(topNotation, notationDefinitions(), { source: new FileMachineSource(root) });
    const unresolved = thrown(() => parseMachine(topNotation, notationDefinitions(), { source }), 'from elsewhere');
    assert(isAbstraction(unresolved, AE.UNKNOWN_MACHINE_REFERENCE), unresolved.stack);
    assert(unresolved.message.includes('refers to "lib/outer.machine"'), unresolved.message);
    assert(unresolved.message.includes('outer.machine: '), unresolved.message);

    const itself = path.join(root, 'itself.machine');
    const itselfNotation = withHeaders('[again machine "lib/../itself.machine"][(reference="a") -> fetch -> a]');
    fs.writeFileSync(itself, itselfNotation, 'utf-8');
    const id = fileMachineId(itself);
    const circle = thrown(() => parseMachine(itselfNotation, notationDefinitions(), { source, id }), 'itself');
    assert(isAbstraction(circle, AE.CYCLIC_MACHINE_REFERENCE), circle.stack);
    assertEqual(circle.chain, [id, id], 'a file that reaches itself');

    // A file that is not there has no id.
    const absent = thrown(() => fileMachineId(path.join(root, 'absent.machine')), 'an absent file');
    assert(absent instanceof MachineSourceError, absent.stack);
    assert(!absent.noSource, 'the source is there');
    assert(absent.message.includes('absent.machine'), absent.message);
    // A machine's id is its file, however the path to it is spelled.
    assertEqual(fileMachineId(path.join(lib, '..', 'top.machine')), fileMachineId(top), 'one file, one id');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ============================================================================
// Resolution, parsing and the canonical form of plain chains.
// ============================================================================

/** A cap whose one arg is its main input, delivered under `slotUrn`, accepting `stdinUrn`. */
function simpleCap(capUrn, stdinUrn, outUrn, slotUrn = stdinUrn) {
  const cap = new Cap(CapUrn.fromString(capUrn), 'cap', ['cap']);
  cap.addArg(new CapArg(slotUrn, 'input', true, [new ArgSource({ stdin: stdinUrn })]));
  cap.addOutput(new CapOutput(outUrn, 'output', 'cap output'));
  return cap;
}

/** The matching over scalar args, with no arg that must be bound. */
const match = (sources, args) => matchSourcesToArgs(sources, args, args.map(() => false), null);
const refusedScalar = (sources, args) => refusedMatch(sources, args, args.map(() => false));

const URN_EXTRACT = 'cap:extract;in="media:document;ext=pdf";out="media:enc=utf-8;ext=txt"';
const URN_EMBED = 'cap:embed;in="media:enc=utf-8";out="media:vec;record"';

const extractEmbedDefinitions = () => definitionsOf([
  simpleCap(URN_EXTRACT, 'media:document;ext=pdf', 'media:enc=utf-8;ext=txt'),
  simpleCap(URN_EMBED, 'media:enc=utf-8', 'media:vec;record'),
]);

const EXTRACT_EMBED = `[extract ${URN_EXTRACT}][embed ${URN_EMBED}][doc -> extract -> txt][txt -> embed -> vec]`;

// TEST1188: Strand resolution fails when the strand contains no capability steps.
function test1188_resolveStrandNoCapStepsFailsHard() {
  const error = thrown(() => resolvePreInterned([], [], definitionsOf([]), 0), 'no steps');
  assert(isAbstraction(error, AE.NO_CAPABILITY_STEPS), error.stack);
}

// TEST1187: Strand resolution fails when a referenced cap is not among the definitions.
function test1187_unknownCapErrorWhenNotInRegistry() {
  const capUrn = 'cap:in="media:document;ext=pdf";extract;out="media:enc=utf-8;ext=txt"';
  const nodes = [media('media:document;ext=pdf'), media('media:enc=utf-8;ext=txt')];
  const error = thrown(() => resolvePreInterned(nodes, [preInterned('t', capUrn, [0], [1])], definitionsOf([]), 0), 'unknown cap');
  assert(isAbstraction(error, AE.UNKNOWN_CAP), error.stack);
  assert(error.message.includes('extract'), error.message);
}

// TEST6703: Source-to-arg matching: single source picks the unique arg.
function test6703_matchSourcesToArgsSingleTrivial() {
  const pairs = match([media('media:document;ext=pdf')], [media('media:document;ext=pdf')]);
  assertEqual(pairs.length, 1, 'one pair');
  assert(pairs[0][0].isEquivalent(media('media:document;ext=pdf')), 'the cap arg');
  assert(pairs[0][1].isEquivalent(media('media:document;ext=pdf')), 'the source');
}

// TEST1179: Source-to-arg matching assigns a more specific source to a compatible general argument.
function test1179_matchSourcesMoreSpecificSourceMatchesGeneralArg() {
  const pairs = match([media('media:enc=utf-8;page')], [media('media:enc=utf-8')]);
  assertEqual(pairs.length, 1, 'one pair');
  assert(pairs[0][0].isEquivalent(media('media:enc=utf-8')), 'the general arg');
  assert(pairs[0][1].isEquivalent(media('media:enc=utf-8;page')), 'the specific source');
}

// TEST1180: Matching fails when a source does not conform to any cap input argument.
function test1180_matchSourcesUnmatchedSourceFailsHard() {
  let failure = refusedScalar([media('media:numeric')], [media('media:enc=utf-8')]);
  assertEqual([failure.ambiguous, failure.source], [false, 0], 'unmatched source must fail hard');
  // It is the source that fits nothing that is named, wherever it stands.
  failure = refusedScalar([media('media:enc=utf-8;page'), media('media:numeric')],
    [media('media:enc=utf-8'), media('media:enc=utf-8;page')]);
  assertEqual([failure.ambiguous, failure.source], [false, 1], 'the second');
}

// TEST1182: Matching fails as ambiguous when two sources can be swapped at equal minimum cost.
function test1182_matchSourcesAmbiguousRaisesAmbiguousError() {
  // Both are left open, and each could go to either arg.
  let failure = refusedScalar([media('media:enc=utf-8'), media('media:enc=utf-8')],
    [media('media:enc=utf-8'), media('media:enc=utf-8')]);
  assert(failure.ambiguous, 'ambiguous matching must fail hard');
  assertEqual(failure.undecided, [[0, [0, 1]], [1, [0, 1]]], 'both open');
  // Only the sources the tie is about are named: a third that fits one arg
  // alone is decided, whatever the other two do.
  const text = media('media:enc=utf-8');
  const number = media('media:numeric');
  failure = refusedScalar([text, number, text], [text, text, number]);
  assert(failure.ambiguous, 'a tie');
  assertEqual(failure.undecided, [[0, [0, 1]], [2, [0, 1]]], 'only the two that tie');
}

// TEST1308: A wiring that forms a cycle is refused, naming the strand.
function test1308_cyclicStrandFailsHard() {
  const urnA = 'cap:in="media:document;ext=pdf";op-a;out="media:enc=utf-8;ext=txt"';
  const urnB = 'cap:in="media:enc=utf-8;ext=txt";op-b;out="media:document;ext=pdf"';
  const definitions = definitionsOf([
    simpleCap(urnA, 'media:document;ext=pdf', 'media:enc=utf-8;ext=txt'),
    simpleCap(urnB, 'media:enc=utf-8;ext=txt', 'media:document;ext=pdf'),
  ]);
  const nodes = [media('media:document;ext=pdf'), media('media:enc=utf-8;ext=txt')];
  // node 0 -> cap_a -> node 1  and  node 1 -> cap_b -> node 0 (cycle)
  const error = thrown(() => resolvePreInterned(nodes,
    [preInterned('a', urnA, [0], [1]), preInterned('b', urnB, [1], [0])], definitions, 5), 'a cycle');
  assert(isAbstraction(error, AE.CYCLIC_MACHINE_STRAND), error.stack);
  assertEqual(error.strandIndex, 5, 'the strand');
}

// TEST1171: Empty machine notation is rejected as a syntax error.
function test1171_machineParseErrorWrapsSyntaxError() {
  for (const empty of ['', '   \n\t ']) {
    const error = thrown(() => parseMachine(empty, definitionsOf([])), JSON.stringify(empty));
    assert(isSyntax(error, SE.EMPTY), error.stack);
  }
}

// TEST1165: Parsing fails hard when a referenced cap is missing from the definitions.
function test1165_parseMachineUnknownCapRaisesParseErrorWithAbstractionCause() {
  const error = thrown(() => parseMachine(`[extract ${URN_EXTRACT}]\n[doc -> extract -> text]`, definitionsOf([])), 'unknown cap');
  assert(isAbstraction(error, AE.UNKNOWN_CAP), error.stack);
}

// TEST1309: Parsing a single-cap machine notation produces one strand with one edge.
function test1309_parseMachineSingleWiringOneStrand() {
  const machine = parseMachine(`[extract ${URN_EXTRACT}]\n[doc -> extract -> text]`, extractEmbedDefinitions());
  assertEqual(machine.strandCount(), 1, 'one strand');
  assertEqual(machine.strands()[0].edges().length, 1, 'one edge');
  assert(!machine.isEmpty(), 'not empty');
}

// TEST1164: Parsing two disconnected strand definitions yields two separate machine strands.
function test1164_parseMachineDisconnectedWiringsBecomeSeparateStrands() {
  const urnCaption = 'cap:in=media:image;caption;out="media:enc=utf-8;ext=txt"';
  const definitions = definitionsOf([
    simpleCap(URN_EXTRACT, 'media:document;ext=pdf', 'media:enc=utf-8;ext=txt'),
    simpleCap(urnCaption, 'media:image', 'media:enc=utf-8;ext=txt'),
  ]);
  const machine = parseMachine(`[extract ${URN_EXTRACT}]\n[caption ${urnCaption}]\n[doc -> extract -> text1]\n[img -> caption -> text2]`, definitions);
  assertEqual(machine.strandCount(), 2, 'two strands');
  assert(machine.strands()[0].edges()[0].capUrn.toString().includes('extract'), 'in the order they first appear');
}

// TEST6698: Two caps whose wirings share a node name are folded into a single strand with two edges.
function test6698_parseMachineSharedNodeNameYieldsOneStrand() {
  const machine = parseMachine(`[extract ${URN_EXTRACT}]\n[embed ${URN_EMBED}]\n[doc -> extract -> text]\n[text -> embed -> vecs]`,
    extractEmbedDefinitions());
  assertEqual(machine.strandCount(), 1, 'one strand');
  assertEqual(machine.strands()[0].edges().length, 2, 'two edges');
}

// TEST6713: A binding's cap arg media URN is the slot identity (the arg's own
// media URN), not the type its stdin source accepts.
function test6713_bindingSlotIdentityIsOuterMediaUrn() {
  const capUrn = 'cap:in="media:document;ext=pdf";disbind;out="media:enc=utf-8;page"';
  const definitions = definitionsOf([simpleCap(capUrn, 'media:document;ext=pdf', 'media:enc=utf-8;page', 'media:enc=utf-8;file-path')]);
  const nodes = [media('media:document;ext=pdf'), media('media:enc=utf-8;page')];
  const strand = resolvePreInterned(nodes, [preInterned('t', capUrn, [0], [1])], definitions, 0);
  assertEqual(strand.edges().length, 1, 'one edge');
  const binding = strand.edges()[0].assignment[0];
  assert(binding.capArgMediaUrn.isEquivalent(media('media:enc=utf-8;file-path')), 'the slot identity');
  assert(!binding.source.isConstant, 'a node');
  assertEqual(binding.source.node, 0, 'node 0');
  assertEqual(binding.argName, 'input', "the binding carries the arg's name");
}

// TEST1310: Two strands differing only in one node's media URN are not equivalent.
function test1310_strandEquivalenceRejectsMismatchedNodeUrns() {
  const urnTxt = 'cap:in="media:document;ext=pdf";extract;out="media:enc=utf-8;ext=txt"';
  const urnMd = 'cap:in="media:document;ext=pdf";extract;out="media:enc=utf-8;ext=md"';
  const definitions = definitionsOf([
    simpleCap(urnTxt, 'media:document;ext=pdf', 'media:enc=utf-8;ext=txt'),
    simpleCap(urnMd, 'media:document;ext=pdf', 'media:enc=utf-8;ext=md'),
  ]);
  const txt = parseMachine(`[e ${urnTxt}][doc -> e -> out]`, definitions);
  const md = parseMachine(`[e ${urnMd}][doc -> e -> out]`, definitions);
  assert(!txt.strands()[0].isEquivalent(md.strands()[0]), 'another output URN');
  // The same step over nodes that differ in one URN: the steps alone do not
  // make two strands one.
  const nodes = [media('media:document;ext=pdf'), media('media:enc=utf-8;ext=txt')];
  const scanned = [media('media:document;ext=pdf;scanned'), media('media:enc=utf-8;ext=txt')];
  const plain = resolvePreInterned(nodes, [preInterned('t', urnTxt, [0], [1])], definitions, 0);
  const other = resolvePreInterned(scanned, [preInterned('t', urnTxt, [0], [1])], definitions, 0);
  assert(!plain.isEquivalent(other) && !other.isEquivalent(plain), 'one node holds another type');
  assert(plain.isEquivalent(resolvePreInterned(nodes, [preInterned('u', urnTxt, [0], [1])], definitions, 0)), 'the same strand');
  assert(txt.strands()[0].isEquivalent(parseMachine(`[x ${urnTxt}][a -> x -> b]`, definitions).strands()[0]), 'the same strand');
}

// TEST1136: parsing with an undefined cap alias is a syntax error.
function test1136_parseMachineUndefinedAliasRaisesSyntaxError() {
  const error = thrown(() => parseMachine('[doc -> undefined_alias -> text]', definitionsOf([])), 'undefined alias');
  assert(isSyntax(error, SE.UNDEFINED_ALIAS), error.stack);
}

// TEST6691: A machine with two strands serializes to notation that names both caps.
function test6691_twoStrandMachineSerializesToNotation() {
  const urnCaption = 'cap:in=media:image;caption;out="media:enc=utf-8;ext=txt"';
  const definitions = definitionsOf([
    simpleCap(URN_EXTRACT, 'media:document;ext=pdf', 'media:enc=utf-8;ext=txt'),
    simpleCap(urnCaption, 'media:image', 'media:enc=utf-8;ext=txt'),
  ]);
  const machine = parseMachine(`[extract ${URN_EXTRACT}][caption ${urnCaption}][doc -> extract -> t1][img -> caption -> t2]`, definitions);
  const notation = machine.toMachineNotation();
  assert(notation.includes('extract') && notation.includes('caption'), notation);
  // Each strand's node names are a range of their own, and the text reads back
  // as the same two strands.
  const again = parseMachine(notation, definitions);
  assertEqual(again.strandCount(), 2, 'two strands');
  assert(again.isEquivalent(machine), notation);
}

// TEST6692: A step's bindings are sorted by the arg's media URN, whatever order
// the args are declared and the sources written in.
function test6692_assignmentBindingsSortedBySlotUrn() {
  const capUrn = 'cap:in="media:document;ext=pdf";merge;out="media:enc=utf-8;ext=txt"';
  const cap = new Cap(CapUrn.fromString(capUrn), 'Merge', ['merge']);
  cap.addArg(new CapArg('media:enc=utf-8', 'text', false, [new ArgSource({ cli_flag: '--text' })]));
  cap.addArg(new CapArg('media:document;ext=pdf', 'input', true, [new ArgSource({ stdin: 'media:document;ext=pdf' })]));
  cap.addOutput(new CapOutput('media:enc=utf-8;ext=txt', 'output', 'merged output'));
  const definitions = definitionsOf([cap]);
  const nodes = [media('media:document;ext=pdf'), media('media:enc=utf-8'), media('media:enc=utf-8;ext=txt')];
  for (const sources of [[0, 1], [1, 0]]) {
    const strand = resolvePreInterned(nodes, [preInterned('t', capUrn, sources, [2])], definitions, 0);
    const slots = strand.edges()[0].assignment.map(binding => binding.capArgMediaUrn);
    assertEqual(slots.length, 2, 'two bindings');
    assert(compareMediaUrns(slots[0], slots[1]) < 0, `sorted: ${slots}`);
    assertEqual(strand.edges()[0].assignment.map(binding => binding.argName), ['input', 'text'], 'by URN, not declaration');
  }
}

// TEST1147: a syntax error's message names the step, the statement and what is wrong.
function test1147_machineSyntaxErrorDisplayIsSpecific() {
  const error = refusedSyntax('[a -> b -> c][a -> fetch{tries=1} -> d]');
  assert(isSyntax(error, SE.INVALID_POLICY), error.stack);
  assertEqual(error.message, "invalid policy on step 'fetch' in statement 1: unknown key 'tries' (a policy takes retry and on_error)", 'the message');
  assert(error.location !== null, 'where it is');
}

// TEST1149: an ambiguity says which members to name, and what each could be.
function test1149_machineParseErrorFromResolutionPreservesVariant() {
  const undecided = node => new UndecidedMember(node, 'media:enc=utf-8', ['left', 'right']);
  const URN = 'cap:in="media:document;ext=pdf";out=media:text';
  const error = new MachineAbstractionError(AE.AMBIGUOUS_MACHINE_NOTATION, '', {});
  assert(error instanceof Error, 'an error');
  const definitions = definitionsOf([definition('cap:in="media:enc=utf-8";pair;out="media:enc=utf-8;paired"', 'pair', [
    stdinArg('media:enc=utf-8', 'left'),
    flagArg('media:enc=utf-8;right', 'right').accepting('media:enc=utf-8'),
  ], [outputOf('media:enc=utf-8;paired', 'paired')])]);
  const nodes = [media('media:enc=utf-8'), media('media:enc=utf-8'), media('media:enc=utf-8;paired')];
  const ambiguous = thrown(() => resolvePreInterned(nodes,
    [preInterned('t', 'cap:in="media:enc=utf-8";pair;out="media:enc=utf-8;paired"', [0, 1], [2])], definitions, 2), 'a tie');
  assert(isAbstraction(ambiguous, AE.AMBIGUOUS_MACHINE_NOTATION), ambiguous.stack);
  assertEqual(ambiguous.strandIndex, 2, 'the strand');
  // Without notation a member is known by its type alone.
  assert(ambiguous.message.endsWith(
    "name them: a member of type 'media:enc=utf-8' could be left or right; a member of type 'media:enc=utf-8' could be left or right"),
  ambiguous.message);
  assertEqual(ambiguous.members.length, 2, 'the members are carried');
  assertEqual(undecided('a').toString(), "'a' (media:enc=utf-8) could be left or right", 'a named member');
  assertEqual(undecided('').toString(), "a member of type 'media:enc=utf-8' could be left or right", 'an unnamed member');
  assert(URN.length > 0, 'a cap URN');
}

// TEST1166: Duplicate header aliases are reported as syntax errors.
function test1166_parseDuplicateAliasIsSyntaxError() {
  const error = thrown(() => parseMachine(`[extract ${URN_EXTRACT}][extract ${URN_EMBED}][a -> extract -> b]`,
    extractEmbedDefinitions()), 'a duplicate');
  assert(isSyntax(error, SE.DUPLICATE_ALIAS), error.stack);
}

// TEST1167: Wiring that references an undefined alias is reported as a syntax error.
function test1167_parseUndefinedAliasIsSyntaxError() {
  const error = thrown(() => parseMachine(`[extract ${URN_EXTRACT}][a -> notDefined -> b]`, extractEmbedDefinitions()), 'undefined');
  assert(isSyntax(error, SE.UNDEFINED_ALIAS), error.stack);
}

// TEST1168: Parsing rejects node names that collide with declared cap aliases.
function test1168_parseNodeAliasCollisionWithHeaderAliasFailsHard() {
  const error = thrown(() => parseMachine(`[extract ${URN_EXTRACT}][extract -> extract -> b]`, extractEmbedDefinitions()), 'a collision');
  assert(isSyntax(error, SE.NODE_ALIAS_COLLISION), error.stack);
}

// TEST1169: A sequence-output cap feeding a scalar-input cap makes the
// resolved edge a per-item map (isLoop), derived from cardinality. The
// scalar->sequence producer edge itself does not loop.
function test1169_sequenceIntoScalarCapDerivesIsLoop() {
  const splitUrn = 'cap:in="media:enc=utf-8";split;out="media:enc=utf-8;item"';
  const tUrn = 'cap:in="media:enc=utf-8;item";t;out="media:enc=utf-8"';
  const splitter = simpleCap(splitUrn, 'media:enc=utf-8', 'media:enc=utf-8;item');
  splitter.mainOutput().is_sequence = true;
  const definitions = definitionsOf([splitter, simpleCap(tUrn, 'media:enc=utf-8;item', 'media:enc=utf-8')]);
  const machine = parseMachine(`[split ${splitUrn}][t ${tUrn}][a -> split -> items][items -> t -> b]`, definitions);
  assertEqual(machine.strandCount(), 1, 'one strand');
  const edges = machine.strands()[0].edges();
  assertEqual(edges.length, 2, 'two edges');
  const split = edges.find(edge => edge.capUrn.toString().includes('split'));
  const t = edges.find(edge => !edge.capUrn.toString().includes('split'));
  assert(!split.isLoop, 'a scalar source feeding the sequence-producing cap must not map');
  assert(t.isLoop, 'a sequence feeding a scalar-input cap must map per item');
}

// TEST1170: Parsing and then serializing machine notation round-trips to the canonical form.
function test1170_parseThenSerializeRoundTripsToCanonicalForm() {
  const definitions = extractEmbedDefinitions();
  const first = parseMachine(`[user_extract ${URN_EXTRACT}][user_embed ${URN_EMBED}][doc -> user_extract -> txt][txt -> user_embed -> vec]`,
    definitions);
  const text = first.toMachineNotation();
  // The canonical form does not keep the aliases a user wrote.
  assert(!text.includes('user_extract') && !text.includes('user_embed'), text);
  assert(text.includes('edge_0'), text);
  const second = parseMachine(text, definitions);
  assert(first.isEquivalent(second), 'the same machine');
  assertEqual(second.toMachineNotation(), text, 'a fixed point');
}

// TEST1172: Serializing a two-step chain emits global aliases and node names.
function test1172_serializeTwoStepStrandEmitsGlobalAliasesAndNodeNames() {
  const notation = parseMachine(EXTRACT_EMBED, extractEmbedDefinitions()).toMachineNotation();
  assert(notation.includes('[edge_0 cap:') && notation.includes('[edge_1 cap:'), notation);
  assert(notation.includes('[(input=n0) -> edge_0 -> (output=n1)]'), notation);
  assert(notation.includes('[(input=n1) -> edge_1 -> (output=n2)]'), notation);
}

// TEST1173: Serializing and reparsing a machine preserves strict machine equivalence.
function test1173_serializeThenParseRoundTripPreservesStrictEquivalence() {
  const definitions = extractEmbedDefinitions();
  const first = parseMachine(EXTRACT_EMBED, definitions);
  const notation = first.toMachineNotation();
  const second = parseMachine(notation, definitions);
  assert(first.isEquivalent(second), 'machine and its serialize-reparse must be strictly equivalent');
  assertEqual(second.toMachineNotation(), notation, 'canonical notation must be a fixed point of parse-then-serialize');
}

// TEST1174: The line-based notation format round-trips back to the same machine.
function test1174_lineBasedFormatRoundTripsToSameMachine() {
  const definitions = extractEmbedDefinitions();
  const first = parseMachine(EXTRACT_EMBED, definitions);
  const lineBased = first.toMachineNotationFormatted(NOTATION_FORMAT_LINE_BASED);
  assert(!lineBased.includes('['), `line-based form must not contain brackets, got: ${lineBased}`);
  assert(first.isEquivalent(parseMachine(lineBased, definitions)), lineBased);
}

// TEST1175: Serializing an empty machine produces an empty string.
function test1175_emptyMachineSerializesToEmptyString() {
  assertEqual(new Machine([]).toMachineNotation(), '', 'empty');
}

// TEST1176: Rendering payload JSON includes strand anchor metadata for a
// populated machine, and the title of every node and step; a title that is
// not at hand is refused, never made up from a URN.
function test1176_renderPayloadJsonIncludesStrandWithAnchors() {
  const machine = parseMachine(EXTRACT_EMBED, extractEmbedDefinitions());
  const titled = extractEmbedDefinitions().addMediaDefs([
    new MediaDef('application/pdf', null, null, 'PDF', null, 'media:document;ext=pdf'),
    new MediaDef('text/plain', null, null, 'Plain Text', null, 'media:enc=utf-8;ext=txt'),
    new MediaDef('application/json', null, null, 'Vector', null, 'media:vec;record'),
  ]);
  const payload = machine.toRenderPayloadJson(titled);
  assert(payload.startsWith('{"strands":['), payload);
  for (const part of ['"nodes":[', '"edges":[', '"input_anchor_nodes":["n0"]', '"output_anchor_nodes":["n2"]',
    '"title":"PDF"', '"title":"Plain Text"', '"title":"Vector"', '"title":"cap"', 'extract', 'embed']) {
    assert(payload.includes(part), `${part} in ${payload}`);
  }
  const untitled = thrown(() => machine.toRenderPayloadJson(extractEmbedDefinitions()), 'no media definitions');
  assert(isAbstraction(untitled, AE.UNCACHED_MEDIA_DEF), untitled.stack);
  assert(untitled.message.includes(canonical('media:document;ext=pdf')), untitled.message);
  const noCap = definitionsOf([]).addMediaDefs([
    new MediaDef('application/pdf', null, null, 'PDF', null, 'media:document;ext=pdf'),
    new MediaDef('text/plain', null, null, 'Plain Text', null, 'media:enc=utf-8;ext=txt'),
    new MediaDef('application/json', null, null, 'Vector', null, 'media:vec;record'),
  ]);
  const uncached = thrown(() => machine.toRenderPayloadJson(noCap), 'no cap definitions');
  assert(isAbstraction(uncached, AE.UNCACHED_CAP), uncached.stack);
}

// TEST1177: Rendering payload JSON for an empty machine emits an empty strands array.
function test1177_renderPayloadForEmptyMachineHasEmptyStrandsArray() {
  assertEqual(new Machine([]).toRenderPayloadJson(definitionsOf([])), '{"strands":[]}', 'empty');
}

// TEST1181: Two sources disambiguated by specificity — unique minimum-cost assignment.
function test1181_matchTwoSourcesDisambiguatedBySpecificity() {
  const sources = [media('media:ext=png;image'), media('media:enc=utf-8;model-spec')];
  const args = [media('media:ext=png;image'), media('media:enc=utf-8')];
  const pairs = match(sources, args);
  assertEqual(pairs.length, 2, 'two pairs');
  let foundImage = false;
  let foundText = false;
  for (const [arg, source] of pairs) {
    if (arg.isEquivalent(media('media:ext=png;image'))) {
      assert(source.isEquivalent(media('media:ext=png;image')), 'the image');
      foundImage = true;
    } else if (arg.isEquivalent(media('media:enc=utf-8'))) {
      assert(source.isEquivalent(media('media:enc=utf-8;model-spec')), 'the text');
      foundText = true;
    }
  }
  assert(foundImage && foundText, 'both arg slots must be assigned');

  // The pairs come by arg URN — its parts, not its text — whatever order the
  // sources stand in.
  for (const ordered of [sources, [...sources].reverse()]) {
    const byArg = match(ordered, args).map(([arg]) => arg);
    assertEqual(byArg.length, 2, 'two');
    assert(compareMediaUrns(byArg[0], byArg[1]) < 0, `${byArg}`);
  }
  const byParts = match([media('media:file-path'), media('media:file;sample')], [media('media:file-path'), media('media:file;sample')]);
  assertEqual(byParts.map(([arg]) => arg.toString()), [canonical('media:file;sample'), canonical('media:file-path')], 'by parts');

  // One source that fits two args takes the one it is closest to, whichever
  // of the two is tried first.
  const general = media('media:enc=utf-8');
  const exact = media('media:enc=utf-8;page');
  for (const either of [[general, exact], [exact, general]]) {
    const one = match([media('media:enc=utf-8;page')], either);
    assertEqual(one.length, 1, 'one pair');
    assert(one[0][0].isEquivalent(exact), `the exact arg, not the general one: ${one[0][0]}`);
  }
}

// TEST1183: Matching fails when more sources are provided than the cap has input arguments.
function test1183_matchMoreSourcesThanArgsFailsHard() {
  const pdf = media('media:document;ext=pdf');
  const args = [pdf, pdf];
  // Every source has somewhere to go and one of them must go without: the
  // first stands for it.
  let failure = refusedScalar([pdf, pdf, pdf], args);
  assertEqual([failure.ambiguous, failure.source], [false, 0], 'more sources than args must fail hard');
  // Where one of them fits nothing at all, that is the one named.
  failure = refusedScalar([pdf, media('media:numeric'), pdf], args);
  assertEqual([failure.ambiguous, failure.source], [false, 1], 'the one that fits nothing');
}

// TEST1163: Parsing one connected strand yields a single machine strand with
// both caps connected by the shared node.
function test1163_parseSingleStrandTwoCapsConnectedViaSharedNode() {
  const machine = parseMachine(EXTRACT_EMBED, extractEmbedDefinitions());
  assertEqual(machine.strandCount(), 1, 'one strand');
  const strand = machine.strands()[0];
  assertEqual(strand.edges().length, 2, 'two edges');
  assertEqual(strand.edges()[0].mainTarget(), strand.edges()[1].assignment[0].source.node, 'one shared node');
}

// TEST1178: One source is assigned to the single compatible cap argument.
function test1178_matchSingleSourcePicksUniqueArg() {
  const pairs = match([media('media:document;ext=pdf')], [media('media:document;ext=pdf')]);
  assertEqual(pairs.length, 1, 'one pair');
  assert(pairs[0][0].isEquivalent(media('media:document;ext=pdf')), 'the arg');
  assert(pairs[0][1].isEquivalent(media('media:document;ext=pdf')), 'the source');
}

// TEST1196: the aliased form writes a cap by its display alias (shortest, then
// alphabetical) in the wiring with no header, keeps the URN and a header for a
// cap with no alias, and reads back as the same machine.
function test1196_aliasedSerializationUsesAliasAndRoundTrips() {
  const extractUrn = 'cap:extract;in="media:document;ext=pdf";out="media:enc=utf-8;ext=txt"';
  const embedUrn = 'cap:embed;in="media:enc=utf-8;ext=txt";out="media:vec;record"';
  const definitions = definitionsOf([
    simpleCap(extractUrn, 'media:document;ext=pdf', 'media:enc=utf-8;ext=txt'),
    simpleCap(embedUrn, 'media:enc=utf-8;ext=txt', 'media:vec;record'),
  ]).addAlias('extract-pdf', extractUrn).addAlias('ex', extractUrn);
  const first = parseMachine(`[x ${extractUrn}][y ${embedUrn}][doc -> x -> txt][txt -> y -> vec]`, definitions);
  const aliased = first.toMachineNotationAliased(definitions);
  assert(aliased.includes('-> ex ->'), `the shortest alias: ${aliased}`);
  assert(!aliased.includes('cap:extract'), `the aliased URN does not appear: ${aliased}`);
  assert(aliased.includes('cap:embed'), `a cap with no alias keeps its URN: ${aliased}`);
  assert(first.isEquivalent(parseMachine(aliased, definitions)), 'the alias reads back as its cap');
  // A registry client that knows the same aliases names the caps the same way.
  const registry = new FabricRegistryClient('https://fabric.example', 1);
  registry.insertCachedAliasForTest(new StoredAlias('extract-pdf', CapUrn.fromString(extractUrn).toString(), 1));
  registry.insertCachedAliasForTest(new StoredAlias('ex', CapUrn.fromString(extractUrn).toString(), 1));
  assertEqual(first.toMachineNotationAliased(registry), aliased, 'one alias interface');
  const canonicalText = first.toMachineNotation();
  assert(canonicalText.includes('cap:extract') && canonicalText.includes('cap:embed'), canonicalText);
  assert(!canonicalText.includes('-> ex ->'), 'the canonical form names caps by URN');
  // An alias names one URN: a name that is not one, or that names a media URN
  // in step position, is refused.
  assert(isSyntax(thrown(() => parseMachine('[doc -> pdf -> out]', definitionsOf([]).addAlias('pdf', 'media:document;ext=pdf')), 'a media alias'),
    SE.ALIAS_NOT_A_CAP), 'a media alias in step position');
  thrown(() => definitionsOf([]).addAlias('bad', 'not a urn'), 'an alias of nothing');
}

// TEST12837: the resolver holds a wiring it is handed to the names its cap's
// definition declares, whoever built the wiring: a member or a target naming
// what the cap does not declare is refused by name, with what it does declare.
function test12837_theResolverRefusesNamesADefinitionDoesNotDeclare() {
  const capUrn = 'cap:in="media:document;ext=pdf";extract;out="media:enc=utf-8;ext=txt"';
  const definitions = definitionsOf([simpleCap(capUrn, 'media:document;ext=pdf', 'media:enc=utf-8;ext=txt')]);
  const nodes = [media('media:document;ext=pdf'), media('media:enc=utf-8;ext=txt')];
  const wiring = (named, targets) => ({ ...preInterned('t', capUrn, [], []), namedSources: named, targets });

  // By the names the definition declares, it resolves.
  const resolved = resolvePreInterned(nodes, [wiring([['input', BindingSource.ofNode(0)]], [{ node: 1, name: 'output' }])], definitions, 0);
  assertEqual(resolved.edges()[0].mainTarget(), 1, 'the main output');

  const arg = thrown(() => resolvePreInterned(nodes, [wiring([['document', BindingSource.ofNode(0)]], [{ node: 1, name: null }])], definitions, 2), 'arg');
  assert(isAbstraction(arg, AE.UNKNOWN_ARG_NAME), arg.stack);
  assert(arg.message.includes('strand 2: '), arg.message);
  assert(arg.message.includes("declares no arg named 'document' (it declares: input)"), arg.message);

  const out = thrown(() => resolvePreInterned(nodes, [wiring([['input', BindingSource.ofNode(0)]], [{ node: 1, name: 'text' }])], definitions, 2), 'output');
  assert(isAbstraction(out, AE.UNKNOWN_OUTPUT_NAME), out.stack);
  assert(out.message.includes("declares no output named 'text' (it declares: output)"), out.message);
}

// ============================================================================
// Editor support: where each part of a statement stands, and where a refusal
// points.
// ============================================================================

const EXTRACT_HEADER = '[extract cap:in="media:document;ext=pdf";extract;out="media:enc=utf-8;ext=txt"]';
const extractDefinitions = () => definitionsOf([simpleCap('cap:in="media:document;ext=pdf";extract;out="media:enc=utf-8;ext=txt"',
  'media:document;ext=pdf', 'media:enc=utf-8;ext=txt')]);

/** The text a location covers. */
const covered = (text, location) => text.slice(location.start.offset, location.end.offset);

// TEST6452: a header carries where it, its alias and its cap URN stand.
function test6452_Machine_parseMachineWithAST_headerLocation() {
  const input = EXTRACT_HEADER + '[doc -> extract -> text]';
  const result = parseMachineWithAST(input, extractDefinitions());
  assertEqual(result.statements.length, 2, 'two statements');
  const header = result.statements[0];
  assertEqual(header.kind, SYNTAX_CAP_HEADER, 'a header');
  assertEqual(covered(input, header.location), EXTRACT_HEADER, 'the statement');
  assertEqual(covered(input, header.aliasLocation), 'extract', 'the alias');
  assertEqual(covered(input, header.capUrnLocation), 'cap:in="media:document;ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'the URN');
  assertEqual(header.location.start.line, 1, 'line 1');
  assertEqual(header.location.start.column, 1, 'column 1');
}

// TEST6453: a wiring carries where its members, its step, its policy and its
// targets stand, each member and target with the name it bears.
function test6453_Machine_parseMachineWithAST_wiringLocation() {
  const input = 'doc -> extract{retry=1} -> (text, x=y)';
  const wiring = parseSyntax(input)[0].wiring;
  assertEqual(covered(input, wiring.sources[0].location), 'doc', 'the member');
  assertEqual(covered(input, wiring.stepLocation), 'extract', 'the step');
  assertEqual(covered(input, wiring.policyLocation), '{retry=1}', 'the policy');
  assertEqual(covered(input, wiring.targets[0].location), 'text', 'the main target');
  assertEqual(covered(input, wiring.targets[1].location), 'x=y', 'a named target');
  assertEqual(covered(input, wiring.targets[1].nameLocation), 'x', 'its name');
  assertEqual(covered(input, wiring.targetsLocation), '(text, x=y)', 'the targets');
}

// TEST6454: locations count lines across a multi-line text, and are where
// each part stands in the text as given: whitespace before the first
// statement moves them.
function test6454_Machine_parseMachineWithAST_multilinePositions() {
  const result = parseMachineWithAST(EXTRACT_HEADER + '\n[doc -> extract -> text]', extractDefinitions());
  assertEqual(result.statements[0].location.start.line, 1, 'the header on line 1');
  assertEqual(result.statements[1].location.start.line, 2, 'the wiring on line 2');
  assertEqual(result.statements[1].wiring.stepLocation.start.line, 2, 'its step on line 2');
  const input = '\n\n  ' + EXTRACT_HEADER + '\n[doc -> extract -> text]\n';
  const padded = parseMachineWithAST(input, extractDefinitions());
  assertEqual(padded.statements[0].location.start.line, 3, 'after two blank lines, line 3');
  assertEqual(padded.statements[0].location.start.column, 3, 'after two spaces, column 3');
  assertEqual(covered(input, padded.statements[1].wiring.stepLocation), 'extract', 'offsets in the text as given');
}

// TEST6455: each member of a group, named or not, constant or node, has a location.
function test6455_Machine_parseMachineWithAST_fanInSourceLocations() {
  const input = '(thumbnail, spec=model, window=20) -> describe -> description';
  const wiring = parseSyntax(input)[0].wiring;
  assertEqual(wiring.sources.map(member => covered(input, member.location)),
    ['thumbnail', 'spec=model', 'window=20'], 'every member');
  assertEqual(covered(input, wiring.sources[2].nameLocation), 'window', 'the name of a constant');
  assertEqual(covered(input, wiring.sourcesLocation), '(thumbnail, spec=model, window=20)', 'the group');
}

// TEST6456: the alias map holds every header's cap with where it was declared.
function test6456_Machine_parseMachineWithAST_aliasMap() {
  const input = EXTRACT_HEADER + `[embed ${URN_EMBED}][doc -> extract -> text][text -> embed -> vectors]`;
  const definitions = extractDefinitions().addCaps([simpleCap(URN_EMBED, 'media:enc=utf-8', 'media:vec;record')]);
  const result = parseMachineWithAST(input, definitions);
  assertEqual([...result.aliasMap.keys()].sort(), ['embed', 'extract'], 'both aliases');
  const extract = result.aliasMap.get('extract');
  assert(extract.capUrn.isEquivalent(CapUrn.fromString('cap:in="media:document;ext=pdf";extract;out="media:enc=utf-8;ext=txt"')), 'its cap');
  assertEqual(covered(input, extract.aliasLocation), 'extract', 'where its alias stands');
  assertEqual(covered(input, extract.capUrnLocation), 'cap:in="media:document;ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'where its URN stands');
}

// TEST6457: every node, by the name the text gave it, with the media it holds.
function test6457_Machine_parseMachineWithAST_nodeMedia() {
  const result = parseMachineWithAST(EXTRACT_HEADER + '[doc -> extract -> text]', extractDefinitions());
  assertEqual(result.nodeMedia.get('doc').toString(), canonical('media:document;ext=pdf'), 'doc');
  assertEqual(result.nodeMedia.get('text').toString(), canonical('media:enc=utf-8;ext=txt'), 'text');
  assertEqual(result.nodeMedia.size, 2, 'two nodes');
  assertEqual(result.nodeNames[0].get('doc'), result.machine.strands()[0].inputAnchorIds()[0], 'the input, by name');
}

// TEST6458: text the grammar does not accept is refused where it stops being read.
function test6458_Machine_errorLocation_parseError() {
  const error = thrown(() => parseMachine('[this is not valid', extractDefinitions()), 'not valid');
  assert(isSyntax(error, SE.PARSE_ERROR), error.stack);
  assert(error.location !== null && error.location.start.offset >= 0, 'where it stops');
}

// TEST6459: a duplicate alias is refused where the second declaration stands.
function test6459_Machine_errorLocation_duplicateAlias() {
  const input = EXTRACT_HEADER + EXTRACT_HEADER + '[doc -> extract -> text]';
  const error = thrown(() => parseMachine(input, extractDefinitions()), 'a duplicate');
  assert(isSyntax(error, SE.DUPLICATE_ALIAS), error.stack);
  assertEqual(error.location.start.offset, EXTRACT_HEADER.length + 1, 'the second alias');
}

// TEST6460: an undefined step is refused where the step stands.
function test6460_Machine_errorLocation_undefinedAlias() {
  const input = '[doc -> nonexistent -> text]';
  const error = thrown(() => parseMachine(input, extractDefinitions()), 'undefined');
  assert(isSyntax(error, SE.UNDEFINED_ALIAS), error.stack);
  assertEqual(covered(input, error.location), 'nonexistent', 'the step');
}

// ============================================================================
// Machine.toMermaid()
// ============================================================================

// TEST6462: a chain draws its data nodes, its step and the arg and output each edge is.
function test6462_Machine_toMermaid_linearChain() {
  const mermaid = parseMachine(EXTRACT_HEADER + '[doc -> extract -> text]', extractDefinitions()).toMermaid();
  assert(mermaid.startsWith('flowchart LR'), mermaid);
  assert(mermaid.includes('s0["edge_0"]'), mermaid);
  assert(mermaid.includes(`n0(["n0: ${canonical('media:document;ext=pdf')}"])`), mermaid);
  assert(mermaid.includes(`n1(["n1: ${canonical('media:enc=utf-8;ext=txt')}"])`), mermaid);
  assert(mermaid.includes('n0 -- "input" --> s0'), mermaid);
  assert(mermaid.includes('s0 -- "output" --> n1'), mermaid);
}

// TEST6463: the edges of a step that runs once per item are dotted, and no
// LOOP text is drawn.
function test6463_Machine_toMermaid_loopEdge() {
  const mermaid = machineOf('[path -> compare -> (residuals=res)][res -> score -> s]').toMermaid();
  assert(!mermaid.includes('LOOP'), mermaid);
  assert(mermaid.includes('-. "row" .-> s1'), mermaid);
  assert(mermaid.includes('s1 -. "score" .-> n'), mermaid);
  assert(mermaid.includes('-- "series" --> s0'), 'the step that maps nothing is solid');
}

// TEST6464: an empty machine says so.
function test6464_Machine_toMermaid_emptyGraph() {
  assert(new Machine([]).toMermaid().includes('empty machine'), 'empty');
}

// TEST6465: a step given several members draws one edge per binding, a
// constant as a box of its own, and its policy on the step.
function test6465_Machine_toMermaid_fanIn() {
  const mermaid = machineOf('[(path, benchmark=bench, label="max") -> compare{retry=2} -> r]').toMermaid();
  assertEqual((mermaid.match(/--> s0/g) || []).length, 3, `three bindings: ${mermaid}`);
  assert(mermaid.includes('k0[/"\\"max\\""/]') || mermaid.includes('k0[/"#quot;max#quot;"/]'), mermaid);
  assert(mermaid.includes('s0["edge_0{retry=2}"]'), mermaid);
}

// TEST6466: one input feeding two steps, and one step giving two outputs.
function test6466_Machine_toMermaid_fanOut() {
  const mermaid = machineOf('[path -> compare -> (result, residuals=res)][path -> compare -> (note=n)]').toMermaid();
  assertEqual((mermaid.match(/ -- "series" --> /g) || []).length, 2, `one input, two steps: ${mermaid}`);
  assert(mermaid.includes('-- "comparison" -->') && mermaid.includes('-- "residuals" -->'), mermaid);
}

// ============================================================================
// Run
// ============================================================================

function runTests() {
  console.log('Machine notation tests\n');
  runTest('TEST12732: the_forms_of_a_wiring', test12732_theFormsOfAWiring);
  runTest('TEST12734: cap_headers_and_machine_headers', test12734_capHeadersAndMachineHeaders);
  runTest('TEST12735: a_step_policy', test12735_aStepPolicy);
  runTest('TEST12736: what_the_text_alone_refuses', test12736_whatTheTextAloneRefuses);
  runTest('TEST12832: a_constant_has_one_text', test12832_aConstantHasOneText);
  runTest('TEST12737: a_named_member_binds_the_arg_it_names', test12737_aNamedMemberBindsTheArgItNames);
  runTest('TEST12738: a_constant_is_bound_and_validated', test12738_aConstantIsBoundAndValidated);
  runTest('TEST12739: outputs_sources_and_sinks', test12739_outputsSourcesAndSinks);
  runTest('TEST12740: the_urn_of_a_node_is_position_free', test12740_theUrnOfANodeIsPositionFree);
  runTest('TEST12741: canonical_notation_round_trips', test12741_canonicalNotationRoundTrips);
  runTest('TEST12742: a_machine_reference_needs_a_source', test12742_aMachineReferenceNeedsASource);
  runTest('TEST12743: render_payload_carries_names_constants_and_outputs', test12743_renderPayloadCarriesNamesConstantsAndOutputs);
  runTest('TEST12867: render_payload_marks_the_main_input_and_output', test12867_renderPayloadMarksTheMainInputAndOutput);
  runTest('TEST12833: a_carried_output_holds_the_inputs_type', test12833_aCarriedOutputHoldsTheInputsType);
  runTest('TEST12834: a_node_stands_for_one_node', test12834_aNodeStandsForOneNode);
  runTest('TEST12838: urns_are_ordered_by_their_parts_not_their_text', test12838_urnsAreOrderedByTheirPartsNotTheirText);

  runTest('TEST1400: gather_n_sources_into_sequence_arg', test1400_gatherNSourcesIntoSequenceArg);
  runTest('TEST1401: product_precedence_over_gather', test1401_productPrecedenceOverGather);
  runTest('TEST1402: gather_ambiguity_and_scalar_pigeonhole_fail_hard', test1402_gatherAmbiguityAndScalarPigeonholeFailHard);
  runTest('TEST1403: resolve_gather_emits_n_bindings_on_sequence_arg', test1403_resolveGatherEmitsNBindingsOnSequenceArg);
  runTest('TEST1404: sequence_producer_in_gather_flattens', test1404_sequenceProducerInGatherFlattens);
  runTest('TEST12746: a_sequence_on_a_scalar_arg_opens_a_map', test12746_aSequenceOnAScalarArgOpensAMap);
  runTest('TEST12747: a_step_joins_the_map_its_value_is_produced_in_and_a_fold_closes_it', test12747_aStepJoinsTheMapItsValueIsProducedInAndAFoldClosesIt);
  runTest('TEST12748: several_mapped_members_open_one_map', test12748_severalMappedMembersOpenOneMap);
  runTest('TEST12749: a_map_nests_and_a_fold_closes_one_level', test12749_aMapNestsAndAFoldClosesOneLevel);
  runTest('TEST12750: steps_over_one_sequence_share_a_map', test12750_stepsOverOneSequenceShareAMap);
  runTest('TEST12751: an_outside_sequence_is_zipped_never_crossed', test12751_anOutsideSequenceIsZippedNeverCrossed);
  runTest('TEST12793: placement_does_not_depend_on_member_order', test12793_placementDoesNotDependOnMemberOrder);
  runTest('TEST12752: steps_on_a_cycle_are_named', test12752_stepsOnACycleAreNamed);
  runTest('TEST12803: an_included_machine_is_its_steps_written_in', test12803_anIncludedMachineIsItsStepsWrittenIn);
  runTest('TEST12804: each_use_of_a_machine_has_nodes_of_its_own', test12804_eachUseOfAMachineHasNodesOfItsOwn);
  runTest('TEST12805: unnamed_members_of_a_machine_step_are_matched_by_type', test12805_unnamedMembersOfAMachineStepAreMatchedByType);
  runTest('TEST12806: a_machine_step_is_held_to_the_machines_inputs_and_outputs', test12806_aMachineStepIsHeldToTheMachinesInputsAndOutputs);
  runTest('TEST12807: a_reference_must_resolve_to_a_valid_machine_and_never_to_itself', test12807_aReferenceMustResolveToAValidMachineAndNeverToItself);
  runTest('TEST12808: a_constant_for_a_machine_input_reaches_the_arg_inside', test12808_aConstantForAMachineInputReachesTheArgInside);
  runTest('TEST12818: a_step_keeps_its_policy_where_it_is_included', test12818_aStepKeepsItsPolicyWhereItIsIncluded);
  runTest('TEST12809: inclusion_nests_and_an_untaken_output_is_not_the_wholes', test12809_inclusionNestsAndAnUntakenOutputIsNotTheWholes);
  runTest('TEST12810: a_node_of_an_included_machine_holds_the_type_it_held_alone', test12810_aNodeOfAnIncludedMachineHoldsTheTypeItHeldAlone);
  runTest('TEST12811: file_references_are_relative_to_the_including_file', test12811_fileReferencesAreRelativeToTheIncludingFile);
  runTest('TEST1188: resolve_strand_no_cap_steps_fails_hard', test1188_resolveStrandNoCapStepsFailsHard);
  runTest('TEST1187: unknown_cap_error_when_not_in_registry', test1187_unknownCapErrorWhenNotInRegistry);
  runTest('TEST6703: match_sources_to_args_single_trivial', test6703_matchSourcesToArgsSingleTrivial);
  runTest('TEST1179: match_sources_more_specific_source_matches_general_arg', test1179_matchSourcesMoreSpecificSourceMatchesGeneralArg);
  runTest('TEST1180: match_sources_unmatched_source_fails_hard', test1180_matchSourcesUnmatchedSourceFailsHard);
  runTest('TEST1182: match_sources_ambiguous_raises_ambiguous_error', test1182_matchSourcesAmbiguousRaisesAmbiguousError);
  runTest('TEST1308: cyclic_strand_fails_hard', test1308_cyclicStrandFailsHard);
  runTest('TEST1171: machine_parse_error_wraps_syntax_error', test1171_machineParseErrorWrapsSyntaxError);
  runTest('TEST1165: parse_machine_unknown_cap_raises_parse_error_with_abstraction_cause', test1165_parseMachineUnknownCapRaisesParseErrorWithAbstractionCause);
  runTest('TEST1309: parse_machine_single_wiring_one_strand', test1309_parseMachineSingleWiringOneStrand);
  runTest('TEST1164: parse_machine_disconnected_wirings_become_separate_strands', test1164_parseMachineDisconnectedWiringsBecomeSeparateStrands);
  runTest('TEST6698: parse_machine_shared_node_name_yields_one_strand', test6698_parseMachineSharedNodeNameYieldsOneStrand);
  runTest('TEST6713: binding_slot_identity_is_outer_media_urn', test6713_bindingSlotIdentityIsOuterMediaUrn);
  runTest('TEST1310: strand_equivalence_rejects_mismatched_node_urns', test1310_strandEquivalenceRejectsMismatchedNodeUrns);
  runTest('TEST1136: parse_machine_undefined_alias_raises_syntax_error', test1136_parseMachineUndefinedAliasRaisesSyntaxError);
  runTest('TEST6691: two_strand_machine_serializes_to_notation', test6691_twoStrandMachineSerializesToNotation);
  runTest('TEST6692: assignment_bindings_sorted_by_slot_urn', test6692_assignmentBindingsSortedBySlotUrn);
  runTest('TEST1147: machine_syntax_error_display_is_specific', test1147_machineSyntaxErrorDisplayIsSpecific);
  runTest('TEST1149: machine_parse_error_from_resolution_preserves_variant', test1149_machineParseErrorFromResolutionPreservesVariant);
  runTest('TEST1166: parse_duplicate_alias_is_syntax_error', test1166_parseDuplicateAliasIsSyntaxError);
  runTest('TEST1167: parse_undefined_alias_is_syntax_error', test1167_parseUndefinedAliasIsSyntaxError);
  runTest('TEST1168: parse_node_alias_collision_with_header_alias_fails_hard', test1168_parseNodeAliasCollisionWithHeaderAliasFailsHard);
  runTest('TEST1169: sequence_into_scalar_cap_derives_is_loop', test1169_sequenceIntoScalarCapDerivesIsLoop);
  runTest('TEST1170: parse_then_serialize_round_trips_to_canonical_form', test1170_parseThenSerializeRoundTripsToCanonicalForm);
  runTest('TEST1172: serialize_two_step_strand_emits_global_aliases_and_node_names', test1172_serializeTwoStepStrandEmitsGlobalAliasesAndNodeNames);
  runTest('TEST1173: serialize_then_parse_round_trip_preserves_strict_equivalence', test1173_serializeThenParseRoundTripPreservesStrictEquivalence);
  runTest('TEST1174: line_based_format_round_trips_to_same_machine', test1174_lineBasedFormatRoundTripsToSameMachine);
  runTest('TEST1175: empty_machine_serializes_to_empty_string', test1175_emptyMachineSerializesToEmptyString);
  runTest('TEST1176: render_payload_json_includes_strand_with_anchors', test1176_renderPayloadJsonIncludesStrandWithAnchors);
  runTest('TEST1177: render_payload_for_empty_machine_has_empty_strands_array', test1177_renderPayloadForEmptyMachineHasEmptyStrandsArray);
  runTest('TEST1181: match_two_sources_disambiguated_by_specificity', test1181_matchTwoSourcesDisambiguatedBySpecificity);
  runTest('TEST1183: match_more_sources_than_args_fails_hard', test1183_matchMoreSourcesThanArgsFailsHard);
  runTest('TEST1163: parse_single_strand_two_caps_connected_via_shared_node', test1163_parseSingleStrandTwoCapsConnectedViaSharedNode);
  runTest('TEST1178: match_single_source_picks_unique_arg', test1178_matchSingleSourcePicksUniqueArg);
  runTest('TEST1196: aliased_serialization_uses_alias_and_round_trips', test1196_aliasedSerializationUsesAliasAndRoundTrips);
  runTest('TEST12837: the_resolver_refuses_names_a_definition_does_not_declare', test12837_theResolverRefusesNamesADefinitionDoesNotDeclare);
  runTest('TEST6452: machine_parse_machine_with_a_s_t_header_location', test6452_Machine_parseMachineWithAST_headerLocation);
  runTest('TEST6453: machine_parse_machine_with_a_s_t_wiring_location', test6453_Machine_parseMachineWithAST_wiringLocation);
  runTest('TEST6454: machine_parse_machine_with_a_s_t_multiline_positions', test6454_Machine_parseMachineWithAST_multilinePositions);
  runTest('TEST6455: machine_parse_machine_with_a_s_t_fan_in_source_locations', test6455_Machine_parseMachineWithAST_fanInSourceLocations);
  runTest('TEST6456: machine_parse_machine_with_a_s_t_alias_map', test6456_Machine_parseMachineWithAST_aliasMap);
  runTest('TEST6457: machine_parse_machine_with_a_s_t_node_media', test6457_Machine_parseMachineWithAST_nodeMedia);
  runTest('TEST6458: machine_error_location_parse_error', test6458_Machine_errorLocation_parseError);
  runTest('TEST6459: machine_error_location_duplicate_alias', test6459_Machine_errorLocation_duplicateAlias);
  runTest('TEST6460: machine_error_location_undefined_alias', test6460_Machine_errorLocation_undefinedAlias);
  runTest('TEST6462: machine_to_mermaid_linear_chain', test6462_Machine_toMermaid_linearChain);
  runTest('TEST6463: machine_to_mermaid_loop_edge', test6463_Machine_toMermaid_loopEdge);
  runTest('TEST6464: machine_to_mermaid_empty_graph', test6464_Machine_toMermaid_emptyGraph);
  runTest('TEST6465: machine_to_mermaid_fan_in', test6465_Machine_toMermaid_fanIn);
  runTest('TEST6466: machine_to_mermaid_fan_out', test6466_Machine_toMermaid_fanOut);
  console.log(`\n${passCount + failCount} tests: ${passCount} passed, ${failCount} failed`);
  if (failCount > 0) process.exit(1);
}

runTests();
