const AppState = {
    currentScreen: 'welcome',
    user: null,
    goals: [],
    chatHistory: [],
    currentTab: 'all',
    editingGoalId: null,
    lastActivityTime: null, // Thêm biến theo dõi thời gian hoạt động
    currentSessionId: null
};

const API_URL = 'http://localhost:3000/api';

// Hằng số session timeout — dùng chung cho cả checkExistingUser và monitor
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 phút

// Utility: Escape HTML để chống XSS
function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

function getAuthHeaders() {
    const token = localStorage.getItem('goalflow_token');
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

let sessionMonitorInterval = null;

function startSessionMonitor() {
    if (sessionMonitorInterval) clearInterval(sessionMonitorInterval);

    // Kiểm tra định kỳ mỗi 1 phút (60000 ms)
    sessionMonitorInterval = setInterval(() => {
        if (!AppState.user) return;

        const lastActivityStr = localStorage.getItem('goalflow_last_activity');
        if (lastActivityStr) {
            const lastActivity = parseInt(lastActivityStr, 10);
            const now = Date.now();
            const sessionTimeoutMs = SESSION_TIMEOUT_MS;

            if (now - lastActivity > sessionTimeoutMs) {
                // Hết hạn phiên làm việc
                clearInterval(sessionMonitorInterval);
                showToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'warning');
                setTimeout(() => {
                    handleLogoutSilent();
                }, 2000);
            }
        }
    }, 60000);
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    attachEventListeners();
    checkExistingUser();
});

function initializeApp() {
    // Load theme
    const theme = localStorage.getItem('goalflow_theme');
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        setTimeout(() => {
            const sun = document.getElementById('theme-icon-sun');
            const moon = document.getElementById('theme-icon-moon');
            if (sun && moon) {
                sun.classList.remove('hidden');
                moon.classList.add('hidden');
            }
        }, 100);
    }

    // Load data from localStorage
    const savedUser = localStorage.getItem('goalflow_user');
    const savedGoals = localStorage.getItem('goalflow_goals');
    const token = localStorage.getItem('goalflow_token');

    if (savedUser && token) {
        AppState.user = JSON.parse(savedUser);
    }

    if (savedGoals) {
        AppState.goals = JSON.parse(savedGoals);
    }

    // Load avatar
    loadAvatar();
}

function checkExistingUser() {
    if (AppState.user) {
        // Kiểm tra thời gian hoạt động cuối cùng (Tính bằng mili giây)
        const lastActivityStr = localStorage.getItem('goalflow_last_activity');
        if (lastActivityStr) {
            const lastActivity = parseInt(lastActivityStr, 10);
            const now = Date.now();
            const sessionTimeoutMs = SESSION_TIMEOUT_MS; // 30 phút

            if (now - lastActivity > sessionTimeoutMs) {
                // Đã quá 30 phút không tương tác -> Yêu cầu đăng nhập lại
                showToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'warning');
                // Chờ một chút để hiện toast, sau đó mới reset user
                setTimeout(() => {
                    handleLogoutSilent(); // Gọi hàm tự động đăng xuất
                }, 2000);
                return; // Dừng việc vào thẳng web
            }
        }

        // Nếu vẫn còn session hợp lệ
        updateActivityTime(); // Cập nhật lại thời gian lúc vừa vào web
        startSessionMonitor(); // Bắt đầu bộ đếm theo dõi
        showScreen('choice');
        updateUserDisplay();
    }
}

// Hàm đặt lại thời gian hoạt động
function updateActivityTime() {
    if (AppState.user) {
        AppState.lastActivityTime = Date.now();
        localStorage.setItem('goalflow_last_activity', AppState.lastActivityTime.toString());
    }
}

// Hàm đăng xuất ẩn (khi hết phiên)
function handleLogoutSilent() {
    if (sessionMonitorInterval) clearInterval(sessionMonitorInterval);
    localStorage.removeItem('goalflow_user');
    localStorage.removeItem('goalflow_token');
    localStorage.removeItem('goalflow_goals');
    localStorage.removeItem('goalflow_last_activity');
    AppState.user = null;
    AppState.goals = [];
    showScreen('welcome');
}

// ===== Avatar Functions =====
function loadAvatar() {
    const savedAvatar = localStorage.getItem('goalflow_avatar');
    if (savedAvatar) {
        applyAvatar(savedAvatar);
    }
}

function applyAvatar(base64) {
    // Profile screen
    const profileImg = document.getElementById('profile-avatar-img');
    const profileSvg = document.getElementById('profile-avatar-svg');
    if (profileImg && profileSvg) {
        profileImg.src = base64;
        profileImg.style.display = 'block';
        profileSvg.style.display = 'none';
    }
    // Nav sidebar
    const navImg = document.getElementById('nav-avatar-img');
    const navSvg = document.getElementById('nav-avatar-svg');
    if (navImg && navSvg) {
        navImg.src = base64;
        navImg.style.display = 'block';
        navSvg.style.display = 'none';
    }
}

function clearAvatar() {
    const profileImg = document.getElementById('profile-avatar-img');
    const profileSvg = document.getElementById('profile-avatar-svg');
    if (profileImg && profileSvg) {
        profileImg.src = '';
        profileImg.style.display = 'none';
        profileSvg.style.display = 'block';
    }
    const navImg = document.getElementById('nav-avatar-img');
    const navSvg = document.getElementById('nav-avatar-svg');
    if (navImg && navSvg) {
        navImg.src = '';
        navImg.style.display = 'none';
        navSvg.style.display = 'block';
    }
}

function attachEventListeners() {
    // Welcome Screen
    document.getElementById('user-info-form').addEventListener('submit', handleUserSubmit);

    // Avatar upload
    const avatarContainer = document.getElementById('profile-avatar-container');
    const avatarFileInput = document.getElementById('avatar-file-input');
    if (avatarContainer && avatarFileInput) {
        avatarContainer.addEventListener('click', () => avatarFileInput.click());
        avatarFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                showToast('Vui lòng chọn file ảnh hợp lệ', 'error');
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                showToast('Ảnh phải nhỏ hơn 5MB', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                const base64 = ev.target.result;
                localStorage.setItem('goalflow_avatar', base64);
                applyAvatar(base64);
                showToast('Đã cập nhật ảnh đại diện', 'success');
            };
            reader.readAsDataURL(file);
            // Reset input để có thể chọn lại cùng file
            e.target.value = '';
        });
    }
    
    // Auth Tabs Logic
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            // Reset tất cả tab
            document.querySelectorAll('.auth-tab').forEach(t => {
                t.classList.remove('active');
                t.style.borderBottom = '2px solid transparent';
                t.style.color = 'var(--text-secondary)';
            });
            const target = e.currentTarget;
            target.classList.add('active');
            target.style.borderBottom = '2px solid var(--primary-color)';
            target.style.color = 'var(--text-color)';

            const mode = target.dataset.target;
            const form = document.getElementById('user-info-form');
            form.dataset.mode = mode;

            if (mode === 'register') {
                document.querySelectorAll('.register-only').forEach(el => el.style.display = 'block');
                document.querySelectorAll('.login-only').forEach(el => el.style.display = 'none');
                document.getElementById('auth-submit-text').textContent = 'Đăng ký tài khoản';
                document.getElementById('user-name').required = true;
            } else {
                document.querySelectorAll('.register-only').forEach(el => el.style.display = 'none');
                document.querySelectorAll('.login-only').forEach(el => el.style.display = 'block');
                document.getElementById('auth-submit-text').textContent = 'Đăng nhập hệ thống';
                document.getElementById('user-name').required = false;
            }
        });
    });

    const welcomeLogo = document.getElementById('main-logo-welcome');
    if (welcomeLogo) {
        welcomeLogo.addEventListener('click', () => {
            if (AppState.user) showScreen('choice');
        });
    }

    // Logo Navigation
    document.querySelectorAll('.nav-logo').forEach(logo => {
        logo.addEventListener('click', () => {
            if (AppState.user) showScreen('choice');
        });
    });

    // Choice Screen - cards are now directly clickable
    document.querySelectorAll('.choice-card[data-choice]').forEach(card => {
        card.addEventListener('click', (e) => {
            const choice = e.currentTarget.dataset.choice;
            handleChoice(choice);
        });
    });
    // Keep old button selectors for backward compat if any
    document.querySelectorAll('[data-choice]').forEach(btn => {
        if (!btn.classList.contains('choice-card')) {
            btn.addEventListener('click', (e) => {
                const choice = e.currentTarget.dataset.choice;
                handleChoice(choice);
            });
        }
    });

    // Old logout btn (choice screen) - now in nav sidebar, keep for safety
    const logoutBtnOld = document.getElementById('logout-btn');
    if (logoutBtnOld) logoutBtnOld.addEventListener('click', handleLogout);

    // Nav Sidebar logic
    const navSidebar = document.getElementById('nav-sidebar');
    const navSidebarOverlay = document.getElementById('nav-sidebar-overlay');

    function openNavSidebar() {
        if (navSidebar) navSidebar.classList.add('active');
        if (navSidebarOverlay) navSidebarOverlay.classList.add('active');
        // Update user info in sidebar
        if (AppState.user) {
            const nameEl = document.getElementById('nav-sidebar-name');
            const emailEl = document.getElementById('nav-sidebar-email');
            if (nameEl) nameEl.textContent = AppState.user.name || 'Người dùng';
            if (emailEl) emailEl.textContent = AppState.user.email || '';
        }
        // Sync theme toggle state
        const navToggle = document.getElementById('nav-theme-toggle');
        if (navToggle) {
            navToggle.checked = document.body.classList.contains('dark-mode');
            updateNavThemeLabel();
        }
    }

    function closeNavSidebar() {
        if (navSidebar) navSidebar.classList.remove('active');
        if (navSidebarOverlay) navSidebarOverlay.classList.remove('active');
    }

    function updateNavThemeLabel() {
        const label = document.getElementById('nav-theme-label');
        const icon = document.getElementById('nav-theme-icon');
        const isDark = document.body.classList.contains('dark-mode');
        if (label) label.textContent = isDark ? 'Chế độ sáng' : 'Chế độ tối';
        if (icon) {
            icon.innerHTML = isDark
                ? '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line>'
                : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
        }
    }

    // Hamburger buttons - choice screen and goals screen
    const navToggleChoice = document.getElementById('nav-sidebar-toggle-btn');
    const navToggleGoals = document.getElementById('nav-sidebar-toggle-btn-goals');
    if (navToggleChoice) navToggleChoice.addEventListener('click', openNavSidebar);
    if (navToggleGoals) navToggleGoals.addEventListener('click', openNavSidebar);
    if (navSidebarOverlay) navSidebarOverlay.addEventListener('click', closeNavSidebar);

    // Nav sidebar items
    const navGoGoals = document.getElementById('nav-go-goals');
    if (navGoGoals) navGoGoals.addEventListener('click', () => { closeNavSidebar(); showScreen('goals'); });

    const navGoConsultation = document.getElementById('nav-go-consultation');
    if (navGoConsultation) navGoConsultation.addEventListener('click', () => { closeNavSidebar(); handleChoice('no-goals'); });

    const navGoProfile = document.getElementById('nav-go-profile');
    if (navGoProfile) navGoProfile.addEventListener('click', () => { closeNavSidebar(); showScreen('profile'); });

    const navChangePassword = document.getElementById('nav-change-password');
    if (navChangePassword) navChangePassword.addEventListener('click', () => {
        closeNavSidebar();
        document.getElementById('change-password-modal').classList.add('active');
        document.getElementById('change-password-form').reset();
    });

    const navLogoutBtn = document.getElementById('nav-logout-btn');
    if (navLogoutBtn) navLogoutBtn.addEventListener('click', () => { closeNavSidebar(); handleLogout(); });

    // Theme toggle inside nav sidebar
    const navThemeToggle = document.getElementById('nav-theme-toggle');
    if (navThemeToggle) {
        navThemeToggle.addEventListener('change', () => {
            toggleTheme();
            updateNavThemeLabel();
        });
    }

    // Consultation Screen
    document.getElementById('back-to-choice-btn').addEventListener('click', () => showScreen('choice'));
    document.getElementById('chat-form').addEventListener('submit', handleChatSubmit);
    document.getElementById('generate-goals-btn').addEventListener('click', generateGoalsFromChat);
    // clearChatBtn removed
    
    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const chatSidebar = document.getElementById('chat-sidebar');
    const newChatBtn = document.getElementById('new-chat-btn');
    
    if (toggleSidebarBtn) {
        toggleSidebarBtn.addEventListener('click', () => {
            chatSidebar.classList.add('active');
            sidebarOverlay.classList.add('active');
        });
    }
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            chatSidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        });
    }
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            startNewChat();
            chatSidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        });
    }

    // Goals Screen
    document.getElementById('add-goal-btn').addEventListener('click', () => openGoalModal());
    const aiSupportBtn = document.getElementById('ai-support-btn');
    if (aiSupportBtn) aiSupportBtn.addEventListener('click', openAISupportModal);

    // profile-btn and logout-goals-btn moved to nav sidebar, keep for safety
    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) profileBtn.addEventListener('click', () => showScreen('profile'));
    const logoutGoalsBtn = document.getElementById('logout-goals-btn');
    if (logoutGoalsBtn) logoutGoalsBtn.addEventListener('click', handleLogout);
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);

    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.target.dataset.tab;
            switchTab(tabName);
        });
    });

    // Profile Screen
    document.getElementById('back-to-goals-btn').addEventListener('click', () => showScreen('goals'));
    document.getElementById('export-data-btn').addEventListener('click', exportUserData);
    document.getElementById('delete-account-btn').addEventListener('click', deleteAccount);

    const changePasswordBtn = document.getElementById('change-password-btn');
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', () => {
            document.getElementById('change-password-modal').classList.add('active');
            document.getElementById('change-password-form').reset();
        });
    }

    document.querySelectorAll('.close-change-password-modal, .cancel-change-password-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('change-password-modal').classList.remove('active');
        });
    });

    const changePasswordForm = document.getElementById('change-password-form');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', handleChangePasswordSubmit);
    }

    // Modal
    document.querySelectorAll('.close-modal, .cancel-modal').forEach(btn => {
        btn.addEventListener('click', closeGoalModal);
    });

    document.querySelectorAll('.close-ai-modal, .cancel-modal-ai').forEach(btn => {
        btn.addEventListener('click', closeAISupportModal);
    });

    document.getElementById('goal-modal').addEventListener('click', (e) => {
        if (e.target.id === 'goal-modal') {
            closeGoalModal();
        }
    });

    document.getElementById('ai-support-modal').addEventListener('click', (e) => {
        if (e.target.id === 'ai-support-modal') {
            closeAISupportModal();
        }
    });

    document.getElementById('goal-form').addEventListener('submit', handleGoalSubmit);

    const forgotPasswordLink = document.getElementById('forgot-password-link');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('forgot-password-modal').classList.add('active');
        });
    }

    document.querySelectorAll('.close-forgot-modal, .cancel-forgot-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('forgot-password-modal').classList.remove('active');
        });
    });

    const forgotPasswordForm = document.getElementById('forgot-password-form');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', handleForgotPasswordSubmit);
    }

    // Bắt các sự kiện tương tác để reset thời gian inactivity
    window.addEventListener('mousemove', updateActivityTime);
    window.addEventListener('click', updateActivityTime);
    window.addEventListener('keypress', updateActivityTime);
    window.addEventListener('scroll', updateActivityTime);
    window.addEventListener('touchstart', updateActivityTime);
}

