grammar JSON;

// 语法规则
json : value EOF ;

value : object
      | array
      | STRING
      | NUMBER
      | 'true'
      | 'false'
      | 'null'
      ;

object : '{' pair (',' pair)* '}'
       | '{' '}'
       ;

pair : STRING ':' value ;

array : '[' value (',' value)* ']'
      | '[' ']'
      ;

// 词法规则
STRING : '"' (ESC | ~["\\])* '"' ;

fragment ESC : '\\' (["\\/bfnrt] | UNICODE) ;

fragment UNICODE : 'u' HEX HEX HEX HEX ;

fragment HEX : [0-9a-fA-F] ;

NUMBER : '-'? INT ('.' [0-9]+)? EXP? ;

fragment INT : '0' | [1-9] [0-9]* ;

fragment EXP : [eE] [+-]? INT ;

WS : [ \t\r\n]+ -> skip ;
