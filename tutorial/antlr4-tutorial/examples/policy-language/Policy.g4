grammar Policy;

// 语法规则
policy : audience_section? declaration_section? state_section ;

audience_section : 'for' audience (',' audience)* ;

audience : 'public' | ID | STRING ;

declaration_section : declaration* ;

declaration : service_state_declaration | expression_declaration ;

service_state_declaration : 'always' ID ;

expression_declaration : ID '(' ID (',' ID)* ')' '=' expression ;

expression : term (('+'|'-') term)* ;

term : factor (('*'|'/') factor)* ;

factor : NUMBER | ID | '(' expression ')' | ID '(' expression (',' expression)* ')' ;

state_section : state_definition+ ;

state_definition : state_name service_states? ':' transition* ;

state_name : ID | 'initial' ;

service_states : '[' ID (',' ID)* ']' ;

transition : event '=>' state_name | 'terminate' ;

event : '~' service '.' event_name '(' event_args? ')' ;

service : ID ('.' ID)* ;

event_name : ID ;

event_args : event_arg (',' event_arg)* ;

event_arg : STRING | NUMBER | ID ;

// 词法规则
ID : [a-zA-Z_][a-zA-Z0-9_]* ;

STRING : '"' ~["]* '"' | '\'' ~[']* '\'' ;

NUMBER : [0-9]+ ('.' [0-9]+)? ;

WS : [ \t\r\n]+ -> skip ;

LINE_COMMENT : '//' ~[\r\n]* -> skip ;