// Screen Management
function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    const targetScreen = document.getElementById(`${screenName}-screen`);
    if (targetScreen) {
        targetScreen.classList.add('active');
        AppState.currentScreen = screenName;
        window.scrollTo(0, 0); // Đảm bảo cuộn lên đầu trang khi chuyển màn hình

        if (screenName === 'goals') {
            renderGoals();
            startNotificationSystem(); // Khởi động kiểm tra thông báo
        } else if (screenName === 'profile') {
            updateProfileScreen();
        } else if (screenName === 'consultation') {
            initializeConsultation();
        }
    }
}

// Notification System (Mới thêm)
function startNotificationSystem() {
    // Xin quyền HTML5 Notification nếu chưa có
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }

    const activeGoals = AppState.goals.filter(g => g.status !== 'completed');
    if (activeGoals.length === 0) return;

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // "YYYY-MM-DD"
    const currentMonthStr = todayStr.substring(0, 7);   // "YYYY-MM"

    // Lấy lịch sử thông báo từ localStorage
    const lastDailyNotif = localStorage.getItem('goalflow_last_daily_notif');
    const lastMonthlyNotif = localStorage.getItem('goalflow_last_monthly_notif');

    let hasShortTerm = false;
    let hasLongTerm = false;

    activeGoals.forEach(goal => {
        const deadline = new Date(goal.deadline);
        const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));

        if (daysLeft >= 180) {
            hasLongTerm = true;
        } else {
            hasShortTerm = true;
        }
    });

    // 1. Thông báo tiến độ Hàng Ngày (Cho mục tiêu ngắn hạn < 6 tháng)
    if (hasShortTerm && lastDailyNotif !== todayStr) {
        setTimeout(() => {
            showToast('🔔 Nhắc nhở: Đừng quên thực hiện các mục tiêu ngắn hạn ngày hôm nay nhé!', 'info');
            sendBrowserNotification('Gợi ý từ GoalFlow', 'Đừng quên thực hiện các mục tiêu ngắn hạn ngày hôm nay nhé!');
            localStorage.setItem('goalflow_last_daily_notif', todayStr);
        }, 2000);
    }

    // 2. Thông báo tiến độ Hàng Tháng (Cho mục tiêu dài hạn >= 6 tháng)
    if (hasLongTerm && lastMonthlyNotif !== currentMonthStr) {
        setTimeout(() => {
            showToast('🌟 Tổng kết tháng: Hãy rà soát lại các mục tiêu dài hạn của bạn để đảm bảo đúng tiến độ!', 'success');
            sendBrowserNotification('Đánh giá hàng tháng', 'Hãy dành chút thời gian nhìn lại mục tiêu dài hạn của mình nào.');
            localStorage.setItem('goalflow_last_monthly_notif', currentMonthStr);
        }, hasShortTerm ? 5000 : 2000); // Tránh trùng lặp 2 toast cùng lúc
    }
}

function sendBrowserNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, {
            body: body,
            icon: '/favicon.ico' // Trỏ tới icon web tạm, có thể đổi lại
        });
    }
}

// User Management
// User Management
async function handleUserSubmit(e) {
    e.preventDefault();

    const form = document.getElementById('user-info-form');
    const mode = form.dataset.mode || 'login';
    const name = document.getElementById('user-name').value.trim();
    const email = document.getElementById('user-email').value.trim();
    const password = document.getElementById('user-password').value;

    if (!email || !password) {
        showToast('Vui lòng điền đầy đủ thông tin', 'error');
        return;
    }
    
    if (mode === 'register' && !name) {
        showToast('Vui lòng nhập tên cho tài khoản mới', 'error');
        return;
    }

    if (!email.toLowerCase().endsWith('@gmail.com')) {
        showToast('Vui lòng nhập đúng định dạng @gmail.com', 'error');
        document.getElementById('user-email').focus();
        return;
    }

    const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';
    const payload = mode === 'register' ? { name, email, password } : { email, password };

    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            if (mode === 'register') {
                showToast(data.message || 'Đăng ký thành công! Vui lòng đăng nhập.', 'success');
                document.querySelector('.auth-tab[data-target="login"]').click();
                return;
            }

            // Save Token & User Info
            localStorage.setItem('goalflow_token', data.token);
            localStorage.setItem('goalflow_user', JSON.stringify(data.user));
            AppState.user = data.user;

            // Fetch Data
            try {
                const goalsRes = await fetch(`${API_URL}/goals`, { headers: getAuthHeaders() });
                const goalsData = await goalsRes.json();
                if (goalsData && goalsData.goals && Array.isArray(goalsData.goals)) {
                    // Lấy goals từ localStorage (đã tạo trước khi login)
                    let localGoals = [];
                    try {
                        const raw = localStorage.getItem('goalflow_goals');
                        localGoals = raw ? JSON.parse(raw) : [];
                    } catch (_) { localGoals = []; }

                    // Merge: DB là source of truth, nhưng goals local chưa được sync thì giữ lại
                    const dbIds = new Set(goalsData.goals.map(g => g.id));
                    const unsynced = localGoals.filter(g => !dbIds.has(g.id));

                    // Nếu có goals chưa sync, đẩy lên DB ngay
                    if (unsynced.length > 0) {
                        const allGoals = [...goalsData.goals, ...unsynced];
                        AppState.goals = allGoals;
                        localStorage.setItem('goalflow_goals', JSON.stringify(AppState.goals));
                        // Sync unsynced goals to server
                        fetch(`${API_URL}/goals`, {
                            method: 'POST',
                            headers: getAuthHeaders(),
                            body: JSON.stringify({ goals: allGoals })
                        }).catch(e => console.warn('Sync error:', e.message));
                    } else {
                        AppState.goals = goalsData.goals;
                        localStorage.setItem('goalflow_goals', JSON.stringify(AppState.goals));
                    }
                } else {
                    // DB không trả về gì → dùng localStorage
                    const raw = localStorage.getItem('goalflow_goals');
                    AppState.goals = raw ? JSON.parse(raw) : [];
                }
            } catch (goalErr) {
                console.error('Error fetching existing goals:', goalErr);
                AppState.goals = [];
            }

            showToast(`Chào mừng ${data.user.name}!`, 'success');
            
            updateActivityTime();
            startSessionMonitor();
            updateUserDisplay();
            showScreen('choice');
        } else {
            showToast(data.error || 'Có lỗi xảy ra', 'error');
        }
    } catch (error) {
        console.error('Lỗi đăng nhập/đăng ký:', error);
        showToast('Không thể kết nối máy chủ', 'error');
    }
}

