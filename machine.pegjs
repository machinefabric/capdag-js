// Machine notation grammar for Peggy.
//
// This grammar mirrors the Rust pest grammar in machine.pest exactly.
// All actions return location() for LSP position tracking.
//
// Two equally valid statement forms:
//
// Bracketed (one or more statements per line, any layout):
//   [extract cap:in="media:pdf";op=extract;out="media:txt;textable"]
//   [doc -> extract -> text]
//
// Line-based (one statement per line, no brackets):
//   extract cap:in="media:pdf";op=extract;out="media:txt;textable"
//   doc -> extract -> text
//   (thumbnail, model_spec) -> describe -> description
//   pages -> LOOP p2t -> texts
//
// Both forms can be freely mixed in the same program.

program = _ stmts:stmt* _ { return stmts; }

stmt = "[" _ inner:inner _ "]" _ { return inner; }
     / inner:inner _ { return inner; }

inner = wiring / header

// Header: alias followed by a cap URN starting with "cap:".
header = a:alias_loc __ c:cap_urn_loc {
  return { type: 'header', alias: a.value, capUrn: c.value, location: location(), aliasLocation: a.location, capUrnLocation: c.location };
}

// Wiring: source -> loop_cap -> target
wiring = s:source_loc _ arrow _ lc:loop_cap_loc _ arrow _ t:alias_loc {
  return { type: 'wiring', sources: s.values, capAlias: lc.alias, isLoop: lc.isLoop, target: t.value, location: location(), sourceLocations: s.locations, capAliasLocation: lc.location, targetLocation: t.location };
}

source_loc = group_loc / single_alias_loc

single_alias_loc = a:alias_loc { return { values: [a.value], locations: [a.location] }; }

group_loc = "(" _ first:alias_loc rest:("," _ a:alias_loc { return a; })+ _ ")" {
  return { values: [first.value, ...rest.map(r => r.value)], locations: [first.location, ...rest.map(r => r.location)] };
}

loop_cap_loc = "LOOP" __ a:alias_loc { return { alias: a.value, isLoop: true, location: a.location }; }
            / a:alias_loc { return { alias: a.value, isLoop: false, location: a.location }; }

arrow = "-"+ ">"

// Alias with location tracking
alias_loc = a:alias { return { value: a, location: location() }; }

// Alias: starts with alpha or underscore, continues with alphanumeric, underscore, or hyphen.
// This is atomic — no whitespace skipping inside.
alias = $( [a-zA-Z_] [a-zA-Z0-9_-]* )

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
