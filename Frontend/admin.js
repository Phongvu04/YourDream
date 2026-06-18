const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000/api'
    : window.location.origin + '/api';
const S = { token: null, user: null, page: 'dashboard', usersPage: 1, goalsPage: 1, chatsPage: 1, trustUserId: null, trustUserName: '' };

function hdrs() { return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token }; }
async function api(method, path, body) {
    const r = await fetch(API + path, { method, headers: hdrs(), body: body ? JSON.stringify(body) : undefined });
    return r.json();
}

function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = 'admin-toast ' + type;
    el.innerHTML = `<span>${msg}</span>`;
    document.getElementById('admin-toast-container').appendChild(el);
    setTimeout(() => el.remove(), 3500);
}

function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('vi-VN'); }
function fmtDateTime(d) { if (!d) return '—'; return new Date(d).toLocaleString('vi-VN'); }

function statusBadge(s) {
    const m = { active: ['badge-active','Đang thực hiện'], completed: ['badge-completed','Hoàn thành'], abandoned: ['badge-abandoned','Từ bỏ'], checking: ['badge-checking','Chờ duyệt'] };
    const [cls, label] = m[s] || ['badge-active', s];
    return `<span class="badge ${cls}">${label}</span>`;
}
function priorityBadge(p) {
    const m = { high: ['badge-high','Cao'], medium: ['badge-medium','TB'], low: ['badge-low','Thấp'] };
    const [cls, label] = m[p] || ['badge-medium', p];
    return `<span class="badge ${cls}">${label}</span>`;
}
function trustColor(n) { return n >= 80 ? 'high' : n >= 50 ? 'mid' : 'low'; }
function userCell(name, email) {
    const init = (name || '?')[0].toUpperCase();
    return `<div class="user-cell"><div class="user-cell-avatar">${init}</div><div><div class="user-cell-name">${name}</div><div class="user-cell-email">${email}</div></div></div>`;
}

// ── AUTH
document.getElementById('admin-login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('btn-login');
    btn.disabled = true; btn.textContent = 'Đang xử lý...';
    const errEl = document.getElementById('login-error');
    errEl.style.display = 'none';
    try {
        const d = await fetch(API + '/admin/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: document.getElementById('admin-email').value, password: document.getElementById('admin-password').value })
        }).then(r => r.json());
        if (d.success) {
            S.token = d.token; S.user = d.user;
            localStorage.setItem('gf_admin_token', d.token);
            localStorage.setItem('gf_admin_user', JSON.stringify(d.user));
            showDashboard();
        } else {
            errEl.textContent = d.error; errEl.style.display = 'block';
        }
    } catch { errEl.textContent = 'Không thể kết nối máy chủ'; errEl.style.display = 'block'; }
    btn.disabled = false; btn.textContent = 'Đăng nhập';
});

// Nút "Quay về trang chủ" là thẻ <a href="/"> → tự điều hướng, không cần JS
// Token admin vẫn còn trong localStorage, lần sau vào /admin sẽ auto-login

// ── AUTO-LOGIN: Kiểm tra token khi trang load
// Ưu tiên 1: token từ main app (goalflow_token) — đã có role:'admin' trong JWT
// Ưu tiên 2: token admin riêng (gf_admin_token) từ lần đăng nhập admin trước
window.addEventListener('DOMContentLoaded', async () => {
    const mainToken  = localStorage.getItem('goalflow_token');
    const mainUser   = localStorage.getItem('goalflow_user');
    const adminToken = localStorage.getItem('gf_admin_token');
    const adminUser  = localStorage.getItem('gf_admin_user');

    // Thử dùng token từ main app trước (RBAC unified login)
    const token = mainToken || adminToken;
    const userRaw = mainToken ? mainUser : adminUser;

    if (token && userRaw) {
        try {
            // Verify token còn hiệu lực bằng cách gọi API stats
            const r = await fetch(API + '/admin/stats', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (r.ok) {
                // Token hợp lệ + có quyền admin → vào thẳng dashboard
                S.token = token;
                S.user  = JSON.parse(userRaw);
                showDashboard();
                return;
            }
        } catch (_) { /* token lỗi → hiện form đăng nhập bình thường */ }
    }
    // Không có token hoặc token hết hạn → hiện form đăng nhập
    document.getElementById('admin-login').style.display = 'flex';
});

function showDashboard() {
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-app').classList.remove('hidden');
    document.getElementById('sidebar-name').textContent = S.user?.name || 'Admin';
    document.getElementById('sidebar-avatar').textContent = (S.user?.name || 'A')[0].toUpperCase();
    loadPage('dashboard');
    startClock();
}

// ── CLOCK
function startClock() {
    const el = document.getElementById('topbar-time');
    const tick = () => { el.textContent = new Date().toLocaleString('vi-VN'); };
    tick(); setInterval(tick, 1000);
}

// ── NAV
document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => loadPage(btn.dataset.page));
});

