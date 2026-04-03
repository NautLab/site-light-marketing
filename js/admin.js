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
        const initials = (profile.full_name || profile.email || '?')
            .split(' ')
            .slice(0, 2)
            .map(n => n[0])
            .join('')
            .toUpperCase();

        document.getElementById('sidebarAvatar').textContent = initials;
        document.getElementById('sidebarName').textContent   = profile.full_name || profile.email;
        document.getElementById('sidebarRole').textContent   = profile.role === 'super_admin' ? 'Super Admin' : 'Admin';

        // Hide super_admin option for non-super_admins in role modal
        if (profile.role !== 'super_admin') {
            const saOpt = document.getElementById('superAdminOption');
            if (saOpt) saOpt.remove();
        }

        // Show app
        document.getElementById('authLoading').style.display = 'none';
        document.getElementById('adminApp').style.display    = 'flex';

        // Load initial section data
        await loadUsers();

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
};

function showSection(name) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

    document.getElementById(`section-${name}`)?.classList.add('active');
    document.querySelector(`.nav-item[data-section="${name}"]`)?.classList.add('active');
    document.getElementById('topbarTitle').textContent = sectionTitles[name] || name;

    // Lazy-load section data
    if (name === 'plans' && allPlans.length === 0)               loadPlans();
    if (name === 'subscriptions' && allSubs.length === 0)         loadSubscriptions();
    if (name === 'coupons' && allCoupons.length === 0)            loadCoupons();
    if (name === 'notifications' && allNotifications.length === 0) loadNotifications();

    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        document.getElementById('adminSidebar').classList.remove('open');
    }
}

function toggleSidebar() {
    document.getElementById('adminSidebar').classList.toggle('open');
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

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        showToast('Erro ao carregar usuários: ' + error.message, 'error');
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p class="empty-state-text">Erro ao carregar usuários</p></div></td></tr>`;
        return;
    }

    allUsers = data || [];
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
    const basic      = base.filter(u => u.subscription_tier === 'basic').length;
    const premium    = base.filter(u => u.subscription_tier === 'premium').length;
    const freeAccess = allUsers.filter(u => u.free_access).length;

    document.getElementById('statTotal').textContent      = total;
    document.getElementById('statFree').textContent       = free;
    document.getElementById('statBasic').textContent      = basic;
    document.getElementById('statPremium').textContent    = premium;
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
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p class="empty-state-text">Nenhum usuário encontrado</p></div></td></tr>`;
        return;
    }

    tbody.innerHTML = page.map(u => buildUserRow(u)).join('');
}

function buildUserRow(u) {
    const initials = (u.full_name || u.email || '?')
        .split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();

    const tierBadge = `<span class="badge badge-${u.subscription_tier}">${tierLabel(u.subscription_tier)}</span>`;
    const roleBadge = `<span class="badge ${roleBadgeClass(u.role)}">${roleLabel(u.role)}</span>`;
    const giftBadge = u.free_access ? `<span class="badge badge-gift">${tierLabel(u.free_access_tier)}</span>` : `<span style="color:var(--text-dim);font-size:12px;">—</span>`;
    const date      = u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '—';

    const canEditRole = currentProfile.role === 'super_admin' || u.role !== 'super_admin';
    const isSelf      = u.id === currentProfile.id;

    const roleBtn = (!isSelf && canEditRole) ? `
        <button class="btn btn-sm btn-secondary" onclick="openRoleModal('${u.id}', '${escHtml(u.full_name || u.email)}', '${u.role}')">
            Função
        </button>` : '';

    const freeAccessBtn = u.free_access
        ? `<button class="btn btn-sm btn-danger" onclick="revokeFreeAccess('${u.id}', '${escHtml(u.full_name || u.email)}')">
Revogar</button>`
        : `<button class="btn btn-sm btn-success" onclick="openFreeAccessModal('${u.id}', '${escHtml(u.full_name || u.email)}')">
Acesso</button>`;

    return `
    <tr>
        <td>
            <div class="user-cell">
                <div class="user-avatar-sm">${initials}</div>
                <div>
                    <div class="user-name">${escHtml(u.full_name || '—')}</div>
                    <div class="user-email">${escHtml(u.email)}</div>
                </div>
            </div>
        </td>
        <td>${tierBadge}</td>
        <td>${roleBadge}</td>
        <td>${giftBadge}</td>
        <td style="color:var(--text-muted);font-size:12px;">${date}</td>
        <td>
            <div class="actions-cell">
                ${roleBtn}
                ${freeAccessBtn}
            </div>
        </td>
    </tr>`;
}