async function handleForgotPasswordSubmit(e) {
    e.preventDefault();
    const emailInput = document.getElementById('forgot-email');
    const email = emailInput.value.trim();
    const submitBtn = document.getElementById('btn-submit-forgot');
    const originalBtnRaw = submitBtn.innerHTML;

    if (!email) {
        showToast('Vui lòng nhập địa chỉ email', 'error');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="loading"></div><span>Đang xử lý...</span>';

    try {
        const response = await fetch(`${API_URL}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json();

        if (response.ok && data.success) {
            showToast(data.message, 'success');
            document.getElementById('forgot-password-modal').classList.remove('active');
            emailInput.value = '';
        } else {
            showToast(data.error || 'Có lỗi xảy ra', 'error');
        }
    } catch (error) {
        console.error('Lỗi khi khôi phục mật khẩu:', error);
        showToast('Không thể kết nối máy chủ', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnRaw;
    }
}

async function handleChangePasswordSubmit(e) {
    e.preventDefault();
    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const submitBtn = document.getElementById('btn-submit-change-password');
    const originalBtnRaw = submitBtn.innerHTML;

    if (newPassword !== confirmPassword) {
        showToast('Mật khẩu mới và xác nhận không khớp', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showToast('Mật khẩu mới phải từ 6 ký tự trở lên', 'error');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="loading"></div><span>Đang xử lý...</span>';

    try {
        const response = await fetch(`${API_URL}/auth/change-password`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ oldPassword, newPassword })
        });
        const data = await response.json();

        if (response.ok && data.success) {
            document.getElementById('change-password-modal').classList.remove('active');
            
            setTimeout(() => {
                const wantToLogout = confirm('Đổi mật khẩu thành công! Bạn có muốn thoát ra và đăng nhập lại bằng mật khẩu mới không?');
                if (wantToLogout) {
                    handleLogoutSilent();
                    showToast('Vui lòng đăng nhập lại bằng mật khẩu mới', 'info');
                } else {
                    showToast('Đổi mật khẩu thành công', 'success');
                }
            }, 100);

        } else {
            showToast(data.error || 'Có lỗi xảy ra', 'error');
        }
    } catch (error) {
        console.error('Lỗi khi đổi mật khẩu:', error);
        showToast('Không thể kết nối máy chủ', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnRaw;
    }
}

function updateUserDisplay() {
    if (AppState.user) {
        const displayUserName = document.getElementById('display-user-name');
        if (displayUserName) displayUserName.textContent = AppState.user.name;
        
        const profileName = document.getElementById('profile-name');
        if (profileName) profileName.textContent = AppState.user.name;
        
        const profileEmail = document.getElementById('profile-email');
        if (profileEmail) profileEmail.textContent = AppState.user.email;
    }
}

function handleLogout() {
    if (confirm('Bạn có chắc muốn đăng xuất?')) {
        if (sessionMonitorInterval) clearInterval(sessionMonitorInterval);
        localStorage.removeItem('goalflow_user');
        localStorage.removeItem('goalflow_token');
        localStorage.removeItem('goalflow_goals');
        localStorage.removeItem('goalflow_last_activity');
        localStorage.removeItem('goalflow_avatar');
        localStorage.removeItem('goalflow_trust_score');
        AppState.user = null;
        AppState.goals = [];
        clearAvatar();
        showScreen('welcome');
        showToast('Đã đăng xuất thành công', 'success');
    }
}

async function deleteAccount() {
    if (confirm('Bạn có chắc muốn xóa tài khoản? Toàn bộ dữ liệu sẽ bị xóa vĩnh viễn khỏi hệ thống!')) {
        if (sessionMonitorInterval) clearInterval(sessionMonitorInterval);
        try {
            const response = await fetch(`${API_URL}/users/me`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (!data.success) {
                showToast(data.error || 'Có lỗi xảy ra khi xóa tài khoản', 'error');
                return;
            }
        } catch (error) {
            console.error('Lỗi khi xóa tài khoản:', error);
            showToast('Không thể kết nối máy chủ', 'error');
            return;
        }
        // Xóa toàn bộ localStorage
        localStorage.removeItem('goalflow_user');
        localStorage.removeItem('goalflow_token');
        localStorage.removeItem('goalflow_goals');
        localStorage.removeItem('goalflow_last_activity');
        localStorage.removeItem('goalflow_avatar');
        localStorage.removeItem('goalflow_trust_score');
        AppState.user = null;
        AppState.goals = [];
        clearAvatar();
        showScreen('welcome');
        showToast('Đã xóa tài khoản và toàn bộ dữ liệu thành công', 'success');
    }
}

// Choice Handling
function handleChoice(choice) {
    if (choice === 'has-goals') {
        showScreen('goals');
    } else if (choice === 'no-goals') {
        showScreen('consultation');
    }
}

// AI Consultation
async function initializeConsultation() {
    // Luôn bắt đầu chat mới khi vào màn hình tư vấn
    AppState.currentSessionId = null;
    startNewChat();
    // Tải danh sách lịch sử vào sidebar để người dùng có thể chọn xem lại
    await loadSessionList();
}

async function loadSessionList() {
    const listContainer = document.getElementById('session-list');
    try {
        const res = await fetch(`${API_URL}/ai/sessions`, { headers: getAuthHeaders() });
        const data = await res.json();
        
        if (data.success) {
            listContainer.innerHTML = '';
            data.sessions.forEach(session => {
                const div = document.createElement('div');
                div.className = `session-item ${session._id === AppState.currentSessionId ? 'active' : ''}`;
                div.dataset.id = session._id;
                div.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px; flex: 1; overflow: hidden;">
                        <svg class="session-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${session.title}</span>
                    </div>
                    <button class="delete-session-btn" title="Xóa">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
                    </button>
                `;
                div.addEventListener('click', async (e) => {
                    if (e.target.closest('.delete-session-btn')) {
                        deleteSpecificSession(session._id);
                        return;
                    }
                    await loadSession(session._id);
                    document.getElementById('chat-sidebar').classList.remove('active');
                    document.getElementById('sidebar-overlay').classList.remove('active');
                });
                listContainer.appendChild(div);
            });
            if (data.sessions.length === 0) {
                listContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); margin-top: 20px;">Chưa có lịch sử</div>';
            }
        }
    } catch (e) {
        listContainer.innerHTML = '<div style="color: var(--danger-color); padding: 10px;">Lỗi tải lịch sử</div>';
    }
}

async function loadSession(sessionId) {
    AppState.currentSessionId = sessionId;
    const chatContainer = document.getElementById('chat-container');
    const container = document.getElementById('generate-goals-container');
    chatContainer.innerHTML = '<div class="loading" style="margin: 20px auto; display: block;"></div>';
    
    // Highlight sidebar item
    document.querySelectorAll('.session-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.id === sessionId) item.classList.add('active');
    });

    try {
        const response = await fetch(`${API_URL}/ai/sessions/${sessionId}`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        chatContainer.innerHTML = '';
        if (data.success && data.history) {
            AppState.chatHistory = data.history;
            data.history.forEach(msg => {
                if (msg.role !== 'system') {
                    const uiRole = msg.role === 'assistant' ? 'ai' : msg.role;
                    addMessageToChat(uiRole, msg.content);
                }
            });
            if (container) container.style.display = AppState.chatHistory.length >= 6 ? 'block' : 'none';
        }
    } catch (error) {
        chatContainer.innerHTML = '<p style="text-align:center; color: var(--danger-color);">Không thể tải chi tiết cuộc trò chuyện.</p>';
    }
}

function startNewChat() {
    AppState.currentSessionId = null;
    AppState.chatHistory = [];
    const chatContainer = document.getElementById('chat-container');
    const container = document.getElementById('generate-goals-container');
    if (container) container.style.display = 'none';
    
    document.querySelectorAll('.session-item').forEach(item => item.classList.remove('active'));
    
    chatContainer.innerHTML = `
        <div class="chat-message ai-message">
            <div class="message-avatar">AI</div>
            <div class="message-content">
                <p>Xin chào ${AppState.user.name}! Tôi là trợ lý AI của GoalFlow. Tôi sẽ giúp bạn xác định và xây dựng các mục tiêu phù hợp.</p>
                <p>Để bắt đầu, hãy cho tôi biết: <strong>Bạn muốn đạt được điều gì trong cuộc sống?</strong></p>
            </div>
        </div>
    `;
}

