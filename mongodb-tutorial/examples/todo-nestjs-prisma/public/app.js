// API 基础 URL
const API_BASE_URL = 'http://localhost:3000/api';

// 当前用户 ID
let currentUserId = 'user001';
let currentFilter = 'all';
let allTodos = [];

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    loadTodos();
    updateStats();
});

// 加载 Todos
async function loadTodos() {
    currentUserId = document.getElementById('userId').value || 'user001';
    const priorityFilter = document.getElementById('priorityFilter').value;
    
    try {
        let url = `${API_BASE_URL}/todos?userId=${currentUserId}&page=1&limit=100`;
        
        if (priorityFilter) {
            url += `&priority=${priorityFilter}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        allTodos = data.data || [];
        renderTodos();
        updateStats();
    } catch (error) {
        console.error('加载 Todos 失败:', error);
        showError('加载失败，请检查后端服务是否启动');
    }
}

// 渲染 Todos
function renderTodos() {
    const todosList = document.getElementById('todosList');
    
    let filteredTodos = [...allTodos];
    
    // 应用筛选
    if (currentFilter === 'pending') {
        filteredTodos = filteredTodos.filter(todo => !todo.completed);
    } else if (currentFilter === 'completed') {
        filteredTodos = filteredTodos.filter(todo => todo.completed);
    }
    
    if (filteredTodos.length === 0) {
        todosList.innerHTML = '<div class="empty-state">暂无 Todo</div>';
        return;
    }
    
    todosList.innerHTML = filteredTodos.map(todo => `
        <div class="todo-item ${todo.completed ? 'completed' : ''}">
            <div class="todo-header">
                <div class="todo-title">${escapeHtml(todo.title)}</div>
                <span class="todo-priority priority-${todo.priority}">${getPriorityText(todo.priority)}</span>
            </div>
            ${todo.description ? `<div class="todo-description">${escapeHtml(todo.description)}</div>` : ''}
            <div class="todo-meta">
                ${todo.dueDate ? `<span>📅 ${formatDate(todo.dueDate)}</span>` : ''}
                <span>🕐 ${formatDate(todo.createdAt)}</span>
            </div>
            ${todo.tags && todo.tags.length > 0 ? `
                <div class="todo-tags">
                    ${todo.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                </div>
            ` : ''}
            <div class="todo-actions">
                <button class="btn-small btn-toggle" onclick="toggleTodo('${todo.id}')">
                    ${todo.completed ? '标记未完成' : '标记完成'}
                </button>
                <button class="btn-small btn-edit" onclick="openEditModal('${todo.id}')">编辑</button>
                <button class="btn-small btn-delete" onclick="deleteTodo('${todo.id}')">删除</button>
            </div>
        </div>
    `).join('');
}

// 创建 Todo
async function createTodo(event) {
    event.preventDefault();
    
    const title = document.getElementById('title').value;
    const description = document.getElementById('description').value;
    const priority = document.getElementById('priority').value;
    const dueDate = document.getElementById('dueDate').value;
    const tags = document.getElementById('tags').value.split(',').map(t => t.trim()).filter(t => t);
    
    const todoData = {
        title,
        description: description || undefined,
        priority,
        userId: currentUserId,
        tags,
        dueDate: dueDate || undefined,
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/todos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(todoData),
        });
        
        if (response.ok) {
            document.getElementById('todoForm').reset();
            loadTodos();
            showSuccess('Todo 创建成功！');
        } else {
            const error = await response.json();
            showError(error.message || '创建失败');
        }
    } catch (error) {
        console.error('创建 Todo 失败:', error);
        showError('创建失败，请检查后端服务是否启动');
    }
}

// 更新 Todo
async function updateTodo(event) {
    event.preventDefault();
    
    const id = document.getElementById('editId').value;
    const title = document.getElementById('editTitle').value;
    const description = document.getElementById('editDescription').value;
    const priority = document.getElementById('editPriority').value;
    const completed = document.getElementById('editCompleted').checked;
    const dueDate = document.getElementById('editDueDate').value;
    const tags = document.getElementById('editTags').value.split(',').map(t => t.trim()).filter(t => t);
    
    const todoData = {
        title,
        description: description || undefined,
        priority,
        completed,
        tags,
        dueDate: dueDate || undefined,
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/todos/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(todoData),
        });
        
        if (response.ok) {
            closeEditModal();
            loadTodos();
            showSuccess('Todo 更新成功！');
        } else {
            const error = await response.json();
            showError(error.message || '更新失败');
        }
    } catch (error) {
        console.error('更新 Todo 失败:', error);
        showError('更新失败，请检查后端服务是否启动');
    }
}

// 切换完成状态
async function toggleTodo(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/todos/${id}/toggle`, {
            method: 'PATCH',
        });
        
        if (response.ok) {
            loadTodos();
            showSuccess('状态更新成功！');
        } else {
            showError('更新失败');
        }
    } catch (error) {
        console.error('切换状态失败:', error);
        showError('操作失败');
    }
}

