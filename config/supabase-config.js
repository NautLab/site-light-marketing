// =============================================
// SUPABASE CONFIGURATION
// =============================================
// IMPORTANTE: Configure estas variáveis no Cloudflare Pages como Environment Variables
// Ou crie um arquivo .env.local (não commitar no Git)

const SUPABASE_CONFIG = {
    // Substitua com suas credenciais do Supabase
    // Encontre em: https://supabase.com/dashboard/project/_/settings/api
    url: import.meta.env?.VITE_SUPABASE_URL || 'https://YOUR_PROJECT.supabase.co',
    anonKey: import.meta.env?.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY'
};

// Inicializar cliente Supabase
const supabase = window.supabase.createClient(
    SUPABASE_CONFIG.url,
    SUPABASE_CONFIG.anonKey
);

// =============================================
// FUNÇÕES DE UTILIDADE
// =============================================

// Verificar se usuário está autenticado
async function checkAuth() {
    const { data: { session }, error } = await supabase.auth.getSession();
    return session;
}

// Obter usuário atual
async function getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    return user;
}

// Obter perfil do usuário
async function getUserProfile(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    
    if (error) {
        console.error('Erro ao buscar perfil:', error);
        return null;
    }
    
    return data;
}

// Verificar limite de uso
async function checkUsageLimit(userId) {
    const { data, error } = await supabase
        .rpc('check_usage_limit', { p_user_id: userId });
    
    if (error) {
        console.error('Erro ao verificar limite:', error);
        return null;
    }
    
    return data[0];
}

// Registrar uso
async function logUsage(userId, processType, pdfFilename, xlsxFilename) {
    const { data, error } = await supabase
        .from('usage_logs')
        .insert([{
            user_id: userId,
            process_type: processType,
            pdf_filename: pdfFilename,
            xlsx_filename: xlsxFilename,
            status: 'success'
        }]);
    
    if (error) {
        console.error('Erro ao registrar uso:', error);
        return false;
    }
    
    return true;
}

// Obter estatísticas de uso
async function getUsageStats(userId) {
    const { data, error } = await supabase
        .from('user_usage_stats')
        .select('*')
        .eq('user_id', userId)
        .single();
    
    if (error) {
        console.error('Erro ao buscar estatísticas:', error);
        return null;
    }
    
    return data;
}

// Obter limites de planos
async function getSubscriptionLimits() {
    const { data, error } = await supabase
        .from('usage_limits')
        .select('*')
        .order('price_monthly_cents', { ascending: true });
    
    if (error) {
        console.error('Erro ao buscar limites:', error);
        return null;
    }
    
    return data;
}

// Atualizar perfil do usuário
async function updateUserProfile(userId, updates) {
    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId);
    
    if (error) {
        console.error('Erro ao atualizar perfil:', error);
        return false;
    }
    
    return true;
}

// Listener para mudanças de autenticação
function onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange((event, session) => {
        callback(event, session);
    });
}

// Exportar para uso global
window.SupabaseClient = {
    supabase,
    checkAuth,
    getCurrentUser,
    getUserProfile,
    checkUsageLimit,
    logUsage,
    getUsageStats,
    getSubscriptionLimits,
    updateUserProfile,
    onAuthStateChange
};

console.log('✅ Supabase configurado com sucesso!');