async function deleteSpecificSession(sessionId) {
    if (!confirm('Bạn có chắc muốn xóa cuộc trò chuyện này không?')) return;
    
    try {
        const response = await fetch(`${API_URL}/ai/sessions/${sessionId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        if (data.success) {
            showToast('Đã xóa cuộc trò chuyện', 'success');
            if (AppState.currentSessionId === sessionId) {
                startNewChat();
            }
            loadSessionList();
        } else {
            showToast('Không thể xóa', 'error');
        }
    } catch (error) {
        console.error('Lỗi khi xóa:', error);
        showToast('Lỗi kết nối máy chủ', 'error');
    }
}

async function handleChatSubmit(e) {
    e.preventDefault();

    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message) return;

    // Add user message to chat
    addMessageToChat('user', message);
    AppState.chatHistory.push({ role: 'user', content: message });

    input.value = '';

    // Show typing indicator
    const typingId = addTypingIndicator();

    // Call AI API
    try {
        const response = await fetch(`${API_URL}/ai/chat`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                userId: AppState.user.id,
                message: message,
                history: AppState.chatHistory,
                sessionId: AppState.currentSessionId
            })
        });

        const data = await response.json();

        // Remove typing indicator
        removeTypingIndicator(typingId);

        if (data.success) {
            if (!AppState.currentSessionId && data.sessionId) {
                AppState.currentSessionId = data.sessionId;
                loadSessionList();
            }
            
            addMessageToChat('ai', data.response);
            AppState.chatHistory.push({ role: 'assistant', content: data.response });

            // Show generate button after sufficient conversation
            if (AppState.chatHistory.length >= 6) {
                const container = document.getElementById('generate-goals-container');
                if (container) container.style.display = 'block';
            }
        } else {
            addMessageToChat('ai', 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại.');
        }
    } catch (error) {
        console.error('Error calling AI:', error);
        removeTypingIndicator(typingId);
        addMessageToChat('ai', `❌ AI tạm thời không hoạt động. Lỗi: ${error?.message || "Kiểm tra API key Groq"}`);
    }
}

function addMessageToChat(role, content) {
    const chatContainer = document.getElementById('chat-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role === 'user' ? 'user-message' : 'ai-message'}`;

    // Escape HTML để chống XSS
    const safeName = role === 'user' ? escapeHtml(AppState.user.name.charAt(0).toUpperCase()) : 'AI';
    const safeContent = escapeHtml(content).replace(/\n/g, '<br>');

    messageDiv.innerHTML = `
        <div class="message-avatar">${safeName}</div>
        <div class="message-content">
            <p>${safeContent}</p>
        </div>
    `;

    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function addTypingIndicator() {
    const chatContainer = document.getElementById('chat-container');
    const typingDiv = document.createElement('div');
    const id = 'typing-' + Date.now();
    typingDiv.id = id;
    typingDiv.className = 'chat-message ai-message';

    typingDiv.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content">
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;

    chatContainer.appendChild(typingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    return id;
}

function removeTypingIndicator(id) {
    const element = document.getElementById(id);
    if (element) {
        element.remove();
    }
}

async function generateGoalsFromChat() {
    const btn = document.getElementById('generate-goals-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="loading"></div><span>Đang tạo mục tiêu...</span>';

    const timeframeValue = document.getElementById('timeframe-value').value;
    const timeframeUnit = document.getElementById('timeframe-unit').value;
    const timeframeStr = `${timeframeValue} ${timeframeUnit}`;

    try {
        const response = await fetch(`${API_URL}/ai/generate-goals`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                userId: AppState.user.id,
                chatHistory: AppState.chatHistory,
                timeframe: timeframeStr
            })
        });

        const data = await response.json();

                if (data.success && data.goals && data.goals.length > 0) {
            // Add generated goals to state
            // Server da cung cap id, chi can them status va createdAt
            data.goals.forEach(goal => {
                // Tranh duplicate: kiem tra id da ton tai chua
                const exists = AppState.goals.find(g => g.id === goal.id);
                if (!exists) {
                    AppState.goals.push({
                        ...goal,
                        // Dam bao co id (server da tao, dung ghi de)
                        id: goal.id || (Date.now().toString() + Math.random().toString(36).substr(2, 9)),
                        status: 'active',
                        createdAt: goal.createdAt || new Date().toISOString()
                    });
                }
            });

            saveGoals();
            showScreen('goals');
            showToast(`Đã tạo ${data.goals.length} mục tiêu thành công!`, 'success');
        } else {
            showToast('Không thể tạo mục tiêu. Vui lòng thử lại.', 'error');
        }
    } catch (error) {
        console.error('Error generating goals:', error);
        showToast('Đã có lỗi xảy ra. Vui lòng thử lại.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Goals Management
// Track intervals để clear khi render lại
let countdownIntervals = [];

function renderGoals() {
    const goalsList = document.getElementById('goals-list');
    const filteredGoals = filterGoalsByTab(AppState.currentTab);

    // Clear old intervals
    countdownIntervals.forEach(interval => clearInterval(interval));
    countdownIntervals = [];

    if (filteredGoals.length === 0) {
        goalsList.innerHTML = `
            <div class="empty-state">
                <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                    <circle cx="40" cy="40" r="30" stroke="currentColor" stroke-width="3" opacity="0.3"/>
                    <path d="M40 30v20M30 40h20" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.3"/>
                </svg>
                <p>Chưa có mục tiêu nào</p>
                <p class="empty-subtitle">Nhấn "Thêm mục tiêu" để bắt đầu</p>
            </div>
        `;
        return;
    }

    goalsList.innerHTML = filteredGoals.map(goal => createGoalCard(goal)).join('');

    // Attach event listeners to goal actions
    attachGoalActionListeners();

    // Start countdown timers
    startCountdownTimers();

    // ── Post-render: thêm class is-abandoned + khởi động progress bars ──
    document.querySelectorAll('.goal-item').forEach(card => {
        const goalId = card.dataset.goalId;
        const goal   = AppState.goals.find(g => g.id === goalId);
        if (goal && goal.status === 'abandoned') {
            card.classList.add('is-abandoned');
        }
    });
    requestAnimationFrame(() => { if (typeof initProgressBars === 'function') initProgressBars(); });
}

function startCountdownTimers() {
    const timers = document.querySelectorAll('.countdown-timer');

    timers.forEach(timerEl => {
        const deadlineStr = timerEl.dataset.deadline;
        // Đặt deadline vào 23:59:59 của ngày mục tiêu
        const deadline = new Date(deadlineStr);
        deadline.setHours(23, 59, 59, 999);

        const daysEl = timerEl.querySelector('.days');
        const hoursEl = timerEl.querySelector('.hours');
        const minutesEl = timerEl.querySelector('.minutes');
        const secondsEl = timerEl.querySelector('.seconds');

        const updateTimer = () => {
            const now = new Date();
            const timeDifference = deadline - now;

            if (timeDifference <= 0) {
                daysEl.textContent = '00';
                hoursEl.textContent = '00';
                minutesEl.textContent = '00';
                secondsEl.textContent = '00';
                timerEl.style.borderColor = 'var(--danger-color)';
                timerEl.style.opacity = '0.7';
                return;
            }

            const days = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeDifference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeDifference % (1000 * 60)) / 1000);

            daysEl.textContent = days.toString().padStart(2, '0');
            hoursEl.textContent = hours.toString().padStart(2, '0');
            minutesEl.textContent = minutes.toString().padStart(2, '0');
            secondsEl.textContent = seconds.toString().padStart(2, '0');

            // Đổi màu nếu sắp hết hạn (dưới 3 ngày)
            if (days < 3) {
                timerEl.style.borderColor = 'var(--warning-color)';
            }
        };

        // Cập nhật ngay lần đầu tiên
        updateTimer();

        // Cập nhật mỗi giây
        const intervalId = setInterval(updateTimer, 1000);
        countdownIntervals.push(intervalId);
    });
}

function createGoalCard(goal) {
    const categoryLabels = {
        'weekly': 'Tuần',
        'monthly': 'Tháng',
        'yearly': 'Năm',
        'long-term': 'Dài hạn'
    };

    const priorityLabels = {
        'high': 'Cao',
        'medium': 'Trung bình',
        'low': 'Thấp'
    };

    const deadline = new Date(goal.deadline);
    const today = new Date();
    const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));

    const isCompleted = goal.status === 'completed';

    return `
        <div class="goal-item" data-goal-id="${goal.id}">
            <div class="goal-header-row">
                <div class="goal-title-section">
                    <h3>${goal.title}</h3>
                    <div class="goal-meta">
                        <span class="goal-badge badge-category">${categoryLabels[goal.category]}</span>
                        <span class="goal-badge badge-priority-${goal.priority}">${priorityLabels[goal.priority]}</span>
                    </div>
                </div>
            </div>
            
            ${isCompleted ? `
            <div class="goal-completed-text">Mục tiêu đã hoàn thành</div>
            ` : `
            <div class="countdown-timer" data-deadline="${goal.deadline}">
                <div class="timer-box">
                    <span class="time-val days">00</span>
                    <span class="time-label">Ngày</span>
                </div>
                <div class="timer-sep">:</div>
                <div class="timer-box">
                    <span class="time-val hours">00</span>
                    <span class="time-label">Giờ</span>
                </div>
                <div class="timer-sep">:</div>
                <div class="timer-box">
                    <span class="time-val minutes">00</span>
                    <span class="time-label">Phút</span>
                </div>
                <div class="timer-sep">:</div>
                <div class="timer-box">
                    <span class="time-val seconds">00</span>
                    <span class="time-label">Giây</span>
                </div>
            </div>
            `}
            
            ${goal.tags && goal.tags.length > 0 ? `
            <div class="goal-tags">
                ${goal.tags.map(tag => `<span class="goal-tag">${tag}</span>`).join('')}
            </div>
            ` : ''}
            ${goal.description ? `<p class="goal-description">${goal.description}</p>` : ''}

            <!-- ProgressBar: chỉ hiện khi có milestones -->
            ${
                goal.milestones && goal.milestones.length > 0
                    ? renderGoalProgressBar(goal)
                    : ''
            }

            <div class="goal-actions">
                ${!isCompleted ? `
                <button class="btn btn-primary btn-verify" data-goal-id="${goal.id}"
                    style="background:linear-gradient(135deg,#667EEA,#764BA2);color:#fff;border:none;">
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24">
                        <path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7L3 9l7-1 2-6z"
                              stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    <span>Báo cáo kết quả</span>
                </button>
                <button class="btn btn-negotiate-edit" data-goal-id="${goal.id}"
                    title="Yêu cầu AI Coach xét duyệt trước khi sửa">
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24">
                        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
                              stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    <span>Sửa</span>
                </button>
                <button class="btn btn-abandon" data-goal-id="${goal.id}" title="Từ bỏ mục tiêu (-10 Trust Score)">
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" class="abandon-flag" style="display:none;">
                        <path d="M4 21V4M4 4l8 4-8 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <svg width="15" height="15" fill="none" viewBox="0 0 20 20" class="abandon-label-icon">
                        <path d="M3 6h14M8 6V4a2 2 0 012-2h0a2 2 0 012 2v2M5 6v10a2 2 0 002 2h6a2 2 0 002-2V6"
                              stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                    <span class="abandon-label">Từ bỏ</span>
                    <span class="abandon-flag" style="display:none;">Cờ trắng</span>
                </button>
                ` : ''}
            </div>
        </div>
    `;
}

function attachGoalActionListeners() {
    // Verify (Báo cáo kết quả) buttons
    document.querySelectorAll('.btn-verify').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const goalId = e.currentTarget.dataset.goalId;
            openVerifyModal(goalId);
        });
    });

    // Abandon (Từ bỏ) buttons
    document.querySelectorAll('.btn-abandon').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const goalId = e.currentTarget.dataset.goalId;
            openAbandonModal(goalId);
        });
    });

    // Edit (Negotiate) buttons — chỉ cho sửa sau khi AI Coach duyệt
    document.querySelectorAll('.btn-negotiate-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const goalId = e.currentTarget.dataset.goalId;
            const goal   = AppState.goals.find(g => g.id === goalId);
            // Goal active → phải thương lượng với AI Coach
            if (goal && (goal.status === 'active' || !goal.status || goal.status === 'in-progress')) {
                openNegotiateModal(goalId);
            } else {
                // Goal đã completed/abandoned/checking → cho sửa trực tiếp
                openGoalModal(goalId);
            }
        });
    });

    // Delete buttons
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const goalId = e.currentTarget.dataset.goalId;
            deleteGoal(goalId);
        });
    });
}

