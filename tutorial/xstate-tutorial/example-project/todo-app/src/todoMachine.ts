import { createMachine, assign } from 'xstate';

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

export interface TodoContext {
  todos: Todo[];
  filter: 'all' | 'active' | 'completed';
}

export type TodoEvent =
  | { type: 'ADD_TODO'; text: string }
  | { type: 'TOGGLE_TODO'; id: string }
  | { type: 'DELETE_TODO'; id: string }
  | { type: 'EDIT_TODO'; id: string; text: string }
  | { type: 'SET_FILTER'; filter: 'all' | 'active' | 'completed' }
  | { type: 'CLEAR_COMPLETED' };

const STORAGE_KEY = 'xstate-todos';

// 从本地存储加载
const loadTodos = (): Todo[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

// 保存到本地存储
const saveTodos = (todos: Todo[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch (error) {
    console.error('Failed to save todos:', error);
  }
};

export const todoMachine = createMachine({
  types: {
    context: {} as TodoContext,
    events: {} as TodoEvent
  },
  id: 'todo',
  initial: 'idle',
  context: {
    todos: loadTodos(),
    filter: 'all'
  },
  states: {
    idle: {
      on: {
        ADD_TODO: {
          actions: [
            assign({
              todos: ({ context, event }) => {
                const newTodo: Todo = {
                  id: Date.now().toString(),
                  text: event.text,
                  completed: false
                };
                const updatedTodos = [...context.todos, newTodo];
                saveTodos(updatedTodos);
                return updatedTodos;
              }
            })
          ]
        },
        TOGGLE_TODO: {
          actions: [
            assign({
              todos: ({ context, event }) => {
                const updatedTodos = context.todos.map(todo =>
                  todo.id === event.id
                    ? { ...todo, completed: !todo.completed }
                    : todo
                );
                saveTodos(updatedTodos);
                return updatedTodos;
              }
            })
          ]
        },
        DELETE_TODO: {
          actions: [
            assign({
              todos: ({ context, event }) => {
                const updatedTodos = context.todos.filter(
                  todo => todo.id !== event.id
                );
                saveTodos(updatedTodos);
                return updatedTodos;
              }
            })
          ]
        },
        EDIT_TODO: {
          actions: [
            assign({
              todos: ({ context, event }) => {
                const updatedTodos = context.todos.map(todo =>
                  todo.id === event.id
                    ? { ...todo, text: event.text }
                    : todo
                );
                saveTodos(updatedTodos);
                return updatedTodos;
              }
            })
          ]
        },
        SET_FILTER: {
          actions: assign({
            filter: ({ event }) => event.filter
          })
        },
        CLEAR_COMPLETED: {
          actions: [
            assign({
              todos: ({ context }) => {
                const updatedTodos = context.todos.filter(
                  todo => !todo.completed
                );
                saveTodos(updatedTodos);
                return updatedTodos;
              }
            })
          ]
        }
      }
    }
  }
});
