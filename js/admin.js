/**
 * Admin Panel – Light Marketing
 * js/admin.js
 *
 * Depends on:
 *   - window.supabase  (from supabase-config.js)
 *   - css/admin.css
 */

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
const USERS_PER_PAGE = 20;

// ── Available app screens ─────────────────────────────────────
// Defined in js/screens-config.js (shared with planos.html).
// AVAILABLE_SCREENS is loaded as a global from that file.

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

let currentUser   = null;
let currentProfile = null;
let allUsers      = [];          // full list (filtered in-memory)
let filteredUsers = [];
let usersCurrentPage = 1;

let selectedUserId   = null;
let selectedUserName = null;
let selectedSubId    = null;

let allSubs   = [];
let allPlans  = [];
let allCoupons = [];
let allNotifications = [];
let filteredNotifications = [];

// ─────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initAdmin();
});

async function initAdmin() {
    try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            window.location.href = 'login.html';
            return;
        }

        currentUser = session.user;

        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (error || !profile) {
            window.location.href = 'index.html';
            return;
        }

        currentProfile = profile;

        if (!['admin', 'super_admin'].includes(profile.role)) {
            window.location.href = 'index.html';
            return;
        }

        // Render sidebar user info
        const initials = getInitials(profile.full_name, profile.email);

        document.getElementById('sidebarAvatar').textContent = initials;
        document.getElementById('sidebarName').textContent   = profile.full_name || profile.email;
        document.getElementById('sidebarRole').textContent   = 'Admin';

        // Hide super_admin option for non-super_admins in role modal
        if (profile.role !== 'super_admin') {
            const saOpt = document.getElementById('superAdminOption');
            if (saOpt) saOpt.remove();
        }

        // Restore last-visited section from URL hash BEFORE making app visible (no flash)
        const savedSection = location.hash.slice(1);
        if (savedSection && Object.keys(sectionTitles).includes(savedSection) && savedSection !== 'users') {
            showSection(savedSection);
        }

        // Show app (may already be visible via sessionStorage pre-render)
        if (!window._adminPreRendered) {
            document.getElementById('authLoading').style.display = 'none';
            document.getElementById('adminApp').style.display    = 'flex';
        }

        // ── Blocked user overlay on admin ─────────────────
        if (profile.is_blocked) {
            renderAdminBlockedOverlay();
        }

        // ── Realtime: block/unblock ───────────────────────
        supabase.channel('admin-profile-block-' + currentUser.id)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `id=eq.${currentUser.id}`
            }, payload => {
                const np = payload.new;
                if (!np) return;
                if (np.is_blocked && !currentProfile?.is_blocked) renderAdminBlockedOverlay();
                else if (!np.is_blocked && currentProfile?.is_blocked) {
                    const ov = document.getElementById('adminBlockedOverlay');
                    if (ov) ov.remove();
                }
                currentProfile = { ...currentProfile, ...np };
            })
            .subscribe();

        // ── Notification badge + popup ────────────────────
        checkAdminNotificationsPopup(currentUser.id, currentProfile);
        supabase.channel('notif-realtime-admin-' + currentUser.id)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'admin_notifications'
            }, async (payload) => {
                const n = payload.new;
                if (!n || !n.is_active) return;
                if (document.getElementById('notifPopupOverlay')) return;
                let applies = false;
                if (n.target_type === 'all') applies = true;
                else if (n.target_type === 'role' || n.target_type === 'tier' || n.target_type === 'plan' || n.target_type === 'specific') {
                    // Notifications are resolved at send time — check target_user_ids
                    applies = (n.target_user_ids || []).includes(currentUser.id);
                }
                if (applies && n.show_popup !== false) showAdminNotificationPopup([n], currentUser.id);
            })
            .subscribe();

        // Load initial section data (plans too, so free_access plan names resolve in users table)
        await Promise.all([loadUsers(), loadPlans()]);

    } catch (err) {
        console.error('Admin init error:', err);
        window.location.href = 'index.html';
    }
}

// ─────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────

const sectionTitles = {
    users: 'Usuários',
    plans: 'Planos',
    subscriptions: 'Assinaturas',
    coupons: 'Cupons',
    notifications: 'Notificações',
    'site-data': 'Dados do site',
};

function showSection(name) {
    location.hash = name;
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

    document.getElementById(`section-${name}`)?.classList.add('active');
    document.querySelector(`.nav-item[data-section="${name}"]`)?.classList.add('active');
    document.getElementById('topbarTitle').textContent = sectionTitles[name] || name;

    // Lazy-load section data
    if (name === 'plans' && allPlans.length === 0)               loadPlans();
    if (name === 'subscriptions')                                  loadSubscriptions();
    if (name === 'coupons' && allCoupons.length === 0)            loadCoupons();
    if (name === 'notifications' && allNotifications.length === 0) loadNotifications();
    if (name === 'site-data') loadSiteSettings();

    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        closeSidebar();
    }
}

function toggleSidebar() {
    const sidebar  = document.getElementById('adminSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const isOpen   = sidebar.classList.toggle('open');
    if (backdrop) backdrop.classList.toggle('open', isOpen);
}

function closeSidebar() {
    document.getElementById('adminSidebar').classList.remove('open');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (backdrop) backdrop.classList.remove('open');
}

// ─────────────────────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────────────────────

async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
}

// ─────────────────────────────────────────────────────────────
// ██  USERS SECTION  ██
// ─────────────────────────────────────────────────────────────

async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = buildLoadingRows(6, 6);

    const [profilesResult, subsResult] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('subscriptions').select('id, plan_id, plan_name_snapshot, status, stripe_subscription_id, cancel_at_period_end, current_period_end, user_id')
    ]);

    if (profilesResult.error) {
        showToast('Erro ao carregar usuários: ' + profilesResult.error.message, 'error');
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p class="empty-state-text">Erro ao carregar usuários</p></div></td></tr>`;
        return;
    }

    const subsMap = {};
    (subsResult.data || []).forEach(s => {
        if (!subsMap[s.user_id]) subsMap[s.user_id] = [];
        subsMap[s.user_id].push(s);
    });

    allUsers = (profilesResult.data || []).map(p => ({ ...p, subscriptions: subsMap[p.id] || [] }));

    // Auto-revoke expired free access (server-side via edge function)
    const expiredUsers = allUsers.filter(u => u.free_access && u.free_access_expires_at && new Date(u.free_access_expires_at) <= new Date());
    if (expiredUsers.length > 0) {
        const session = await supabase.auth.getSession();
        const token = session?.data?.session?.access_token;
        if (token) {
            await Promise.all(expiredUsers.map(async u => {
                try {
                    const res = await callFunction('admin-update-user', { target_user_id: u.id, action: 'revoke_free_access' }, token);
                    if (res.ok) {
                        u.free_access = false;
                        u.free_access_plan_id = null;
                        u.free_access_expires_at = null;
                        u.free_access_granted_by = null;
                        u.subscription_tier = 'free';
                    }
                } catch (_) {}
            }));
        }
    }

    filteredUsers = [...allUsers];
    usersCurrentPage = 1;

    updateUserStats();
    renderUsersTable();
}

function updateUserStats() {
    const filterActive = document.getElementById('filterFreeAccess')?.checked;
    const base = filterActive ? allUsers.filter(u => !u.free_access) : allUsers;

    const total      = base.length;
    const free       = base.filter(u => u.subscription_tier === 'free').length;
    const paid       = base.filter(u => u.subscription_tier === 'paid').length;
    const freeAccess = allUsers.filter(u => isFreeAccessValid(u)).length;

    document.getElementById('statTotal').textContent      = total;
    document.getElementById('statFree').textContent       = free;
    document.getElementById('statPaid').textContent       = paid;
    document.getElementById('statFreeAccess').textContent = freeAccess;
}

function filterUsers() {
    const query   = (document.getElementById('usersSearch').value || '').toLowerCase();
    const role    = document.getElementById('usersRoleFilter').value;
    const tier    = document.getElementById('usersTierFilter').value;

    filteredUsers = allUsers.filter(u => {
        const matchText  = !query || (u.full_name || '').toLowerCase().includes(query) || (u.email || '').toLowerCase().includes(query);
        const matchRole  = !role || u.role === role;
        const matchTier  = !tier || u.subscription_tier === tier;
        return matchText && matchRole && matchTier;
    });

    usersCurrentPage = 1;
    renderUsersTable();
}

function usersPage(dir) {
    const totalPages = Math.ceil(filteredUsers.length / USERS_PER_PAGE);
    usersCurrentPage = Math.max(1, Math.min(totalPages, usersCurrentPage + dir));
    renderUsersTable();
}

function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    const total = filteredUsers.length;
    const totalPages = Math.max(1, Math.ceil(total / USERS_PER_PAGE));
    const start = (usersCurrentPage - 1) * USERS_PER_PAGE;
    const page  = filteredUsers.slice(start, start + USERS_PER_PAGE);

    document.getElementById('usersPaginationInfo').textContent =
        `${total} usuário${total !== 1 ? 's' : ''} · Página ${usersCurrentPage} de ${totalPages}`;
    document.getElementById('usersPrevBtn').disabled = usersCurrentPage <= 1;
    document.getElementById('usersNextBtn').disabled = usersCurrentPage >= totalPages;

    if (page.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p class="empty-state-text">Nenhum usuário encontrado</p></div></td></tr>`;
        return;
    }

    tbody.innerHTML = page.map(u => buildUserRow(u)).join('');
}