function filterGoalsByTab(tab) {
    if (tab === 'all') {
        return AppState.goals;
    }
    return AppState.goals.filter(goal => goal.category === tab);
}

function switchTab(tabName) {
    AppState.currentTab = tabName;

    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });

    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    renderGoals();
}

// Goal Modal
function openGoalModal(goalId = null) {
    const modal = document.getElementById('goal-modal');
    const form = document.getElementById('goal-form');
    const modalTitle = document.getElementById('modal-title');
    const submitText = document.getElementById('submit-text');

    form.reset();

    if (goalId) {
        // Edit mode
        AppState.editingGoalId = goalId;
        const goal = AppState.goals.find(g => g.id === goalId);

        if (goal) {
            modalTitle.textContent = 'Chỉnh sửa mục tiêu';
            submitText.textContent = 'Cập nhật';

            document.getElementById('goal-title').value = goal.title;
            document.getElementById('goal-description').value = goal.description || '';
            document.getElementById('goal-category').value = goal.category;
            document.getElementById('goal-deadline').value = goal.deadline;
            document.getElementById('goal-priority').value = goal.priority;
            document.getElementById('goal-tags').value = goal.tags ? goal.tags.join(', ') : '';
        }
    } else {
        // Add mode
        AppState.editingGoalId = null;
        modalTitle.textContent = 'Thêm mục tiêu mới';
        submitText.textContent = 'Thêm mục tiêu';

        // Set default deadline to next week
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        document.getElementById('goal-deadline').value = nextWeek.toISOString().split('T')[0];
        document.getElementById('goal-tags').value = '';
    }

    modal.classList.add('active');
}

function closeGoalModal() {
    const modal = document.getElementById('goal-modal');
    modal.classList.remove('active');
    AppState.editingGoalId = null;
}

async function handleGoalSubmit(e) {
    e.preventDefault();

    const goalData = {
        title: document.getElementById('goal-title').value.trim(),
        description: document.getElementById('goal-description').value.trim(),
        category: document.getElementById('goal-category').value,
        deadline: document.getElementById('goal-deadline').value,
        priority: document.getElementById('goal-priority').value,
        tags: document.getElementById('goal-tags').value.split(',').map(t => t.trim()).filter(t => t.length > 0),
    };

    if (AppState.editingGoalId) {
        // Update existing goal
        const goalIndex = AppState.goals.findIndex(g => g.id === AppState.editingGoalId);
        if (goalIndex !== -1) {
            AppState.goals[goalIndex] = {
                ...AppState.goals[goalIndex],
                ...goalData,
                updatedAt: new Date().toISOString()
            };
            showToast('Đã cập nhật mục tiêu', 'success');
        }
    } else {
        // Add new goal
        const newGoal = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            ...goalData,
            status: 'active',
            createdAt: new Date().toISOString()
        };

        AppState.goals.push(newGoal);
        showToast('Đã thêm mục tiêu mới', 'success');
    }

    saveGoals();
    renderGoals();
    closeGoalModal();
}

// AI Support Modal Logic
function openAISupportModal() {
    const modal = document.getElementById('ai-support-modal');
    const goalsList = document.getElementById('ai-support-goals-list');

    const activeGoals = AppState.goals.filter(g => g.status !== 'completed');

    if (activeGoals.length === 0) {
        goalsList.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 20px;">Bạn chưa có mục tiêu nào đang thực hiện để AI hỗ trợ.</p>';
    } else {
        goalsList.innerHTML = activeGoals.map(goal => `
            <div class="ai-support-goal-item" data-goal-id="${goal.id}">
                <div class="ai-support-goal-content">
                    <h4>${goal.title}</h4>
                    ${goal.description ? `<p>${goal.description.substring(0, 60)}${goal.description.length > 60 ? '...' : ''}</p>` : ''}
                </div>
                <button class="btn btn-outline btn-ai-select">Chọn</button>
            </div>
        `).join('');

        goalsList.querySelectorAll('.btn-ai-select').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const item = e.target.closest('.ai-support-goal-item');
                if (item) {
                    const goalId = item.dataset.goalId;
                    startAISupportForGoal(goalId);
                }
            });
        });
    }

    modal.classList.add('active');
}

function closeAISupportModal() {
    document.getElementById('ai-support-modal').classList.remove('active');
}

async function startAISupportForGoal(goalId) {
    closeAISupportModal();
    const goal = AppState.goals.find(g => g.id === goalId);
    if (!goal) return;

    startNewChat();
    
    const chatContainer = document.getElementById('chat-container');
    chatContainer.innerHTML = '';
    
    const promptMsg = `Tôi cần hỗ trợ chi tiết để đạt được mục tiêu sau:
Tên mục tiêu: "${goal.title}"
Mô tả: "${goal.description || 'Không có'}"
Thể loại: ${goal.category}
Hạn chót: ${goal.deadline || 'Không có'}

Vui lòng đóng vai một chuyên gia tư vấn hàng đầu. Hãy:
1. Phân tích tính khả thi và những khó khăn tiềm ẩn của mục tiêu này.
2. Lập một bản kế hoạch hành động chi tiết từng bước (Step-by-step).
3. Đề xuất một số từ khóa hoặc tài nguyên để tôi có thể tự tìm kiếm thông tin trên mạng nhằm phục vụ mục tiêu này.`;

    addMessageToChat('user', promptMsg);
    AppState.chatHistory.push({ role: 'user', content: promptMsg });

    const typingId = addTypingIndicator();
    showScreen('consultation');

    try {
        const response = await fetch(`${API_URL}/ai/chat`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                userId: AppState.user.id,
                message: promptMsg,
                history: [],
                sessionId: null
            })
        });

        const data = await response.json();
        removeTypingIndicator(typingId);

        if (data.success) {
            if (data.sessionId) {
                AppState.currentSessionId = data.sessionId;
                loadSessionList();
            }
            addMessageToChat('ai', data.response);
            AppState.chatHistory.push({ role: 'assistant', content: data.response });
        } else {
            addMessageToChat('ai', 'Lỗi khi phân tích mục tiêu. Vui lòng thử lại.');
        }
    } catch (error) {
        removeTypingIndicator(typingId);
        addMessageToChat('ai', 'Lỗi kết nối. Vui lòng kiểm tra mạng.');
    }
}

function completeGoal(goalId) {
    const goal = AppState.goals.find(g => g.id === goalId);
    if (goal) {
        if (confirm(`Bạn đã hoàn thành mục tiêu "${goal.title}"?`)) {
            const goalIndex = AppState.goals.findIndex(g => g.id === goalId);
            AppState.goals[goalIndex].status = 'completed';
            AppState.goals[goalIndex].completedAt = new Date().toISOString();

            saveGoals();
            renderGoals();
            showToast('Chúc mừng! Bạn đã hoàn thành mục tiêu', 'success');

            // Send notification email
            sendCompletionNotification(goal);
        }
    }
}

function deleteGoal(goalId) {
    const goal = AppState.goals.find(g => g.id === goalId);
    if (goal) {
        if (confirm(`Bạn có chắc muốn xóa mục tiêu "${goal.title}"?`)) {
            AppState.goals = AppState.goals.filter(g => g.id !== goalId);
            saveGoals();
            renderGoals();
            showToast('Đã xóa mục tiêu', 'success');
        }
    }
}

async function saveGoals() {
    localStorage.setItem('goalflow_goals', JSON.stringify(AppState.goals));

    // Sync with backend
    try {
        const response = await fetch(`${API_URL}/goals`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                userId: AppState.user.id,
                goals: AppState.goals
            })
        });
        const data = await response.json();
        if (!data.success) {
            console.warn('Sync goals warning:', data.error);
        }
    } catch (error) {
        console.error('Error syncing goals:', error);
        showToast('Lưu mục tiêu offline. Sẽ đồng bộ khi có mạng.', 'warning');
    }
}

async function sendCompletionNotification(goal) {
    try {
        await fetch(`${API_URL}/notifications/completion`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                userId: AppState.user.id,
                email: AppState.user.email,
                goalTitle: goal.title
            })
        });
    } catch (error) {
        console.error('Error sending notification:', error);
    }
}

// Profile Screen
async function updateProfileScreen() {
    // Cập nhật tên và email người dùng
    if (AppState.user) {
        const nameEl = document.getElementById('profile-name');
        const emailEl = document.getElementById('profile-email');
        if (nameEl) nameEl.textContent = AppState.user.name || 'Người dùng';
        if (emailEl) emailEl.textContent = AppState.user.email || '';
    }

    const totalGoals = AppState.goals.length;
    const completedGoals = AppState.goals.filter(g => g.status === 'completed').length;
    const inProgressGoals = AppState.goals.filter(g => g.status === 'active' || g.status === 'checking').length;

    document.getElementById('total-goals').textContent = totalGoals;
    document.getElementById('completed-goals').textContent = completedGoals;
    document.getElementById('in-progress-goals').textContent = inProgressGoals;

    // Lấy Trust Score từ API
    try {
        const res = await fetch(`${API_URL}/users/me`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success && data.user) {
            const score = typeof data.user.trustScore === 'number' ? data.user.trustScore : 100;
            const abandonCount = data.user.abandonCount || 0;
            _saveTrustScore(score);

            const trustScoreEl = document.getElementById('trust-score-value');
            const trustInfoEl = document.getElementById('trust-score-info');
            if (trustScoreEl) {
                trustScoreEl.textContent = score + ' ⭐';
                // Đổi màu theo mức điểm
                if (score >= 80) {
                    trustScoreEl.style.color = '#48BB78'; // xanh
                } else if (score >= 50) {
                    trustScoreEl.style.color = '#ECC94B'; // vàng
                } else {
                    trustScoreEl.style.color = '#F56565'; // đỏ
                }
            }
            if (trustInfoEl) {
                let goalLimit = '5-13';
                if (score >= 100) goalLimit = '5-13';
                else if (score >= 50) goalLimit = '4-10';
                else if (score >= 1) goalLimit = '1-4';
                else goalLimit = '1-2';
                trustInfoEl.textContent = `Đã từ bỏ ${abandonCount} mục tiêu · AI tạo tối đa ${goalLimit} mục tiêu`;
            }
        }
    } catch (e) {
        console.warn('Không lấy được Trust Score:', e.message);
    }

    drawPriorityChart();
    drawMonthlyChart();
}

