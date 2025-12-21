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
            renderScale: 4,
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
                missingOrderNumbers: [],
            },
        };

        // Regex para extrair número do pedido das etiquetas Shopee
        // Formato: 6 dígitos (data) + letras/números alfanuméricos (ex: 251105VDG4NY6J)
        // Deve ter pelo menos 1 letra para não pegar códigos de barras numéricos
        this.orderNumberRegex = /\b\d{6}[A-Z][A-Z0-9]{5,11}\b/gi;
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
                missingOrderNumbers: [],
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

                    // Mapa para armazenar dados por order_sn (número do pedido)
                    const dataMap = new Map();
                    const duplicates = [];

                    // Procura pela coluna de order_sn (número do pedido)
                    // Tenta diferentes nomes possíveis
                    const orderColumns = [
                        'order_sn',
                        'Order SN',
                        'OrderSN',
                        'order_id',
                        'Order ID',
                        'Número do Pedido',
                        'numero_pedido',
                        'Pedido',
                        'pedido',
                        'Order Number',
                        'order_number'
                    ];

                    // Encontra a coluna de order_sn
                    let orderColumn = null;
                    const firstRow = jsonData[0];
                    
                    for (const col of orderColumns) {
                        if (firstRow.hasOwnProperty(col)) {
                            orderColumn = col;
                            break;
                        }
                    }

                    // Se não encontrou, procura por coluna que contém números de pedido (15-18 dígitos)
                    if (!orderColumn) {
                        for (const key of Object.keys(firstRow)) {
                            const value = String(firstRow[key] || '');
                            if (this.orderNumberRegex.test(value)) {
                                orderColumn = key;
                                break;
                            }
                        }
                    }

                    if (!orderColumn) {
                        reject(new Error('Não foi possível encontrar a coluna de número do pedido (order_sn) na planilha. Certifique-se de que existe uma coluna com números de pedido Shopee.'));
                        return;
                    }

                    // Processa cada linha
                    for (const row of jsonData) {
                        let orderNumber = String(row[orderColumn] || '').trim();
                        
                        // Extrai o número do pedido se estiver em um texto maior
                        const matches = orderNumber.match(this.orderNumberRegex);
                        if (matches && matches.length > 0) {
                            orderNumber = matches[0];
                        }

                        if (!orderNumber) continue;

                        // Verifica duplicatas
                        if (dataMap.has(orderNumber)) {
                            duplicates.push(orderNumber);
                        } else {
                            dataMap.set(orderNumber, row);
                        }
                    }

                    // Se houver duplicatas, aborta o processamento
                    if (duplicates.length > 0) {
                        reject(new Error(`Números de pedido duplicados encontrados na planilha:\n${duplicates.slice(0, 10).join('\n')}${duplicates.length > 10 ? `\n... e mais ${duplicates.length - 10}` : ''}`));
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

                    // Para cada quadrante, extrai o texto e encontra o número do pedido
                    for (let i = 0; i < 4; i++) {
                        const quadrant = quadrants[i];
                        
                        // Extrai texto do quadrante específico
                        const quadrantText = await this.extractTextFromArea(page, {
                            x: quadrant.x,
                            y: quadrant.y,
                            width: quadrant.w,
                            height: quadrant.h
                        });
                        
                        // Encontra números de pedido no texto do quadrante
                        const matches = quadrantText.match(this.orderNumberRegex) || [];
                        // Remove duplicatas e pega o primeiro
                        const uniqueMatches = [...new Set(matches)];
                        const orderNumber = uniqueMatches.length > 0 ? uniqueMatches[0] : null;
                        
                        // Log detalhado para debug
                        console.log(`Página ${pageNum}, Quadrante ${i}: Matches encontrados:`, matches);
                        if (!orderNumber && quadrantText.trim().length > 10) {
                            console.log(`Página ${pageNum}, Quadrante ${i} (${quadrant.name}): Texto detectado mas nenhum número de pedido encontrado`);
                            console.log(`Texto completo do quadrante:`, quadrantText);
                        }
                        
                        // Só adiciona a etiqueta se tiver número de pedido válido
                        // Ignora etiquetas em branco
                        if (orderNumber) {
                            labels.push({
                                pageNum,
                                quadrantIndex: i,
                                quadrant: quadrant.name,
                                orderNumber,
                                bounds: {
                                    x: quadrant.x,
                                    y: quadrant.y,
                                    width: quadrant.w,
                                    height: quadrant.h,
                                },
                            });
                        }
                    }
                }

                this.state.extractedLabels = labels;
                
                // Log do total de etiquetas encontradas
                console.log(`Total de etiquetas encontradas: ${labels.length}`);
                console.log(`Números de pedido detectados:`, labels.map(l => l.orderNumber));
                
                // Informa se nenhuma etiqueta válida foi encontrada
                if (labels.length === 0) {
                    console.warn('Aviso: Nenhuma etiqueta com número de pedido válido foi encontrada no PDF.');
                }
                
                resolve(labels);
            } catch (error) {
                reject(new Error(`Erro ao processar PDF: ${error.message}`));
            }
        });
    }

    /**
     * Encontra dados do XLSX para um número de pedido
     * @param {string} orderNumber - Número do pedido
     * @returns {Object|null} Dados associados ou null
     */
    findXlsxData(orderNumber) {
        if (!orderNumber || !this.state.xlsxData) return null;
        return this.state.xlsxData.get(orderNumber) || null;
    }

    /**
     * Extrai SKU e Variação do campo product_info
     * @param {string} productInfo - String com informações do produto
     * @returns {Object} Objeto com sku e variation
     */
    /**
     * Extrai todos os produtos do campo product_info
     * @param {string} productInfo - String com informações dos produtos
     * @returns {Array} Array de objetos com sku, variation e quantity
     */
    extractProductDetails(productInfo) {
        if (!productInfo) return [];
        
        const str = String(productInfo);
        const products = [];
        
        // Divide por [número] que indica múltiplos produtos
        const productBlocks = str.split(/\[\d+\]/).filter(block => block.trim());
        
        for (const block of productBlocks) {
            const product = { sku: '', variation: '', quantity: 1 };
            
            // Extrai SKU Reference No.
            const skuMatch = block.match(/SKU Reference No\.?:\s*([^;,]+)/i);
            if (skuMatch) {
                product.sku = skuMatch[1].trim();
            }
            
            // Extrai Variation Name (até o ponto e vírgula)
            const variationMatch = block.match(/Variation Name:?\s*([^;]+)/i);
            if (variationMatch) {
                product.variation = variationMatch[1].trim();
            }
            
            // Extrai Quantity
            const quantityMatch = block.match(/Quantity:?\s*(\d+)/i);
            if (quantityMatch) {
                product.quantity = parseInt(quantityMatch[1]);
            }
            
            // Só adiciona se tiver pelo menos SKU ou variação
            if (product.sku || product.variation) {
                products.push(product);
            }
        }
        
        // Se não encontrou produtos no formato esperado, tenta extrair como item único
        if (products.length === 0) {
            const product = { sku: '', variation: '', quantity: 1 };
            
            const skuMatch = str.match(/SKU Reference No\.?:\s*([^;,]+)/i);
            if (skuMatch) product.sku = skuMatch[1].trim();
            
            const variationMatch = str.match(/Variation Name:?\s*([^;]+)/i);
            if (variationMatch) product.variation = variationMatch[1].trim();
            
            const quantityMatch = str.match(/Quantity:?\s*(\d+)/i);
            if (quantityMatch) product.quantity = parseInt(quantityMatch[1]);
            
            if (product.sku || product.variation) {
                products.push(product);
            }
        }
        
        return products;
    }

    /**
     * Gera o PDF de saída com etiquetas individuais
     * @param {Function} progressCallback - Callback para atualizar progresso
     * @returns {Promise<Blob>} PDF gerado como Blob
     */
    async generateOutputPdf(progressCallback = () => {}) {
        if (!this.state.pdfFile) {
            throw new Error('Nenhum arquivo PDF foi selecionado.');
        }
        
        if (this.state.extractedLabels.length === 0) {
            throw new Error('Nenhuma etiqueta com número de pedido válido foi encontrada no PDF. Verifique se o arquivo contém etiquetas Shopee.');
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
            missingOrderNumbers: [],
        };

        const totalLabels = this.state.extractedLabels.length;
        
        // Fonte padrão
        const font = await outputDoc.embedFont(PDFLib.StandardFonts.Helvetica);
        const boldFont = await outputDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

        // Configurações da tabela
        const tableConfig = {
            minHeight: 35,           // Altura mínima da área de tabela
            maxHeight: 80,           // Altura máxima antes de criar página extra
            headerHeight: 0,         // Altura do cabeçalho (sem cabeçalho)
            lineHeight: 7,           // Altura por linha de texto
            rowPadding: 4,           // Padding vertical da linha
            padding: 5,              // Padding interno
            colWidths: [175, 80, 20], // SKU, Variação, Qtd
            fontSize: 7,
            headerFontSize: 7,
            maxSkuChars: 43,         // Máx caracteres SKU por linha (+8)
            maxVarChars: 19,         // Máx caracteres variação por linha (+6)
            maxQtyChars: 3,          // Máx caracteres quantidade por linha
        };

        // Escala de renderização para qualidade (maior = melhor)
        const renderScale = this.config.renderScale || 3;

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

            // Busca dados do XLSX primeiro para calcular altura necessária
            const xlsxData = this.findXlsxData(label.orderNumber);
            this.state.results.total++;

            if (xlsxData) {
                this.state.results.withData++;
                
                // Extrai produtos do product_info
                const productInfoKey = Object.keys(xlsxData).find(k => 
                    k.toLowerCase().includes('product') || k.toLowerCase().includes('produto')
                );
                const products = this.extractProductDetails(xlsxData[productInfoKey]);
                
                // Função auxiliar para quebrar texto em linhas
                const wrapText = (text, maxChars) => {
                    if (!text || text.length <= maxChars) return [text || ''];
                    const lines = [];
                    let remaining = text;
                    while (remaining.length > maxChars) {
                        lines.push(remaining.substring(0, maxChars));
                        remaining = remaining.substring(maxChars);
                    }
                    if (remaining) lines.push(remaining);
                    return lines;
                };
                
                // Calcula altura necessária para cada produto (considerando quebra de linha em todas as colunas)
                const productHeights = products.map(p => {
                    const skuLines = wrapText(p.sku, tableConfig.maxSkuChars).length;
                    const varLines = wrapText(p.variation, tableConfig.maxVarChars).length;
                    const qtyLines = wrapText(String(p.quantity), tableConfig.maxQtyChars).length;
                    const maxLines = Math.max(skuLines, varLines, qtyLines, 1);
                    // Altura dinâmica: padding + (número de linhas * altura da linha)
                    return { height: tableConfig.rowPadding + (maxLines * tableConfig.lineHeight), maxLines };
                });
                
                const totalProductsHeight = productHeights.reduce((a, b) => a + b.height, 0);
                const maxLinesInAnyProduct = Math.max(...productHeights.map(ph => ph.maxLines));
                let calculatedTableHeight = tableConfig.headerHeight + totalProductsHeight + tableConfig.padding * 2;
                
                // Verifica se precisa de página extra (altura > 80 OU qualquer produto com 4+ linhas)
                const needsExtraPage = calculatedTableHeight > tableConfig.maxHeight || maxLinesInAnyProduct >= 4;
                const textAreaHeight = needsExtraPage ? tableConfig.minHeight : Math.max(tableConfig.minHeight, calculatedTableHeight);
                
                // Reposiciona a imagem da etiqueta
                const availableHeightForImage = outputHeight - textAreaHeight;
                const imgScaleXNew = outputWidth / quadWidth;
                const imgScaleYNew = availableHeightForImage / quadHeight;
                const imgScaleNew = Math.min(imgScaleXNew, imgScaleYNew);
                const imgWidthNew = quadWidth * imgScaleNew;
                const imgHeightNew = quadHeight * imgScaleNew;
                const imgXNew = (outputWidth - imgWidthNew) / 2;
                
                // Redesenha a imagem com novo posicionamento
                newPage.drawRectangle({ x: 0, y: 0, width: outputWidth, height: outputHeight, color: PDFLib.rgb(1, 1, 1) });
                newPage.drawImage(pngImage, {
                    x: imgXNew,
                    y: textAreaHeight,
                    width: imgWidthNew,
                    height: imgHeightNew,
                });
                
                // Função para desenhar tabela em uma página
                const drawTable = (page, prods, startY, areaHeight) => {
                    const tableWidth = tableConfig.colWidths.reduce((a, b) => a + b, 0);
                    const tableX = (outputWidth - tableWidth) / 2;  // Centraliza horizontalmente
                    let currentY = startY;
                    
                    // Fundo branco
                    page.drawRectangle({
                        x: 0, y: 0, width: outputWidth, height: areaHeight,
                        color: PDFLib.rgb(1, 1, 1),
                    });
                    
                    // Linhas de produtos
                    for (let pIdx = 0; pIdx < prods.length; pIdx++) {
                        const prod = prods[pIdx];
                        const skuLines = wrapText(prod.sku, tableConfig.maxSkuChars);
                        const varLines = wrapText(prod.variation, tableConfig.maxVarChars);
                        const qtyLines = wrapText(String(prod.quantity), tableConfig.maxQtyChars);
                        const maxLines = Math.max(skuLines.length, varLines.length, qtyLines.length, 1);
                        // Altura dinâmica baseada no número de linhas
                        const rowH = tableConfig.rowPadding + (maxLines * tableConfig.lineHeight);
                        
                        // Retângulo da linha
                        page.drawRectangle({
                            x: tableX, y: currentY - rowH,
                            width: tableWidth, height: rowH,
                            borderColor: PDFLib.rgb(0, 0, 0), borderWidth: 0.5,
                        });
                        
                        // Linhas verticais
                        let colX = tableX;
                        for (let c = 0; c <= 3; c++) {
                            page.drawLine({
                                start: { x: colX, y: currentY },
                                end: { x: colX, y: currentY - rowH },
                                color: PDFLib.rgb(0, 0, 0), thickness: 0.5,
                            });
                            if (c < 3) colX += tableConfig.colWidths[c];
                        }
                        
                        // Texto SKU (com quebra de linha)
                        const lineSpacing = 7;
                        for (let l = 0; l < skuLines.length; l++) {
                            page.drawText(skuLines[l], {
                                x: tableX + 2,
                                y: currentY - 7 - (l * lineSpacing),
                                size: tableConfig.fontSize, font: font, color: PDFLib.rgb(0, 0, 0),
                            });
                        }
                        
                        // Texto Variação (com quebra de linha)
                        for (let l = 0; l < varLines.length; l++) {
                            page.drawText(varLines[l], {
                                x: tableX + tableConfig.colWidths[0] + 2,
                                y: currentY - 7 - (l * lineSpacing),
                                size: tableConfig.fontSize, font: font, color: PDFLib.rgb(0, 0, 0),
                            });
                        }
                        
                        // Quantidade (com quebra de linha se necessário)
                        for (let l = 0; l < qtyLines.length; l++) {
                            page.drawText(qtyLines[l], {
                                x: tableX + tableConfig.colWidths[0] + tableConfig.colWidths[1] + 5,
                                y: currentY - 7 - (l * lineSpacing),
                                size: tableConfig.fontSize, font: boldFont, color: PDFLib.rgb(0, 0, 0),
                            });
                        }
                        
                        currentY -= rowH;
                    }
                };
                
                if (needsExtraPage && products.length > 0) {
                    // Desenha indicador na página da etiqueta
                    newPage.drawRectangle({
                        x: 0, y: 0, width: outputWidth, height: textAreaHeight,
                        color: PDFLib.rgb(1, 1, 1),
                    });
                    newPage.drawText('>> Ver produtos na próxima página', {
                        x: tableConfig.padding, y: textAreaHeight / 2 - 3,
                        size: 8, font: font, color: PDFLib.rgb(0.4, 0.4, 0.4),
                    });
                    
                    // Cria página extra para tabela completa
                    const extraPage = outputDoc.addPage([outputWidth, outputHeight]);
                    extraPage.drawRectangle({ x: 0, y: 0, width: outputWidth, height: outputHeight, color: PDFLib.rgb(1, 1, 1) });
                    
                    // Título
                    extraPage.drawText(`Produtos - ${label.trackingNumber || 'S/N'}`, {
                        x: tableConfig.padding, y: outputHeight - 15,
                        size: 10, font: boldFont, color: PDFLib.rgb(0, 0, 0),
                    });
                    
                    // Desenha tabela completa
                    drawTable(extraPage, products, outputHeight - 25, outputHeight);
                } else {
                    // Desenha tabela diretamente na página
                    drawTable(newPage, products, textAreaHeight - tableConfig.padding, textAreaHeight);
                }
            } else {
                this.state.results.withoutData++;
                if (label.orderNumber) {
                    this.state.results.missingOrderNumbers.push(label.orderNumber);
                } else {
                    this.state.results.missingOrderNumbers.push(`Página ${label.pageNum} - ${label.quadrant}`);
                }

                const textAreaHeight = tableConfig.minHeight;
                
                // Calcula posicionamento da imagem para o caso sem dados
                const availableHeightForImage = outputHeight - textAreaHeight;
                const imgScaleXNo = outputWidth / quadWidth;
                const imgScaleYNo = availableHeightForImage / quadHeight;
                const imgScaleNo = Math.min(imgScaleXNo, imgScaleYNo);
                const imgWidthNo = quadWidth * imgScaleNo;
                const imgHeightNo = quadHeight * imgScaleNo;
                const imgXNo = (outputWidth - imgWidthNo) / 2;
                
                // Desenha fundo branco e imagem
                newPage.drawRectangle({ x: 0, y: 0, width: outputWidth, height: outputHeight, color: PDFLib.rgb(1, 1, 1) });
                newPage.drawImage(pngImage, {
                    x: imgXNo,
                    y: textAreaHeight,
                    width: imgWidthNo,
                    height: imgHeightNo,
                });
                
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
            missingOrderNumbers: this.state.results.missingOrderNumbers,
            percentage: this.state.results.total > 0 
                ? Math.round((this.state.results.withData / this.state.results.total) * 100) 
                : 0,
        };
    }
}

// Instância global do processador
const labelProcessor = new LabelProcessor();