function openUserDetail(userId) {
    const u = allUsers.find(u => u.id === userId);
    if (!u) return;

    const initials = getInitials(u.full_name, u.email);
    const date    = u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '—';
    const isSelf  = u.id === currentProfile.id;
    const canEditRole = currentProfile.role === 'super_admin' || u.role !== 'super_admin';
    const activeSub = getUserActiveSub(u);

    const planDisplay = (() => {
        if (isFreeAccessBroken(u)) {
            return `<span class="badge badge-warning" style="background:rgba(234,179,8,0.15);color:#b45309;border:1px solid rgba(234,179,8,0.4)">⚠ Inconsistente</span><span style="font-size:10px;color:#b45309;display:block;margin-top:2px;">Acesso concedido mas sem permissão ativa</span>`;
        }
        if (u.free_access) {
            const expiryText = u.free_access_expires_at
                ? `Concedido até ${new Date(u.free_access_expires_at).toLocaleDateString('pt-BR', {timeZone:'America/Sao_Paulo'})}`
                : 'Concedido';
            return `<span class="badge badge-gift">${escHtml(planNameById(u.free_access_plan_id))}</span><span style="font-size:10px;color:var(--text-dim);display:block;margin-top:2px;">${expiryText}</span>`;
        }
        if (activeSub?.plan_id)
            return `<span class="badge badge-paid">${escHtml(planNameById(activeSub.plan_id) || activeSub.plan_name_snapshot)}</span>`;
        return `<span class="badge badge-${u.subscription_tier}">${tierLabel(u.subscription_tier)}</span>`;
    })();
    const roleBadge = `<span class="badge ${roleBadgeClass(u.role)}">${roleLabel(u.role)}</span>`;
    const blockedDateStr = u.is_blocked && u.blocked_at
        ? new Date(u.blocked_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        : null;
    const blockedBadge = u.is_blocked
        ? `<span class="badge badge-danger">Bloqueado${blockedDateStr ? ` · ${blockedDateStr}` : ''}</span>`
        : `<span style="color:var(--text-dim);font-size:12px;">Não</span>`;

    const usageMonth = u.usage_month || '';
    const currentMonth = new Date().toISOString().slice(0, 7);
    const usageCount = (u.usage_month === currentMonth) ? (u.monthly_usage_count || 0) : 0;

    // Botao de free_access: trata os 3 estados (válido / inconsistente / inexistente)
    const freeAccessDetailBtn = isFreeAccessBroken(u)
        ? `<button class="btn btn-warning" style="width:100%;justify-content:center;background:rgba(234,179,8,0.15);color:#b45309;border-color:rgba(234,179,8,0.4);" onclick="closeModal('userDetailModal'); repairFreeAccess('${u.id}')">Corrigir acesso inconsistente</button>`
        : u.free_access
            ? `<button class="btn btn-danger" style="width:100%;justify-content:center;" onclick="closeModal('userDetailModal'); revokeFreeAccess('${u.id}')">Revogar acesso gratuito</button>`
            : `<button class="btn btn-success" style="width:100%;justify-content:center;" onclick="closeModal('userDetailModal'); openFreeAccessModal('${u.id}', '${escHtml(u.full_name || u.email)}')">Conceder acesso gratuito</button>`;

    const revokeSubDetailBtn = '';

    document.getElementById('userDetailBody').innerHTML = `
        <div class="user-detail-header">
            <div class="user-detail-avatar">${initials}</div>
            <div class="user-detail-info">
                <div class="user-detail-name">${escHtml(u.full_name || '—')}</div>
                <div class="user-detail-email">${escHtml(u.email)}</div>
            </div>
        </div>
        <div class="user-detail-grid">
            <div class="user-detail-item">
                <span class="user-detail-item-label">Plano</span>
                ${planDisplay}
            </div>
            <div class="user-detail-item">
                <span class="user-detail-item-label">Função</span>
                ${roleBadge}
            </div>
            <div class="user-detail-item">
                <span class="user-detail-item-label">Bloqueado</span>
                ${blockedBadge}
            </div>
            <div class="user-detail-item">
                <span class="user-detail-item-label">Cadastro</span>
                <span style="font-size:13px;color:var(--text);">${date}</span>
            </div>
            <div class="user-detail-item">
                <span class="user-detail-item-label">Uso este mês</span>
                <span style="font-size:13px;color:var(--text);">${usageCount} processamento${usageCount !== 1 ? 's' : ''}</span>
            </div>
            <div class="user-detail-item" style="grid-column: 1 / -1;">
                <span class="user-detail-item-label">ID</span>
                <span style="font-size:10px;color:var(--text-dim);word-break:break-all;">${u.id}</span>
            </div>
        </div>
        <div class="user-detail-actions">
            ${(!isSelf && canEditRole) ? `
            <button class="btn btn-secondary" style="width:100%;justify-content:center;" onclick="closeModal('userDetailModal'); openRoleModal('${u.id}', '${escHtml(u.full_name || u.email)}', '${u.role}')">
                Alterar função
            </button>` : ''}
            ${revokeSubDetailBtn}
            ${freeAccessDetailBtn}
            ${(!isSelf && canEditRole) ? (u.is_blocked ? `
            <button class="btn btn-success" style="width:100%;justify-content:center;" onclick="closeModal('userDetailModal'); unblockAccount('${u.id}')">Desbloquear conta</button>` : `
            <button class="btn btn-danger" style="width:100%;justify-content:center;" onclick="closeModal('userDetailModal'); blockAccount('${u.id}')">Bloquear conta</button>`) : ''}
        </div>
    `;

    document.getElementById('userDetailFooter').innerHTML =
        `<button class="btn btn-secondary" onclick="closeModal('userDetailModal')">Fechar</button>`;

    openModal('userDetailModal');
}

function getUserActiveSub(u) {
    if (!u.subscriptions || !Array.isArray(u.subscriptions)) return null;
    return u.subscriptions.find(s => s.status === 'active' || s.status === 'trialing') || null;
}

// free_access válido: free_access=true E subscription_tier='paid' (estado consistente)
function isFreeAccessValid(u) {
    return !!u.free_access && u.subscription_tier === 'paid';
}
// Estado inconsistente: free_access=true mas subscription_tier!='paid'
// Ocorre quando revoke_paid_subscription ou outro processo zerou subscription_tier sem limpar free_access
function isFreeAccessBroken(u) {
    return !!u.free_access && u.subscription_tier !== 'paid';
}

function buildUserRow(u) {
    const initials = getInitials(u.full_name, u.email);
    const activeSub = getUserActiveSub(u);

    const planDisplay = (() => {
        if (isFreeAccessBroken(u)) {
            return `<span class="badge badge-warning" style="background:rgba(234,179,8,0.15);color:#b45309;border:1px solid rgba(234,179,8,0.4)">⚠ Inconsistente</span><span style="font-size:10px;color:#b45309;display:block;margin-top:2px;">Acesso inválido</span>`;
        }
        if (u.free_access) {
            const expiryText = u.free_access_expires_at
                ? `Concedido até ${new Date(u.free_access_expires_at).toLocaleDateString('pt-BR', {timeZone:'America/Sao_Paulo'})}`
                : 'Concedido';
            return `<span class="badge badge-gift">${escHtml(planNameById(u.free_access_plan_id))}</span><span style="font-size:10px;color:var(--text-dim);display:block;margin-top:2px;">${expiryText}</span>`;
        }
        if (activeSub?.plan_id)
            return `<span class="badge badge-paid">${escHtml(planNameById(activeSub.plan_id) || activeSub.plan_name_snapshot)}</span>`;
        return `<span class="badge badge-${u.subscription_tier}">${tierLabel(u.subscription_tier)}</span>`;
    })();
    const roleBadge = `<span class="badge ${roleBadgeClass(u.role)}">${roleLabel(u.role)}</span>`;
    const date      = u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '—';

    const canEditRole = currentProfile.role === 'super_admin' || u.role !== 'super_admin';
    const isSelf      = u.id === currentProfile.id;

    const roleBtn = (!isSelf && canEditRole) ? `
        <button class="btn btn-sm btn-secondary" onclick="openRoleModal('${u.id}', '${escHtml(u.full_name || u.email)}', '${u.role}')">
            Função
        </button>` : '';

    // 3 estados: inconsistente (corrigir), válido (revogar), sem acesso (conceder)
    const freeAccessBtn = isFreeAccessBroken(u)
        ? `<button class="btn btn-sm btn-warning" style="background:rgba(234,179,8,0.15);color:#b45309;border-color:rgba(234,179,8,0.4);" onclick="repairFreeAccess('${u.id}')">Corrigir</button>`
        : u.free_access
            ? `<button class="btn btn-sm btn-danger" onclick="revokeFreeAccess('${u.id}')">Revogar</button>`
            : `<button class="btn btn-sm btn-success" onclick="openFreeAccessModal('${u.id}', '${escHtml(u.full_name || u.email)}')">Acesso</button>`;

    const blockBtn = (!isSelf && canEditRole) ? (u.is_blocked
        ? `<button class="btn btn-sm btn-success" onclick="unblockAccount('${u.id}')">Desbloquear</button>`
        : `<button class="btn btn-sm btn-danger" onclick="blockAccount('${u.id}')">Bloquear</button>`) : '';

    // Show revoke sub button when user has active Stripe sub (without free_access).
    // With free_access the sub was already canceled at grant time, so no separate revoke needed.
    const revokeSubBtn = '';

    return `
    <tr class="user-row-clickable" onclick="openUserDetail('${u.id}')">
        <td>
            <div class="user-cell">
                <div class="user-avatar-sm">${initials}</div>
                <div>
                    <div class="user-name">${escHtml(u.full_name || '—')}${u.is_blocked ? ` <span class="badge badge-danger" style="font-size:10px;">Bloqueado${u.blocked_at ? ' · ' + new Date(u.blocked_at).toLocaleDateString('pt-BR', {timeZone:'America/Sao_Paulo'}) : ''}</span>` : ''}</div>
                    <div class="user-email">${escHtml(u.email)}</div>
                </div>
            </div>
        </td>
        <td>${planDisplay}</td>
        <td>${roleBadge}</td>
        <td style="color:var(--text-muted);font-size:12px;">${date}</td>
        <td onclick="event.stopPropagation()">
            <div class="actions-cell">
                ${roleBtn}
                ${revokeSubBtn}
                ${freeAccessBtn}
                ${blockBtn}
            </div>
        </td>
    </tr>`;
}

// ─── Block / Unblock ─────────────────────────────────────────

// State for the block-refund notification modal
let _blockRefundUserId       = null;
let _blockRefundUserEmail    = null;
let _blockRefundAmountCents  = null;

// State for the block-confirm modal
let _pendingBlockUserId = null;

function blockAccount(userId) {
    const u = allUsers.find(x => x.id === userId);
    const userName = u?.full_name || u?.email || userId;
    const activeSub = (u?.subscriptions || []).find(s => s.status === 'active' || s.status === 'trialing');
    const hasActiveSub = !!activeSub;
    const hasFreeAccess = !!u?.free_access;

    _pendingBlockUserId = userId;
    document.getElementById('blockConfirmUserName').textContent = userName;
    openModal('blockConfirmModal');
}

async function confirmBlockAccount() {
    closeModal('blockConfirmModal');
    const userId = _pendingBlockUserId;
    if (!userId) return;
    const u = allUsers.find(x => x.id === userId);
    const userName = u?.full_name || u?.email || userId;
    const activeSub = (u?.subscriptions || []).find(s => s.status === 'active' || s.status === 'trialing');
    const hasActiveSub = !!activeSub;
    // Considera free_access mesmo quando conflitante com subscription_tier (estado inconsistente)
    const hasFreeAccess = !!u?.free_access && !hasActiveSub;
    try {
        const session = await supabase.auth.getSession();
        const token = session.data.session.access_token;

        // 1. Bloquear conta — block_account já revoga free_access + subscription_tier atomicamente
        //    Além disso armazena o período restante (sub Stripe ou free_access) para restaurar ao desbloquear
        const blockPayload = {
            target_user_id: userId,
            action: 'block_account',
        };
        if (hasActiveSub && activeSub.current_period_end) {
            blockPayload.blocked_sub_period_end = activeSub.current_period_end;
            if (activeSub.plan_id) blockPayload.blocked_sub_plan_id = activeSub.plan_id;
        } else if (hasFreeAccess && u.free_access_plan_id) {
            // Salva o plan_id sempre; só envia period_end se houver data de expiração
            if (u.free_access_expires_at) blockPayload.blocked_free_access_period_end = u.free_access_expires_at;
            blockPayload.blocked_free_access_plan_id = u.free_access_plan_id;
        }

        const resBlock = await callFunction('admin-update-user', blockPayload, token);
        const blockData = await resBlock.json();
        if (!resBlock.ok) throw new Error(blockData.error || 'Erro ao bloquear');

        const user = allUsers.find(u => u.id === userId);
        if (user) {
            user.is_blocked             = true;
            user.blocked_at             = blockData.blocked_at || new Date().toISOString();
            // block_account já zerou esses campos no DB; refletir no estado local
            user.free_access            = false;
            user.free_access_plan_id    = null;
            user.free_access_expires_at = null;
            user.subscription_tier      = 'free';
            if (hasActiveSub && activeSub.current_period_end) {
                user.blocked_sub_period_end = activeSub.current_period_end;
                user.blocked_sub_plan_id    = activeSub.plan_id || null;
            } else if (hasFreeAccess) {
                user.blocked_sub_period_end = u.free_access_expires_at || null;
                user.blocked_sub_plan_id    = u.free_access_plan_id || null;
            }
        }

        // 2. Cancelar assinatura Stripe ativa (requer chamada separada pois vai para o Stripe)
        if (hasActiveSub) {
            try {
                const resRevoke = await callFunction('admin-update-user', {
                    target_user_id: userId,
                    action: 'revoke_paid_subscription',
                }, token);
                if (resRevoke.ok && user?.subscriptions) {
                    user.subscriptions.forEach(s => {
                        if (s.status === 'active' || s.status === 'trialing') s.status = 'canceled';
                    });
                }
            } catch (_) { /* sub pode já estar inativa */ }
            allSubs = []; // força recarregamento na próxima visita à seção de assinaturas
        }

        renderUsersTable();
        updateUserStats();
        showToast('Conta bloqueada com sucesso.', 'success');

        // 3. Oferecer reembolso via modal (apenas se tinha sub Stripe ativa)
        if (hasActiveSub) {
            if (allSubs.length === 0) await loadSubscriptions();
            const sub = allSubs.find(s => s.user_id === userId);
            _blockRefundUserId      = userId;
            _blockRefundUserEmail   = sub?.userEmail || userName;
            _blockRefundAmountCents = sub?.last_invoice_amount_cents ?? null;
            document.getElementById('blockRefundUserName').textContent = userName;
            openModal('blockRefundModal');
        }
    } catch (err) { showToast('Erro: ' + err.message, 'error'); }
}

function handleBlockRefundYes() {
    closeModal('blockRefundModal');
    showSection('subscriptions');
    openRefundModal(_blockRefundUserId, _blockRefundUserEmail, _blockRefundAmountCents);
}

async function unblockAccount(userId) {
    const u = allUsers.find(x => x.id === userId);
    const userName = u?.full_name || u?.email || userId;

    // Calculate remaining ms at block time to show in confirmation
    const hasStoredPeriod  = u?.blocked_sub_period_end && u?.blocked_sub_plan_id && u?.blocked_at;
    const isUnlimitedAccess = !!u?.blocked_sub_plan_id && !u?.blocked_sub_period_end;
    let remainingDaysStr = null;
    if (isUnlimitedAccess) {
        remainingDaysStr = 'ilimitado';
    } else if (hasStoredPeriod) {
        const remainingMs = new Date(u.blocked_sub_period_end).getTime() - new Date(u.blocked_at).getTime();
        if (remainingMs > 0) {
            const days = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
            remainingDaysStr = `${days} dia${days !== 1 ? 's' : ''}`;
        }
    }
    const msg = remainingDaysStr === 'ilimitado'
        ? `Desbloquear a conta de ${userName}?\n\nO acesso ilimitado ao plano anterior será concedido.`
        : remainingDaysStr
            ? `Desbloquear a conta de ${userName}?\n\nO acesso ao plano anterior será concedido por ${remainingDaysStr} a partir de hoje.`
            : `Desbloquear a conta de ${userName}?`;
    showConfirmModal('Desbloquear Conta', msg, async () => {
    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('admin-update-user', {
            target_user_id: userId,
            action: 'unblock_account',
        }, session.data.session.access_token);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro');

        const user = allUsers.find(u => u.id === userId);
        if (user) {
            user.is_blocked = false;
            user.blocked_at = null;
            user.blocked_sub_period_end = null;
            user.blocked_sub_plan_id    = null;
            if (data.free_access_restored) {
                user.free_access            = true;
                user.free_access_plan_id    = data.free_access_plan_id;
                user.free_access_expires_at = data.free_access_expires_at;
                user.subscription_tier      = 'paid';
            }
        }
        renderUsersTable();
        updateUserStats();
        const msg2 = data.free_access_restored
            ? data.free_access_expires_at
                ? `Conta desbloqueada. Acesso ao plano retomado até ${new Date(data.free_access_expires_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`
                : 'Conta desbloqueada. Acesso ilimitado ao plano retomado.'
            : 'Conta desbloqueada com sucesso.';
        showToast(msg2, 'success');
    } catch (err) { showToast('Erro: ' + err.message, 'error'); }
    }, 'Desbloquear', 'btn-primary');
}

