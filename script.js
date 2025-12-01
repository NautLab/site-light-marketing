// =============================================
// AUTH & USER STATE
// =============================================
let currentUser = null;
let userProfile = null;
let canProcess = false;

// Verificar autenticação ao carregar página
async function checkAuthStatus() {
    try {
        const session = await window.SupabaseClient?.checkAuth();
        
        if (session) {
            currentUser = await window.SupabaseClient.getCurrentUser();
            userProfile = await window.SupabaseClient.getUserProfile(currentUser.id);
            
            // Atualizar navegação
            document.getElementById('nav-login').style.display = 'none';
            document.getElementById('nav-dashboard').style.display = 'inline-block';
            
            // Verificar limites de uso
            await checkUsageLimits();
        } else {
            // Usuário não autenticado - redirecionar para login
            document.getElementById('nav-login').style.display = 'inline-block';
            document.getElementById('nav-dashboard').style.display = 'none';
            
            // Desabilitar ferramenta e mostrar aviso
            showLoginRequired();
        }
    } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
    }
}

// Verificar limites de uso
async function checkUsageLimits() {
    try {
        const limitData = await window.SupabaseClient.checkUsageLimit(currentUser.id);
        
        if (limitData && !limitData.can_process) {
            canProcess = false;
            showLimitReached(limitData);
        } else {
            canProcess = true;
        }
    } catch (error) {
        console.error('Erro ao verificar limites:', error);
        canProcess = true; // Em caso de erro, permitir uso
    }
}

// Mostrar aviso de login necessário
function showLoginRequired() {
    const toolCard = document.querySelector('.tool-card');
    if (toolCard) {
        toolCard.style.opacity = '0.6';
        toolCard.style.pointerEvents = 'none';
        
        // Adicionar overlay de bloqueio
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            z-index: 100;
        `;
        
        overlay.innerHTML = `
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-bottom: 20px;">
                <path d="M12 15V17M6 21H18C19.1046 21 20 20.1046 20 19V13C20 11.8954 19.1046 11 18 11H6C4.89543 11 4 11.8954 4 13V19C4 20.1046 4.89543 21 6 21ZM16 11V7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7V11H16Z" stroke="#0C7E92" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <h3 style="color: white; font-size: 24px; margin-bottom: 10px;">Login Necessário</h3>
            <p style="color: rgba(255, 255, 255, 0.8); margin-bottom: 25px;">Faça login para usar a ferramenta de formatação</p>
            <a href="login.html" style="background: #0C7E92; color: white; padding: 15px 40px; border-radius: 50px; text-decoration: none; font-weight: 700;">
                FAZER LOGIN
            </a>
        `;
        
        const heroRight = document.querySelector('.hero-right');
        if (heroRight) {
            heroRight.style.position = 'relative';
            heroRight.appendChild(overlay);
        }
    }
}

// Mostrar aviso de limite atingido
function showLimitReached(limitData) {
    const toolCard = document.querySelector('.tool-card');
    if (toolCard) {
        toolCard.style.opacity = '0.6';
        toolCard.style.pointerEvents = 'none';
        
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            z-index: 100;
        `;
        
        overlay.innerHTML = `
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-bottom: 20px;">
                <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#ffbb33" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <h3 style="color: white; font-size: 24px; margin-bottom: 10px;">Limite Atingido</h3>
            <p style="color: rgba(255, 255, 255, 0.8); margin-bottom: 25px;">
                Você usou ${limitData.current_usage} de ${limitData.monthly_limit} processamentos este mês.
                <br>Faça upgrade para continuar usando!
            </p>
            <a href="dashboard.html" style="background: #0C7E92; color: white; padding: 15px 40px; border-radius: 50px; text-decoration: none; font-weight: 700;">
                VER PLANOS
            </a>
        `;
        
        const heroRight = document.querySelector('.hero-right');
        if (heroRight) {
            heroRight.style.position = 'relative';
            heroRight.appendChild(overlay);
        }
    }
}

// Menu hambúrguer toggle
// Versão: 5.0 - Slide from right
const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');

// Criar overlay para o menu mobile
let menuOverlay = document.querySelector('.menu-overlay');
if (!menuOverlay) {
    menuOverlay = document.createElement('div');
    menuOverlay.className = 'menu-overlay';
    document.body.appendChild(menuOverlay);
}

