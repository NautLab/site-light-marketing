// =============================================
// AUTHENTICATION LOGIC
// =============================================

const Auth = {
    // Registrar novo usuário
    async register(email, password, fullName) {
        try {
            const { data, error } = await window.SupabaseClient.supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName
                    },
                    emailRedirectTo: `${window.location.origin}/login.html?verified=true`
                }
            });

            if (error) throw error;

            return {
                success: true,
                message: 'Conta criada! Verifique seu email para confirmar.',
                data
            };
        } catch (error) {
            console.error('Erro ao registrar:', error);
            return {
                success: false,
                message: this.getErrorMessage(error)
            };
        }
    },

    // Login
    async login(email, password) {
        try {
            const { data, error } = await window.SupabaseClient.supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            return {
                success: true,
                message: 'Login realizado com sucesso!',
                data
            };
        } catch (error) {
            console.error('Erro ao fazer login:', error);
            return {
                success: false,
                message: this.getErrorMessage(error)
            };
        }
    },

    // Logout
    async logout() {
        try {
            const { error } = await window.SupabaseClient.supabase.auth.signOut();
            if (error) throw error;

            return {
                success: true,
                message: 'Logout realizado com sucesso!'
            };
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
            return {
                success: false,
                message: this.getErrorMessage(error)
            };
        }
    },

    // Recuperar senha
    async resetPassword(email) {
        try {
            const { error } = await window.SupabaseClient.supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password.html`
            });

            if (error) throw error;

            return {
                success: true,
                message: 'Email de recuperação enviado! Verifique sua caixa de entrada.'
            };
        } catch (error) {
            console.error('Erro ao recuperar senha:', error);
            return {
                success: false,
                message: this.getErrorMessage(error)
            };
        }
    },

    // Atualizar senha
    async updatePassword(newPassword) {
        try {
            const { error } = await window.SupabaseClient.supabase.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;

            return {
                success: true,
                message: 'Senha atualizada com sucesso!'
            };
        } catch (error) {
            console.error('Erro ao atualizar senha:', error);
            return {
                success: false,
                message: this.getErrorMessage(error)
            };
        }
    },

    // Verificar se está autenticado e redirecionar se necessário
    async requireAuth(redirectTo = '/login.html') {
        const session = await window.SupabaseClient.checkAuth();
        
        if (!session) {
            window.location.href = redirectTo;
            return null;
        }
        
        return session;
    },

    // Redirecionar se já estiver autenticado
    async redirectIfAuthenticated(redirectTo = '/dashboard.html') {
        const session = await window.SupabaseClient.checkAuth();
        
        if (session) {
            window.location.href = redirectTo;
            return true;
        }
        
        return false;
    },

    // Obter mensagem de erro amigável
    getErrorMessage(error) {
        const errorMessages = {
            'Invalid login credentials': 'Email ou senha incorretos',
            'Email not confirmed': 'Por favor, confirme seu email antes de fazer login',
            'User already registered': 'Este email já está cadastrado',
            'Password should be at least 6 characters': 'A senha deve ter pelo menos 6 caracteres',
            'Unable to validate email address: invalid format': 'Email inválido',
            'Signup requires a valid password': 'Senha inválida',
            'Email rate limit exceeded': 'Muitas tentativas. Tente novamente mais tarde.',
            'For security purposes, you can only request this after': 'Aguarde alguns minutos antes de tentar novamente'
        };

        const message = error?.message || error?.error_description || error;
        return errorMessages[message] || 'Erro ao processar requisição. Tente novamente.';
    },

    // Validar email
    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },

    // Validar senha
    isValidPassword(password) {
        return password && password.length >= 6;
    },

    // Mostrar mensagem de erro
    showError(elementId, message) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
            element.style.display = 'block';
            element.className = 'message error-message';
        }
    },

    // Mostrar mensagem de sucesso
    showSuccess(elementId, message) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
            element.style.display = 'block';
            element.className = 'message success-message';
        }
    },

    // Limpar mensagens
    clearMessage(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.style.display = 'none';
            element.textContent = '';
        }
    },

    // Desabilitar formulário durante submissão
    disableForm(formId, disable = true) {
        const form = document.getElementById(formId);
        if (form) {
            const inputs = form.querySelectorAll('input, button');
            inputs.forEach(input => {
                input.disabled = disable;
            });
        }
    }
};

// Exportar para uso global
window.Auth = Auth;

console.log('✅ Auth module carregado com sucesso!');