function drawPriorityChart() {
    const canvas = document.getElementById('priority-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 10;

    let high = 0, medium = 0, low = 0;
    AppState.goals.forEach(g => {
        if (g.priority === 'high') high++;
        else if (g.priority === 'medium') medium++;
        else low++;
    });

    const total = high + medium + low;
    ctx.clearRect(0, 0, w, h);

    if (total === 0) {
        ctx.fillStyle = '#E2E8F0';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#718096';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '14px "Space Mono"';
        ctx.fillText('Chưa có', cx, cy - 10);
        ctx.fillText('mục tiêu', cx, cy + 10);

        document.getElementById('priority-legend').innerHTML = '<p style="color: var(--text-secondary); font-size: 0.875rem;">Chưa có dữ liệu mục tiêu để hiển thị biểu đồ.</p>';
        return;
    }

    const data = [
        { label: 'Cao', value: high, color: '#F56565' },
        { label: 'Trung bình', value: medium, color: '#ECC94B' },
        { label: 'Thấp', value: low, color: '#48BB78' }
    ];

    let startAngle = -Math.PI / 2;
    let legendHTML = '';

    data.forEach(item => {
        if (item.value === 0) return;
        const sliceAngle = (item.value / total) * 2 * Math.PI;
        const percent = Math.round((item.value / total) * 100);

        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fill();

        startAngle += sliceAngle;

        legendHTML += `
            <div style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem;">
                <div style="width: 16px; height: 16px; border-radius: 4px; background: ${item.color};"></div>
                <span style="font-weight: 600;">${item.label}</span>
                <span style="color: var(--text-secondary);">(${percent}%) - ${item.value} mục tiêu</span>
            </div>
        `;
    });

    document.getElementById('priority-legend').innerHTML = legendHTML;
}

function exportUserData() {
    if (!AppState.goals || AppState.goals.length === 0) {
        showToast('Không có dữ liệu mục tiêu để xuất', 'info');
        return;
    }

    // Prepare data for Excel
    const excelData = AppState.goals.map(goal => ({
        "Tiêu đề": goal.title,
        "Mô tả": goal.description || '',
        "Danh mục": goal.category === 'weekly' ? 'Tuần' : goal.category === 'monthly' ? 'Tháng' : goal.category === 'yearly' ? 'Năm' : 'Dài hạn',
        "Độ ưu tiên": goal.priority === 'high' ? 'Cao' : goal.priority === 'medium' ? 'Trung bình' : 'Thấp',
        "Hạn hoàn thành": goal.deadline,
        "Trạng thái": goal.status === 'completed' ? 'Đã hoàn thành' : goal.status === 'abandoned' ? 'Đã từ bỏ' : goal.status === 'checking' ? 'Đang chờ xét duyệt' : 'Đang thực hiện',
        "Ngày tạo": new Date(goal.createdAt).toLocaleDateString('vi-VN'),
        "Ngày hoàn thành": goal.completedAt ? new Date(goal.completedAt).toLocaleDateString('vi-VN') : ''
    }));

    try {
        // Create a new workbook
        const wb = XLSX.utils.book_new();

        // Convert JSON to worksheet
        const ws = XLSX.utils.json_to_sheet(excelData);

        // Auto-size columns (basic implementation)
        const colWidths = [
            { wch: 30 }, // Tiêu đề
            { wch: 40 }, // Mô tả
            { wch: 15 }, // Danh mục
            { wch: 15 }, // Độ ưu tiên
            { wch: 15 }, // Hạn hoàn thành
            { wch: 20 }, // Trạng thái
            { wch: 15 }, // Ngày tạo
            { wch: 15 }  // Ngày hoàn thành
        ];
        ws['!cols'] = colWidths;

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, "Mục Tiêu");

        // Use SheetJS to write and download file
        const fileName = `GoalFlow_Data_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);

        showToast('Đã xuất dữ liệu Excel thành công', 'success');
    } catch (error) {
        console.error('Lỗi khi xuất định dạng Excel:', error);
        showToast('Có lỗi xảy ra khi xuất dữ liệu', 'error');
    }
}

// Toast Notifications
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

// Dark Mode Toggle
function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('goalflow_theme', isDark ? 'dark' : 'light');
    
    const sun = document.getElementById('theme-icon-sun');
    const moon = document.getElementById('theme-icon-moon');
    if (sun && moon) {
        if (isDark) {
            sun.classList.remove('hidden');
            moon.classList.add('hidden');
        } else {
            sun.classList.add('hidden');
            moon.classList.remove('hidden');
        }
    }
}

// Monthly Chart
let monthlyChartInstance = null;
function drawMonthlyChart() {
    const canvas = document.getElementById('monthly-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    const monthNames = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
    const now = new Date();
    const data = new Array(12).fill(0);
    const labels = new Array(12).fill('');
    
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels[11 - i] = monthNames[d.getMonth()] + '/' + d.getFullYear().toString().substr(-2);
    }
    
    AppState.goals.forEach(g => {
        if (g.status === 'completed' && g.completedAt) {
            const completedDate = new Date(g.completedAt);
            const monthDiff = (now.getFullYear() - completedDate.getFullYear()) * 12 + now.getMonth() - completedDate.getMonth();
            if (monthDiff >= 0 && monthDiff < 12) {
                data[11 - monthDiff]++;
            }
        }
    });

    if (monthlyChartInstance) {
        monthlyChartInstance.destroy();
    }

    if (typeof Chart !== 'undefined') {
        const isDark = document.body.classList.contains('dark-mode');
        const textColor = isDark ? '#A0AEC0' : '#718096';
        const gridColor = isDark ? '#4A5568' : '#E2E8F0';

        monthlyChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Mục tiêu hoàn thành',
                    data: data,
                    backgroundColor: '#667EEA',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, color: textColor },
                        grid: { color: gridColor }
                    },
                    x: {
                        ticks: { color: textColor },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (context) => 'Tháng ' + context[0].label,
                            label: (context) => context.raw + ' mục tiêu'
                        }
                    }
                }
            }
        });
    }
}

// ═══════════════════════════════════════════════════════════════
// VERIFY GOAL MODAL – Báo cáo kết quả & AI thẩm định
// ═══════════════════════════════════════════════════════════════

// Lưu goalId đang được xác thực
let _verifyingGoalId = null;

/**
 * Mở modal báo cáo, truyền goalId để gửi lên API.
 */
function openVerifyModal(goalId) {
    _verifyingGoalId = goalId;

    // Điền vào goal chip (new design)
    const chipEl = document.getElementById('verify-goal-chip-text');
    const goal2 = AppState.goals.find(g => g.id === goalId);
    if (chipEl && goal2) {
        chipEl.textContent = goal2.title.length > 45 ? goal2.title.slice(0, 45) + '…' : goal2.title;
    }

    // Điền tiêu đề mục tiêu vào header modal
    const goal = AppState.goals.find(g => g.id === goalId);
    const titleEl = document.getElementById('verify-modal-title');
    if (titleEl && goal) {
        titleEl.textContent = `Báo cáo: "${goal.title.length > 30 ? goal.title.slice(0, 30) + '…' : goal.title}"`;
    }

    // Reset về step 1
    _verifyShowStep('form');
    document.getElementById('verify-report-content').value = '';
    document.getElementById('verify-proof-url').value = '';
    const ccEl2 = document.getElementById('verify-char-count');
    if (ccEl2) ccEl2.textContent = '0';

    document.getElementById('verify-goal-modal').classList.add('active');
}

/** Đóng modal và reset về trạng thái ban đầu */
function closeVerifyModal() {
    document.getElementById('verify-goal-modal').classList.remove('active');
    _verifyingGoalId = null;
}

/** Chuyển bước hiển thị trong modal: 'form' | 'loading' | 'result' */
function _verifyShowStep(step) {
    ['form', 'loading', 'result'].forEach(s => {
        document.getElementById(`verify-step-${s}`).style.display = s === step ? 'block' : 'none';
    });
}

/** Cập nhật gợi ý xoay vòng trong loading screen */
function _verifyStartLoadingHints() {
    const hints = [
        'Phân tích nội dung báo cáo…',
        'So sánh với mục tiêu ban đầu…',
        'Đánh giá mức độ chi tiết…',
        'Kiểm tra bằng chứng minh chứng…',
        'Tổng hợp kết quả thẩm định…',
    ];
    let i = 0;
    const el = document.getElementById('verify-loading-hint');
    if (!el) return null;
    el.textContent = hints[0];
    return setInterval(() => {
        i = (i + 1) % hints.length;
        el.textContent = hints[i];
    }, 1400);
}

/**
 * Hiển thị kết quả thẩm định từ AI.
 * @param {{ approved: boolean, message: string, confidenceScore: number }} result
 */
function _verifyShowResult(result) {
    _verifyShowStep('result');

    const approved = result.approved;
    const score    = Math.round((result.confidenceScore || 0) * 100);

    const banner  = document.getElementById('verify-result-banner');
    const iconEl  = document.getElementById('verify-result-icon');
    const titleEl = document.getElementById('verify-result-title');
    const scoreEl = document.getElementById('verify-result-score');
    const msgEl   = document.getElementById('verify-result-message');
    const confVal = document.getElementById('verify-conf-val');
    const confBar = document.getElementById('verify-conf-bar');

    if (approved) {
        banner.className = 'vmodal-result-banner approved';
        iconEl.className = 'vmodal-result-icon approved';
        // ── Giao diện DUYỆT (xanh lá) ──
        banner.style.background  = 'rgba(72,187,120,.08)';
        banner.style.border      = '2px solid #48BB78';
        iconEl.style.background  = '#48BB78';
        iconEl.innerHTML = `<svg width="18" height="18" fill="none" viewBox="0 0 20 20">
            <path d="M4 10l5 5 7-8" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
        titleEl.textContent      = '🎉 AI đã xác nhận kết quả của bạn!';
        titleEl.style.color      = '#276749';
        confBar.style.background = '#48BB78';

        // Đánh dấu goal là completed trong local state
        const idx = AppState.goals.findIndex(g => g.id === _verifyingGoalId);
        if (idx !== -1) {
            AppState.goals[idx].status      = 'completed';
            AppState.goals[idx].completedAt = new Date().toISOString();
            AppState.goals[idx].aiFeedback  = result.message;
            saveGoals();
        }
    } else {
        banner.className = 'vmodal-result-banner rejected';
        iconEl.className = 'vmodal-result-icon rejected';
             // ── Giao diện TỪ CHỐI (vàng cảnh báo) ──
        banner.style.background  = 'rgba(236,201,75,.1)';
        banner.style.border      = '2px solid #ECC94B';
        iconEl.style.background  = '#ECC94B';
        iconEl.innerHTML = `<svg width="18" height="18" fill="none" viewBox="0 0 20 20">
            <path d="M10 5v6M10 14v.5" stroke="white" stroke-width="2.2" stroke-linecap="round"/>
        </svg>`;
        titleEl.textContent      = '⚠️ Cần bổ sung thêm thông tin';
        titleEl.style.color      = '#744210';
        confBar.style.background = '#ECC94B';
    }

    msgEl.textContent  = result.message;
    scoreEl.textContent = `Điểm tin cậy: ${score}%`;
    confVal.textContent = `${score}%`;

    // Animate confidence bar
    confBar.style.width = '0%';
    setTimeout(() => { confBar.style.width = score + '%'; }, 80);
}

