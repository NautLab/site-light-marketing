// =============================================
// DASHBOARD LOGIC
// =============================================

let currentUser = null;
let userProfile = null;
let usageStats = null;
let subscriptionLimits = null;

// Inicializar dashboard
async function initDashboard() {
    try {
        // Verificar autenticação
        const session = await Auth.requireAuth();
        if (!session) return;

        // Obter dados do usuário
        currentUser = await SupabaseClient.getCurrentUser();
        if (!currentUser) {
            window.location.href = 'login.html';
            return;
        }

        // Carregar dados em paralelo
        await Promise.all([
            loadUserProfile(),
            loadUsageStats(),
            loadSubscriptionLimits()
        ]);

        // Renderizar dashboard
        renderDashboard();
        
        // Ocultar loading
        hideLoading();

    } catch (error) {
        console.error('Erro ao inicializar dashboard:', error);
        alert('Erro ao carregar dashboard. Por favor, recarregue a página.');
        hideLoading();
    }
}

// Carregar perfil do usuário
async function loadUserProfile() {
    userProfile = await SupabaseClient.getUserProfile(currentUser.id);
    if (!userProfile) {
        throw new Error('Perfil não encontrado');
    }
}

// Carregar estatísticas de uso
async function loadUsageStats() {
    usageStats = await SupabaseClient.getUsageStats(currentUser.id);
}

// Carregar limites de assinatura
async function loadSubscriptionLimits() {
    subscriptionLimits = await SupabaseClient.getSubscriptionLimits();
}

// Renderizar dashboard
function renderDashboard() {
    // Nome do usuário
    const userName = userProfile.full_name || currentUser.email.split('@')[0];
    document.getElementById('user-name').textContent = userName;

    // Stats cards
    renderStatsCards();

    // Plano atual
    renderCurrentPlan();

    // Planos disponíveis
    renderAvailablePlans();

    // Atividade recente
    renderRecentActivity();
}

// Renderizar cards de estatísticas
function renderStatsCards() {
    const currentTier = userProfile.subscription_tier || 'free';
    const tierName = currentTier.charAt(0).toUpperCase() + currentTier.slice(1);
    
    document.getElementById('current-tier').textContent = tierName;
    
    if (usageStats) {
        const currentUsage = usageStats.usage_this_month || 0;
        const limit = usageStats.monthly_limit || 5;
        const totalUsage = usageStats.total_usage || 0;
        
        document.getElementById('current-usage').textContent = currentUsage;
        document.getElementById('usage-limit').textContent = limit === -1 ? '∞' : limit;
        document.getElementById('total-usage').textContent = totalUsage;
        
        // Calcular progresso
        let progressPercent = 0;
        if (limit === -1) {
            progressPercent = 0; // Ilimitado
        } else if (limit > 0) {
            progressPercent = Math.min((currentUsage / limit) * 100, 100);
        }
        
        document.getElementById('usage-progress').style.width = progressPercent + '%';
        document.getElementById('usage-percent').textContent = Math.round(progressPercent) + '%';
        
        // Mudar cor se estiver perto do limite
        const progressBar = document.getElementById('usage-progress');
        if (progressPercent >= 90) {
            progressBar.style.background = '#ff4444';
        } else if (progressPercent >= 70) {
            progressBar.style.background = '#ffbb33';
        } else {
            progressBar.style.background = 'var(--primary-color)';
        }
    }
    
    // Status do plano
    const statusText = userProfile.subscription_status === 'active' ? 'Plano ativo' : 
                      userProfile.subscription_status === 'canceled' ? 'Plano cancelado' :
                      userProfile.subscription_status === 'past_due' ? 'Pagamento pendente' :
                      'Plano ativo';
    document.getElementById('plan-status').textContent = statusText;
}