// ─── Free Access ─────────────────────────────────────────────

function openFreeAccessModal(userId, userName) {
    selectedUserId   = userId;
    selectedUserName = userName;
    document.getElementById('freeAccessUserName').textContent = userName;
    openModal('freeAccessModal');
}

async function confirmFreeAccess() {
    const tier = document.getElementById('freeAccessTierSelect').value;
    const btn  = document.getElementById('freeAccessConfirmBtn');

    btn.disabled = true;
    btn.textContent = 'A processar…';

    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('admin-update-user', {
            target_user_id: selectedUserId,
            action: 'grant_free_access',
            free_access_tier: tier,
        }, session.data.session.access_token);

        if (!res.ok) {
            const body = await res.json();
            throw new Error(body.error || 'Erro desconhecido');
        }

        // Update local state
        const user = allUsers.find(u => u.id === selectedUserId);
        if (user) {
            user.free_access      = true;
            user.free_access_tier = tier;
            user.subscription_tier = tier;
        }

        closeModal('freeAccessModal');
        renderUsersTable();
        updateUserStats();
        showToast(`Acesso gratuito (${tierLabel(tier)}) concedido com sucesso!`, 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirmar';
    }
}

async function revokeFreeAccess(userId, userName) {
    if (!confirm(`Revogar acesso gratuito de ${userName}?`)) return;

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

        const user = allUsers.find(u => u.id === userId);
        if (user) {
            user.free_access       = false;
            user.free_access_tier  = null;
            user.subscription_tier = 'free';
        }

        renderUsersTable();
        updateUserStats();
        showToast('Acesso gratuito revogado.', 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
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
    const visible = allPlans.filter(p => !!p.is_archived === showArchivedPlans);

    if (visible.length === 0) {
        const msg = showArchivedPlans ? 'Nenhum plano arquivado' : 'Nenhum plano encontrado';
        container.innerHTML = `<div class="empty-state"><p class="empty-state-text">${msg}</p>${!showArchivedPlans ? '<p class="empty-state-sub">Clique em "+ Criar Plano" para começar.</p>' : ''}</div>`;
        return;
    }

    container.innerHTML = `<div class="plans-grid">${visible.map(buildPlanCard).join('')}</div>`;
}

function buildPlanCard(p) {
    const price    = `R$ ${parseFloat(p.price_brl).toFixed(2).replace('.', ',')}`;
    const interval = p.interval === 'month' ? '/mês' : '/ano';
    const status   = p.is_archived
        ? `<span class="badge badge-canceled">Arquivado</span>`
        : p.is_active
            ? `<span class="badge badge-active">Ativo</span>`
            : `<span class="badge badge-canceled">Inativo</span>`;

    const stripeLink = p.stripe_price_id
        ? `<span class="stripe-badge">Stripe</span>`
        : `<span style="color:var(--text-dim);font-size:11px;">Sem Stripe</span>`;

    let footerActions = '';
    if (p.is_archived) {
        footerActions = `<button class="btn btn-sm btn-success" onclick="archivePlan('${p.id}', false)">Desarquivar</button>`;
    } else {
        const toggleLabel = p.is_active ? 'Desativar' : 'Ativar';
        const toggleClass = p.is_active ? 'btn-danger' : 'btn-success';
        const archiveBtn  = !p.is_active
            ? `<button class="btn btn-sm btn-secondary" onclick="archivePlan('${p.id}', true)">Arquivar</button>`
            : '';
        footerActions = `
            <button class="btn btn-sm ${toggleClass}" onclick="togglePlan('${p.id}', ${p.is_active})">${toggleLabel}</button>
            ${archiveBtn}`;
    }

    return `
    <div class="plan-card">
        <div class="plan-card-header">
            <div>
                <div class="plan-name">${escHtml(p.name)}</div>
                <span class="badge badge-${p.tier}" style="margin-top:4px;">${tierLabel(p.tier)}</span>
            </div>
            ${status}
        </div>
        <div class="plan-price">${price} <span>${interval}</span></div>
        <div class="plan-description">${escHtml(p.description || '—')}</div>
        <div class="plan-card-footer">
            ${stripeLink}
            <div style="display:flex;gap:6px;">${footerActions}</div>
        </div>
    </div>`;
}

async function submitCreatePlan() {
    const name        = document.getElementById('planName').value.trim();
    const description = document.getElementById('planDescription').value.trim();
    const tier        = document.getElementById('planTier').value;
    const interval    = document.getElementById('planInterval').value;
    const price       = parseFloat(document.getElementById('planPrice').value);
    const observation = document.getElementById('planObservation').value.trim();
    const createAnnual = interval === 'month' && document.getElementById('createAnnualToo')?.checked;
    const annualPrice  = createAnnual ? parseFloat(document.getElementById('planAnnualPrice').value) : null;
    const annualObs    = createAnnual ? document.getElementById('planAnnualObservation').value.trim() : '';

    if (!name || isNaN(price) || price <= 0) {
        showToast('Preencha nome e preço corretamente.', 'error');
        return;
    }
    if (createAnnual && (isNaN(annualPrice) || annualPrice <= 0)) {
        showToast('Preencha o preço anual corretamente.', 'error');
        return;
    }

    const btn = document.getElementById('createPlanBtn');
    btn.disabled = true;
    btn.textContent = 'Criando…';

    try {
        const session = await supabase.auth.getSession();
        const token = session.data.session.access_token;

        // Create monthly (or annual-only) plan
        const res = await callFunction('admin-create-plan', {
            name, description, tier, interval, price_brl: price, observation,
        }, token);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Erro ao criar plano');
        allPlans.push(body.plan);

        // Optionally create annual counterpart
        if (createAnnual) {
            const resAnnual = await callFunction('admin-create-plan', {
                name: `${name} Anual`,
                description,
                tier,
                interval: 'year',
                price_brl: annualPrice,
                observation: annualObs,
            }, token);
            const bodyAnnual = await resAnnual.json();
            if (!resAnnual.ok) throw new Error(bodyAnnual.error || 'Erro ao criar plano anual');
            allPlans.push(bodyAnnual.plan);
        }

        renderPlans();
        closeModal('createPlanModal');
        clearPlanForm();
        showToast(createAnnual ? 'Planos mensal e anual criados com sucesso!' : 'Plano criado com sucesso no Stripe!', 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Criar no Stripe';
    }
}

function toggleAnnualPriceFields() {
    const interval = document.getElementById('planInterval').value;
    const section  = document.getElementById('annualPriceSection');
    const fields   = document.getElementById('annualPriceFields');
    const checkbox = document.getElementById('createAnnualToo');

    // Hide the annual section when the interval is already 'year'
    if (section) section.style.display = interval === 'year' ? 'none' : '';
    if (fields && checkbox) fields.style.display = checkbox.checked ? '' : 'none';
}

async function togglePlan(planId, currentActive) {
    try {
        const { error } = await supabase
            .from('plans')
            .update({ is_active: !currentActive })
            .eq('id', planId);

        if (error) throw error;

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
    if (!confirm(`Deseja ${label} este plano?`)) return;

    try {
        const updates = archive
            ? { is_archived: true, is_active: false }
            : { is_archived: false };

        const { error } = await supabase
            .from('plans')
            .update(updates)
            .eq('id', planId);

        if (error) throw error;

        const plan = allPlans.find(p => p.id === planId);
        if (plan) { plan.is_archived = archive; if (archive) plan.is_active = false; }

        renderPlans();
        showToast(`Plano ${archive ? 'arquivado' : 'desarquivado'} com sucesso.`, 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
}

function clearPlanForm() {
    ['planName', 'planDescription', 'planPrice', 'planObservation', 'planAnnualPrice', 'planAnnualObservation'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('planTier').value     = 'basic';
    document.getElementById('planInterval').value = 'month';
    const cb = document.getElementById('createAnnualToo');
    if (cb) cb.checked = false;
    toggleAnnualPriceFields();
}

// ─────────────────────────────────────────────────────────────
// ██  SUBSCRIPTIONS SECTION  ██
// ─────────────────────────────────────────────────────────────

async function loadSubscriptions() {
    const tbody = document.getElementById('subsTableBody');
    tbody.innerHTML = buildLoadingRows(4, 6);

    const { data, error } = await supabase
        .from('subscriptions')
        .select('*, plans(name, tier)')
        .order('created_at', { ascending: false });

    if (error) {
        showToast('Erro ao carregar assinaturas: ' + error.message, 'error');
        return;
    }

    allSubs = data || [];
    renderSubscriptionsTable();
}

function filterSubs() {
    const status = document.getElementById('subsStatusFilter').value;
    const display = status ? allSubs.filter(s => s.status === status) : allSubs;
    renderSubscriptionsTable(display);
}

function renderSubscriptionsTable(list) {
    const display = list || allSubs;
    const tbody = document.getElementById('subsTableBody');

    if (display.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p class="empty-state-text">Nenhuma assinatura encontrada</p></div></td></tr>`;
        return;
    }

    tbody.innerHTML = display.map(s => {
        const planName    = s.plans?.name || '—';
        const planTier    = s.plans?.tier || 'free';
        const periodEnd   = s.current_period_end ? new Date(s.current_period_end).toLocaleDateString('pt-BR') : '—';
        const cancelAtEnd = s.cancel_at_period_end ? '<span class="badge badge-warning">Sim</span>' : '<span style="color:var(--text-dim);font-size:12px;">Não</span>';

        return `
        <tr>
            <td style="color:var(--text-muted);font-size:12px;">${escHtml(s.user_id.slice(0, 8))}…</td>
            <td>
                <div>${escHtml(planName)}</div>
                <span class="badge badge-${planTier}" style="margin-top:3px;">${tierLabel(planTier)}</span>
            </td>
            <td><span class="badge badge-${s.status}">${statusLabel(s.status)}</span></td>
            <td style="font-size:12px;color:var(--text-muted);">${periodEnd}</td>
            <td>${cancelAtEnd}</td>
            <td>
                <div class="actions-cell">
                    ${s.status === 'active' && !s.cancel_at_period_end
                        ? `<button class="btn btn-sm btn-danger" onclick="openCancelSubModal('${s.id}', '${s.user_id.slice(0, 8)}…')">Cancelar</button>`
                        : ''}
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
    const mode = document.getElementById('cancelSubMode').value;
    const btn  = document.getElementById('cancelSubBtn');
    btn.disabled = true;
    btn.textContent = 'A cancelar…';

    try {
        const session = await supabase.auth.getSession();
        const res = await callFunction('cancel-subscription', {
            subscription_id: selectedSubId,
            cancel_at_period_end: mode === 'period_end',
        }, session.data.session.access_token);

        if (!res.ok) {
            const body = await res.json();
            throw new Error(body.error || 'Erro ao cancelar');
        }

        closeModal('cancelSubModal');
        allSubs = []; // force reload
        await loadSubscriptions();
        showToast('Assinatura cancelada com sucesso.', 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Cancelar Assinatura';
    }
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

function renderCoupons() {
    const container = document.getElementById('couponsContainer');

    if (allCoupons.length === 0) {
        container.innerHTML = `<div class="empty-state"><p class="empty-state-text">Nenhum cupom encontrado</p><p class="empty-state-sub">Clique em "+ Criar Cupom" para começar.</p></div>`;
        return;
    }

    container.innerHTML = `<div class="coupons-grid">${allCoupons.map(buildCouponCard).join('')}</div>`;
}

function buildCouponCard(c) {
    const discount = c.discount_type === 'percent'
        ? `${c.discount_value}% off`
        : `R$ ${parseFloat(c.discount_value).toFixed(2).replace('.', ',')} off`;

    const validade = c.redeem_by
        ? `Válido até ${new Date(c.redeem_by).toLocaleDateString('pt-BR')}`
        : 'Sem prazo';

    const usos = c.max_redemptions
        ? `${c.times_redeemed} / ${c.max_redemptions} usos`
        : `${c.times_redeemed} usos`;

    const status = c.is_active
        ? `<span class="badge badge-active">Ativo</span>`
        : `<span class="badge badge-canceled">Inativo</span>`;

    return `
    <div class="coupon-card">
        <div class="coupon-code-display">${escHtml(c.code)}</div>
        <div class="coupon-discount">${discount}</div>
        <div class="coupon-meta">
            <span>Validade: ${validade}</span>
            <span>Duração: ${durationLabel(c.duration)}</span>
            <span>${usos}</span>
        </div>
        <div class="coupon-card-footer">
            ${status}
            <button class="btn btn-sm ${c.is_active ? 'btn-danger' : 'btn-success'}" onclick="toggleCoupon('${c.id}', ${c.is_active})">
                ${c.is_active ? 'Desativar' : 'Ativar'}
            </button>
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
    const redeemBy        = document.getElementById('couponRedeemBy').value || null;

    if (!code || !name || isNaN(value) || value <= 0) {
        showToast('Preencha código, nome e valor corretamente.', 'error');
        return;
    }

    if (type === 'percent' && (value < 1 || value > 100)) {
        showToast('O desconto percentual deve estar entre 1 e 100.', 'error');
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

function toggleCouponTypeHint() {
    const type  = document.getElementById('couponType').value;
    const label = document.getElementById('couponValueLabel');
    label.textContent = type === 'percent' ? 'Desconto (%)' : 'Desconto (R$)';
}

function toggleDurationMonths() {
    const dur   = document.getElementById('couponDuration').value;
    const group = document.getElementById('couponDurationMonthsGroup');
    group.style.display = dur === 'repeating' ? 'flex' : 'none';
}

function clearCouponForm() {
    ['couponCode', 'couponName', 'couponValue', 'couponMaxRedemptions', 'couponRedeemBy'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('couponType').value     = 'percent';
    document.getElementById('couponDuration').value = 'once';
    document.getElementById('couponDurationMonthsGroup').style.display = 'none';
    toggleCouponTypeHint();
}

// ─────────────────────────────────────────────────────────────
// ██  NOTIFICATIONS SECTION  ██
// ─────────────────────────────────────────────────────────────

async function loadNotifications() {
    document.getElementById('notificationsContainer').innerHTML =
        `<div class="empty-state"><p class="empty-state-text">Carregando notificações…</p></div>`;

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

    filteredNotifications = allNotifications.filter(n => {
        const matchStatus = !status
            || (status === 'active' && n.is_active)
            || (status === 'inactive' && !n.is_active);
        const matchTarget = !target || n.target_type === target;
        return matchStatus && matchTarget;
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
            </div>
        </div>
        <div class="notification-message">${escHtml(n.message)}</div>
    </div>`;
}

function notifTargetDesc(n) {
    if (n.target_type === 'all')      return 'Todos os usuários';
    if (n.target_type === 'role')     return `Funções: ${(n.target_roles || []).map(roleLabel).join(', ') || '—'}`;
    if (n.target_type === 'tier')     return `Planos: ${(n.target_tiers || []).map(tierLabel).join(', ') || '—'}`;
    if (n.target_type === 'specific') return `${(n.target_user_ids || []).length} usuário(s) específico(s)`;
    return '—';
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

function updateNotifTargetFields() {
    const type = document.getElementById('notifTargetType').value;
    document.getElementById('notifRoleFields').style.display     = type === 'role'     ? '' : 'none';
    document.getElementById('notifTierFields').style.display     = type === 'tier'     ? '' : 'none';
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

    container.innerHTML = users.slice(0, 100).map(u => `
        <label class="notif-user-item">
            <input type="checkbox" class="notif-user-check" value="${u.id}" style="accent-color:var(--primary);" />
            <div class="notif-user-info">
                <span class="notif-user-name">${escHtml(u.full_name || u.email)}</span>
                <span class="notif-user-email">${escHtml(u.email)}</span>
            </div>
            <span class="badge badge-${u.subscription_tier}" style="font-size:10px;">${tierLabel(u.subscription_tier)}</span>
        </label>`).join('');
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

    if (type === 'role') {
        target_roles = [...document.querySelectorAll('.notif-role-check:checked')].map(el => el.value);
        if (target_roles.length === 0) { showToast('Selecione ao menos uma função.', 'error'); return; }
    }
    if (type === 'tier') {
        target_tiers = [...document.querySelectorAll('.notif-tier-check:checked')].map(el => el.value);
        if (target_tiers.length === 0) { showToast('Selecione ao menos um plano.', 'error'); return; }
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

function escHtml(str) {
    return (str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function tierLabel(tier) {
    return { free: 'Free', basic: 'Básico', premium: 'Premium' }[tier] || tier || '—';
}

function roleLabel(role) {
    return { user: 'Usuário', admin: 'Admin', super_admin: 'Super Admin' }[role] || role || '—';
}

function roleBadgeClass(role) {
    return { user: 'badge-user', admin: 'badge-admin', super_admin: 'badge-superadmin' }[role] || 'badge-user';
}

function statusLabel(s) {
    return { active: 'Ativa', canceled: 'Cancelada', past_due: 'Vencida', unpaid: 'Não Paga', trialing: 'Trial', incomplete: 'Incompleta' }[s] || s;
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