/** Xử lý submit form báo cáo → gọi /api/goals/verify */
async function handleVerifySubmit() {
    const reportContent = document.getElementById('verify-report-content').value.trim();
    const proofUrl      = document.getElementById('verify-proof-url').value.trim();

    if (!reportContent) {
        showToast('Vui lòng nhập nội dung báo cáo trước khi gửi.', 'error');
        return;
    }
    if (reportContent.length < 20) {
        showToast('Báo cáo quá ngắn. Hãy mô tả chi tiết hơn nhé!', 'warning');
        return;
    }

    // Chuyển sang loading
    _verifyShowStep('loading');
    const hintInterval = _verifyStartLoadingHints();

    const goal = AppState.goals.find(g => g.id === _verifyingGoalId);

    try {
        const response = await fetch(`${API_URL}/goals/verify`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                goalId:          _verifyingGoalId,
                goalTitle:       goal ? goal.title       : '',
                goalDescription: goal ? goal.description : '',
                reportContent,
                proofUrl: proofUrl || null,
            }),
        });

        const data = await response.json();

        if (data.success) {
            _verifyShowResult({
                approved:        data.approved,
                message:         data.message,
                confidenceScore: data.confidenceScore,
            });
            // Nếu AI duyệt → re-render danh sách goal
            if (data.approved) {
                // Cập nhật Trust Score local nếu server trả về
                if (typeof data.newTrustScore === 'number') {
                    _saveTrustScore(data.newTrustScore);
                }
                renderGoals();
                const rewardMsg = data.tcReward ? ` (+${data.tcReward} Trust Score)` : '';
                showToast(`🎉 AI đã xác nhận mục tiêu của bạn!${rewardMsg}`, 'success');
            }
        } else {
            throw new Error(data.error || 'Lỗi từ máy chủ.');
        }
    } catch (err) {
        console.error('[Verify] Lỗi:', err.message);
        _verifyShowResult({
            approved:        false,
            message:         `Không thể kết nối đến AI. Lỗi: ${err.message}. Vui lòng thử lại.`,
            confidenceScore: 0,
        });
    } finally {
        if (hintInterval) clearInterval(hintInterval);
    }
}