menuToggle.addEventListener('click', () => {
    menuToggle.classList.toggle('active');
    nav.classList.toggle('active');
    menuOverlay.classList.toggle('active');
    document.body.classList.toggle('menu-open');
});

// Fechar menu ao clicar no overlay
menuOverlay.addEventListener('click', () => {
    menuToggle.classList.remove('active');
    nav.classList.remove('active');
    menuOverlay.classList.remove('active');
    document.body.classList.remove('menu-open');
});

// Fechar menu ao clicar em um link
const navLinks = document.querySelectorAll('.nav a');
navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Fechar menu
        menuToggle.classList.remove('active');
        nav.classList.remove('active');
        menuOverlay.classList.remove('active');
        document.body.classList.remove('menu-open');
        
        // Scroll sem focar no elemento (evita cursor de texto)
        const targetId = link.getAttribute('href');
        const targetSection = document.querySelector(targetId);
        
        if (targetSection) {
            // Usar scrollIntoView sem causar focus
            targetSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
            
            // Remover focus do elemento alvo para evitar cursor de texto
            setTimeout(() => {
                if (document.activeElement) {
                    document.activeElement.blur();
                }
            }, 100);
        }
    });
});

// Efeito de digitação no título com destaque
const typingElement = document.querySelector('.typing-text');
if (typingElement) {
    const normalText = 'Formatador de Etiquetas ';
    const highlightText = 'Shopee';
    let i = 0;
    let j = 0;
    let highlightSpan = null;
    
    function typeWriter() {
        if (i < normalText.length) {
            typingElement.textContent += normalText.charAt(i);
            i++;
            setTimeout(typeWriter, 80);
        } else if (j < highlightText.length) {
            // Criar o span na primeira letra de "Sit Amet"
            if (j === 0) {
                highlightSpan = document.createElement('span');
                highlightSpan.className = 'highlight';
                typingElement.appendChild(highlightSpan);
            }
            // Adicionar letra por letra dentro do span
            highlightSpan.textContent += highlightText.charAt(j);
            j++;
            
            // Se for a última letra, remover o cursor imediatamente
            if (j === highlightText.length) {
                typingElement.style.setProperty('--cursor-display', 'none');
            }
            
            setTimeout(typeWriter, 80);
        }
    }
    
    typeWriter();
}

// File input handlers
const pdfInput = document.getElementById('pdf-file');
const xlsxInput = document.getElementById('xlsx-file');
const pdfName = document.getElementById('pdf-name');
const xlsxName = document.getElementById('xlsx-name');
const processBtn = document.getElementById('process-btn');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const successMessage = document.getElementById('success-message');

// File selection handlers
pdfInput.addEventListener('change', function(e) {
    if (this.files && this.files[0]) {
        pdfName.textContent = this.files[0].name;
        pdfName.style.color = '#0C7E92';
    } else {
        pdfName.textContent = 'Nenhum arquivo selecionado';
        pdfName.style.color = 'rgba(255, 255, 255, 0.6)';
    }
});

xlsxInput.addEventListener('change', function(e) {
    if (this.files && this.files[0]) {
        xlsxName.textContent = this.files[0].name;
        xlsxName.style.color = '#0C7E92';
    } else {
        xlsxName.textContent = 'Nenhum arquivo selecionado';
        xlsxName.style.color = 'rgba(255, 255, 255, 0.6)';
    }
});

// Click on upload area to trigger file input
document.querySelectorAll('.file-upload').forEach((upload, index) => {
    upload.addEventListener('click', function() {
        if (index === 0) {
            pdfInput.click();
        } else {
            xlsxInput.click();
        }
    });
});

