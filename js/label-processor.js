/**
 * Light Marketing - Processador de Etiquetas Shopee
 * Versão: 2.0.0
 * 
 * Sistema 100% client-side para processamento de etiquetas de envio.
 * Todo o processamento ocorre exclusivamente no navegador do usuário.
 * Nenhum arquivo é enviado para servidor.
 */

class LabelProcessor {
    constructor() {
        // Configurações padrão
        this.config = {
            outputSize: {
                width: 100, // mm
                height: 150, // mm (A6 aproximado)
            },
            textPosition: {
                x: 5, // mm da borda esquerda
                y: 145, // mm do topo
            },
            fontSize: 8,
            fontFamily: 'Helvetica',
            // Fator de escala para renderização (maior = melhor qualidade)
            renderScale: 2,
        };

        // Estado do processamento
        this.state = {
            processing: false,
            pdfFile: null,
            xlsxFile: null,
            xlsxData: null,
            extractedLabels: [],
            pdfArrayBuffer: null, // Cache do ArrayBuffer do PDF
            results: {
                total: 0,
                withData: 0,
                withoutData: 0,
                missingTrackingNumbers: [],
            },
        };

        // Regex para extrair tracking number das etiquetas
        // Formato: BR seguido de letras maiúsculas e números (geralmente 13 caracteres)
        this.trackingNumberRegex = /BR[A-Z0-9]{9,15}BR|BR[A-Z0-9]{9,15}/gi;
    }

    /**
     * Reset do estado
     */
    reset() {
        this.state = {
            processing: false,
            pdfFile: null,
            xlsxFile: null,
            xlsxData: null,
            extractedLabels: [],
            pdfArrayBuffer: null,
            results: {
                total: 0,
                withData: 0,
                withoutData: 0,
                missingTrackingNumbers: [],
            },
        };
    }

    /**
     * Define o arquivo PDF
     */
    setPdfFile(file) {
        this.state.pdfFile = file;
    }

    /**
     * Define o arquivo XLSX
     */
    setXlsxFile(file) {
        this.state.xlsxFile = file;
    }

    /**
     * Lê e processa o arquivo XLSX
     * @returns {Promise<Object>} Mapa de tracking_number -> dados
     */
    async parseXlsx() {
        return new Promise((resolve, reject) => {
            if (!this.state.xlsxFile) {
                reject(new Error('Arquivo XLSX não selecionado'));
                return;
            }

            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    // Pega a primeira planilha
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    // Converte para JSON
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);
                    
                    if (jsonData.length === 0) {
                        reject(new Error('Planilha XLSX está vazia'));
                        return;
                    }

                    // Mapa para armazenar dados por tracking_number
                    const dataMap = new Map();
                    const duplicates = [];

                    // Procura pela coluna de tracking_number
                    // Tenta diferentes nomes possíveis
                    const trackingColumns = [
                        'tracking_number',
                        'Tracking Number',
                        'TrackingNumber',
                        'tracking',
                        'Tracking',
                        'Número de Rastreio',
                        'numero_rastreio',
                        'Código de Rastreio',
                        'codigo_rastreio',
                        'N° de rastreamento',
                        'Numero de rastreamento',
                        'rastreio',
                        'Rastreio'
                    ];

                    // Encontra a coluna de tracking
                    let trackingColumn = null;
                    const firstRow = jsonData[0];
                    
                    for (const col of trackingColumns) {
                        if (firstRow.hasOwnProperty(col)) {
                            trackingColumn = col;
                            break;
                        }
                    }

                    // Se não encontrou, procura por coluna que contém códigos BR
                    if (!trackingColumn) {
                        for (const key of Object.keys(firstRow)) {
                            const value = String(firstRow[key] || '');
                            if (this.trackingNumberRegex.test(value)) {
                                trackingColumn = key;
                                break;
                            }
                        }
                    }

                    if (!trackingColumn) {
                        reject(new Error('Não foi possível encontrar a coluna de tracking number na planilha. Certifique-se de que existe uma coluna com códigos de rastreio (ex: BR123456789BR)'));
                        return;
                    }

                    // Processa cada linha
                    for (const row of jsonData) {
                        let trackingNumber = String(row[trackingColumn] || '').trim().toUpperCase();
                        
                        // Extrai o código BR se estiver em um texto maior
                        const matches = trackingNumber.match(this.trackingNumberRegex);
                        if (matches && matches.length > 0) {
                            trackingNumber = matches[0];
                        }

                        if (!trackingNumber) continue;

                        // Verifica duplicatas
                        if (dataMap.has(trackingNumber)) {
                            duplicates.push(trackingNumber);
                        } else {
                            dataMap.set(trackingNumber, row);
                        }
                    }

                    // Se houver duplicatas, aborta o processamento
                    if (duplicates.length > 0) {
                        reject(new Error(`Tracking numbers duplicados encontrados na planilha:\n${duplicates.slice(0, 10).join('\n')}${duplicates.length > 10 ? `\n... e mais ${duplicates.length - 10}` : ''}`));
                        return;
                    }

                    this.state.xlsxData = dataMap;
                    resolve(dataMap);
                } catch (error) {
                    reject(new Error(`Erro ao processar XLSX: ${error.message}`));
                }
            };