const PAGE_TITLES = { dashboard: 'Dashboard', users: 'Người dùng', goals: 'Mục tiêu', chats: 'Chat Sessions' };

function loadPage(name) {
    S.page = name;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === name));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + name));
    document.getElementById('topbar-title').textContent = PAGE_TITLES[name] || name;
    if (name === 'dashboard') loadStats();
    if (name === 'users')     { S.usersPage = 1; loadUsers(); }
    if (name === 'goals')     { S.goalsPage = 1; loadGoals(); }
    if (name === 'chats')     { S.chatsPage = 1; loadChats(); }
}

// ── DASHBOARD
let chartInstance = null;
async function loadStats() {
    document.getElementById('stats-grid').innerHTML = '<div class="loading-spinner"><div class="spinner"></div> Đang tải...</div>';
    const d = await api('GET', '/admin/stats');
    if (!d.success) return;
    const st = d.stats;

    // Badge checking
    const cb = document.getElementById('checking-badge');
    if (st.goalsByStatus.checking > 0) { cb.style.display = ''; cb.textContent = st.goalsByStatus.checking; }
    else cb.style.display = 'none';

    document.getElementById('stats-grid').innerHTML = `
        <div class="stat-card"><div class="stat-icon indigo"><svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 014-4h6a4 4 0 014 4v2"/></svg></div><div><div class="stat-val">${st.totalUsers}</div><div class="stat-label">Tổng người dùng</div><div class="stat-sub">+${st.newUsersThisWeek} tuần này</div></div></div>
        <div class="stat-card"><div class="stat-icon blue"><svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></div><div><div class="stat-val">${st.totalGoals}</div><div class="stat-label">Tổng mục tiêu</div><div class="stat-sub">${st.goalsByStatus.checking} chờ duyệt</div></div></div>
        <div class="stat-card"><div class="stat-icon green"><svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg></div><div><div class="stat-val">${st.goalsByStatus.completed}</div><div class="stat-label">Đã hoàn thành</div></div></div>
        <div class="stat-card"><div class="stat-icon yellow"><svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg></div><div><div class="stat-val">${st.goalsByStatus.active}</div><div class="stat-label">Đang thực hiện</div></div></div>
        <div class="stat-card"><div class="stat-icon red"><svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg></div><div><div class="stat-val">${st.goalsByStatus.abandoned}</div><div class="stat-label">Đã từ bỏ</div></div></div>
        <div class="stat-card"><div class="stat-icon purple"><svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/></svg></div><div><div class="stat-val">${st.totalChats}</div><div class="stat-label">Chat Sessions</div></div></div>
    `;

    // Pie chart
    const ctx = document.getElementById('chart-goals-status').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    const gs = st.goalsByStatus;
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Đang thực hiện','Hoàn thành','Từ bỏ','Chờ duyệt'],
            datasets: [{ data: [gs.active,gs.completed,gs.abandoned,gs.checking], backgroundColor: ['#3b82f6','#10b981','#ef4444','#f59e0b'], borderWidth: 0, hoverOffset: 6 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', font: { size: 11 }, padding: 16 } } }, cutout: '65%' }
    });

    // Recent users
    const ul = document.getElementById('recent-users-list');
    if (!st.recentUsers?.length) { ul.innerHTML = '<p style="color:var(--text3);font-size:.85rem">Chưa có người dùng</p>'; return; }
    ul.innerHTML = st.recentUsers.map(u => `
        <div class="recent-item">
            <div class="recent-avatar">${(u.name||'?')[0].toUpperCase()}</div>
            <div><div class="recent-name">${u.name}</div><div class="recent-meta">${u.email} · ${fmtDate(u.createdAt)}</div></div>
            <span class="badge ${u.isBanned ? 'badge-banned' : 'badge-normal'}" style="margin-left:auto">${u.isBanned ? 'Bị khóa' : 'Hoạt động'}</span>
        </div>`).join('');
}