// ── CSS animation cho loading orbs (thêm vào <style> qua JS) ──
(function injectVerifyCSS() {
    const style = document.createElement('style');
    style.textContent = `
        .verify-ai-loader {
            position: relative;
            width: 80px; height: 80px;
            margin: 0 auto;
        }
        .verify-core {
            position: absolute;
            inset: 0; margin: auto;
            width: 40px; height: 40px;
            border-radius: 50%;
            background: linear-gradient(135deg,#667EEA,#764BA2);
            color: #fff;
            font-family: var(--font-display);
            font-size: 0.7rem;
            font-weight: 700;
            display: flex; align-items: center; justify-content: center;
            z-index: 2;
        }
        .verify-orbit {
            position: absolute;
            inset: 0;
            border-radius: 50%;
            border: 2.5px solid transparent;
            border-top-color: #667EEA;
            animation: verifyOrbitSpin 1.1s linear infinite;
        }
        .verify-orbit-2 {
            inset: 8px;
            border-top-color: #764BA2;
            animation-duration: 0.75s;
            animation-direction: reverse;
        }
        @keyframes verifyOrbitSpin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
})();

// ── Wiring event listeners cho Verify Modal ───────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Char counter
    const reportTextarea = document.getElementById('verify-report-content');
    if (reportTextarea) {
        reportTextarea.addEventListener('input', () => {
            const len = reportTextarea.value.length;
            const el  = document.getElementById('verify-char-count');
            if (el) el.textContent = `${len} ký tự`;
        });
    }

    // Close buttons
    ['close-verify-modal', 'cancel-verify-btn', 'verify-close-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', closeVerifyModal);
    });

    // Retry → go back to form
    const retryBtn = document.getElementById('verify-retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', () => _verifyShowStep('form'));

    // Submit
    const submitBtn = document.getElementById('submit-verify-btn');
    if (submitBtn) submitBtn.addEventListener('click', handleVerifySubmit);

    // Click backdrop to close
    const modal = document.getElementById('verify-goal-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeVerifyModal();
        });
    }
});

// ═══════════════════════════════════════════════════════════════
// ABANDON GOAL – Từ bỏ mục tiêu & trừ Trust Score
// ═══════════════════════════════════════════════════════════════

// Trust Score hiện tại (cache local, đồng bộ từ server sau mỗi lần abandon)
// Mặc định 100 nếu chưa lấy từ server.
let _localTrustScore = parseInt(localStorage.getItem('goalflow_trust_score') || '100', 10);

/** Cập nhật Trust Score local cache */
function _saveTrustScore(score) {
    _localTrustScore = score;
    localStorage.setItem('goalflow_trust_score', String(score));
}

// goalId đang chờ xác nhận từ bỏ
let _abandoningGoalId = null;

/**
 * Mở modal cảnh báo "từ bỏ mục tiêu".
 * Hiển thị Trust Score hiện tại và điểm sau khi trừ.
 */
function openAbandonModal(goalId) {
    _abandoningGoalId = goalId;

    const goal = AppState.goals.find(g => g.id === goalId);

    // Cập nhật điểm hiển thị
    const currentScore = _localTrustScore;
    const newScore     = Math.max(0, currentScore - 10);

    const curEl = document.getElementById('abandon-current-score');
    const newEl = document.getElementById('abandon-new-score');
    if (curEl) {
        curEl.textContent = `${currentScore} ⭐`;
        curEl.className   = `trust-score-badge${currentScore <= 50 ? ' low' : ''}`;
    }
    if (newEl) {
        newEl.textContent = `${newScore} ⭐`;
    }

    // Reset textarea lý do
    const reasonEl = document.getElementById('abandon-reason-input');
    if (reasonEl) reasonEl.value = '';

    document.getElementById('abandon-modal').classList.add('active');
}

/** Đóng modal abandon */
function closeAbandonModal() {
    document.getElementById('abandon-modal').classList.remove('active');
    _abandoningGoalId = null;
}

/**
 * Gọi API POST /api/goals/:id/abandon khi người dùng xác nhận.
 */
async function handleConfirmAbandon() {
    if (!_abandoningGoalId) return;

    const reason     = (document.getElementById('abandon-reason-input')?.value || '').trim();
    const confirmBtn = document.getElementById('confirm-abandon-btn');
    const origHtml   = confirmBtn.innerHTML;

    // Loading state cho nút xác nhận
    confirmBtn.disabled   = true;
    confirmBtn.innerHTML  = '<div class="loading" style="width:16px;height:16px;margin:0;"></div><span>Đang xử lý...</span>';

    try {
        const response = await fetch(`${API_URL}/goals/${_abandoningGoalId}/abandon`, {
            method:  'POST',
            headers: getAuthHeaders(),
            body:    JSON.stringify({ reason }),
        });

        const data = await response.json();

        if (data.success) {
            // Cập nhật local state của goal
            const idx = AppState.goals.findIndex(g => g.id === _abandoningGoalId);
            if (idx !== -1) {
                AppState.goals[idx].status      = 'abandoned';
                AppState.goals[idx].abandonedAt = new Date().toISOString();
                if (reason) AppState.goals[idx].abandonReason = reason;
                saveGoals();
            }

            // Cập nhật Trust Score
            if (typeof data.trustScore === 'number') {
                _saveTrustScore(data.trustScore);
            }

            closeAbandonModal();
            renderGoals();

            // Toast có màu đỏ + thông báo điểm
            showToast(
                `⚑ Đã từ bỏ mục tiêu. Trust Score còn ${data.trustScore ?? _localTrustScore} ⭐`,
                'error'
            );

        } else {
            showToast(data.error || 'Có lỗi xảy ra khi từ bỏ mục tiêu.', 'error');
        }

    } catch (err) {
        console.error('[Abandon] Lỗi:', err.message);
        showToast('Không thể kết nối máy chủ. Vui lòng thử lại.', 'error');
    } finally {
        confirmBtn.disabled  = false;
        confirmBtn.innerHTML = origHtml;
    }
}

// ── Gắn event listeners cho abandon modal ─────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Close buttons
    ['close-abandon-modal', 'cancel-abandon-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', closeAbandonModal);
    });

    // Confirm abandon
    const confirmBtn = document.getElementById('confirm-abandon-btn');
    if (confirmBtn) confirmBtn.addEventListener('click', handleConfirmAbandon);

    // Click backdrop
    const modal = document.getElementById('abandon-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeAbandonModal();
        });
    }
});

// ── Patch createGoalCard: thêm class is-abandoned cho card đã từ bỏ ──
// Override hàm attachGoalActionListeners để thêm class sau khi render


// ═══════════════════════════════════════════════════════════════
// NEGOTIATE EDIT – Thương lượng sửa mục tiêu với AI Coach
// ═══════════════════════════════════════════════════════════════

// goalId đang trong quá trình thương lượng
let _negotiatingGoalId  = null;
// Sau khi AI duyệt, lưu goalId để mở form sửa thật
let _approvedEditGoalId = null;

/**
 * Chuyển bước hiển thị trong negotiate modal.
 * step: 'reason' | 'loading' | 'result'
 */
function _negotiateShowStep(step) {
    ['reason', 'loading', 'result'].forEach(s => {
        const el = document.getElementById(`negotiate-step-${s}`);
        if (el) el.style.display = s === step ? 'block' : 'none';
    });
}

/**
 * Mở negotiate modal — điền thông tin goal vào banner.
 */
function openNegotiateModal(goalId) {
    _negotiatingGoalId  = goalId;
    _approvedEditGoalId = null;

    const goal = AppState.goals.find(g => g.id === goalId);

    // Điền banner thông tin goal
    const titleEl    = document.getElementById('negotiate-goal-title');
    const deadlineEl = document.getElementById('negotiate-goal-deadline');
    if (goal) {
        if (titleEl)    titleEl.textContent    = goal.title;
        if (deadlineEl) deadlineEl.textContent = goal.deadline
            ? `⏰ Deadline: ${new Date(goal.deadline).toLocaleDateString('vi-VN')}`
            : '';
    }

    // Reset
    const reasonEl = document.getElementById('negotiate-reason-input');
    if (reasonEl) reasonEl.value = '';
    const charEl = document.getElementById('negotiate-char');
    if (charEl) charEl.textContent = '0 ký tự (tối thiểu 10)';

    // Reset nút proceed
    const proceedBtn = document.getElementById('negotiate-proceed-edit-btn');
    if (proceedBtn) proceedBtn.style.display = 'none';

    _negotiateShowStep('reason');
    document.getElementById('negotiate-edit-modal').classList.add('active');
}

/** Đóng negotiate modal */
function closeNegotiateModal() {
    document.getElementById('negotiate-edit-modal').classList.remove('active');
    _negotiatingGoalId  = null;
    _approvedEditGoalId = null;
}

/**
 * Hiển thị phản hồi từ AI Coach.
 * severity: 'reasonable' | 'lazy' | 'urgent'
 */
function _negotiateShowCoachReply({ canEdit, coachMessage, severity }) {
    _negotiateShowStep('result');

    const box         = document.getElementById('coach-reply-box');
    const avatarEl    = document.getElementById('coach-avatar');
    const verdictEl   = document.getElementById('coach-verdict-label');
    const msgEl       = document.getElementById('coach-message');
    const proceedBtn  = document.getElementById('negotiate-proceed-edit-btn');

    // Xóa class cũ
    box.classList.remove('approved', 'rejected', 'urgent');
    avatarEl.classList.remove('approved', 'rejected', 'urgent');

    if (canEdit) {
        const cls = severity === 'urgent' ? 'urgent' : 'approved';
        box.classList.add(cls);
        avatarEl.classList.add(cls);
        avatarEl.textContent      = cls === 'urgent' ? '⚡' : '✅';
        verdictEl.textContent     = cls === 'urgent'
            ? '🔔 Trường hợp đặc biệt — cho phép điều chỉnh'
            : '✅ Lý do hợp lệ — được phép điều chỉnh';
        verdictEl.style.color     = cls === 'urgent' ? 'var(--accent-color)' : '#276749';
        // Hiện nút "Tiến hành sửa"
        if (proceedBtn) proceedBtn.style.display = 'flex';
        _approvedEditGoalId = _negotiatingGoalId;
    } else {
        box.classList.add('rejected');
        avatarEl.classList.add('rejected');
        avatarEl.textContent      = '⚠️';
        verdictEl.textContent     = '⚠️ Lý do chưa đủ thuyết phục';
        verdictEl.style.color     = '#744210';
        if (proceedBtn) proceedBtn.style.display = 'none';
    }

    if (msgEl) msgEl.textContent = coachMessage;
}

/**
 * Gọi API POST /api/goals/:id/request-edit và xử lý phản hồi.
 */
async function handleNegotiateSubmit() {
    const reason = (document.getElementById('negotiate-reason-input')?.value || '').trim();

    if (!reason || reason.length < 10) {
        showToast('Vui lòng giải thích lý do cụ thể hơn (ít nhất 10 ký tự).', 'warning');
        return;
    }

    _negotiateShowStep('loading');

    try {
        const response = await fetch(`${API_URL}/goals/${_negotiatingGoalId}/request-edit`, {
            method:  'POST',
            headers: getAuthHeaders(),
            body:    JSON.stringify({ reason }),
        });

        const data = await response.json();

        if (data.success) {
            _negotiateShowCoachReply({
                canEdit:      data.canEdit,
                coachMessage: data.coachMessage,
                severity:     data.severity,
            });
        } else {
            throw new Error(data.error || 'Lỗi từ máy chủ.');
        }

    } catch (err) {
        console.error('[Negotiate] Lỗi:', err.message);
        _negotiateShowCoachReply({
            canEdit:      false,
            coachMessage: `Không thể kết nối AI Coach. Lỗi: ${err.message}`,
            severity:     'lazy',
        });
    }
}

// ── Wiring event listeners cho negotiate modal ────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Char counter
    const reasonTA = document.getElementById('negotiate-reason-input');
    if (reasonTA) {
        reasonTA.addEventListener('input', () => {
            const len = reasonTA.value.length;
            const el  = document.getElementById('negotiate-char');
            if (el) {
                el.textContent = `${len} ký tự${len < 10 ? ` (tối thiểu 10)` : ' ✓'}`;
                el.style.color = len >= 10 ? 'var(--success-color)' : 'var(--text-secondary)';
            }
        });
    }

    // Close / cancel
    ['close-negotiate-modal', 'cancel-negotiate-btn', 'negotiate-close-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', closeNegotiateModal);
    });

    // Retry → về bước nhập lý do
    const retryBtn = document.getElementById('negotiate-retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', () => _negotiateShowStep('reason'));

    // Submit
    const submitBtn = document.getElementById('submit-negotiate-btn');
    if (submitBtn) submitBtn.addEventListener('click', handleNegotiateSubmit);

    // Proceed to actual edit form
    const proceedBtn = document.getElementById('negotiate-proceed-edit-btn');
    if (proceedBtn) {
        proceedBtn.addEventListener('click', () => {
            closeNegotiateModal();
            if (_approvedEditGoalId) {
                openGoalModal(_approvedEditGoalId); // mở form sửa thật
            }
        });
    }

    // Click backdrop to close
    const modal = document.getElementById('negotiate-edit-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeNegotiateModal();
        });
    }
});



// ---------------------------------------------------------------
// GOAL PROGRESS BAR — Vanilla JS renderer (port từ React component)
// ---------------------------------------------------------------

function _gpbColorInfo(pct) {
    if (pct < 30)  return { cls: 'red',    label: 'Hãy bắt đầu nào!',       emoji: '🔥' };
    if (pct < 50)  return { cls: 'yellow', label: 'Đang nỗ lực',            emoji: '💪' };
    if (pct < 70)  return { cls: 'yellow', label: 'Giữa chặng đường',       emoji: '⭐' };
    if (pct < 90)  return { cls: 'green',  label: 'Sắp về đích!',           emoji: '🎯' };
    return             { cls: 'green',  label: 'Hoàn thành xuất sắc!',  emoji: '🏆' };
}

function renderGoalProgressBar(goal) {
    const milestones = goal.milestones || [];
    if (milestones.length === 0) return '';
    const total = milestones.length;
    const done  = milestones.filter(m => m.isDone).length;
    const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
    const { cls, label, emoji } = _gpbColorInfo(pct);

    const dotsHtml = milestones.map((ms, i) => {
        const pos      = total === 1 ? 100 : (i / (total - 1)) * 100;
        const dotClass = `gpb-dot${ms.isDone ? ` done ${cls}` : ''}`;
        const tip      = ms.task.replace(/"/g, '&quot;');
        return `<div class="${dotClass}" style="left:${pos}%" data-tip="${tip}${ms.isDone ? ' ✅' : ''}"></div>`;
    }).join('');

    const chipsHtml = milestones.map(ms => {
        const chipClass = `gpb-chip${ms.isDone ? ` done ${cls}` : ''}`;
        const icon = ms.isDone
            ? `<svg width="10" height="10" fill="none" viewBox="0 0 10 10"><path d="M2 5l2.5 2.5 3.5-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
            : `<span style="width:9px;height:9px;border-radius:50%;border:1.5px solid currentColor;display:inline-block;opacity:.5;flex-shrink:0;"></span>`;
        return `<span class="${chipClass}">${icon}<span style="overflow:hidden;text-overflow:ellipsis;">${ms.task}</span></span>`;
    }).join('');

    return `<div class="goal-progress-wrap" data-gpb-id="${goal.id}" data-gpb-pct="${pct}" data-gpb-cls="${cls}">
    <div class="gpb-header">
        <div style="display:flex;align-items:baseline;gap:2px;">
            <span class="gpb-percent ${cls}" data-gpb-count>0</span>
            <span style="font-family:var(--font-display);font-weight:700;color:var(--text-secondary);font-size:.85rem;">%</span>
        </div>
        <span class="gpb-label ${cls}">${emoji} ${label}</span>
    </div>
    <div class="gpb-track"><div class="gpb-fill ${cls}" data-gpb-fill></div>${dotsHtml}</div>
    <div class="gpb-footer"><span>${done} / ${total} bước hoàn thành</span><span style="opacity:.55;font-size:.65rem;">theo milestone</span></div>
    <div class="gpb-chips">${chipsHtml}</div></div>`;
}

function initProgressBars() {
    const bars = document.querySelectorAll('[data-gpb-id]:not([data-gpb-done])');
    if (!bars.length) return;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const wrap = entry.target;
            if (wrap.dataset.gpbDone) return;
            wrap.dataset.gpbDone = '1';
            const pct    = parseInt(wrap.dataset.gpbPct, 10) || 0;
            const fillEl = wrap.querySelector('[data-gpb-fill]');
            const cntEl  = wrap.querySelector('[data-gpb-count]');
            requestAnimationFrame(() => { if (fillEl) fillEl.style.width = pct + '%'; });
            if (cntEl) {
                const stepMs = Math.ceil(1000/60), steps = 850/stepMs, inc = pct/steps;
                let cur = 0;
                const t = setInterval(() => {
                    cur += inc;
                    if (cur >= pct) { cntEl.textContent = pct; clearInterval(t); }
                    else cntEl.textContent = Math.floor(cur);
                }, stepMs);
            }
            observer.unobserve(wrap);
        });
    }, { threshold: 0.15 });
    bars.forEach(b => observer.observe(b));
}