// ─── Revoke Paid Subscription ────────────────────────────────

async function revokePaidSubscription(userId) {
    const u = allUsers.find(x => x.id === userId);
    const userName = u?.full_name || u?.email || userId;
    showConfirmModal('Revogar Plano Pago', `Revogar o plano pago de ${userName}? A assinatura será cancelada imediatamente no Stripe.`, async () => {
    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('admin-update-user', {
            target_user_id: userId,
            action: 'revoke_paid_subscription',
        }, session.data.session.access_token);
        if (!res.ok) { const b = await res.json(); throw new Error(b.error || 'Erro'); }
        const user = allUsers.find(u => u.id === userId);
        if (user) {
            user.subscription_tier = 'free';
            if (user.subscriptions) {
                user.subscriptions.forEach(s => {
                    if (s.status === 'active' || s.status === 'trialing') s.status = 'canceled';
                });
            }
        }
        renderUsersTable();
        updateUserStats();
        showToast('Plano pago revogado com sucesso.', 'success');
    } catch (err) { showToast('Erro: ' + err.message, 'error'); }
    });
}

// ─── Refund ──────────────────────────────────────────────────

async function openRefundModal(userId, userName, lastAmountCents) {
    selectedUserId   = userId;
    selectedUserName = userName;

    const loadingOverlay = document.getElementById('refundLoadingOverlay');
    const bodyContent    = document.getElementById('refundBodyContent');

    // Mostrar spinner no centro do card, ocultar conteúdo
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    if (bodyContent)    bodyContent.style.display    = 'none';

    document.getElementById('refundAmount').value = '';
    openModal('refundModal');

    // Carregar dados do Stripe em paralelo com a abertura do modal
    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('admin-update-user', {
            target_user_id: userId,
            action: 'get_charge_info',
        }, session.data.session.access_token);
        const body = await res.json();

        // Preencher conteúdo
        document.getElementById('refundUserName').textContent = userName;
        const hint     = document.getElementById('refundLastAmountHint');
        const infoHint = document.getElementById('refundInfoHint');
        // refundLastAmountHint fica oculto — a API já inclui o valor total no infoHint
        if (hint) hint.style.display = 'none';
        if (infoHint) {
            const total     = (res.ok && body.amount_cents != null) ? body.amount_cents : 0;
            const refunded  = (res.ok && body.amount_refunded_cents != null) ? body.amount_refunded_cents : 0;
            const available = total - refunded;
            const fmt = v => `R$ ${(v / 100).toFixed(2).replace('.', ',')}`;
            infoHint.innerHTML = [
                `Último pagamento: <strong>${fmt(total)}</strong>`,
                `Já reembolsado: <strong>${fmt(refunded)}</strong>`,
                `Disponível para reembolso: <strong>${fmt(available)}</strong>`,
            ].join('<br>');
            infoHint.style.display = 'block';
        }
    } catch (_) {
        document.getElementById('refundUserName').textContent = userName;
        const hint = document.getElementById('refundLastAmountHint');
        if (hint && lastAmountCents) {
            hint.textContent = `Último pagamento: R$ ${(lastAmountCents / 100).toFixed(2).replace('.', ',')}`;
            hint.style.display = '';
        }
        const infoHint = document.getElementById('refundInfoHint');
        if (infoHint) infoHint.style.display = 'none';
    }

    // Ocultar spinner e exibir conteúdo
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    if (bodyContent)    bodyContent.style.display    = '';
}

