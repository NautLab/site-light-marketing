// Toggle between login and register forms
const loginCard = document.getElementById('login-card');
const registerCard = document.getElementById('register-card');
const showRegisterLink = document.getElementById('show-register');
const showLoginLink = document.getElementById('show-login');

// Show register form
showRegisterLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginCard.style.display = 'none';
    registerCard.style.display = 'block';
});

// Show login form
showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    registerCard.style.display = 'none';
    loginCard.style.display = 'block';
});

// Handle login form submission
const loginForm = document.getElementById('login-form');
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const remember = document.querySelector('input[name="remember"]').checked;
    
    // Validate inputs
    if (!email || !password) {
        alert('Por favor, preencha todos os campos.');
        return;
    }
    
    // Simple validation (in production, this would connect to a backend)
    if (password.length < 6) {
        alert('A senha deve ter pelo menos 6 caracteres.');
        return;
    }
    
    // Store login state (simple client-side storage for demo)
    sessionStorage.setItem('isLoggedIn', 'true');
    sessionStorage.setItem('userEmail', email);
    
    if (remember) {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userEmail', email);
    }
    
    // Show success message
    showSuccessMessage('Login realizado com sucesso!');
    
    // Redirect to home page after a short delay
    setTimeout(() => {
        window.location.href = 'home.html';
    }, 1500);
});

// Handle register form submission
const registerForm = document.getElementById('register-form');
registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;
    const termsAccepted = document.querySelector('input[name="terms"]').checked;
    
    // Validate inputs
    if (!name || !email || !password || !confirmPassword) {
        alert('Por favor, preencha todos os campos.');
        return;
    }
    
    if (!termsAccepted) {
        alert('Por favor, aceite os termos de uso.');
        return;
    }
    
    // Validate password length
    if (password.length < 6) {
        alert('A senha deve ter pelo menos 6 caracteres.');
        return;
    }
    
    // Validate password match
    if (password !== confirmPassword) {
        alert('As senhas não coincidem. Por favor, tente novamente.');
        return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        alert('Por favor, insira um email válido.');
        return;
    }
    
    // Store user data (in production, this would be sent to a backend)
    sessionStorage.setItem('isLoggedIn', 'true');
    sessionStorage.setItem('userEmail', email);
    sessionStorage.setItem('userName', name);
    
    // Show success message
    showSuccessMessage('Conta criada com sucesso!');
    
    // Redirect to home page after a short delay
    setTimeout(() => {
        window.location.href = 'home.html';
    }, 1500);
});

// Function to show success message
function showSuccessMessage(message) {
    // Create success overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        animation: fadeIn 0.3s ease;
    `;
    
    // Create success message box
    const messageBox = document.createElement('div');
    messageBox.style.cssText = `
        background: rgba(12, 126, 146, 0.15);
        border: 2px solid #0C7E92;
        border-radius: 20px;
        padding: 40px;
        text-align: center;
        animation: slideIn 0.5s ease;
        max-width: 400px;
    `;
    
    messageBox.innerHTML = `
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-bottom: 20px;">
            <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#0C7E92" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h3 style="color: #0C7E92; font-size: 24px; margin-bottom: 10px; font-weight: 700;">${message}</h3>
        <p style="color: rgba(255, 255, 255, 0.8); font-size: 16px;">Redirecionando...</p>
    `;
    
    overlay.appendChild(messageBox);
    document.body.appendChild(overlay);
}

// Check if user is already logged in
window.addEventListener('DOMContentLoaded', () => {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn') || localStorage.getItem('isLoggedIn');
    
    if (isLoggedIn === 'true') {
        // User is already logged in, redirect to home page
        window.location.href = 'home.html';
    }
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
    
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(-30px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
`;
document.head.appendChild(style);
