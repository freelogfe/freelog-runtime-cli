grammar Calc;

// 语法规则
program : statement* EOF ;

statement : assignment | expression ;

assignment : ID '=' expression ;

expression : term (('+'|'-') term)* ;

term : factor (('*'|'/') factor)* ;

factor : NUMBER
       | ID
       | function_call
       | '(' expression ')'
       ;

function_call : ID '(' args? ')' ;

args : expression (',' expression)* ;

// 词法规则
ID : [a-zA-Z][a-zA-Z0-9]* ;

NUMBER : [0-9]+ ('.' [0-9]+)? ;

WS : [ \t\r\n]+ -> skip ;