async function submitRefund() {
    const amountStr = document.getElementById('refundAmount').value.trim();
    const amount = amountStr ? parseFloat(amountStr.replace(',', '.')) : undefined;

    if (amount !== undefined && (isNaN(amount) || amount <= 0)) {
        showToast('Valor de reembolso inválido.', 'error');
        return;
    }

    const btn = document.getElementById('refundConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'Processando…';

    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('admin-update-user', {
            target_user_id: selectedUserId,
            action: 'refund',
            amount: amount,
        }, session.data.session.access_token);

        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Erro');

        closeModal('refundModal');
        const refundedAmount = (body.amount / 100).toFixed(2).replace('.', ',');
        showToast(`Reembolso de R$ ${refundedAmount} processado com sucesso.`, 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Reembolsar';
    }
}

// ─── Free Access ─────────────────────────────────────────────

async function openFreeAccessModal(userId, userName) {
    selectedUserId   = userId;
    selectedUserName = userName;
    document.getElementById('freeAccessUserName').textContent = userName;
    document.getElementById('freeAccessExpiresAt').value = '';
    // Prevent selecting past dates (Item 1)
    document.getElementById('freeAccessExpiresAt').min = new Date().toISOString().split('T')[0];

    // Ensure plans are loaded (not loaded if Plans section was never visited)
    if (allPlans.length === 0) await loadPlans();

    // Populate plan select from loaded plans (exclude free plans, sorted alphabetically)
    const select = document.getElementById('freeAccessPlanSelect');
    const paidPlans = allPlans
        .filter(p => !p.is_free && !p.is_archived && p.is_active)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (paidPlans.length > 0) {
        select.innerHTML = paidPlans.map(p =>
            `<option value="${p.id}">${escHtml(p.name)}</option>`
        ).join('');
    } else {
        select.innerHTML = '<option value="">Nenhum plano pago disponível</option>';
    }

    openModal('freeAccessModal');
}

async function confirmFreeAccess() {
    const planId    = document.getElementById('freeAccessPlanSelect').value;
    // Convert YYYY-MM-DD to end-of-day in BRT so the day itself is still valid (Item 2)
    const expiresAtRaw = document.getElementById('freeAccessExpiresAt').value || null;
    if (expiresAtRaw) {
        const today = new Date().toISOString().split('T')[0];
        if (expiresAtRaw < today) {
            showToast('A data de expiração não pode ser anterior ao dia atual.', 'error');
            return;
        }
    }
    const expiresAt    = expiresAtRaw ? expiresAtRaw + 'T23:59:59.999-03:00' : null;
    if (!planId) { showToast('Selecione um plano.', 'error'); return; }
    const btn  = document.getElementById('freeAccessConfirmBtn');

    btn.disabled = true;
    btn.textContent = 'A processar…';

    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('admin-update-user', {
            target_user_id: selectedUserId,
            action: 'grant_free_access',
            free_access_plan_id: planId,
            free_access_expires_at: expiresAt,
        }, session.data.session.access_token);

        if (!res.ok) {
            const body = await res.json();
            throw new Error(body.error || 'Erro desconhecido');
        }

        // Update local state
        const user = allUsers.find(u => u.id === selectedUserId);
        if (user) {
            user.free_access          = true;
            user.free_access_plan_id  = planId;
            user.free_access_expires_at = expiresAt || null;
            user.subscription_tier    = 'paid';
        }

        closeModal('freeAccessModal');
        renderUsersTable();
        updateUserStats();
        const planName = planNameById(planId);
        showToast(`Acesso gratuito (${planName}) concedido com sucesso!`, 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirmar';
    }
}

async function revokeFreeAccess(userId) {
    const u = allUsers.find(x => x.id === userId);
    const userName = u?.full_name || u?.email || userId;
    showConfirmModal('Revogar Acesso Gratuito', `Revogar acesso gratuito de ${userName}?`, async () => {

    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('admin-update-user', {
            target_user_id: userId,
            action: 'revoke_free_access',
        }, session.data.session.access_token);

        if (!res.ok) {
            const body = await res.json();
            throw new Error(body.error || 'Erro desconhecido');
        }

        const data = await res.json();
        const user = allUsers.find(u => u.id === userId);
        if (user) {
            if (data.has_remaining_days) {
                // User gets remaining days from the subscription canceled when free_access was granted
                user.free_access            = true;
                user.free_access_plan_id    = data.plan_id || user.free_access_plan_id;
                user.free_access_granted_by = null;
                user.free_access_expires_at = data.expires_at;
                user.subscription_tier      = 'paid';
            } else {
                user.free_access            = false;
                user.free_access_plan_id    = null;
                user.free_access_expires_at = null;
                user.subscription_tier      = 'free';
            }
        }

        renderUsersTable();
        updateUserStats();
        const msg = data.has_remaining_days
            ? `Acesso gratuito revogado. Usuário mantém acesso até ${new Date(data.expires_at).toLocaleDateString('pt-BR', {timeZone:'America/Sao_Paulo'})}.`
            : 'Acesso gratuito revogado.';
        showToast(msg, 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
    });
}

// Corrige estado inconsistente: free_access=true mas subscription_tier='free'
// Chama grant_free_access com o plano já existente para restaurar subscription_tier='paid'
async function repairFreeAccess(userId) {
    const u = allUsers.find(x => x.id === userId);
    if (!u?.free_access_plan_id) {
        // Sem plano salvo — apenas revogar para limpar o estado
        await revokeFreeAccess(userId);
        return;
    }
    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('admin-update-user', {
            target_user_id: userId,
            action: 'grant_free_access',
            free_access_plan_id: u.free_access_plan_id,
            free_access_expires_at: u.free_access_expires_at || null,
        }, session.data.session.access_token);
        if (!res.ok) {
            const body = await res.json();
            throw new Error(body.error || 'Erro desconhecido');
        }
        const user = allUsers.find(x => x.id === userId);
        if (user) user.subscription_tier = 'paid';
        renderUsersTable();
        updateUserStats();
        const planName = planNameById(u.free_access_plan_id);
        showToast(`Acesso inconsistente corrigido para o plano ${planName}.`, 'success');
    } catch (err) {
        showToast('Erro ao corrigir: ' + err.message, 'error');
    }
}

// ─── Role change ──────────────────────────────────────────────

function openRoleModal(userId, userName, currentRole) {
    selectedUserId   = userId;
    selectedUserName = userName;
    document.getElementById('roleModalUserName').textContent = userName;
    document.getElementById('roleSelectInput').value = currentRole;
    openModal('roleModal');
}

async function confirmRoleChange() {
    const newRole = document.getElementById('roleSelectInput').value;

    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('admin-update-user', {
            target_user_id: selectedUserId,
            action: 'update_role',
            role: newRole,
        }, session.data.session.access_token);

        if (!res.ok) {
            const body = await res.json();
            throw new Error(body.error || 'Erro desconhecido');
        }

        const user = allUsers.find(u => u.id === selectedUserId);
        if (user) user.role = newRole;

        closeModal('roleModal');
        renderUsersTable();
        showToast('Função atualizada com sucesso!', 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
}

// ─────────────────────────────────────────────────────────────
// ██  PLANS SECTION  ██
// ─────────────────────────────────────────────────────────────

async function loadPlans() {
    document.getElementById('plansContainer').innerHTML =
        `<div class="empty-state"><p class="empty-state-text">Carregando planos…</p></div>`;

    const { data, error } = await supabase
        .from('plans')
        .select('*')
        .order('display_order', { ascending: true });

    if (error) {
        showToast('Erro ao carregar planos: ' + error.message, 'error');
        return;
    }

    allPlans = data || [];
    renderPlans();
}

let showArchivedPlans = false;

function toggleArchivedPlans() {
    showArchivedPlans = !showArchivedPlans;
    const btn = document.getElementById('toggleArchivedBtn');
    if (btn) btn.textContent = showArchivedPlans ? 'Ver ativos' : 'Ver arquivados';
    renderPlans();
}

function renderPlans() {
    const container = document.getElementById('plansContainer');
    const q = (document.getElementById('planSearch')?.value || '').toLowerCase();
    const visible = allPlans.filter(p => {
        if (!!p.is_archived !== showArchivedPlans) return false;
        if (q && !(p.name || '').toLowerCase().includes(q) && !(p.description || '').toLowerCase().includes(q)) return false;
        return true;
    });

    if (visible.length === 0) {
        const msg = showArchivedPlans ? 'Nenhum plano arquivado' : 'Nenhum plano encontrado';
        container.innerHTML = `<div class="empty-state"><p class="empty-state-text">${msg}</p>${!showArchivedPlans ? '<p class="empty-state-sub">Clique em "+ Criar Plano" para começar.</p>' : ''}</div>`;
        return;
    }

    const sortVal = document.getElementById('planSortSelect')?.value || 'default';
    const sorted = [...visible].sort((a, b) => {
        if (sortVal === 'name-asc')   return (a.name || '').localeCompare(b.name || '');
        if (sortVal === 'name-desc')  return (b.name || '').localeCompare(a.name || '');
        if (sortVal === 'price-asc')  return (parseFloat(a.price_brl) || 0) - (parseFloat(b.price_brl) || 0);
        if (sortVal === 'price-desc') return (parseFloat(b.price_brl) || 0) - (parseFloat(a.price_brl) || 0);
        if (sortVal === 'updated-desc') return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
        if (sortVal === 'updated-asc')  return new Date(a.updated_at || 0) - new Date(b.updated_at || 0);
        if (sortVal === 'created-desc') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        if (sortVal === 'created-asc')  return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    container.innerHTML = `<div class="plans-grid">${sorted.map(buildPlanCard).join('')}</div>`;
}

function buildPlanCard(p) {
    const priceBrl = p.price_brl != null ? parseFloat(p.price_brl) : 0;
    const price    = `R$ ${priceBrl.toFixed(2).replace('.', ',')}`;
    const status   = p.is_archived
        ? `<span class="badge badge-canceled">Arquivado</span>`
        : p.is_active
            ? `<span class="badge badge-active">Ativo</span>`
            : `<span class="badge badge-canceled">Inativo</span>`;

    const limitText = p.monthly_limit
        ? `<div style="font-size:11px;color:var(--text-dim);margin-top:4px;">${p.monthly_limit} processamentos/mês</div>`
        : '';

    const screensText = (p.unlocked_screens || []).length > 0
        ? `<div style="font-size:11px;color:var(--text-dim);margin-top:2px;">Telas: ${(p.unlocked_screens || []).map(id => {
            const s = AVAILABLE_SCREENS.find(s => s.id === id);
            return s ? s.name : id;
          }).join(', ')}</div>`
        : '';

    // Annual pricing info
    const annualInfo = p.annual_price_brl
        ? `<div style="font-size:11px;color:var(--primary);margin-top:4px;">Anual: R$ ${parseFloat(p.annual_price_brl).toFixed(2).replace('.', ',')} /ano (R$ ${(parseFloat(p.annual_price_brl)/12).toFixed(2).replace('.', ',')} /mês)</div>`
        : (!p.is_free ? `<div style="font-size:11px;color:var(--primary);margin-top:4px;">Apenas mensal</div>` : '');

    let footerActions = '';
    if (p.is_free) {
        // Free plan: only edit, no delete/deactivate/archive
        footerActions = `
            <button class="btn btn-sm btn-secondary" onclick="openEditPlanModal('${p.id}')">Editar</button>`;
    } else if (p.is_archived) {
        footerActions = `
            <button class="btn btn-sm btn-success" onclick="archivePlan('${p.id}', false)">Desarquivar</button>
            <button class="btn btn-sm btn-danger" onclick="deletePlan('${p.id}', '${escHtml(p.name)}')">Excluir</button>`;
    } else {
        const toggleLabel = p.is_active ? 'Desativar' : 'Ativar';
        const toggleClass = p.is_active ? 'btn-danger' : 'btn-success';
        const archiveBtn  = !p.is_active
            ? `<button class="btn btn-sm btn-secondary" onclick="archivePlan('${p.id}', true)">Arquivar</button>`
            : '';
        footerActions = `
            <button class="btn btn-sm btn-secondary" onclick="openEditPlanModal('${p.id}')">Editar</button>
            <button class="btn btn-sm ${toggleClass}" onclick="togglePlan('${p.id}', ${p.is_active})">${toggleLabel}</button>
            ${archiveBtn}`;
    }

    return `
    <div class="plan-card">
        <div class="plan-card-header">
            <div>
                <div class="plan-name">${escHtml(p.name)}</div>
            </div>
            ${status}
        </div>
        <div class="plan-price">${price} <span>/mês</span></div>
        ${annualInfo}
        <div class="plan-description">${escHtml(p.description || '—')}</div>
        ${limitText}
        ${screensText}
        <div class="plan-card-footer">
            <div style="display:flex;gap:6px;flex-wrap:wrap;">${footerActions}</div>
        </div>
    </div>`;
}

async function submitCreatePlan() {
    const name        = document.getElementById('planName').value.trim();
    const description = document.getElementById('planDescription').value.trim();
    const price       = parseFloat(document.getElementById('planPrice').value);
    const observation = document.getElementById('planObservation').value.trim();
    const monthlyLimitRaw = document.getElementById('planMonthlyLimit').value;
    const monthlyLimit = monthlyLimitRaw ? parseInt(monthlyLimitRaw) : null;
    const unlockedScreens = [...document.querySelectorAll('#planScreensCreate .screen-check-input:checked')]
        .map(el => el.value);
    const createAnnual = document.getElementById('createAnnualToo')?.checked;
    const annualMonthly = createAnnual ? parseFloat(document.getElementById('planAnnualPrice').value) : null;
    const annualObs    = createAnnual ? document.getElementById('planAnnualObservation').value.trim() : '';

    if (!name || isNaN(price) || price <= 0) {
        showToast('Preencha nome e preço corretamente.', 'error');
        return;
    }
    if (createAnnual && (isNaN(annualMonthly) || annualMonthly <= 0)) {
        showToast('Preencha o preço mensal da versão anual corretamente.', 'error');
        return;
    }

    const btn = document.getElementById('createPlanBtn');
    btn.disabled = true;
    btn.textContent = 'Criando…';

    try {
        const session = await supabase.auth.getSession();
        const token = session.data.session.access_token;

        // Create single plan with optional annual pricing
        const payload = {
            name, description, price_brl: price,
            observation, monthly_limit: monthlyLimit, unlocked_screens: unlockedScreens,
        };
        if (createAnnual) {
            payload.annual_price_brl = Math.round(annualMonthly * 12 * 100) / 100; // total anual
            payload.annual_observation = annualObs;
        }

        const res = await callFunction('admin-create-plan', payload, token);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Erro ao criar plano');
        allPlans.push(body.plan);

        renderPlans();
        closeModal('createPlanModal');
        clearPlanForm();
        showToast('Plano criado com sucesso!', 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Criar';
    }
}

function toggleAnnualPriceFields() {
    const fields   = document.getElementById('annualPriceFields');
    const checkbox = document.getElementById('createAnnualToo');
    if (fields && checkbox) fields.style.display = checkbox.checked ? '' : 'none';
}

function toggleEditAnnualFields() {
    const fields   = document.getElementById('editAnnualFields');
    const checkbox = document.getElementById('editAnnualToggle');
    if (fields && checkbox) fields.style.display = checkbox.checked ? '' : 'none';
}

function updateAnnualHelper(inputId, helperId) {
    const val  = parseFloat(document.getElementById(inputId)?.value);
    const el   = document.getElementById(helperId);
    if (!el) return;
    if (val > 0) {
        const total = (val * 12).toFixed(2).replace('.', ',');
        el.textContent = `Equivalente mensal ao cobrar anualmente. Total anual = R$ ${total}`;
    } else {
        el.textContent = 'Equivalente mensal ao cobrar anualmente.';
    }
}

// ── Build screen checkboxes ───────────────────────────────────
function buildScreenCheckboxes(containerId, selectedIds = []) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = AVAILABLE_SCREENS.map(s => `
        <label class="screen-check-item">
            <input type="checkbox" class="screen-check-input" value="${s.id}"
                ${selectedIds.includes(s.id) ? 'checked' : ''} />
            <div class="screen-check-info">
                <span class="screen-check-name">${escHtml(s.name)}</span>
                <span class="screen-check-desc">${escHtml(s.description)}</span>
            </div>
        </label>`).join('');
}

// ── Edit plan ─────────────────────────────────────────────────
function openEditPlanModal(planId) {
    const p = allPlans.find(x => x.id === planId);
    if (!p) return;

    document.getElementById('editPlanId').value           = p.id;
    document.getElementById('editPlanName').value         = p.name;
    document.getElementById('editPlanDescription').value  = p.description || '';
    document.getElementById('editPlanPrice').value        = parseFloat(p.price_brl || 0).toFixed(2);
    document.getElementById('editPlanMonthlyLimit').value = p.monthly_limit || '';
    document.getElementById('editPlanObservation').value  = p.observation || '';

    // Annual fields — checkbox toggle
    const hasAnnual = !!p.annual_price_brl;
    const annualToggle = document.getElementById('editAnnualToggle');
    const annualFields = document.getElementById('editAnnualFields');
    if (annualToggle) annualToggle.checked = hasAnnual;
    if (annualFields) annualFields.style.display = hasAnnual ? '' : 'none';

    const annualPriceEl = document.getElementById('editPlanAnnualPrice');
    const annualObsEl   = document.getElementById('editPlanAnnualObservation');
    if (annualPriceEl) annualPriceEl.value = p.annual_price_brl ? (parseFloat(p.annual_price_brl) / 12).toFixed(2) : '';
    if (annualObsEl)   annualObsEl.value   = p.annual_observation || '';

    // Update helper text with calculated value
    if (annualPriceEl?.value) updateAnnualHelper('editPlanAnnualPrice', 'editAnnualHelper');

    // Free plan: lock price and annual section
    const isFree = !!p.is_free;
    document.getElementById('editPlanPrice').disabled = isFree;
    const annualSection = document.getElementById('editAnnualSection');
    if (annualSection) annualSection.style.display = isFree ? 'none' : '';

    buildScreenCheckboxes('planScreensEdit', p.unlocked_screens || []);
    openModal('editPlanModal');
}

async function submitEditPlan() {
    const id            = document.getElementById('editPlanId').value;
    const name          = document.getElementById('editPlanName').value.trim();
    const description   = document.getElementById('editPlanDescription').value.trim();
    const observation   = document.getElementById('editPlanObservation').value.trim();
    const limitRaw      = document.getElementById('editPlanMonthlyLimit').value;
    const monthly_limit = limitRaw ? parseInt(limitRaw) : null;
    const price_brl_raw = document.getElementById('editPlanPrice').value;
    const price_brl     = price_brl_raw !== '' ? parseFloat(price_brl_raw) : undefined;
    const unlocked_screens = [...document.querySelectorAll('#planScreensEdit .screen-check-input:checked')]
        .map(el => el.value);

    // Annual fields — only if checkbox is checked
    const annualEnabled  = document.getElementById('editAnnualToggle')?.checked;
    const annualPriceRaw = annualEnabled ? document.getElementById('editPlanAnnualPrice')?.value : '';
    const annualMonthly  = annualPriceRaw ? parseFloat(annualPriceRaw) : null;
    const annual_price_brl = annualMonthly ? Math.round(annualMonthly * 12 * 100) / 100 : null;
    const annual_observation = annualEnabled ? (document.getElementById('editPlanAnnualObservation')?.value.trim() || '') : '';

    if (!name) { showToast('Nome é obrigatório.', 'error'); return; }
    if (annualEnabled && (isNaN(annualMonthly) || !annualMonthly || annualMonthly <= 0)) {
        showToast('Preencha o preço mensal da versão anual corretamente.', 'error');
        return;
    }

    const btn = document.getElementById('editPlanBtn');
    btn.disabled    = true;
    btn.textContent = 'Salvando…';

    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('admin-update-plan', {
            action: 'edit',
            plan_id: id,
            name, description, observation, monthly_limit, unlocked_screens,
            ...(price_brl !== undefined && !isNaN(price_brl) ? { price_brl } : {}),
            annual_price_brl,
            annual_observation,
        }, session.data.session.access_token);

        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Erro ao salvar plano');

        // Update local state
        const idx = allPlans.findIndex(p => p.id === id);
        if (idx !== -1) allPlans[idx] = body.plan;

        renderPlans();
        closeModal('editPlanModal');
        showToast('Plano atualizado com sucesso!', 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Salvar';
    }
}

// ── Delete plan ───────────────────────────────────────────────
async function deletePlan(planId, planName) {
    showConfirmModal('Excluir Plano', `Excluir o plano "${planName}" permanentemente?\n\nSó é possível excluir planos sem assinaturas ativas.`, async () => {

    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('admin-update-plan', {
            action: 'delete',
            plan_id: planId,
        }, session.data.session.access_token);

        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Erro ao excluir plano');

        allPlans = allPlans.filter(p => p.id !== planId);
        renderPlans();
        showToast('Plano excluído com sucesso.', 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
    });
}

async function togglePlan(planId, currentActive) {
    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('admin-update-plan', {
            action: 'toggle',
            plan_id: planId,
        }, session.data.session.access_token);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Erro ao alternar plano');

        const plan = allPlans.find(p => p.id === planId);
        if (plan) plan.is_active = !currentActive;

        renderPlans();
        showToast(`Plano ${!currentActive ? 'ativado' : 'desativado'}.`, 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
}

async function archivePlan(planId, archive) {
    const label = archive ? 'arquivar' : 'desarquivar';
    showConfirmModal(archive ? 'Arquivar Plano' : 'Desarquivar Plano', `Deseja ${label} este plano?`, async () => {

    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('admin-update-plan', {
            action: 'archive',
            plan_id: planId,
            archive,
        }, session.data.session.access_token);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || `Erro ao ${label} plano`);

        const plan = allPlans.find(p => p.id === planId);
        if (plan) { plan.is_archived = archive; if (archive) plan.is_active = false; }

        renderPlans();
        showToast(`Plano ${archive ? 'arquivado' : 'desarquivado'} com sucesso.`, 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
    });
}

function clearPlanForm() {
    ['planName', 'planDescription', 'planPrice', 'planMonthlyLimit', 'planObservation', 'planAnnualPrice', 'planAnnualObservation'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const cb = document.getElementById('createAnnualToo');
    if (cb) cb.checked = false;
    const fields = document.getElementById('annualPriceFields');
    if (fields) fields.style.display = 'none';
}

function openCreatePlanModal() {
    buildScreenCheckboxes('planScreensCreate', []);
    clearPlanForm();
    openModal('createPlanModal');
}

// ─────────────────────────────────────────────────────────────
// ██  SUBSCRIPTIONS SECTION  ██
// ─────────────────────────────────────────────────────────────

async function loadSubscriptions() {
    const tbody = document.getElementById('subsTableBody');
    tbody.innerHTML = buildLoadingRows(4, 6);

    const [subsResult, profilesResult] = await Promise.all([
        supabase.from('subscriptions').select('*, plans(name)').order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, email')
    ]);

    if (subsResult.error) {
        showToast('Erro ao carregar assinaturas: ' + subsResult.error.message, 'error');
        return;
    }

    const emailMap = {};
    (profilesResult.data || []).forEach(p => { emailMap[p.id] = p.email; });

    allSubs = (subsResult.data || []).map(s => ({ ...s, userEmail: emailMap[s.user_id] || s.user_id }));
    renderSubscriptionsTable();
}

function filterSubs() {
    const q      = (document.getElementById('subsSearch')?.value || '').toLowerCase();
    const status = document.getElementById('subsStatusFilter').value;
    const sort   = document.getElementById('subsSortSelect')?.value || 'default';

    let display = allSubs.filter(s => {
        const matchStatus = !status || s.status === status;
        const matchText   = !q || (s.userEmail || '').toLowerCase().includes(q) || (s.plans?.name || '').toLowerCase().includes(q);
        return matchStatus && matchText;
    });

    display = [...display].sort((a, b) => {
        if (sort === 'email-asc')   return (a.userEmail || '').localeCompare(b.userEmail || '');
        if (sort === 'email-desc')  return (b.userEmail || '').localeCompare(a.userEmail || '');
        if (sort === 'period-asc')  return new Date(a.current_period_end || 0) - new Date(b.current_period_end || 0);
        if (sort === 'period-desc') return new Date(b.current_period_end || 0) - new Date(a.current_period_end || 0);
        if (sort === 'created-asc') return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    renderSubscriptionsTable(display);
}

function renderSubscriptionsTable(list) {
    const display = list || allSubs;
    const tbody = document.getElementById('subsTableBody');

    // ── Count bar ──────────────────────────────────────────
    const countBar = document.getElementById('subsCountBar');
    if (countBar) {
        const activeCount   = display.filter(s => s.status === 'active').length;
        const waitingCount  = display.filter(s => s.status === 'trialing').length;
        const canceledCount = display.filter(s => s.status === 'canceled').length;
        const otherCount    = display.length - activeCount - waitingCount - canceledCount;
        const parts = [];
        if (activeCount)   parts.push(`<span style="color:#34d399;font-weight:600;">${activeCount} ativa${activeCount !== 1 ? 's' : ''}</span>`);
        if (waitingCount)  parts.push(`<span style="color:#f59e0b;font-weight:600;">${waitingCount} em espera</span>`);
        if (canceledCount) parts.push(`<span style="color:#f87171;font-weight:600;">${canceledCount} cancelada${canceledCount !== 1 ? 's' : ''}</span>`);
        if (otherCount)    parts.push(`<span>${otherCount} outro${otherCount !== 1 ? 's' : ''}</span>`);
        countBar.innerHTML = parts.length ? parts.join('<span style="color:var(--border)"> · </span>') + `<span style="margin-left:4px;">— total: ${display.length}</span>` : '';
    }

    if (display.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p class="empty-state-text">Nenhuma assinatura encontrada</p></div></td></tr>`;
        return;
    }

    tbody.innerHTML = display.map(s => {
        const planName    = s.plans?.name || '—';
        const periodEnd   = s.current_period_end ? new Date(s.current_period_end).toLocaleDateString('pt-BR') : '—';
        const cancelAtEnd = s.cancel_at_period_end ? '<span class="badge badge-warning">Sim</span>' : '<span style="color:var(--text-dim);font-size:12px;">Não</span>';
        const isActive    = s.status === 'active' || s.status === 'trialing';

        return `
        <tr>
            <td style="font-size:12px;">${escHtml(s.userEmail)}</td>
            <td>
                <div>${escHtml(planName)}</div>
            </td>
            <td><span class="badge badge-${s.status}">${statusLabel(s.status)}</span></td>
            <td style="font-size:12px;color:var(--text-muted);">${periodEnd}</td>
            <td>${cancelAtEnd}</td>
            <td>
                <div class="actions-cell">
                    ${(isActive && !s.cancel_at_period_end) ? `<button class="btn btn-sm btn-danger" onclick="openCancelSubModal('${s.id}', '${escHtml(s.userEmail)}')">Cancelar</button>` : ''}
                    ${isActive ? `<button class="btn btn-sm btn-danger" onclick="revokeSubImmediate('${s.id}')">Revogar</button>` : ''}
                    ${(s.stripe_subscription_id && s.last_invoice_amount_cents > 0) ? `<button class="btn btn-sm btn-secondary" onclick="openRefundModal('${s.user_id}', '${escHtml(s.userEmail)}', ${s.last_invoice_amount_cents})">Reembolsar</button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
}

function openCancelSubModal(subId, userName) {
    selectedSubId    = subId;
    document.getElementById('cancelSubUserName').textContent = userName;
    openModal('cancelSubModal');
}

async function confirmCancelSub() {
    const btn  = document.getElementById('cancelSubBtn');
    btn.disabled = true;
    btn.textContent = 'A cancelar…';

    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('cancel-subscription', {
            subscription_id: selectedSubId,
            cancel_at_period_end: true,
        }, session.data.session.access_token);

        if (!res.ok) {
            const body = await res.json();
            throw new Error(body.error || 'Erro ao cancelar');
        }

        closeModal('cancelSubModal');
        allSubs = [];
        await loadSubscriptions();
        showToast('Assinatura cancelada com sucesso.', 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirmar';
    }
}

function revokeSubImmediate(subId) {
    const sub = allSubs.find(s => s.id === subId);
    const userEmail = sub?.userEmail || subId;
    const existing = document.getElementById('revokeSubImmediateModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay open';
    modal.id = 'revokeSubImmediateModal';
    modal.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true">
            <div class="modal-header">
                <h3 class="modal-title">Revogar Plano</h3>
                <button class="modal-close-btn" onclick="document.getElementById('revokeSubImmediateModal').remove()">×</button>
            </div>
            <div class="modal-body">
                <p style="font-size:13px;color:var(--text-muted);">Revogar imediatamente o plano de <strong style="color:var(--text);">${escHtml(userEmail)}</strong>?</p>
                <div class="info-row warning" style="margin-top:10px;">Se a assinatura estiver ativa, será cancelada agora no Stripe. Esta ação não pode ser desfeita.</div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="document.getElementById('revokeSubImmediateModal').remove()">Cancelar</button>
                <button class="btn btn-danger" id="revokeSubImmediateBtn" onclick="_doRevokeSubImmediate('${subId}')">Revogar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

async function _doRevokeSubImmediate(subId) {
    const sub = allSubs.find(s => s.id === subId);
    const btn = document.getElementById('revokeSubImmediateBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'A revogar…'; }
    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('cancel-subscription', {
            subscription_id: subId,
            cancel_at_period_end: false,
        }, session.data.session.access_token);
        if (!res.ok) { const b = await res.json(); throw new Error(b.error || 'Erro ao revogar'); }
        // Update local state immediately
        if (sub) {
            sub.status = 'canceled';
            const user = allUsers.find(u => u.id === sub.user_id);
            if (user) {
                user.subscription_tier = 'free';
                if (user.subscriptions) {
                    user.subscriptions.forEach(s => { if (s.id === subId) s.status = 'canceled'; });
                }
            }
            renderUsersTable();
            updateUserStats();
        }
        allSubs = [];
        await loadSubscriptions();
        document.getElementById('revokeSubImmediateModal')?.remove();
        showToast('Plano revogado com sucesso.', 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Revogar'; }
    }
}

async function deleteSubscriptionRow(subId, userEmail) {
    showConfirmModal('Excluir Registro', `Excluir o registro de assinatura de ${userEmail}?\n\nEsta ação remove apenas o registro no banco. A assinatura já deve estar cancelada no Stripe.`, async () => {
    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('admin-update-user', {
            target_user_id: allSubs.find(s => s.id === subId)?.user_id || subId,
            action: 'delete_subscription',
            subscription_id: subId,
        }, session.data.session.access_token);
        if (!res.ok) { const b = await res.json(); throw new Error(b.error || 'Erro ao excluir'); }
        allSubs = allSubs.filter(s => s.id !== subId);
        renderSubscriptionsTable();
        showToast('Registro de assinatura excluído.', 'success');
    } catch (err) { showToast('Erro: ' + err.message, 'error'); }
    });
}

// ─────────────────────────────────────────────────────────────
// ██  COUPONS SECTION  ██
// ─────────────────────────────────────────────────────────────

async function loadCoupons() {
    document.getElementById('couponsContainer').innerHTML =
        `<div class="empty-state"><p class="empty-state-text">Carregando cupons…</p></div>`;

    const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        showToast('Erro ao carregar cupons: ' + error.message, 'error');
        return;
    }

    allCoupons = data || [];
    renderCoupons();
}

let showArchivedCoupons = false;

function toggleArchivedCoupons() {
    showArchivedCoupons = !showArchivedCoupons;
    const btn = document.getElementById('toggleArchivedCouponsBtn');
    if (btn) btn.textContent = showArchivedCoupons ? 'Ver ativos' : 'Ver arquivados';
    renderCoupons();
}

function renderCoupons() {
    const container = document.getElementById('couponsContainer');
    const q = (document.getElementById('couponSearch')?.value || '').toLowerCase();
    const visible = allCoupons.filter(c => {
        if (!!c.is_archived !== showArchivedCoupons) return false;
        if (q && !(c.code || '').toLowerCase().includes(q) && !(c.name || '').toLowerCase().includes(q)) return false;
        return true;
    });

    if (visible.length === 0) {
        const msg = showArchivedCoupons ? 'Nenhum cupom arquivado' : 'Nenhum cupom encontrado';
        container.innerHTML = `<div class="empty-state"><p class="empty-state-text">${msg}</p>${!showArchivedCoupons ? '<p class="empty-state-sub">Clique em "+ Criar Cupom" para começar.</p>' : ''}</div>`;
        return;
    }

    const sortVal = document.getElementById('couponSortSelect')?.value || 'default';
    const sorted = [...visible].sort((a, b) => {
        if (sortVal === 'code-asc')     return (a.code || '').localeCompare(b.code || '');
        if (sortVal === 'code-desc')    return (b.code || '').localeCompare(a.code || '');
        if (sortVal === 'value-asc')    return (parseFloat(a.discount_value) || 0) - (parseFloat(b.discount_value) || 0);
        if (sortVal === 'value-desc')   return (parseFloat(b.discount_value) || 0) - (parseFloat(a.discount_value) || 0);
        if (sortVal === 'updated-desc') return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
        if (sortVal === 'updated-asc')  return new Date(a.updated_at || 0) - new Date(b.updated_at || 0);
        if (sortVal === 'created-asc')  return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    container.innerHTML = `<div class="coupons-grid">${sorted.map(buildCouponCard).join('')}</div>`;
}

function buildCouponCard(c) {
    const discount = c.discount_type === 'percent'
        ? `${c.discount_value}% off`
        : `R$ ${parseFloat(c.discount_value).toFixed(2).replace('.', ',')} off`;

    const validade = c.redeem_by
        ? `Válido até ${new Date(c.redeem_by).toLocaleDateString('pt-BR')}`
        : 'Sem prazo';

    const limiteIndividual = c.max_redemptions_per_user
        ? `Limite individual: ${c.max_redemptions_per_user}/usuário`
        : '';

    const status = c.is_archived
        ? `<span class="badge badge-canceled">Arquivado</span>`
        : c.is_active
            ? `<span class="badge badge-active">Ativo</span>`
            : `<span class="badge badge-canceled">Inativo</span>`;

    let footerActions = '';
    if (c.is_archived) {
        footerActions = `
            <button class="btn btn-sm btn-success" onclick="archiveCoupon('${c.id}', false)">Desarquivar</button>
            <button class="btn btn-sm btn-danger" onclick="deleteCoupon('${c.id}', '${escHtml(c.code)}')">Excluir</button>`;
    } else {
        const toggleLabel = c.is_active ? 'Desativar' : 'Ativar';
        const toggleClass = c.is_active ? 'btn-danger' : 'btn-success';
        const archiveBtn = !c.is_active
            ? `<button class="btn btn-sm btn-secondary" onclick="archiveCoupon('${c.id}', true)">Arquivar</button>`
            : '';
        footerActions = `
            <button class="btn btn-sm btn-secondary" onclick="openEditCouponModal('${c.id}')">Editar</button>
            <button class="btn btn-sm ${toggleClass}" onclick="toggleCoupon('${c.id}', ${c.is_active})">${toggleLabel}</button>
            ${archiveBtn}`;
    }

    return `
    <div class="coupon-card">
        <div class="coupon-card-header">
            <div class="coupon-code-display">${escHtml(c.code)}</div>
            ${status}
        </div>
        <div class="coupon-discount">${discount}</div>
        <div class="coupon-meta">
            <span>Validade: ${validade}</span>
            <span>Duração: ${durationLabel(c.duration)}</span>
            ${c.times_redeemed != null ? `<span>Usos realizados: ${c.times_redeemed}</span>` : ''}
            ${c.max_redemptions ? `<span>Limite total: ${c.max_redemptions} usos</span>` : ''}
            ${limiteIndividual ? `<span>${limiteIndividual}</span>` : ''}
        </div>
        <div class="coupon-card-footer">
            <div style="display:flex;gap:6px;flex-wrap:wrap;">${footerActions}</div>
        </div>
    </div>`;
}

async function submitCreateCoupon() {
    const code            = document.getElementById('couponCode').value.trim().toUpperCase();
    const name            = document.getElementById('couponName').value.trim();
    const type            = document.getElementById('couponType').value;
    const value           = parseFloat(document.getElementById('couponValue').value);
    const duration        = document.getElementById('couponDuration').value;
    const durationMonths  = parseInt(document.getElementById('couponDurationMonths').value) || null;
    const maxRedemptions  = parseInt(document.getElementById('couponMaxRedemptions').value) || null;
    const maxPerUser      = parseInt(document.getElementById('couponMaxPerUser').value) || null;
    const redeemByRaw    = document.getElementById('couponRedeemBy').value || null;
    const redeemBy        = redeemByRaw ? redeemByRaw + 'T23:59:59-03:00' : null;

    const errors = [];
    if (!code) errors.push('Código é obrigatório');
    if (!name) errors.push('Nome é obrigatório');
    if (isNaN(value) || value <= 0) errors.push('Valor do desconto é obrigatório');
    if (type === 'percent' && value > 100) errors.push('Percentual não pode ser maior que 100');
    if (errors.length > 0) {
        showToast(errors.join('. ') + '.', 'error');
        return;
    }

    const btn = document.getElementById('createCouponBtn');
    btn.disabled = true;
    btn.textContent = 'Criando…';

    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('admin-update-coupon', {
            action: 'create',
            code, name, discount_type: type, discount_value: value,
            duration, duration_in_months: duration === 'repeating' ? durationMonths : null,
            max_redemptions: maxRedemptions,
            max_redemptions_per_user: maxPerUser,
            redeem_by: redeemBy,
        }, session.data.session.access_token);

        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Erro ao criar cupom');

        allCoupons.unshift(body.coupon);
        renderCoupons();
        closeModal('createCouponModal');
        clearCouponForm();
        showToast('Cupom criado com sucesso!', 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Criar no Stripe';
    }
}

function openEditCouponModal(couponId) {
    const c = allCoupons.find(x => x.id === couponId);
    if (!c) return;
    document.getElementById('editCouponId').value = c.id;
    document.getElementById('editCouponCode').value = c.code;
    document.getElementById('editCouponName').value = c.name || '';
    document.getElementById('editCouponType').value = c.discount_type;
    document.getElementById('editCouponValue').value = c.discount_value;
    toggleEditCouponTypeHint();
    document.getElementById('editCouponDuration').value = c.duration;
    toggleEditDurationMonths();
    if (c.duration === 'repeating' && c.duration_in_months) {
        document.getElementById('editCouponDurationMonths').value = c.duration_in_months;
    }
    const timesRedeemed = c.times_redeemed || 0;
    document.getElementById('editCouponTimesRedeemed').value = timesRedeemed;
    document.getElementById('editCouponTimesRedeemedDisplay').value = timesRedeemed;
    document.getElementById('editCouponMaxRedemptions').value = c.max_redemptions || '';
    document.getElementById('editCouponMaxPerUser').value = c.max_redemptions_per_user || '';
    // Use locale-aware date extraction to avoid UTC off-by-one (Item 12)
    document.getElementById('editCouponRedeemBy').value = c.redeem_by
        ? new Date(c.redeem_by).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
        : '';
    openModal('editCouponModal');
}

async function submitEditCoupon() {
    const id               = document.getElementById('editCouponId').value;
    const code             = document.getElementById('editCouponCode').value.trim().toUpperCase();
    const name             = document.getElementById('editCouponName').value.trim();
    const discountType     = document.getElementById('editCouponType').value;
    const discountValue    = parseFloat(document.getElementById('editCouponValue').value);
    const duration         = document.getElementById('editCouponDuration').value;
    const durationMonths   = parseInt(document.getElementById('editCouponDurationMonths').value) || null;
    const maxRedemptions   = parseInt(document.getElementById('editCouponMaxRedemptions').value) || null;
    const maxPerUser       = parseInt(document.getElementById('editCouponMaxPerUser').value) || null;
    const redeemByRaw     = document.getElementById('editCouponRedeemBy').value || null;
    const redeemBy         = redeemByRaw ? redeemByRaw + 'T23:59:59-03:00' : null;
    const timesRedeemed    = parseInt(document.getElementById('editCouponTimesRedeemed').value) || 0;

    const errors = [];
    if (!code) errors.push('Código é obrigatório');
    if (!name) errors.push('Nome é obrigatório');
    if (isNaN(discountValue) || discountValue <= 0) errors.push('Valor do desconto é obrigatório');
    if (discountType === 'percent' && discountValue > 100) errors.push('Percentual não pode ser maior que 100');
    if (maxRedemptions !== null && maxRedemptions < timesRedeemed) {
        errors.push(`Limite de usos não pode ser menor que ${timesRedeemed} (usos já realizados)`);
    }
    if (errors.length > 0) {
        showToast(errors.join('. ') + '.', 'error');
        return;
    }

    const btn = document.getElementById('editCouponBtn');
    btn.disabled = true;
    btn.textContent = 'Salvando…';

    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('admin-update-coupon', {
            action: 'edit',
            coupon_id: id,
            code, name,
            discount_type: discountType,
            discount_value: discountValue,
            duration,
            duration_in_months: duration === 'repeating' ? durationMonths : null,
            max_redemptions: maxRedemptions,
            max_redemptions_per_user: maxPerUser,
            redeem_by: redeemBy,
        }, session.data.session.access_token);

        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Erro ao editar cupom');

        // Update local data with returned coupon
        const idx = allCoupons.findIndex(c => c.id === id);
        if (idx !== -1 && body.coupon) {
            Object.assign(allCoupons[idx], body.coupon);
        }

        renderCoupons();
        closeModal('editCouponModal');
        showToast('Cupom atualizado.', 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar';
    }
}

async function toggleCoupon(couponId, currentActive) {
    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('admin-update-coupon', {
            action: 'toggle',
            coupon_id: couponId,
            is_active: !currentActive,
        }, session.data.session.access_token);

        if (!res.ok) {
            const body = await res.json();
            throw new Error(body.error || 'Erro ao atualizar cupom');
        }

        const coupon = allCoupons.find(c => c.id === couponId);
        if (coupon) coupon.is_active = !currentActive;

        renderCoupons();
        showToast(`Cupom ${!currentActive ? 'ativado' : 'desativado'}.`, 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
}

async function archiveCoupon(couponId, archive) {
    const label = archive ? 'arquivar' : 'desarquivar';
    showConfirmModal(archive ? 'Arquivar Cupom' : 'Desarquivar Cupom', `Deseja ${label} este cupom?`, async () => {

    try {
        const updates = archive
            ? { is_archived: true, is_active: false }
            : { is_archived: false };

        const session = await supabase.auth.getSession();
        const res = await callFunction('admin-update-coupon', {
            action: 'archive',
            coupon_id: couponId,
            is_archived: archive,
        }, session.data.session.access_token);

        if (!res.ok) {
            const body = await res.json();
            throw new Error(body.error || 'Erro ao atualizar cupom');
        }

        const coupon = allCoupons.find(c => c.id === couponId);
        if (coupon) { coupon.is_archived = archive; if (archive) coupon.is_active = false; }

        renderCoupons();
        showToast(`Cupom ${archive ? 'arquivado' : 'desarquivado'}.`, 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
    });
}

async function deleteCoupon(couponId, code) {
    showConfirmModal('Excluir Cupom', `Excluir o cupom "${code}" permanentemente?`, async () => {

    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('admin-update-coupon', {
            action: 'delete',
            coupon_id: couponId,
        }, session.data.session.access_token);

        if (!res.ok) {
            const body = await res.json();
            throw new Error(body.error || 'Erro ao excluir cupom');
        }

        allCoupons = allCoupons.filter(c => c.id !== couponId);
        renderCoupons();
        showToast('Cupom excluído.', 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
    });
}

function toggleCouponTypeHint() {
    const type  = document.getElementById('couponType').value;
    const label = document.getElementById('couponValueLabel');
    label.textContent = type === 'percent' ? 'Desconto (%)' : 'Desconto (R$)';
}

function toggleEditCouponTypeHint() {
    const type  = document.getElementById('editCouponType').value;
    const label = document.getElementById('editCouponValueLabel');
    label.textContent = type === 'percent' ? 'Desconto (%)' : 'Desconto (R$)';
}

function toggleDurationMonths() {
    const dur   = document.getElementById('couponDuration').value;
    const group = document.getElementById('couponDurationMonthsGroup');
    const input = document.getElementById('couponDurationMonths');
    if (dur === 'repeating') {
        group.style.display = '';
        input.type = 'number';
        input.readOnly = false;
        input.style.opacity = '';
        if (!input.value || input.value === '1') input.value = '3';
    } else if (dur === 'once') {
        group.style.display = '';
        input.type = 'text';
        input.value = '1';
        input.readOnly = true;
        input.style.opacity = '0.6';
    } else { // forever
        group.style.display = '';
        input.type = 'text';
        input.value = 'Ilimitado';
        input.readOnly = true;
        input.style.opacity = '0.6';
    }
}

function toggleEditDurationMonths() {
    const dur   = document.getElementById('editCouponDuration').value;
    const group = document.getElementById('editCouponDurationMonthsGroup');
    const input = document.getElementById('editCouponDurationMonths');
    if (dur === 'repeating') {
        group.style.display = '';
        input.type = 'number';
        input.readOnly = false;
        input.style.opacity = '';
        if (!input.value || input.value === '1') input.value = '3';
    } else if (dur === 'once') {
        group.style.display = '';
        input.type = 'text';
        input.value = '1';
        input.readOnly = true;
        input.style.opacity = '0.6';
    } else { // forever
        group.style.display = '';
        input.type = 'text';
        input.value = 'Ilimitado';
        input.readOnly = true;
        input.style.opacity = '0.6';
    }
}

function clearCouponForm() {
    ['couponCode', 'couponName', 'couponValue', 'couponMaxRedemptions', 'couponRedeemBy'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('couponMaxPerUser').value = '1';
    document.getElementById('couponType').value     = 'percent';
    document.getElementById('couponDuration').value = 'once';
    toggleDurationMonths();
    toggleCouponTypeHint();
}

// ─────────────────────────────────────────────────────────────
// ██  NOTIFICATIONS SECTION  ██
// ─────────────────────────────────────────────────────────────

async function loadNotifications() {
    document.getElementById('notificationsContainer').innerHTML =
        `<div class="empty-state"><p class="empty-state-text">Carregando notificações…</p></div>`;

    // Ensure plans are loaded so plan names can be resolved on notification cards
    if (allPlans.length === 0) await loadPlans();

    const { data, error } = await supabase
        .from('admin_notifications')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        showToast('Erro ao carregar notificações: ' + error.message, 'error');
        return;
    }

    allNotifications = data || [];
    filteredNotifications = [...allNotifications];
    renderNotifications();
}

function filterNotifications() {
    const status = document.getElementById('notifStatusFilter').value;
    const target = document.getElementById('notifTargetFilter').value;
    const q      = (document.getElementById('notifSearchInput')?.value || '').toLowerCase();

    filteredNotifications = allNotifications.filter(n => {
        const matchStatus = !status
            || (status === 'active' && n.is_active)
            || (status === 'inactive' && !n.is_active);
        const matchTarget = !target || n.target_type === target;
        const matchSearch = !q
            || (n.title || '').toLowerCase().includes(q)
            || (n.message || '').toLowerCase().includes(q);
        return matchStatus && matchTarget && matchSearch;
    });
    renderNotifications();
}

function renderNotifications() {
    const container = document.getElementById('notificationsContainer');

    if (filteredNotifications.length === 0) {
        container.innerHTML = `<div class="empty-state"><p class="empty-state-text">Nenhuma notificação encontrada</p><p class="empty-state-sub">Clique em "+ Criar Notificação" para começar.</p></div>`;
        return;
    }

    container.innerHTML = filteredNotifications.map(buildNotificationCard).join('');
}

function buildNotificationCard(n) {
    const date   = new Date(n.created_at).toLocaleDateString('pt-BR');
    const status = n.is_active
        ? `<span class="badge badge-active">Ativa</span>`
        : `<span class="badge badge-canceled">Inativa</span>`;

    const targetDesc = notifTargetDesc(n);

    const deleteBtn = !n.is_active
        ? `<button class="btn btn-sm btn-danger" onclick="deleteNotification('${n.id}')">Excluir</button>`
        : '';

    return `
    <div class="notification-card${n.is_active ? '' : ' notification-card--inactive'}">
        <div class="notification-card-header">
            <div style="flex:1;min-width:0;">
                <div class="notification-title">${escHtml(n.title)}</div>
                <div class="notification-meta">${targetDesc} · ${date}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
                ${status}
                <button class="btn btn-sm ${n.is_active ? 'btn-danger' : 'btn-success'}"
                    onclick="toggleNotification('${n.id}', ${n.is_active})">
                    ${n.is_active ? 'Desativar' : 'Ativar'}
                </button>
                ${deleteBtn}
            </div>
        </div>
        <div class="notification-message">${escHtml(n.message)}</div>
    </div>`;
}

function notifTargetDesc(n) {
    if (n.target_type === 'all')      return 'Todos os usuários';
    if (n.target_type === 'role')     return `Funções: ${(n.target_roles || []).map(roleLabel).join(', ') || '—'}`;
    if (n.target_type === 'tier' || n.target_type === 'plan') {
        const names = (n.target_tiers || []).map(t => {
            const p = allPlans.find(x => x.id === t);
            return p ? p.name : t;
        });
        return `Planos: ${names.join(', ') || '—'}`;
    }
    if (n.target_type === 'specific') return `${(n.target_user_ids || []).length} usuário(s) específico(s)`;
    return '—';
}

async function deleteNotification(id) {
    showConfirmModal('Excluir Notificação', 'Excluir esta notificação permanentemente?', async () => {
    try {
        const { error } = await supabase
            .from('admin_notifications')
            .delete()
            .eq('id', id);
        if (error) throw error;
        allNotifications = allNotifications.filter(x => x.id !== id);
        filteredNotifications = filteredNotifications.filter(x => x.id !== id);
        renderNotifications();
        showToast('Notificação excluída.', 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
    });
}

async function toggleNotification(id, currentActive) {
    try {
        const { error } = await supabase
            .from('admin_notifications')
            .update({ is_active: !currentActive })
            .eq('id', id);

        if (error) throw error;

        const n = allNotifications.find(x => x.id === id);
        if (n) n.is_active = !currentActive;

        filterNotifications();
        showToast(`Notificação ${!currentActive ? 'ativada' : 'desativada'}.`, 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
}

// ─── Create notification modal ────────────────────────────────

function openCreateNotificationModal() {
    // Populate user list
    populateNotifUserList();
    updateNotifTargetFields();
    openModal('createNotificationModal');
}

function populateNotifPlanCheckboxes() {
    const container = document.getElementById('notifPlanChecks');
    if (!container) return;
    const plans = allPlans.filter(p => p.is_active && !p.is_archived).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    container.innerHTML =
        plans.map(p =>
            `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;"><input type="checkbox" class="notif-tier-check" value="${escHtml(p.id)}" /> ${escHtml(p.name)}</label>`
        ).join('');
}

function updateNotifTargetFields() {
    const type = document.getElementById('notifTargetType').value;
    // Clear all sub-selections when switching type (Item 7)
    document.querySelectorAll('.notif-role-check, .notif-tier-check, .notif-user-check').forEach(el => el.checked = false);
    document.getElementById('notifRoleFields').style.display     = type === 'role'     ? '' : 'none';
    document.getElementById('notifTierFields').style.display     = type === 'tier'     ? '' : 'none';
    if (type === 'tier') populateNotifPlanCheckboxes();
    document.getElementById('notifSpecificFields').style.display = type === 'specific' ? '' : 'none';
}

function populateNotifUserList() {
    renderNotifUserList(allUsers);
}

function filterNotifUserList() {
    const q = (document.getElementById('notifUserSearch').value || '').toLowerCase();
    const filtered = q
        ? allUsers.filter(u =>
            (u.full_name || '').toLowerCase().includes(q) ||
            (u.email || '').toLowerCase().includes(q))
        : allUsers;
    renderNotifUserList(filtered);
}

function renderNotifUserList(users) {
    const container = document.getElementById('notifUserList');
    if (!container) return;

    if (users.length === 0) {
        container.innerHTML = `<p style="color:var(--text-dim);font-size:12px;padding:8px 0;">Nenhum usuário encontrado.</p>`;
        return;
    }

    container.innerHTML = users.slice(0, 100).sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '', 'pt-BR')).map(u => `
        <label class="notif-user-item">
            <input type="checkbox" class="notif-user-check" value="${u.id}" />
            <div class="notif-user-info">
                <span class="notif-user-name">${escHtml(u.full_name || u.email)} <span style="font-size:11px;opacity:.45;font-weight:400;">${tierLabel(u.subscription_tier)}</span></span>
                <span class="notif-user-email">${escHtml(u.email)}</span>
            </div>
        </label>`).join('');
}

// ── Resolve user IDs for notifications at send time ──────────
function resolveUserIdsForTiers(tierPlanIds) {
    const freePlan = allPlans.find(p => p.is_free);
    const freePlanId = freePlan?.id;
    return allUsers.filter(u => {
        const activeSub = (u.subscriptions || []).find(s => ['active', 'trialing'].includes(s.status));
        const userPlanId = activeSub?.plan_id || u.free_access_plan_id || (u.subscription_tier === 'free' ? freePlanId : null);
        return tierPlanIds.some(t => t === userPlanId);
    }).map(u => u.id);
}

function resolveUserIdsForRoles(roles) {
    return allUsers.filter(u => {
        const r = u.role || 'user';
        return roles.some(t => t === r || (t === 'admin' && r === 'super_admin'));
    }).map(u => u.id);
}

async function submitCreateNotification() {
    const title   = document.getElementById('notifTitle').value.trim();
    const message = document.getElementById('notifMessage').value.trim();
    const type    = document.getElementById('notifTargetType').value;

    if (!title || !message) {
        showToast('Preencha título e mensagem.', 'error');
        return;
    }

    let target_roles    = [];
    let target_tiers    = [];
    let target_user_ids = [];

    if (type === 'tier') {
        target_tiers = [...document.querySelectorAll('.notif-tier-check:checked')].map(el => el.value);
        if (target_tiers.length === 0) { showToast('Selecione ao menos um plano.', 'error'); return; }
        // Resolve matching user IDs at send time so notifications are immutable
        target_user_ids = resolveUserIdsForTiers(target_tiers);
    }
    if (type === 'role') {
        target_roles = [...document.querySelectorAll('.notif-role-check:checked')].map(el => el.value);
        if (target_roles.length === 0) { showToast('Selecione ao menos uma função.', 'error'); return; }
        // Resolve matching user IDs at send time so notifications are immutable
        target_user_ids = resolveUserIdsForRoles(target_roles);
    }
    if (type === 'specific') {
        target_user_ids = [...document.querySelectorAll('.notif-user-check:checked')].map(el => el.value);
        if (target_user_ids.length === 0) { showToast('Selecione ao menos um usuário.', 'error'); return; }
    }

    const btn = document.getElementById('createNotifBtn');
    btn.disabled = true;
    btn.textContent = 'Criando…';

    try {
        const { data, error } = await supabase
            .from('admin_notifications')
            .insert({
                title, message,
                target_type: type,
                target_roles, target_tiers, target_user_ids,
                created_by: currentProfile.id,
                show_popup: document.getElementById('notifShowPopup').checked,
            })
            .select()
            .single();

        if (error) throw error;

        allNotifications.unshift(data);
        filteredNotifications = [...allNotifications];
        filterNotifications();
        closeModal('createNotificationModal');
        clearNotifForm();
        showToast('Notificação criada com sucesso!', 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Criar Notificação';
    }
}

function clearNotifForm() {
    document.getElementById('notifTitle').value   = '';
    document.getElementById('notifMessage').value = '';
    document.getElementById('notifTargetType').value = 'all';
    document.getElementById('notifUserSearch').value = '';
    document.querySelectorAll('.notif-role-check, .notif-tier-check, .notif-user-check')
        .forEach(el => el.checked = false);
    document.getElementById('notifShowPopup').checked = true;
    updateNotifTargetFields();
}

// ─────────────────────────────────────────────────────────────
// ██  EDGE FUNCTION HELPER  ██
// ─────────────────────────────────────────────────────────────

async function callFunction(name, body, accessToken) {
    return fetch(`${SUPABASE_FUNCTIONS_URL}/${name}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(body),
    });
}

// ─────────────────────────────────────────────────────────────
// ██  MODAL  ██
// ─────────────────────────────────────────────────────────────

function openModal(id) {
    document.getElementById(id)?.classList.add('open');
}

function closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
}

function showConfirmModal(title, message, onConfirm, confirmLabel = 'Confirmar', confirmClass = 'btn-danger') {
    let modal = document.getElementById('genericConfirmModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'genericConfirmModal';
        modal.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
            <div class="modal-header"><h3 class="modal-title" id="gcmTitle"></h3><button class="modal-close-btn" onclick="closeModal('genericConfirmModal')">×</button></div>
            <div class="modal-body"><p id="gcmMessage" style="white-space:pre-wrap;word-break:break-word;"></p></div>
            <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal('genericConfirmModal')">Cancelar</button><button class="btn" id="gcmConfirmBtn"></button></div>
        </div>`;
        document.body.appendChild(modal);
    }
    document.getElementById('gcmTitle').textContent = title;
    document.getElementById('gcmMessage').textContent = message;
    const btn = document.getElementById('gcmConfirmBtn');
    btn.textContent = confirmLabel;
    btn.className = 'btn ' + confirmClass;
    btn.onclick = () => { closeModal('genericConfirmModal'); onConfirm(); };
    openModal('genericConfirmModal');
}

// Close on overlay click
document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('open');
    }
});

// Close on Escape
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    }
});

// ─────────────────────────────────────────────────────────────
// ██  TOAST  ██
// ─────────────────────────────────────────────────────────────

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = 'opacity .3s, transform .3s';
        setTimeout(() => toast.remove(), 320);
    }, 3500);
}