// Renderizar plano atual
function renderCurrentPlan() {
    const currentTier = userProfile.subscription_tier || 'free';
    const planData = subscriptionLimits?.find(p => p.tier === currentTier);
    
    if (!planData) return;
    
    const planCard = document.getElementById('current-plan-card');
    const tierName = currentTier.charAt(0).toUpperCase() + currentTier.slice(1);
    
    let features = [];
    try {
        features = typeof planData.features === 'string' ? 
                   JSON.parse(planData.features) : 
                   planData.features || [];
    } catch (e) {
        features = [];
    }
    
    const price = planData.price_monthly_cents / 100;
    const priceText = price === 0 ? 'Grátis' : `R$ ${price.toFixed(2)}/mês`;
    
    const featuresHtml = features.map(f => `<li>${f}</li>`).join('');
    
    const actionsHtml = currentTier === 'free' ? `
        <div class="plan-actions">
            <button class="btn" onclick="showUpgradePlans()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Fazer Upgrade
            </button>
        </div>
    ` : `
        <div class="plan-actions">
            <button class="btn btn-secondary" onclick="manageSubscription()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 15C15.866 15 19 11.866 19 8C19 4.13401 15.866 1 12 1C8.13401 1 5 4.13401 5 8C5 11.866 8.13401 15 12 15Z" stroke="currentColor" stroke-width="2"/>
                    <path d="M8.21 13.89L7 23L12 20L17 23L15.79 13.88" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Gerenciar Assinatura
            </button>
            ${currentTier !== 'premium' ? '<button class="btn" onclick="showUpgradePlans()">Fazer Upgrade</button>' : ''}
        </div>
    `;
    
    planCard.innerHTML = `
        <span class="plan-badge">Plano Atual</span>
        <h3 class="plan-name">${tierName}</h3>
        <p class="plan-price">${priceText}</p>
        <ul class="plan-features">
            ${featuresHtml}
        </ul>
        ${actionsHtml}
    `;
}

// Renderizar planos disponíveis
function renderAvailablePlans() {
    if (!subscriptionLimits) return;
    
    const plansGrid = document.getElementById('plans-grid');
    const currentTier = userProfile.subscription_tier || 'free';
    
    plansGrid.innerHTML = subscriptionLimits.map(plan => {
        const tierName = plan.tier.charAt(0).toUpperCase() + plan.tier.slice(1);
        const price = plan.price_monthly_cents / 100;
        const priceText = price === 0 ? 'Grátis' : `R$ ${price.toFixed(2)}`;
        const isCurrent = plan.tier === currentTier;
        const isFeatured = plan.tier === 'basic';
        
        let features = [];
        try {
            features = typeof plan.features === 'string' ? 
                       JSON.parse(plan.features) : 
                       plan.features || [];
        } catch (e) {
            features = [];
        }
        
        const featuresHtml = features.map(f => `<li>${f}</li>`).join('');
        
        const buttonHtml = isCurrent ? 
            '<button class="btn btn-secondary" disabled>Plano Atual</button>' :
            `<button class="btn" onclick="upgradeToPlan('${plan.tier}')">Selecionar Plano</button>`;
        
        return `
            <div class="plan-card ${isFeatured ? 'featured' : ''}">
                <h3 class="plan-tier">${tierName}</h3>
                <div class="plan-pricing">
                    <span class="plan-amount">
                        <span class="plan-currency">R$</span>${price.toFixed(2)}
                    </span>
                    <span class="plan-period">/mês</span>
                </div>
                <p class="plan-description">${plan.monthly_limit === -1 ? 'Processamentos ilimitados' : `Até ${plan.monthly_limit} processamentos por mês`}</p>
                <ul class="plan-features">
                    ${featuresHtml}
                </ul>
                ${buttonHtml}
            </div>
        `;
    }).join('');
}