// 删除 Todo
async function deleteTodo(id) {
    if (!confirm('确定要删除这个 Todo 吗？')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/todos/${id}`, {
            method: 'DELETE',
        });
        
        if (response.ok) {
            loadTodos();
            showSuccess('Todo 删除成功！');
        } else {
            showError('删除失败');
        }
    } catch (error) {
        console.error('删除 Todo 失败:', error);
        showError('删除失败');
    }
}

// 打开编辑模态框
async function openEditModal(id) {
    const todo = allTodos.find(t => t.id === id);
    if (!todo) return;
    
    document.getElementById('editId').value = todo.id;
    document.getElementById('editTitle').value = todo.title;
    document.getElementById('editDescription').value = todo.description || '';
    document.getElementById('editPriority').value = todo.priority;
    document.getElementById('editCompleted').checked = todo.completed;
    document.getElementById('editDueDate').value = todo.dueDate ? todo.dueDate.split('T')[0] : '';
    document.getElementById('editTags').value = todo.tags ? todo.tags.join(', ') : '';
    
    document.getElementById('editModal').style.display = 'block';
}

// 关闭编辑模态框
function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

// 筛选 Todos
function filterTodos(filter) {
    currentFilter = filter;
    
    // 更新按钮状态
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    renderTodos();
}

// 搜索 Todos
async function searchTodos() {
    const keyword = document.getElementById('searchInput').value;
    
    if (!keyword.trim()) {
        loadTodos();
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/todos/search/${currentUserId}?keyword=${encodeURIComponent(keyword)}`);
        const data = await response.json();
        
        allTodos = data.data || [];
        renderTodos();
    } catch (error) {
        console.error('搜索失败:', error);
    }
}

// 更新统计信息
async function updateStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/todos/statistics/${currentUserId}`);
        const stats = await response.json();
        
        document.getElementById('totalCount').textContent = stats.total || 0;
        document.getElementById('completedCount').textContent = stats.completed || 0;
        document.getElementById('pendingCount').textContent = stats.pending || 0;
        
        const rate = stats.completionRate || 0;
        document.getElementById('completionRate').textContent = `${rate.toFixed(1)}%`;
    } catch (error) {
        console.error('加载统计信息失败:', error);
    }
}

// 工具函数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function getPriorityText(priority) {
    const map = {
        'HIGH': '高',
        'MEDIUM': '中',
        'LOW': '低',
    };
    return map[priority] || priority;
}

function showSuccess(message) {
    alert(message); // 可以替换为更好的通知组件
}

function showError(message) {
    alert('错误: ' + message); // 可以替换为更好的通知组件
}

// 点击模态框外部关闭
window.onclick = function(event) {
    const modal = document.getElementById('editModal');
    if (event.target === modal) {
        closeEditModal();
    }
}