// ─────────────────────────────────────────────────────────────
// ██  HELPERS  ██
// ─────────────────────────────────────────────────────────────

async function renderAdminBlockedOverlay() {
    if (document.getElementById('adminBlockedOverlay')) return;
    let waUrl = 'https://wa.link/m1vm4f';
    try {
        const { data } = await supabase.from('site_settings').select('value').eq('key', 'phone').maybeSingle();
        if (data?.value) { const p = String(data.value).replace(/\D/g, ''); if (p) waUrl = `https://wa.me/${p}?text=${encodeURIComponent('Olá! Minha conta na Light Marketing foi bloqueada. Gostaria de entender o motivo e saber como resolver. Obrigado!')}`; }
    } catch(_){}
    const ov = document.createElement('div');
    ov.id = 'adminBlockedOverlay';
    ov.style.cssText = 'position:fixed;top:var(--header-height,60px);bottom:0;right:0;left:var(--sidebar-width,240px);z-index:90;background:rgba(10,10,10,0.96);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;';
    ov.innerHTML = `<div style="text-align:center;max-width:420px;padding:32px;">
        <div style="width:56px;height:56px;border-radius:50%;background:rgba(12,126,146,.12);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="10" rx="2" stroke="#0C7E92" stroke-width="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="#0C7E92" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <h3 style="font-family:Poppins,sans-serif;font-size:18px;font-weight:600;color:#fff;margin:0 0 8px;">Conta temporariamente bloqueada</h3>
        <p style="font-family:Poppins,sans-serif;font-size:14px;color:#aaa;margin:0 0 24px;">Entre em contato com o suporte para mais informações.</p>
        <a href="${waUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#0C7E92;color:#fff;text-decoration:none;border-radius:10px;padding:10px 24px;font-family:Poppins,sans-serif;font-size:14px;font-weight:500;">Falar com suporte</a>
    </div>`;
    document.body.appendChild(ov);
}

