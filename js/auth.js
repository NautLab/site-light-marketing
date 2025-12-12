/**
 * Authentication Functions
 * Light Marketing - User Authentication System
 */

/**
 * Sign up a new user with email and password
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @param {string} fullName - User's full name
 * @returns {Promise<{success: boolean, error?: string, requiresConfirmation?: boolean}>}
 */
async function signUp(email, password, fullName) {
    try {
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: fullName
                },
                emailRedirectTo: `${SITE_URL}/login.html`
            }
        });

        if (error) {
            return { success: false, error: translateAuthError(error.message) };
        }

        // Check if email confirmation is required
        if (data.user && data.user.identities && data.user.identities.length === 0) {
            return { success: false, error: 'Este e-mail já está registrado.' };
        }

        // Check if email confirmation is enabled
        const requiresConfirmation = data.user && !data.session;

        return { success: true, requiresConfirmation };
    } catch (err) {
        console.error('SignUp error:', err);
        return { success: false, error: 'Erro ao criar conta. Tente novamente.' };
    }
}

/**
 * Sign in a user with email and password
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function signIn(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            return { success: false, error: translateAuthError(error.message) };
        }

        return { success: true };
    } catch (err) {
        console.error('SignIn error:', err);
        return { success: false, error: 'Erro ao fazer login. Tente novamente.' };
    }
}

/**
 * Sign out the current user
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function signOut() {
    try {
        const { error } = await supabase.auth.signOut();

        if (error) {
            return { success: false, error: translateAuthError(error.message) };
        }

        return { success: true };
    } catch (err) {
        console.error('SignOut error:', err);
        return { success: false, error: 'Erro ao sair. Tente novamente.' };
    }
}

/**
 * Send a password reset email
 * @param {string} email - User's email
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function resetPassword(email) {
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${SITE_URL}/reset-password.html`
        });

        if (error) {
            return { success: false, error: translateAuthError(error.message) };
        }

        return { success: true };
    } catch (err) {
        console.error('ResetPassword error:', err);
        return { success: false, error: 'Erro ao enviar e-mail. Tente novamente.' };
    }
}

/**
 * Update the user's password
 * @param {string} newPassword - The new password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function updatePassword(newPassword) {
    try {
        const { error } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (error) {
            return { success: false, error: translateAuthError(error.message) };
        }

        return { success: true };
    } catch (err) {
        console.error('UpdatePassword error:', err);
        return { success: false, error: 'Erro ao atualizar senha. Tente novamente.' };
    }
}

/**
 * Get the current user session
 * @returns {Promise<{session: object|null, user: object|null}>}
 */
async function getCurrentSession() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        return { session, user: session?.user || null };
    } catch (err) {
        console.error('GetSession error:', err);
        return { session: null, user: null };
    }
}

/**
 * Get the current user
 * @returns {Promise<object|null>}
 */
async function getCurrentUser() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    } catch (err) {
        console.error('GetUser error:', err);
        return null;
    }
}

/**
 * Get the user's profile from the profiles table
 * @returns {Promise<object|null>}
 */
async function getUserProfile() {
    try {
        const user = await getCurrentUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) {
            console.error('GetProfile error:', error);
            return null;
        }

        return data;
    } catch (err) {
        console.error('GetUserProfile error:', err);
        return null;
    }
}

/**
 * Translate Supabase auth error messages to Portuguese
 * @param {string} message - Original error message
 * @returns {string} Translated message
 */
function translateAuthError(message) {
    const errorTranslations = {
        'Invalid login credentials': 'E-mail ou senha incorretos.',
        'Email not confirmed': 'E-mail não confirmado. Verifique sua caixa de entrada.',
        'User already registered': 'Este e-mail já está registrado.',
        'Password should be at least 6 characters': 'A senha deve ter pelo menos 6 caracteres.',
        'Unable to validate email address: invalid format': 'Formato de e-mail inválido.',
        'Signup requires a valid password': 'Senha inválida.',
        'Email rate limit exceeded': 'Muitas tentativas. Aguarde alguns minutos.',
        'For security purposes, you can only request this once every 60 seconds': 'Por segurança, aguarde 60 segundos antes de tentar novamente.',
        'New password should be different from the old password': 'A nova senha deve ser diferente da anterior.',
        'Auth session missing!': 'Sessão expirada. Faça login novamente.'
    };

    return errorTranslations[message] || message || 'Ocorreu um erro. Tente novamente.';
}

/**
 * Show alert message
 * @param {HTMLElement} alertElement - The alert element
 * @param {string} message - The message to display
 * @param {string} type - 'success' or 'error'
 */
function showAlert(alertElement, message, type) {
    alertElement.className = `alert ${type}`;
    alertElement.querySelector('.alert-message').textContent = message;
    alertElement.style.display = 'flex';
}

/**
 * Hide alert message
 * @param {HTMLElement} alertElement - The alert element
 */
function hideAlert(alertElement) {
    alertElement.style.display = 'none';
}

/**
 * Set loading state on button
 * @param {HTMLElement} button - The button element
 * @param {boolean} isLoading - Loading state
 */
function setLoading(button, isLoading) {
    const btnText = button.querySelector('.btn-text');
    const btnLoader = button.querySelector('.btn-loader');
    
    if (isLoading) {
        btnText.style.display = 'none';
        btnLoader.style.display = 'flex';
        button.disabled = true;
    } else {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        button.disabled = false;
    }
}

/**
 * Setup password visibility toggle
 */
function setupPasswordToggle() {
    const toggleButtons = document.querySelectorAll('.toggle-password');
    
    toggleButtons.forEach(button => {
        button.addEventListener('click', function() {
            const input = this.parentElement.querySelector('input');
            const eyeOpen = this.querySelector('.eye-open');
            const eyeClosed = this.querySelector('.eye-closed');
            
            if (input.type === 'password') {
                input.type = 'text';
                eyeOpen.style.display = 'none';
                eyeClosed.style.display = 'block';
            } else {
                input.type = 'password';
                eyeOpen.style.display = 'block';
                eyeClosed.style.display = 'none';
            }
        });
    });
}

/**
 * Get user initials from name or email
 * @param {string} name - User's name
 * @param {string} email - User's email
 * @returns {string} Initials (1-2 characters)
 */
function getUserInitials(name, email) {
    if (name && name.trim()) {
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }
    return email ? email.substring(0, 2).toUpperCase() : 'U';
}