            reader.onerror = () => {
                reject(new Error('Erro ao ler arquivo XLSX'));
            };

            reader.readAsArrayBuffer(this.state.xlsxFile);
        });
    }

    /**
     * Extrai texto de uma página do PDF usando PDF.js
     * @param {PDFPageProxy} page - Página do PDF
     * @returns {Promise<string>} Texto extraído
     */
    async extractTextFromPage(page) {
        const textContent = await page.getTextContent();
        return textContent.items.map(item => item.str).join(' ');
    }

    /**
     * Extrai texto de uma área específica da página
     * @param {PDFPageProxy} page - Página do PDF
     * @param {Object} bounds - Limites da área {x, y, width, height}
     * @returns {Promise<string>} Texto extraído da área
     */
    async extractTextFromArea(page, bounds) {
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        
        // Filtra items de texto que estão dentro da área especificada
        const textsInArea = textContent.items.filter(item => {
            const tx = item.transform[4];
            const ty = item.transform[5];
            
            // Converte coordenadas PDF para coordenadas da viewport
            // PDF usa Y de baixo para cima, então invertemos
            const itemX = tx;
            const itemY = viewport.height - ty;
            
            // Verifica se o item está dentro dos limites
            // Ajusta para coordenadas normalizadas da página
            const normalizedBounds = {
                x: bounds.x,
                y: viewport.height - bounds.y - bounds.height,
                width: bounds.width,
                height: bounds.height
            };
            
            return itemX >= normalizedBounds.x && 
                   itemX <= normalizedBounds.x + normalizedBounds.width &&
                   itemY >= normalizedBounds.y && 
                   itemY <= normalizedBounds.y + normalizedBounds.height;
        });
        
        return textsInArea.map(item => item.str).join(' ');
    }

    /**
     * Processa o PDF de entrada e extrai as etiquetas
     * @param {Function} progressCallback - Callback para atualizar progresso
     * @returns {Promise<Array>} Array de etiquetas extraídas
     */
    async processPdf(progressCallback = () => {}) {
        return new Promise(async (resolve, reject) => {
            if (!this.state.pdfFile) {
                reject(new Error('Arquivo PDF não selecionado'));
                return;
            }

            try {
                // Lê o arquivo uma vez e armazena no cache
                if (!this.state.pdfArrayBuffer) {
                    this.state.pdfArrayBuffer = await this.state.pdfFile.arrayBuffer();
                }
                
                // Cria cópias do buffer para cada biblioteca
                const bufferForPdfJs = this.state.pdfArrayBuffer.slice(0);
                const bufferForPdfLib = this.state.pdfArrayBuffer.slice(0);
                
                // Carrega o PDF com PDF.js para extrair texto
                const loadingTask = pdfjsLib.getDocument({ data: bufferForPdfJs });
                const pdfDoc = await loadingTask.promise;
                
                // Carrega o PDF com pdf-lib para manipulação
                const pdfLibDoc = await PDFLib.PDFDocument.load(bufferForPdfLib);
                
                const numPages = pdfDoc.numPages;
                const labels = [];

                // Cada página contém 4 etiquetas (2x2)
                for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                    progressCallback(Math.round((pageNum / numPages) * 50));

                    // Extrai texto da página para encontrar tracking numbers
                    const page = await pdfDoc.getPage(pageNum);
                    const viewport = page.getViewport({ scale: 1 });
                    
                    // Obtém as dimensões da página
                    const pdfLibPage = pdfLibDoc.getPage(pageNum - 1);
                    const { width, height } = pdfLibPage.getSize();

                    // Define os 4 quadrantes (posições das etiquetas)
                    // Ordem: Superior Esquerdo, Superior Direito, Inferior Esquerdo, Inferior Direito
                    const quadrants = [
                        { name: 'Superior Esquerdo', x: 0, y: height / 2, w: width / 2, h: height / 2 },
                        { name: 'Superior Direito', x: width / 2, y: height / 2, w: width / 2, h: height / 2 },
                        { name: 'Inferior Esquerdo', x: 0, y: 0, w: width / 2, h: height / 2 },
                        { name: 'Inferior Direito', x: width / 2, y: 0, w: width / 2, h: height / 2 },
                    ];

                    // Para cada quadrante, extrai o texto e encontra o tracking number
                    for (let i = 0; i < 4; i++) {
                        const quadrant = quadrants[i];
                        
                        // Extrai texto do quadrante específico
                        const quadrantText = await this.extractTextFromArea(page, {
                            x: quadrant.x,
                            y: quadrant.y,
                            width: quadrant.w,
                            height: quadrant.h
                        });
                        
                        // Encontra tracking numbers no texto do quadrante
                        const matches = quadrantText.match(this.trackingNumberRegex) || [];
                        // Remove duplicatas e pega o primeiro
                        const uniqueMatches = [...new Set(matches.map(m => m.toUpperCase()))];
                        const trackingNumber = uniqueMatches.length > 0 ? uniqueMatches[0] : null;
                        
                        labels.push({
                            pageNum,
                            quadrantIndex: i,
                            quadrant: quadrant.name,
                            trackingNumber,
                            bounds: {
                                x: quadrant.x,
                                y: quadrant.y,
                                width: quadrant.w,
                                height: quadrant.h,
                            },
                        });
                    }
                }

                this.state.extractedLabels = labels;
                resolve(labels);
            } catch (error) {
                reject(new Error(`Erro ao processar PDF: ${error.message}`));
            }
        });
    }

    /**
     * Encontra dados do XLSX para um tracking number
     * @param {string} trackingNumber - Número de rastreio
     * @returns {Object|null} Dados associados ou null
     */
    findXlsxData(trackingNumber) {
        if (!trackingNumber || !this.state.xlsxData) return null;
        return this.state.xlsxData.get(trackingNumber.toUpperCase()) || null;
    }

    /**
     * Extrai SKU e Variação do campo product_info
     * @param {string} productInfo - String com informações do produto
     * @returns {Object} Objeto com sku e variation
     */
    extractProductDetails(productInfo) {
        const result = { sku: '', variation: '' };
        if (!productInfo) return result;
        
        const str = String(productInfo);
        
        // Extrai SKU Reference No.
        const skuMatch = str.match(/SKU Reference No\.?:\s*([^;]+)/i);
        if (skuMatch) {
            result.sku = skuMatch[1].trim();
        }
        
        // Extrai Variation Name
        const variationMatch = str.match(/Variation Name:?\s*([^;]+)/i);
        if (variationMatch) {
            result.variation = variationMatch[1].trim();
        }
        
        return result;
    }

    /**
     * Gera o PDF de saída com etiquetas individuais
     * @param {Function} progressCallback - Callback para atualizar progresso
     * @returns {Promise<Blob>} PDF gerado como Blob
     */
    async generateOutputPdf(progressCallback = () => {}) {
        if (!this.state.pdfFile || this.state.extractedLabels.length === 0) {
            throw new Error('Processamento incompleto. Execute processPdf() primeiro.');
        }

        // Usa o buffer em cache ou lê novamente
        if (!this.state.pdfArrayBuffer) {
            this.state.pdfArrayBuffer = await this.state.pdfFile.arrayBuffer();
        }
        
        // Cria cópia do buffer
        const bufferForPdfJs = this.state.pdfArrayBuffer.slice(0);
        
        // Carrega o PDF com PDF.js para renderizar
        const loadingTask = pdfjsLib.getDocument({ data: bufferForPdfJs });
        const pdfJsDoc = await loadingTask.promise;
        
        // Carrega com pdf-lib para criar o PDF de saída
        const outputDoc = await PDFLib.PDFDocument.create();

        // Tamanho de saída em pontos (1 mm = 2.83465 pontos)
        const mmToPoints = 2.83465;
        const outputWidth = this.config.outputSize.width * mmToPoints;
        const outputHeight = this.config.outputSize.height * mmToPoints;

        // Reset dos resultados
        this.state.results = {
            total: 0,
            withData: 0,
            withoutData: 0,
            missingTrackingNumbers: [],
        };

        const totalLabels = this.state.extractedLabels.length;
        
        // Fonte padrão
        const font = await outputDoc.embedFont(PDFLib.StandardFonts.Helvetica);
        const boldFont = await outputDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

        // Área reservada para texto na parte inferior
        const textAreaHeight = 30;
        const availableHeight = outputHeight - textAreaHeight;

        // Escala de renderização para qualidade
        const renderScale = 2;

        // Cache de páginas renderizadas
        const renderedPages = {};

        for (let i = 0; i < totalLabels; i++) {
            const label = this.state.extractedLabels[i];
            progressCallback(50 + Math.round((i / totalLabels) * 45));

            // Renderiza a página se ainda não foi renderizada
            if (!renderedPages[label.pageNum]) {
                const page = await pdfJsDoc.getPage(label.pageNum);
                const viewport = page.getViewport({ scale: renderScale });
                
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                
                await page.render({
                    canvasContext: ctx,
                    viewport: viewport,
                }).promise;
                
                renderedPages[label.pageNum] = {
                    canvas,
                    width: viewport.width,
                    height: viewport.height,
                    originalWidth: viewport.width / renderScale,
                    originalHeight: viewport.height / renderScale,
                };
            }

            const rendered = renderedPages[label.pageNum];
            
            // Coordenadas do quadrante no canvas (considerando a escala)
            const quadX = label.bounds.x * renderScale;
            const quadY = (rendered.originalHeight - label.bounds.y - label.bounds.height) * renderScale;
            const quadWidth = label.bounds.width * renderScale;
            const quadHeight = label.bounds.height * renderScale;

            // Cria canvas para o recorte do quadrante
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = quadWidth;
            cropCanvas.height = quadHeight;
            const cropCtx = cropCanvas.getContext('2d');
            
            // Recorta o quadrante
            cropCtx.drawImage(
                rendered.canvas,
                quadX, quadY, quadWidth, quadHeight,
                0, 0, quadWidth, quadHeight
            );

            // Converte o canvas para PNG
            const pngDataUrl = cropCanvas.toDataURL('image/png');
            const pngBytes = await fetch(pngDataUrl).then(res => res.arrayBuffer());
            const pngImage = await outputDoc.embedPng(pngBytes);

            // Cria nova página
            const newPage = outputDoc.addPage([outputWidth, outputHeight]);

            // Calcula escala para ajustar a imagem na página
            const imgScaleX = outputWidth / quadWidth;
            const imgScaleY = availableHeight / quadHeight;
            const imgScale = Math.min(imgScaleX, imgScaleY);

            const imgWidth = quadWidth * imgScale;
            const imgHeight = quadHeight * imgScale;
            
            // Centraliza horizontalmente e posiciona no topo
            const imgX = (outputWidth - imgWidth) / 2;
            const imgY = textAreaHeight; // Deixa espaço para texto embaixo

            // Desenha a imagem da etiqueta
            newPage.drawImage(pngImage, {
                x: imgX,
                y: imgY,
                width: imgWidth,
                height: imgHeight,
            });

            // Busca dados do XLSX
            const xlsxData = this.findXlsxData(label.trackingNumber);
            this.state.results.total++;

            if (xlsxData) {
                this.state.results.withData++;
                
                // Extrai SKU e Variação do product_info
                const productInfoKey = Object.keys(xlsxData).find(k => 
                    k.toLowerCase().includes('product') || k.toLowerCase().includes('produto')
                );
                const productDetails = this.extractProductDetails(xlsxData[productInfoKey]);
                
                // Desenha fundo branco para o texto
                newPage.drawRectangle({
                    x: 0,
                    y: 0,
                    width: outputWidth,
                    height: textAreaHeight,
                    color: PDFLib.rgb(1, 1, 1),
                });
                
                // Adiciona informações na parte inferior
                let textY = textAreaHeight - 10;
                const textX = 5;
                const lineHeight = 10;
                
                // SKU
                if (productDetails.sku) {
                    newPage.drawText(productDetails.sku, {
                        x: textX,
                        y: textY,
                        size: 8,
                        font: boldFont,
                        color: PDFLib.rgb(0, 0, 0),
                    });
                    textY -= lineHeight;
                }
                
                // Variação
                if (productDetails.variation) {
                    newPage.drawText(productDetails.variation, {
                        x: textX,
                        y: textY,
                        size: 8,
                        font: font,
                        color: PDFLib.rgb(0, 0, 0),
                    });
                }
            } else {
                this.state.results.withoutData++;
                if (label.trackingNumber) {
                    this.state.results.missingTrackingNumbers.push(label.trackingNumber);
                } else {
                    this.state.results.missingTrackingNumbers.push(`Página ${label.pageNum} - ${label.quadrant}`);
                }

                // Adiciona aviso de dados não encontrados
                newPage.drawRectangle({
                    x: 0,
                    y: 0,
                    width: outputWidth,
                    height: textAreaHeight,
                    color: PDFLib.rgb(1, 0.92, 0.92),
                    borderColor: PDFLib.rgb(0.86, 0.2, 0.2),
                    borderWidth: 1,
                });

                newPage.drawText('SEM DADOS ASSOCIADOS', {
                    x: outputWidth / 2 - 55,
                    y: textAreaHeight / 2 - 4,
                    size: 10,
                    font: boldFont,
                    color: PDFLib.rgb(0.86, 0.2, 0.2),
                });
            }
        }

        progressCallback(98);

        // Gera o PDF final
        const pdfBytes = await outputDoc.save();
        return new Blob([pdfBytes], { type: 'application/pdf' });
    }

    /**
     * Processa os arquivos e gera o PDF de saída
     * @param {Function} progressCallback - Callback para atualizar progresso (0-100)
     * @returns {Promise<Object>} Resultado com blob do PDF e relatório
     */
    async process(progressCallback = () => {}) {
        if (this.state.processing) {
            throw new Error('Processamento já em andamento');
        }

        this.state.processing = true;

        try {
            progressCallback(5);
            
            // Processa o XLSX
            await this.parseXlsx();
            progressCallback(15);

            // Processa o PDF
            await this.processPdf((p) => progressCallback(15 + p * 0.4));
            progressCallback(55);

            // Gera o PDF de saída
            const outputBlob = await this.generateOutputPdf((p) => progressCallback(55 + p * 0.4));
            progressCallback(100);

            return {
                success: true,
                blob: outputBlob,
                results: this.state.results,
            };
        } catch (error) {
            throw error;
        } finally {
            this.state.processing = false;
        }
    }

    /**
     * Gera relatório de processamento
     * @returns {Object} Relatório formatado
     */
    getReport() {
        return {
            total: this.state.results.total,
            withData: this.state.results.withData,
            withoutData: this.state.results.withoutData,
            missingTrackingNumbers: this.state.results.missingTrackingNumbers,
            percentage: this.state.results.total > 0 
                ? Math.round((this.state.results.withData / this.state.results.total) * 100) 
                : 0,
        };
    }
}

// Instância global do processador
const labelProcessor = new LabelProcessor();