// ── Admin Notification Popup + Badge ─────────────────────────
async function checkAdminNotificationsPopup(userId, profile) {
    try {
        const { data: notifications, error: nErr } = await supabase
            .from('admin_notifications')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (nErr || !notifications || notifications.length === 0) return;

        const { data: reads } = await supabase
            .from('notification_reads')
            .select('notification_id')
            .eq('user_id', userId);

        const readIds = new Set((reads || []).map(r => r.notification_id));

        const unread = notifications.filter(n => {
            if (readIds.has(n.id)) return false;
            if (n.target_type === 'all') return true;
            if (n.target_type === 'role' || n.target_type === 'tier' || n.target_type === 'plan') {
                // Notifications are resolved at send time — check target_user_ids
                return (n.target_user_ids || []).includes(userId);
            }
            if (n.target_type === 'specific') return (n.target_user_ids || []).includes(userId);
            return false;
        });

        if (unread.length === 0) return;
        updateAdminNotifBadge(unread.length);
        const popupNotifs = unread.filter(n => n.show_popup !== false);
        if (popupNotifs.length > 0) showAdminNotificationPopup(popupNotifs, userId);
    } catch (_) { /* silent */ }
}

function updateAdminNotifBadge(count) {
    const avatar = document.getElementById('sidebarAvatar');
    if (avatar) {
        avatar.style.position = 'relative';
        let badge = avatar.querySelector('.notif-badge');
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'notif-badge';
                badge.style.cssText = 'position:absolute;top:-4px;right:-6px;background:#ef4444;color:#fff;font-size:9px;font-weight:700;min-width:17px;height:17px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 4px;pointer-events:none;z-index:1;border:2px solid #111;line-height:1;';
                avatar.appendChild(badge);
            }
            badge.textContent = count > 99 ? '99+' : count;
        } else if (badge) { badge.remove(); }
    }
}