// ── USERS
let userSearchTimer;
document.getElementById('user-search').addEventListener('input', e => {
    clearTimeout(userSearchTimer);
    userSearchTimer = setTimeout(() => { S.usersPage = 1; loadUsers(e.target.value); }, 400);
});

async function loadUsers(search = document.getElementById('user-search').value) {
    document.getElementById('users-tbody').innerHTML = '<tr class="empty-row"><td colspan="7"><div class="loading-spinner"><div class="spinner"></div> Đang tải...</div></td></tr>';
    const d = await api('GET', `/admin/users?page=${S.usersPage}&search=${encodeURIComponent(search)}`);
    if (!d.success) return;
    document.getElementById('users-meta').textContent = `${d.total} người dùng`;
    document.getElementById('users-tbody').innerHTML = d.users.length ? d.users.map(u => `
        <tr>
            <td>${userCell(u.name, u.email)}</td>
            <td><span class="trust-score ${trustColor(u.trustScore)}">${u.trustScore} ⭐</span></td>
            <td>${u.goalCount ?? 0}</td>
            <td>${u.abandonCount ?? 0}</td>
            <td><span class="badge ${u.isBanned ? 'badge-banned' : 'badge-normal'}">${u.isBanned ? '🔒 Bị khóa' : '✅ Hoạt động'}</span></td>
            <td>${fmtDate(u.createdAt)}</td>
            <td><div class="actions">
                <button class="btn-action btn-edit" onclick="openTrustModal('${u.id}','${u.name.replace(/'/g,"\\'")}',${u.trustScore})">⭐ TS</button>
                <button class="btn-action ${u.isBanned ? 'btn-unban' : 'btn-ban'}" onclick="toggleBan('${u.id}',this)">${u.isBanned ? '🔓 Mở' : '🔒 Khóa'}</button>
                <button class="btn-action btn-del" onclick="deleteUser('${u.id}','${u.name.replace(/'/g,"\\'")}')">🗑️</button>
            </div></td>
        </tr>`).join('') : '<tr class="empty-row"><td colspan="7">Không có dữ liệu</td></tr>';
    renderPagination('users-pagination', S.usersPage, d.pages, p => { S.usersPage = p; loadUsers(); });
}

async function toggleBan(id, btn) {
    const d = await api('PATCH', `/admin/users/${id}/ban`);
    if (d.success) { toast(d.message, 'success'); loadUsers(); } else toast(d.error, 'error');
}

async function deleteUser(id, name) {
    if (!confirm(`Xóa người dùng "${name}" và toàn bộ dữ liệu?`)) return;
    const d = await api('DELETE', `/admin/users/${id}`);
    if (d.success) { toast('Đã xóa người dùng', 'success'); loadUsers(); } else toast(d.error, 'error');
}

// Trust Score modal
function openTrustModal(id, name, current) {
    S.trustUserId = id; S.trustUserName = name;
    document.getElementById('trust-user-name').textContent = name;
    document.getElementById('trust-current-val').textContent = current;
    document.getElementById('trust-range').value = current;
    document.getElementById('trust-new-display').textContent = current;
    openModal('modal-trust');
}
document.getElementById('trust-range').addEventListener('input', e => {
    document.getElementById('trust-new-display').textContent = e.target.value;
});
document.getElementById('trust-confirm-btn').addEventListener('click', async () => {
    const score = parseInt(document.getElementById('trust-range').value);
    const d = await api('PATCH', `/admin/users/${S.trustUserId}/trust-score`, { trustScore: score });
    if (d.success) { toast(d.message, 'success'); closeModal('modal-trust'); loadUsers(); } else toast(d.error, 'error');
});

// ── GOALS
let goalSearchTimer;
document.getElementById('goal-search').addEventListener('input', e => {
    clearTimeout(goalSearchTimer);
    goalSearchTimer = setTimeout(() => { S.goalsPage = 1; loadGoals(); }, 400);
});
document.getElementById('goal-status-filter').addEventListener('change', () => { S.goalsPage = 1; loadGoals(); });

