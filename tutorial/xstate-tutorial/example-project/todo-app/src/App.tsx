import { useMachine } from '@xstate/react';
import { todoMachine } from './todoMachine';
import { TodoItem } from './TodoItem';
import { TodoFilter } from './TodoFilter';
import './App.css';

function App() {
  const [snapshot, send] = useMachine(todoMachine);

  const filteredTodos = snapshot.context.todos.filter(todo => {
    if (snapshot.context.filter === 'active') {
      return !todo.completed;
    }
    if (snapshot.context.filter === 'completed') {
      return todo.completed;
    }
    return true;
  });

  const activeTodosCount = snapshot.context.todos.filter(
    todo => !todo.completed
  ).length;

  const handleAddTodo = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('todo') as HTMLInputElement;
    if (input.value.trim()) {
      send({ type: 'ADD_TODO', text: input.value.trim() });
      input.value = '';
    }
  };

  return (
    <div className="app">
      <div className="container">
        <h1>待办事项</h1>
        <p className="subtitle">使用 XState 管理状态</p>

        <form onSubmit={handleAddTodo} className="todo-form">
          <input
            type="text"
            name="todo"
            placeholder="添加新的待办事项..."
            className="todo-input"
          />
          <button type="submit" className="add-button">
            添加
          </button>
        </form>

        <TodoFilter
          currentFilter={snapshot.context.filter}
          onFilterChange={(filter) => send({ type: 'SET_FILTER', filter })}
        />

        <div className="todo-list">
          {filteredTodos.length === 0 ? (
            <p className="empty-message">
              {snapshot.context.filter === 'all'
                ? '还没有待办事项'
                : snapshot.context.filter === 'active'
                ? '没有进行中的事项'
                : '没有已完成的事项'}
            </p>
          ) : (
            filteredTodos.map(todo => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={() => send({ type: 'TOGGLE_TODO', id: todo.id })}
                onDelete={() => send({ type: 'DELETE_TODO', id: todo.id })}
                onEdit={(text) =>
                  send({ type: 'EDIT_TODO', id: todo.id, text })
                }
              />
            ))
          )}
        </div>

        {snapshot.context.todos.length > 0 && (
          <div className="todo-footer">
            <span>{activeTodosCount} 个待完成</span>
            {snapshot.context.todos.some(todo => todo.completed) && (
              <button
                onClick={() => send({ type: 'CLEAR_COMPLETED' })}
                className="clear-button"
              >
                清除已完成
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