function showAdminNotificationPopup(notifications, userId) {
    if (document.getElementById('notifPopupOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'notifPopupOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;';

    const n = notifications[0];
    overlay.innerHTML = `<div style="background:#161616;border:1px solid rgba(12,126,146,0.3);border-radius:16px;max-width:440px;width:100%;padding:32px 28px;text-align:center;position:relative;">
        <button onclick="closeNotifPopup('${userId}')" style="position:absolute;top:12px;right:12px;background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:4px 8px;">&times;</button>
        <div style="width:48px;height:48px;border-radius:50%;background:rgba(12,126,146,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="#0C7E92" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="#0C7E92" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <h3 style="font-family:Poppins,sans-serif;font-size:16px;font-weight:600;color:#fff;margin:0 0 8px;">${escHtml(n.title)}</h3>
        <p style="font-family:Poppins,sans-serif;font-size:13px;color:#aaa;margin:0 0 20px;line-height:1.5;">${escHtml(n.message)}</p>
        <button onclick="closeNotifPopup('${userId}')" style="background:#0C7E92;color:#fff;border:none;border-radius:10px;padding:10px 28px;font-family:Poppins,sans-serif;font-size:14px;font-weight:500;cursor:pointer;">Entendi</button>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeNotifPopup(userId); });
}

function closeNotifPopup(userId) {
    const overlay = document.getElementById('notifPopupOverlay');
    if (!overlay) return;
    overlay.remove();
    // Mark all popup notifications as read
    supabase.from('admin_notifications').select('id').eq('is_active', true).then(({ data }) => {
        if (data && data.length > 0) {
            const inserts = data.map(n => ({ user_id: userId, notification_id: n.id }));
            supabase.from('notification_reads').upsert(inserts, { onConflict: 'user_id,notification_id', ignoreDuplicates: true });
        }
    });
    updateAdminNotifBadge(0);
}

function escHtml(str) {
    return (str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getInitials(name, email) {
    if (name && name.trim()) {
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    }
    return email ? email.substring(0, 2).toUpperCase() : '?';
}

function tierLabel(tier) {
    if (tier === 'free') {
        const freePlan = allPlans.find(p => p.is_free);
        return freePlan ? freePlan.name : 'Gratuito';
    }
    return { paid: 'Pagante' }[tier] || tier || '—';
}

function planNameById(planId) {
    if (!planId) return '—';
    const p = allPlans.find(x => x.id === planId);
    return p ? p.name : '—';
}

function roleLabel(role) {
    return { user: 'Usuário', admin: 'Admin', super_admin: 'Admin' }[role] || role || '—';
}

function roleBadgeClass(role) {
    return { user: 'badge-user', admin: 'badge-admin', super_admin: 'badge-superadmin' }[role] || 'badge-user';
}

function statusLabel(s) {
    return { active: 'Ativa', canceled: 'Cancelada', past_due: 'Vencida', unpaid: 'Não Paga', trialing: 'Em espera', incomplete: 'Incompleta' }[s] || s;
}

function durationLabel(d) {
    return { once: 'Única vez', repeating: 'Repetido', forever: 'Para sempre' }[d] || d;
}

function buildLoadingRows(cols, count) {
    const row = `<tr>${Array.from({ length: cols }, () =>
        `<td><div class="skeleton" style="height:14px;width:80%;border-radius:4px;"></div></td>`
    ).join('')}</tr>`;
    return Array.from({ length: count }, () => row).join('');
}

/* ══════════════════════════════════════
   DADOS DO SITE (site_settings)
══════════════════════════════════════ */

const siteFieldMap = {
    company_name: 'siteCompanyName',
    cnpj:         'siteCnpj',
    phone:        'sitePhone',
    email:        'siteEmail',
    website:      'siteWebsite',
    street:       'siteStreet',
    number:       'siteNumber',
    complement:   'siteComplement',
    city:         'siteCity',
    state:        'siteState',
    zip:          'siteZip',
};

async function loadSiteSettings() {
    try {
        const { data, error } = await supabase
            .from('site_settings')
            .select('key, value');
        if (error) throw error;

        (data || []).forEach(row => {
            const inputId = siteFieldMap[row.key];
            if (inputId) {
                const el = document.getElementById(inputId);
                if (el) el.value = row.value || '';
            }
        });
    } catch (err) {
        console.error('Erro ao carregar dados do site:', err);
        showToast('Erro ao carregar dados do site', 'error');
    }
}

async function saveSiteSettings() {
    const btn = document.getElementById('btnSaveSiteData');
    btn.disabled = true;
    btn.textContent = 'Salvando…';

    try {
        const rows = Object.entries(siteFieldMap).map(([key, inputId]) => ({
            key,
            value: (document.getElementById(inputId)?.value || '').trim(),
            updated_at: new Date().toISOString(),
        }));

        const { error } = await supabase
            .from('site_settings')
            .upsert(rows, { onConflict: 'key' });
        if (error) throw error;

        showToast('Dados do site salvos com sucesso!', 'success');
    } catch (err) {
        console.error('Erro ao salvar dados do site:', err);
        showToast('Erro ao salvar dados do site', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar alterações';
    }
}