// Renderizar atividade recente
async function renderRecentActivity() {
    try {
        const { data: activities, error } = await SupabaseClient.supabase
            .from('usage_logs')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(10);
        
        if (error) throw error;
        
        const activityList = document.getElementById('activity-list');
        
        if (!activities || activities.length === 0) {
            activityList.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <p>Nenhuma atividade recente</p>
                </div>
            `;
            return;
        }
        
        activityList.innerHTML = activities.map(activity => {
            const date = new Date(activity.created_at);
            const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
            const statusClass = activity.status === 'success' ? 'success' : 'error';
            const statusText = activity.status === 'success' ? 'Sucesso' : 'Erro';
            const processType = activity.process_type === 'correios' ? 'Correios' : 'Xpress';
            
            return `
                <div class="activity-item">
                    <div class="activity-info">
                        <div class="activity-icon">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="#0C7E92" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        <div class="activity-details">
                            <p class="activity-title">Processamento ${processType}</p>
                            <p class="activity-meta">${dateStr} • ${activity.pdf_filename || 'Arquivo PDF'}</p>
                        </div>
                    </div>
                    <span class="activity-status ${statusClass}">${statusText}</span>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Erro ao carregar atividades:', error);
    }
}

// Mostrar seção de upgrade
function showUpgradePlans() {
    const upgradeSection = document.getElementById('upgrade-section');
    upgradeSection.style.display = 'block';
    upgradeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Fazer upgrade para um plano
async function upgradeToPlan(tier) {
    if (tier === 'free') {
        alert('Você já está no plano gratuito!');
        return;
    }
    
    showLoading('Redirecionando para checkout...');
    
    try {
        // Obter ID do preço do Stripe
        const planData = subscriptionLimits.find(p => p.tier === tier);
        if (!planData) {
            throw new Error('Plano não encontrado');
        }
        
        // Aqui você deve ter configurado os IDs de preço do Stripe no Stripe Config
        let priceId;
        if (tier === 'basic') {
            priceId = StripeClient.config.products.basic.priceId;
        } else if (tier === 'premium') {
            priceId = StripeClient.config.products.premium.priceId;
        }
        
        // Criar sessão de checkout
        const success = await StripeClient.createCheckoutSession(
            priceId,
            userProfile.stripe_customer_id
        );
        
        if (!success) {
            throw new Error('Erro ao criar sessão de checkout');
        }
        
    } catch (error) {
        console.error('Erro ao fazer upgrade:', error);
        hideLoading();
        alert('Erro ao processar upgrade. Por favor, tente novamente ou entre em contato com o suporte.');
    }
}

// Gerenciar assinatura (portal do Stripe)
async function manageSubscription() {
    if (!userProfile.stripe_customer_id) {
        alert('Você não tem uma assinatura ativa para gerenciar.');
        return;
    }
    
    showLoading('Redirecionando...');
    
    try {
        await StripeClient.createCustomerPortal(userProfile.stripe_customer_id);
    } catch (error) {
        console.error('Erro ao abrir portal:', error);
        hideLoading();
        alert('Erro ao abrir portal de gerenciamento. Por favor, tente novamente.');
    }
}

// Logout
async function handleLogout() {
    if (!confirm('Tem certeza que deseja sair?')) return;
    
    showLoading('Saindo...');
    
    const result = await Auth.logout();
    
    if (result.success) {
        window.location.href = 'login.html';
    } else {
        hideLoading();
        alert('Erro ao fazer logout. Por favor, tente novamente.');
    }
}

// Mostrar loading
function showLoading(text = 'Carregando...') {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = overlay.querySelector('.loading-text');
    loadingText.textContent = text;
    overlay.style.display = 'flex';
}

// Ocultar loading
function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    overlay.style.display = 'none';
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Verificar parâmetro de checkout
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('checkout') === 'success') {
        alert('✅ Assinatura ativada com sucesso! Bem-vindo!');
        // Remover parâmetro da URL
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get('checkout') === 'canceled') {
        alert('Checkout cancelado. Você pode tentar novamente quando quiser.');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    // Inicializar dashboard
    initDashboard();
});

// Exportar funções para uso global
window.DashboardFunctions = {
    showUpgradePlans,
    upgradeToPlan,
    manageSubscription
};