async function loadGoals() {
    const search = document.getElementById('goal-search').value;
    const status = document.getElementById('goal-status-filter').value;
    document.getElementById('goals-tbody').innerHTML = '<tr class="empty-row"><td colspan="7"><div class="loading-spinner"><div class="spinner"></div> Đang tải...</div></td></tr>';
    const d = await api('GET', `/admin/goals?page=${S.goalsPage}&search=${encodeURIComponent(search)}&status=${status}`);
    if (!d.success) return;
    document.getElementById('goals-meta').textContent = `${d.total} mục tiêu`;
    const catLabel = { weekly:'Tuần', monthly:'Tháng', yearly:'Năm', 'long-term':'Dài hạn' };
    document.getElementById('goals-tbody').innerHTML = d.goals.length ? d.goals.map(g => `
        <tr>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${g.title}">${g.title}</td>
            <td>${userCell(g.userName, g.userEmail)}</td>
            <td>${catLabel[g.category] || g.category}</td>
            <td>${priorityBadge(g.priority)}</td>
            <td>${statusBadge(g.status)}</td>
            <td>${fmtDate(g.deadline)}</td>
            <td><div class="actions">
                <button class="btn-action btn-view" onclick="viewGoal(${JSON.stringify(JSON.stringify(g))})">👁️</button>
                ${g.status === 'checking' ? `
                <button class="btn-action btn-approve" onclick="changeGoalStatus('${g._id}','completed')">✅ Duyệt</button>
                <button class="btn-action btn-reject" onclick="changeGoalStatus('${g._id}','active')">↩️ Trả về</button>` : ''}
                <button class="btn-action btn-del" onclick="deleteGoal('${g._id}','${g.title.replace(/'/g,"\\'")}')">🗑️</button>
            </div></td>
        </tr>`).join('') : '<tr class="empty-row"><td colspan="7">Không có dữ liệu</td></tr>';
    renderPagination('goals-pagination', S.goalsPage, d.pages, p => { S.goalsPage = p; loadGoals(); });
}

