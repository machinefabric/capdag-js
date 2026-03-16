// Bracket-delimited route notation grammar for Peggy.
//
// This grammar mirrors the Rust pest grammar in route.pest exactly.
//
// Examples:
//   [extract cap:in="media:pdf";op=extract;out="media:txt;textable"]
//   [doc -> extract -> text]
//   [(thumbnail, model_spec) -> describe -> description]
//   [pages -> LOOP p2t -> texts]

program = _ stmts:stmt* _ { return stmts; }

stmt = "[" _ inner:inner _ "]" _ { return inner; }

inner = wiring / header

// Header: alias followed by a cap URN starting with "cap:".
header = a:alias __ c:cap_urn {
  return { type: 'header', alias: a, capUrn: c };
}

// Wiring: source -> loop_cap -> target
wiring = s:source _ arrow _ lc:loop_cap _ arrow _ t:alias {
  return { type: 'wiring', sources: s, capAlias: lc.alias, isLoop: lc.isLoop, target: t };
}

source = group / single_alias

single_alias = a:alias { return [a]; }

group = "(" _ first:alias rest:("," _ a:alias { return a; })+ _ ")" {
  return [first, ...rest];
}

loop_cap = "LOOP" __ a:alias { return { alias: a, isLoop: true }; }
         / a:alias { return { alias: a, isLoop: false }; }

arrow = "-"+ ">"

// Alias: starts with alpha or underscore, continues with alphanumeric, underscore, or hyphen.
// This is atomic — no whitespace skipping inside.
alias = $( [a-zA-Z_] [a-zA-Z0-9_-]* )

// Cap URN: starts with "cap:", reads until the statement-closing "]",
// except quoted strings can contain "]".
cap_urn = $( "cap:" cap_urn_body* )

cap_urn_body = quoted_value / ( !"]" . )

// Quoted strings support escaped quotes.
quoted_value = '"' ( '\\"' / '\\\\' / (!'"' .) )* '"'

// Whitespace rules
_ "optional whitespace" = [ \t\r\n]*
__ "required whitespace" = [ \t\r\n]+