// Process button handler
processBtn.addEventListener('click', async function() {
    // Verificar autenticação
    if (!currentUser) {
        alert('Você precisa fazer login para usar a ferramenta.');
        window.location.href = 'login.html';
        return;
    }
    
    // Verificar limites
    if (!canProcess) {
        alert('Você atingiu o limite de processamentos do seu plano. Faça upgrade para continuar!');
        window.location.href = 'dashboard.html';
        return;
    }
    
    const pdfFile = pdfInput.files[0];
    const xlsxFile = xlsxInput.files[0];
    const processType = 'correios'; // Ou obter de um seletor se você adicionar
    
    // Validation
    if (!pdfFile) {
        alert('Por favor, selecione um arquivo PDF.');
        return;
    }
    
    if (!xlsxFile) {
        alert('Por favor, selecione um arquivo XLSX.');
        return;
    }
    
    // Hide success message if visible
    successMessage.style.display = 'none';
    
    // Show progress bar
    progressContainer.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = '0%';
    
    // Disable button
    processBtn.disabled = true;
    processBtn.style.opacity = '0.6';
    processBtn.style.cursor = 'not-allowed';
    
    const startTime = Date.now();
    
    // Simulate processing with progress
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 15;
        
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            
            // Show success message after a short delay
            setTimeout(async () => {
                const processingTime = Date.now() - startTime;
                
                // Registrar uso no Supabase
                const logged = await window.SupabaseClient.logUsage(
                    currentUser.id,
                    processType,
                    pdfFile.name,
                    xlsxFile.name
                );
                
                if (!logged) {
                    console.error('Erro ao registrar uso');
                }
                
                progressContainer.style.display = 'none';
                successMessage.style.display = 'flex';
                
                // Re-enable button
                processBtn.disabled = false;
                processBtn.style.opacity = '1';
                processBtn.style.cursor = 'pointer';
                
                // Simulate download (in a real implementation, this would download the processed files)
                console.log('Processing complete!');
                console.log('Process type:', processType);
                console.log('PDF file:', pdfFile.name);
                console.log('XLSX file:', xlsxFile.name);
                console.log('Processing time:', processingTime, 'ms');
                
                // Atualizar limites
                await checkUsageLimits();
                
                // Hide success message after 5 seconds
                setTimeout(() => {
                    successMessage.style.display = 'none';
                }, 5000);
            }, 500);
        }
        
        progressFill.style.width = progress + '%';
        progressText.textContent = Math.round(progress) + '%';
    }, 200);
});

// Add animation on scroll for steps - Desabilitado temporariamente para melhor performance
// const observerOptions = {
//     threshold: 0.15,
//     rootMargin: '0px'
// };

// const observer = new IntersectionObserver(function(entries) {
//     entries.forEach(entry => {
//         if (entry.isIntersecting && !entry.target.classList.contains('animated')) {
//             entry.target.classList.add('animated');
//             observer.unobserve(entry.target);
//         }
//     });
// }, observerOptions);

// // Observe all steps
// document.querySelectorAll('.step').forEach(step => {
//     observer.observe(step);
// });

// =============================================
// INITIALIZE AUTH CHECK
// =============================================
// Verificar autenticação quando a página carregar
if (window.SupabaseClient) {
    checkAuthStatus();
} else {
    // Aguardar o carregamento do Supabase
    window.addEventListener('load', () => {
        setTimeout(() => {
            if (window.SupabaseClient) {
                checkAuthStatus();
            }
        }, 500);
    });
}

// Prevent default drag and drop on upload areas
document.querySelectorAll('.file-upload').forEach(upload => {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        upload.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    // Highlight on drag
    ['dragenter', 'dragover'].forEach(eventName => {
        upload.addEventListener(eventName, function() {
            this.style.background = 'rgba(12, 126, 146, 0.2)';
            this.style.borderColor = '#0C7E92';
        });
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        upload.addEventListener(eventName, function() {
            this.style.background = 'rgba(12, 126, 146, 0.08)';
            this.style.borderColor = 'rgba(12, 126, 146, 0.4)';
        });
    });
    
    // Handle drop
    upload.addEventListener('drop', function(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            const file = files[0];
            const uploadIndex = Array.from(document.querySelectorAll('.file-upload')).indexOf(this);
            
            if (uploadIndex === 0 && file.type === 'application/pdf') {
                pdfInput.files = files;
                pdfName.textContent = file.name;
                pdfName.style.color = '#0C7E92';
            } else if (uploadIndex === 1 && (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.type === 'application/vnd.ms-excel')) {
                xlsxInput.files = files;
                xlsxName.textContent = file.name;
                xlsxName.style.color = '#0C7E92';
            }
        }
    });
});