function viewGoal(gJson) {
    const g = JSON.parse(gJson);
    document.getElementById('goal-modal-title').textContent = g.title;
    document.getElementById('goal-modal-body').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:.875rem">
            <div><span style="color:var(--text2)">Người dùng:</span> ${g.userName}</div>
            <div><span style="color:var(--text2)">Trạng thái:</span> ${statusBadge(g.status)}</div>
            <div><span style="color:var(--text2)">Ưu tiên:</span> ${priorityBadge(g.priority)}</div>
            <div><span style="color:var(--text2)">Deadline:</span> ${fmtDate(g.deadline)}</div>
            <div><span style="color:var(--text2)">Ngày tạo:</span> ${fmtDate(g.createdAt)}</div>
            <div><span style="color:var(--text2)">Tags:</span> ${(g.tags||[]).join(', ') || '—'}</div>
        </div>
        ${g.description ? `<p style="margin-top:14px;font-size:.875rem;color:var(--text2)">${g.description}</p>` : ''}
        ${g.aiFeedback ? `<div style="margin-top:14px;background:var(--bg-card2);border-radius:8px;padding:12px;font-size:.82rem"><b style="color:var(--accent)">AI Feedback:</b><p style="margin-top:6px;color:var(--text2)">${g.aiFeedback}</p></div>` : ''}
        ${g.verificationHistory?.length ? `<div style="margin-top:14px"><b style="font-size:.85rem">Lịch sử báo cáo (${g.verificationHistory.length})</b>${g.verificationHistory.map(v=>`<div style="margin-top:8px;background:var(--bg-card2);border-radius:8px;padding:10px;font-size:.8rem"><span style="color:var(--text2)">${fmtDateTime(v.submittedAt)}</span> — ${v.note||'Không có ghi chú'}</div>`).join('')}</div>` : ''}
    `;
    openModal('modal-goal');
}

async function changeGoalStatus(id, status) {
    const d = await api('PATCH', `/admin/goals/${id}/status`, { status });
    if (d.success) { toast(d.message, 'success'); loadGoals(); } else toast(d.error, 'error');
}

async function deleteGoal(id, title) {
    if (!confirm(`Xóa mục tiêu "${title}"?`)) return;
    const d = await api('DELETE', `/admin/goals/${id}`);
    if (d.success) { toast('Đã xóa mục tiêu', 'success'); loadGoals(); } else toast(d.error, 'error');
}

// ── CHATS
let chatSearchTimer;
document.getElementById('chat-search').addEventListener('input', e => {
    clearTimeout(chatSearchTimer);
    chatSearchTimer = setTimeout(() => { S.chatsPage = 1; loadChats(); }, 400);
});

async function loadChats() {
    const search = document.getElementById('chat-search').value;
    document.getElementById('chats-tbody').innerHTML = '<tr class="empty-row"><td colspan="5"><div class="loading-spinner"><div class="spinner"></div> Đang tải...</div></td></tr>';
    const d = await api('GET', `/admin/chats?page=${S.chatsPage}&search=${encodeURIComponent(search)}`);
    if (!d.success) return;
    document.getElementById('chats-meta').textContent = `${d.total} cuộc trò chuyện`;
    document.getElementById('chats-tbody').innerHTML = d.chats.length ? d.chats.map(c => `
        <tr>
            <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.title}</td>
            <td>${userCell(c.userName, c.userEmail)}</td>
            <td>${c.messageCount} tin nhắn</td>
            <td>${fmtDateTime(c.updatedAt)}</td>
            <td><div class="actions">
                <button class="btn-action btn-view" onclick="viewChat('${c._id}','${c.title.replace(/'/g,"\\'")}','${c.userName.replace(/'/g,"\\'")}')">👁️ Xem</button>
                <button class="btn-action btn-del" onclick="deleteChat('${c._id}')">🗑️</button>
            </div></td>
        </tr>`).join('') : '<tr class="empty-row"><td colspan="5">Không có dữ liệu</td></tr>';
    renderPagination('chats-pagination', S.chatsPage, d.pages, p => { S.chatsPage = p; loadChats(); });
}

async function viewChat(id, title, userName) {
    document.getElementById('chat-modal-title').textContent = title;
    document.getElementById('chat-modal-user').textContent = userName;
    document.getElementById('chat-messages').innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    openModal('modal-chat');
    const d = await api('GET', `/admin/chats/${id}`);
    if (!d.success) { document.getElementById('chat-messages').innerHTML = '<p style="color:var(--danger)">Lỗi tải dữ liệu</p>'; return; }
    const msgs = d.chat.messages.filter(m => m.role !== 'system');
    document.getElementById('chat-messages').innerHTML = msgs.length ? msgs.map(m => {
        const isAI = m.role === 'assistant';
        return `<div class="chat-msg ${isAI ? 'ai-msg' : 'user-msg'}">
            <div class="chat-avatar-sm ${isAI ? 'ai' : 'usr'}">${isAI ? 'AI' : 'U'}</div>
            <div><div class="chat-role">${isAI ? 'Trợ lý AI' : userName}</div>
            <div class="chat-bubble">${m.content.replace(/\n/g,'<br>')}</div></div>
        </div>`;
    }).join('') : '<p style="color:var(--text3)">Không có tin nhắn</p>';
}

async function deleteChat(id) {
    if (!confirm('Xóa cuộc trò chuyện này?')) return;
    const d = await api('DELETE', `/admin/chats/${id}`);
    if (d.success) { toast('Đã xóa', 'success'); closeModal('modal-chat'); loadChats(); } else toast(d.error, 'error');
}

// ── PAGINATION
function renderPagination(containerId, current, total, onPage) {
    const el = document.getElementById(containerId);
    if (total <= 1) { el.innerHTML = ''; return; }
    let html = `<button class="page-btn" ${current===1?'disabled':''} onclick="(${onPage.toString()})(${current-1})">‹</button>`;
    for (let i = 1; i <= total; i++) {
        if (total > 7 && i > 2 && i < total - 1 && Math.abs(i - current) > 1) { if (i === 3 || i === total - 2) html += '<span class="page-info">...</span>'; continue; }
        html += `<button class="page-btn ${i===current?'active':''}" onclick="(${onPage.toString()})(${i})">${i}</button>`;
    }
    html += `<button class="page-btn" ${current===total?'disabled':''} onclick="(${onPage.toString()})(${current+1})">›</button>`;
    el.innerHTML = html;
}

// ── MODALS
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
});

// ── INIT: check saved session
window.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('gf_admin_token');
    const user = localStorage.getItem('gf_admin_user');
    if (token && user) {
        S.token = token; S.user = JSON.parse(user);
        showDashboard();
    }
});
