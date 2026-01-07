grammar SQL;

// 语法规则
sql_statement : select_statement
              | insert_statement
              | update_statement
              | delete_statement
              ;

select_statement : SELECT column_list FROM table_name (WHERE condition)? ;

insert_statement : INSERT INTO table_name '(' column_list ')' VALUES '(' value_list ')' ;

update_statement : UPDATE table_name SET assignment_list (WHERE condition)? ;

delete_statement : DELETE FROM table_name (WHERE condition)? ;

column_list : ID (',' ID)* | '*' ;

value_list : value (',' value)* ;

assignment_list : assignment (',' assignment)* ;

assignment : ID '=' value ;

condition : expression ;

expression : ID operator value
           | ID operator ID
           | '(' condition ')'
           | condition AND condition
           | condition OR condition
           ;

operator : '=' | '!=' | '<' | '>' | '<=' | '>=' | LIKE ;

value : STRING | NUMBER | ID ;

table_name : ID ;

// 词法规则
SELECT : 'SELECT' | 'select' ;
INSERT : 'INSERT' | 'insert' ;
INTO : 'INTO' | 'into' ;
UPDATE : 'UPDATE' | 'update' ;
DELETE : 'DELETE' | 'delete' ;
FROM : 'FROM' | 'from' ;
WHERE : 'WHERE' | 'where' ;
SET : 'SET' | 'set' ;
VALUES : 'VALUES' | 'values' ;
AND : 'AND' | 'and' ;
OR : 'OR' | 'or' ;
LIKE : 'LIKE' | 'like' ;

ID : [a-zA-Z_][a-zA-Z0-9_]* ;

STRING : '"' ~["]* '"' | '\'' ~[']* '\'' ;

NUMBER : [0-9]+ ('.' [0-9]+)? ;

WS : [ \t\r\n]+ -> skip ;
