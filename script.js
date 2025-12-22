// Menu hambúrguer toggle
// Versão: 7.0 - Integração com processador de etiquetas
const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');

// Criar overlay para o menu mobile
let menuOverlay = document.querySelector('.menu-overlay');
if (!menuOverlay) {
    menuOverlay = document.createElement('div');
    menuOverlay.className = 'menu-overlay';
    document.body.appendChild(menuOverlay);
}

// Função para fechar dropdown da conta
function closeAccountDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        dropdown.classList.remove('active');
    }
}

menuToggle.addEventListener('click', () => {
    // Fechar dropdown da conta antes de abrir menu
    closeAccountDropdown();
    
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
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const processingReport = document.getElementById('processing-report');
const downloadBtn = document.getElementById('download-btn');

// Variável para armazenar o PDF gerado
let generatedPdfBlob = null;

// File selection handlers
pdfInput.addEventListener('change', function(e) {
    if (this.files && this.files[0]) {
        pdfName.textContent = this.files[0].name;
        pdfName.style.color = '#0C7E92';
        // Configura o arquivo no processador
        if (typeof labelProcessor !== 'undefined') {
            labelProcessor.setPdfFile(this.files[0]);
        }
    } else {
        pdfName.textContent = 'Nenhum arquivo selecionado';
        pdfName.style.color = 'rgba(255, 255, 255, 0.6)';
    }
    // Esconde mensagens anteriores
    hideAllMessages();
});

xlsxInput.addEventListener('change', function(e) {
    if (this.files && this.files[0]) {
        xlsxName.textContent = this.files[0].name;
        xlsxName.style.color = '#0C7E92';
        // Configura o arquivo no processador
        if (typeof labelProcessor !== 'undefined') {
            labelProcessor.setXlsxFile(this.files[0]);
        }
    } else {
        xlsxName.textContent = 'Nenhum arquivo selecionado';
        xlsxName.style.color = 'rgba(255, 255, 255, 0.6)';
    }
    // Esconde mensagens anteriores
    hideAllMessages();
});

// Função para esconder todas as mensagens
function hideAllMessages() {
    if (successMessage) successMessage.style.display = 'none';
    if (errorMessage) errorMessage.style.display = 'none';
    if (processingReport) processingReport.style.display = 'none';
    if (progressContainer) progressContainer.style.display = 'none';
}

// Função para mostrar erro
function showError(message) {
    hideAllMessages();
    if (errorMessage && errorText) {
        errorText.textContent = message;
        errorMessage.style.display = 'flex';
    } else {
        alert(message);
    }
}

// Função para mostrar relatório
function showReport(report) {
    if (!processingReport) return;
    
    document.getElementById('stat-total').textContent = report.total;
    document.getElementById('stat-with-data').textContent = report.withData;
    document.getElementById('stat-without-data').textContent = report.withoutData;
    
    const missingList = document.getElementById('missing-list');
    const missingTrackingNumbers = document.getElementById('missing-tracking-numbers');
    
    if (report.missingTrackingNumbers && report.missingTrackingNumbers.length > 0) {
        missingTrackingNumbers.innerHTML = report.missingTrackingNumbers
            .map(tn => `<li>${tn}</li>`)
            .join('');
        missingList.style.display = 'block';
    } else {
        missingList.style.display = 'none';
    }
    
    processingReport.style.display = 'block';
}

// Função para atualizar progresso
function updateProgress(progress) {
    if (progressFill && progressText) {
        progressFill.style.width = progress + '%';
        progressText.textContent = Math.round(progress) + '%';
    }
}

// Download do PDF gerado
if (downloadBtn) {
    downloadBtn.addEventListener('click', function() {
        if (generatedPdfBlob) {
            // Gera nome do arquivo com data
            const now = new Date();
            const dataFormatada = now.toISOString().slice(0, 10); // YYYY-MM-DD
            const fileName = `Light_Marketing-Shopee_${dataFormatada}.pdf`;
            
            const url = URL.createObjectURL(generatedPdfBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    });
}

// Click on upload area to trigger file input
// REMOVIDO: Estava causando duplo clique porque o label já faz isso
// Os labels com atributo 'for' já acionam o input automaticamente

// Process button handler
processBtn.addEventListener('click', async function() {
    const pdfFile = pdfInput.files[0];
    const xlsxFile = xlsxInput.files[0];
    
    // Validation
    if (!pdfFile) {
        showError('Por favor, selecione um arquivo PDF.');
        return;
    }
    
    if (!xlsxFile) {
        showError('Por favor, selecione um arquivo XLSX.');
        return;
    }
    
    // Verifica se o processador está disponível
    if (typeof labelProcessor === 'undefined') {
        showError('Erro: Processador de etiquetas não carregado. Por favor, recarregue a página.');
        return;
    }
    
    // Hide all messages and reset
    hideAllMessages();
    generatedPdfBlob = null;
    
    // Show progress bar
    progressContainer.style.display = 'block';
    updateProgress(0);
    
    // Disable button
    processBtn.disabled = true;
    processBtn.style.opacity = '0.6';
    processBtn.style.cursor = 'not-allowed';
    
    try {
        // Reset e configura os arquivos
        labelProcessor.reset();
        labelProcessor.setPdfFile(pdfFile);
        labelProcessor.setXlsxFile(xlsxFile);
        
        // Processa os arquivos
        const result = await labelProcessor.process(updateProgress);
        
        if (result.success) {
            // Armazena o blob gerado
            generatedPdfBlob = result.blob;
            
            // Mostra mensagem de sucesso
            progressContainer.style.display = 'none';
            successMessage.style.display = 'flex';
            
            // Mostra o relatório
            showReport(result.results);
            
            console.log('Processamento concluído!');
            console.log('Total:', result.results.total);
            console.log('Com dados:', result.results.withData);
            console.log('Sem dados:', result.results.withoutData);
        }
    } catch (error) {
        console.error('Erro no processamento:', error);
        console.error('Stack:', error.stack);
        progressContainer.style.display = 'none';
        
        // Mostra erro detalhado
        let errorMsg = error.message || 'Erro desconhecido ao processar arquivos';
        if (errorMsg.includes('ArrayBuffer')) {
            errorMsg = 'Erro ao processar PDF: O arquivo pode estar corrompido ou em formato inválido. Tente exportar o PDF novamente.';
        }
        showError(errorMsg);
    } finally {
        // Re-enable button
        processBtn.disabled = false;
        processBtn.style.opacity = '1';
        processBtn.style.cursor = 'pointer';
    }
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
