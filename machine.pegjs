// Machine notation grammar for Peggy.
//
// This grammar reads the same language as the reference's pest grammar
// (capdag-rs/src/machine/machine.pest). Every part of a statement carries
// where it stands in the text, for editor support.
//
// Two equally valid statement forms:
//
// Bracketed (one or more statements per line, any layout):
//   [extract cap:in="media:document;ext=pdf";extract;out="media:enc=utf-8;ext=txt"]
//   [doc -> extract -> text]
//
// Line-based (one statement per line, no brackets):
//   extract cap:in="media:document;ext=pdf";extract;out="media:enc=utf-8;ext=txt"
//   doc -> extract -> text
//   (thumbnail, model_spec) -> describe -> description
//
// Both forms can be freely mixed in the same program.
//
// A wiring is one invocation: what it is given, the step, what is taken.
//   (path, benchmark=bench) -> compare -> result            a named member
//   (prices, window=20, statistic="mean") -> rolling -> s   constants: any JSON value
//   () -> now -> stamp                                      a source given nothing
//   report -> publish -> ()                                 a sink
//   obs -> regress -> (fit, residuals=res)                  several outputs
//   ref -> fetch{retry=3} -> series                         a step policy

program = _ stmts:stmt* _ { return stmts; }

// A bracketed statement stands where its brackets do.
stmt = b:bracketed _ { return b; }
     / inner:inner _ { return inner; }

bracketed = "[" _ inner:inner _ "]" { return { ...inner, location: location() }; }

// A wiring is tried first: it is the only form with an arrow, and its first
// token may be a group. The two headers both start with an alias and are told
// apart by what follows it.
inner = wiring / machine_header / header

// Header: alias followed by a cap URN starting with "cap:".
header = a:alias_loc __ c:cap_urn_loc {
  return { type: 'header', alias: a.value, capUrn: c.value, location: location(), aliasLocation: a.location, capUrnLocation: c.location };
}

// Machine header: an alias for another machine, usable in step position. The
// reference is an opaque string the host resolves; it is kept as written
// (`referenceText`), and read as the JSON string it is by the syntax layer.
machine_header = a:alias_loc __ machine_kw _ r:string_loc {
  return { type: 'machine_header', alias: a.value, referenceText: r.value, location: location(), aliasLocation: a.location, referenceLocation: r.location };
}

machine_kw = "machine" !alias_continue

// Wiring: sources -> step -> targets
//
// There is no per-item marker and no gather marker: both are derived from
// cardinality, never authored syntax.
wiring = s:sources _ a1:arrow_loc _ c:step _ a2:arrow_loc _ t:targets {
  return {
    type: 'wiring',
    sources: s.members,
    sourcesLocation: s.location,
    step: c.alias.value,
    stepLocation: c.alias.location,
    policy: c.policy,
    policyLocation: c.policyLocation,
    arrowLocations: [a1, a2],
    targets: t.targets,
    targetsLocation: t.location,
    location: location(),
  };
}

sources = g:source_group { return g; }
        / a:alias_loc { return { members: [{ name: null, nameLocation: null, node: a.value, location: a.location, valueLocation: a.location }], location: a.location }; }

source_group = "(" _ ms:(first:member rest:(_ "," _ m:member { return m; })* { return [first, ...rest]; })? _ ")" {
  return { members: ms || [], location: location() };
}

// A member names an arg, or does not. Named is tried first: it is the longer
// form, and an unnamed member is exactly a node alias. A member stands where
// all of it does; its name and its value each where they do.
member = named_member
       / c:constant_loc { return { name: null, nameLocation: null, constantText: c.value, location: c.location, valueLocation: c.location }; }
       / a:alias_loc { return { name: null, nameLocation: null, node: a.value, location: a.location, valueLocation: a.location }; }

named_member = n:alias_loc _ "=" _ v:(c:constant_loc { return { constantText: c.value, valueLocation: c.location }; }
                                    / a:alias_loc { return { node: a.value, valueLocation: a.location }; }) {
  return { name: n.value, nameLocation: n.location, ...v, location: location() };
}

// A step is a header alias or a registered cap alias, with an optional policy.
step = a:alias_loc _ p:policy_loc? {
  return { alias: a, policy: p ? p.entries : [], policyLocation: p ? p.location : null };
}

policy_loc = "{" _ es:(first:policy_entry rest:(_ "," _ e:policy_entry { return e; })* { return [first, ...rest]; })? _ "}" {
  return { entries: es || [], location: location() };
}

policy_entry = k:alias_loc _ "=" _ v:policy_value {
  return { key: k.value, keyLocation: k.location, value: v.value, isNumber: v.isNumber, valueLocation: v.location };
}

policy_value = n:$number { return { value: n, isNumber: true, location: location() }; }
             / a:alias { return { value: a, isNumber: false, location: location() }; }

targets = g:target_group { return g; }
        / a:alias_loc { return { targets: [{ name: null, nameLocation: null, node: a.value, location: a.location, valueLocation: a.location }], location: a.location }; }

target_group = "(" _ ts:(first:target rest:(_ "," _ t:target { return t; })* { return [first, ...rest]; })? _ ")" {
  return { targets: ts || [], location: location() };
}

// A target stands where all of it does; its name and its node each where they do.
target = n:alias_loc _ "=" _ a:alias_loc { return { name: n.value, nameLocation: n.location, node: a.value, location: location(), valueLocation: a.location }; }
       / a:alias_loc { return { name: null, nameLocation: null, node: a.value, location: a.location, valueLocation: a.location }; }

arrow_loc = "-"+ ">" { return location(); }

// Alias with location tracking
alias_loc = a:alias { return { value: a, location: location() }; }

// Alias: starts with alpha or underscore, continues with alphanumeric, underscore, or hyphen.
// This is atomic — no whitespace skipping inside.
alias = $( [a-zA-Z_] alias_continue* )
alias_continue = [a-zA-Z0-9_-]

// A constant is a JSON value. `true`, `false` and `null` are constants, never
// node names; a bare word that is none of them is an alias. The text is kept
// as written; the syntax layer reads it as the value it writes.
constant_loc = c:$constant { return { value: c, location: location() }; }
constant = object / array / string / number / boolean / null
boolean = ("true" / "false") !alias_continue
null = "null" !alias_continue
object = "{" _ (pair (_ "," _ pair)*)? _ "}"
pair = string _ ":" _ constant
array = "[" _ (constant (_ "," _ constant)*)? _ "]"
number = "-"? ("0" / [1-9] [0-9]*) ("." [0-9]+)? ([eE] [+-]? [0-9]+)? !alias_continue

// A JSON string: any character but an unescaped quote, backslash or control
// character, with JSON's escapes.
string_loc = s:$string { return { value: s, location: location() }; }
string = '"' string_char* '"'
string_char = [^"\\\u0000-\u001F]
            / "\\" ["\\/bfnrt]
            / "\\u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]

// Cap URN with location tracking
cap_urn_loc = c:cap_urn { return { value: c, location: location() }; }

// Cap URN: starts with "cap:", reads until a statement terminator:
// "]" for bracketed mode, or newline for line-based mode.
// Quoted strings can contain "]" and newlines.
cap_urn = $( "cap:" cap_urn_body* )

cap_urn_body = quoted_value / ( !"]" !NL . )

NL "newline" = "\r\n" / "\n" / "\r"

// Quoted strings support escaped quotes.
quoted_value = '"' ( '\\"' / '\\\\' / (!'"' .) )* '"'

// Whitespace rules
_ "optional whitespace" = [ \t\r\n]*
__ "required whitespace" = [ \t\r\n]+
