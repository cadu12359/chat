/* ═══════════════════════════════════════════════════════════
   Chat IA Local — JavaScript Principal
   Fases 1-3: Chat + PDF + Áudio
   ═══════════════════════════════════════════════════════════ */

// ─── Estado da Aplicação ────────────────────────────────────
let messages = [];       // Histórico de mensagens { role, content }
let pdfContext = null;   // Texto extraído do PDF
let pdfFileName = null;
let audioContext = null; // Texto transcrito do áudio
let audioFileName = null;
let isGenerating = false;

// ─── Referências DOM ────────────────────────────────────────
const messagesEl = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const btnSend = document.getElementById('btn-send');
const btnPdf = document.getElementById('btn-pdf');
const btnAudio = document.getElementById('btn-audio');
const btnNewChat = document.getElementById('btn-new-chat');
const pdfInput = document.getElementById('pdf-input');
const audioInput = document.getElementById('audio-input');
const contextBadges = document.getElementById('context-badges');
const welcomeEl = document.getElementById('welcome');

// ─── Configuração do PDF.js ─────────────────────────────────
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ═══════════════════════════════════════════════════════════
// Event Listeners
// ═══════════════════════════════════════════════════════════

btnSend.addEventListener('click', sendMessage);

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

userInput.addEventListener('input', () => {
    autoResize();
    btnSend.disabled = !userInput.value.trim();
});

btnPdf.addEventListener('click', () => pdfInput.click());
btnAudio.addEventListener('click', () => audioInput.click());
pdfInput.addEventListener('change', handlePdfSelect);
audioInput.addEventListener('change', handleAudioSelect);
btnNewChat.addEventListener('click', newChat);

// ═══════════════════════════════════════════════════════════
// Chat: Enviar Mensagem
// ═══════════════════════════════════════════════════════════

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text || isGenerating) return;

    // Esconde tela de boas-vindas
    hideWelcome();

    // Adiciona mensagem do usuário na UI
    appendMessage('user', text);
    messages.push({ role: 'user', content: text });

    // Limpa input
    userInput.value = '';
    userInput.style.height = 'auto';
    btnSend.disabled = true;

    // Monta mensagens para a API
    const apiMessages = buildApiMessages();

    // Inicia geração
    isGenerating = true;
    const assistantEl = appendMessage('assistant', '');
    const contentEl = assistantEl.querySelector('.message-content');
    showTypingIndicator(contentEl);

    let fullResponse = '';

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'phi3',
                messages: apiMessages,
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let firstChunk = true;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(l => l.trim());

            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    if (data.message && data.message.content) {
                        if (firstChunk) {
                            removeTypingIndicator(contentEl);
                            firstChunk = false;
                        }
                        fullResponse += data.message.content;
                        contentEl.innerHTML = renderMarkdown(fullResponse);
                    }
                } catch (_) {
                    // Ignora linhas que não são JSON válido
                }
            }

            scrollToBottom();
        }

        // Garante que o indicador foi removido
        if (firstChunk) {
            removeTypingIndicator(contentEl);
        }

        // Salva no histórico
        messages.push({ role: 'assistant', content: fullResponse });
        contentEl.innerHTML = renderMarkdown(fullResponse);

    } catch (error) {
        removeTypingIndicator(contentEl);
        contentEl.innerHTML =
            '<span class="error">❌ Erro ao conectar com o modelo. ' +
            'Verifique se o Ollama está rodando e o modelo phi3 foi baixado.<br>' +
            '<small>(' + escapeHtml(error.message) + ')</small></span>';
    }

    isGenerating = false;
    userInput.focus();
    scrollToBottom();
}

// ═══════════════════════════════════════════════════════════
// Chat: Montar Mensagens para a API
// ═══════════════════════════════════════════════════════════

function buildApiMessages() {
    const apiMessages = [];

    // System prompt com contextos carregados
    let systemContent =
        'Você é um assistente IA útil, inteligente e amigável. ' +
        'Responda sempre em português do Brasil de forma clara e objetiva.';

    if (pdfContext) {
        systemContent +=
            '\n\nO usuário carregou um documento PDF. ' +
            'Use o conteúdo extraído abaixo como referência para responder perguntas:\n\n' +
            '--- INÍCIO DO PDF ---\n' + pdfContext + '\n--- FIM DO PDF ---';
    }

    if (audioContext) {
        systemContent +=
            '\n\nO usuário carregou um arquivo de áudio. ' +
            'Use a transcrição abaixo como referência para responder perguntas:\n\n' +
            '--- INÍCIO DA TRANSCRIÇÃO ---\n' + audioContext + '\n--- FIM DA TRANSCRIÇÃO ---';
    }

    apiMessages.push({ role: 'system', content: systemContent });

    // Adiciona histórico completo da conversa
    for (const msg of messages) {
        apiMessages.push({ role: msg.role, content: msg.content });
    }

    return apiMessages;
}

// ═══════════════════════════════════════════════════════════
// PDF: Upload e Extração de Texto
// ═══════════════════════════════════════════════════════════

async function handlePdfSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    hideWelcome();
    const badge = addContextBadge('pdf', file.name, 'Extraindo texto...');

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const maxPages = Math.min(pdf.numPages, 10);
        let fullText = '';

        for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str).join(' ');
            fullText += '[Página ' + i + ']\n' + pageText + '\n\n';
            updateBadgeStatus(badge, 'Página ' + i + '/' + maxPages);
        }

        if (pdf.numPages > 10) {
            fullText += '\n[... ' + (pdf.numPages - 10) + ' páginas restantes omitidas ...]';
        }

        pdfContext = fullText.trim();
        pdfFileName = file.name;
        finalizeBadge(badge, file.name, maxPages + ' pág.');

        appendSystemMessage(
            '📄 PDF "' + file.name + '" carregado (' + maxPages +
            ' de ' + pdf.numPages + ' páginas). Faça perguntas sobre o conteúdo!'
        );

    } catch (error) {
        removeBadge(badge);
        appendSystemMessage('❌ Erro ao ler o PDF: ' + error.message);
    }

    pdfInput.value = '';
}

// ═══════════════════════════════════════════════════════════
// Áudio: Upload e Transcrição
// ═══════════════════════════════════════════════════════════

async function handleAudioSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    hideWelcome();
    const badge = addContextBadge('audio', file.name, 'Transcrevendo...');

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/transcribe', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Erro HTTP ' + response.status);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        audioContext = data.text;
        audioFileName = file.name;
        const duration = data.duration ? Math.round(data.duration) + 's' : '';
        const lang = data.language ? ' · ' + data.language.toUpperCase() : '';
        finalizeBadge(badge, file.name, duration + lang);

        appendSystemMessage(
            '🎤 Áudio "' + file.name + '" transcrito com sucesso' +
            (data.duration ? ' (' + Math.round(data.duration) + ' segundos)' : '') +
            '. Faça perguntas sobre o conteúdo!'
        );

    } catch (error) {
        removeBadge(badge);
        appendSystemMessage('❌ Erro ao transcrever áudio: ' + error.message);
    }

    audioInput.value = '';
}

// ═══════════════════════════════════════════════════════════
// Nova Conversa
// ═══════════════════════════════════════════════════════════

function newChat() {
    messages = [];
    pdfContext = null;
    pdfFileName = null;
    audioContext = null;
    audioFileName = null;
    isGenerating = false;

    // Limpa mensagens
    messagesEl.innerHTML = '';

    // Limpa badges
    contextBadges.innerHTML = '';

    // Mostra welcome
    showWelcome();

    userInput.value = '';
    userInput.style.height = 'auto';
    btnSend.disabled = true;
    userInput.focus();
}

// ═══════════════════════════════════════════════════════════
// UI: Renderizar Mensagens
// ═══════════════════════════════════════════════════════════

function appendMessage(role, content) {
    const msgEl = document.createElement('div');
    msgEl.className = 'message message-' + role;

    const avatar = role === 'user' ? '👤' : '🤖';
    const label = role === 'user' ? 'Você' : 'Assistente';

    msgEl.innerHTML =
        '<div class="message-avatar">' + avatar + '</div>' +
        '<div class="message-body">' +
            '<div class="message-header">' + label + '</div>' +
            '<div class="message-content">' + (content ? renderMarkdown(content) : '') + '</div>' +
        '</div>';

    messagesEl.appendChild(msgEl);
    scrollToBottom();
    return msgEl;
}

function appendSystemMessage(text) {
    const msgEl = document.createElement('div');
    msgEl.className = 'message message-system';
    msgEl.innerHTML = '<div class="message-content">' + text + '</div>';
    messagesEl.appendChild(msgEl);
    scrollToBottom();
}

// ═══════════════════════════════════════════════════════════
// UI: Indicador de Digitação
// ═══════════════════════════════════════════════════════════

function showTypingIndicator(el) {
    el.innerHTML =
        '<div class="typing-indicator">' +
            '<span></span><span></span><span></span>' +
        '</div>';
}

function removeTypingIndicator(el) {
    const indicator = el.querySelector('.typing-indicator');
    if (indicator) indicator.remove();
}

// ═══════════════════════════════════════════════════════════
// UI: Badges de Contexto
// ═══════════════════════════════════════════════════════════

function addContextBadge(type, name, status) {
    // Remove badge existente do mesmo tipo
    const existing = document.getElementById('badge-' + type);
    if (existing) existing.remove();

    const badge = document.createElement('div');
    badge.className = 'badge badge-' + type + ' badge-loading';
    badge.id = 'badge-' + type;

    const icon = type === 'pdf' ? '📄' : '🎤';
    badge.innerHTML =
        '<span class="badge-icon">' + icon + '</span>' +
        '<span class="badge-name">' + escapeHtml(name) + '</span>' +
        '<span class="badge-status">' + status + '</span>' +
        '<button class="badge-remove" onclick="removeContext(\'' + type + '\')" title="Remover">×</button>';

    contextBadges.appendChild(badge);
    return badge;
}

function updateBadgeStatus(badge, status) {
    const statusEl = badge.querySelector('.badge-status');
    if (statusEl) statusEl.textContent = status;
}

function finalizeBadge(badge, name, status) {
    badge.classList.remove('badge-loading');
    const nameEl = badge.querySelector('.badge-name');
    const statusEl = badge.querySelector('.badge-status');
    if (nameEl) nameEl.textContent = name;
    if (statusEl) statusEl.textContent = status;
}

function removeBadge(badge) {
    if (badge && badge.parentNode) {
        badge.remove();
    }
}

// Função global para onclick dos badges
window.removeContext = function(type) {
    if (type === 'pdf') {
        pdfContext = null;
        pdfFileName = null;
    } else if (type === 'audio') {
        audioContext = null;
        audioFileName = null;
    }

    const badge = document.getElementById('badge-' + type);
    if (badge) removeBadge(badge);

    const label = type === 'pdf' ? 'PDF' : 'áudio';
    const icon = type === 'pdf' ? '📄' : '🎤';
    appendSystemMessage(icon + ' Contexto de ' + label + ' removido.');
};

// ═══════════════════════════════════════════════════════════
// UI: Welcome Screen
// ═══════════════════════════════════════════════════════════

function hideWelcome() {
    if (welcomeEl && welcomeEl.parentNode) {
        welcomeEl.style.display = 'none';
    }
}

function showWelcome() {
    // Recria o welcome
    const welcome = document.createElement('div');
    welcome.className = 'welcome';
    welcome.id = 'welcome';
    welcome.innerHTML =
        '<div class="welcome-glow"></div>' +
        '<div class="welcome-icon">🤖</div>' +
        '<h2>Olá! Sou seu assistente IA local</h2>' +
        '<p>Tudo roda na sua máquina — sem nuvem, sem custos, sem limites.</p>' +
        '<div class="welcome-features">' +
            '<div class="feature">' +
                '<span class="feature-icon">💬</span>' +
                '<span class="feature-label">Chat direto</span>' +
                '<span class="feature-desc">Converse com Phi-3</span>' +
            '</div>' +
            '<div class="feature">' +
                '<span class="feature-icon">📄</span>' +
                '<span class="feature-label">Leitura de PDF</span>' +
                '<span class="feature-desc">Extraia e pergunte</span>' +
            '</div>' +
            '<div class="feature">' +
                '<span class="feature-icon">🎤</span>' +
                '<span class="feature-label">Áudio para texto</span>' +
                '<span class="feature-desc">Transcrição Whisper</span>' +
            '</div>' +
        '</div>';
    messagesEl.appendChild(welcome);
}

// ═══════════════════════════════════════════════════════════
// Markdown Renderer (simples)
// ═══════════════════════════════════════════════════════════

function renderMarkdown(text) {
    if (!text) return '';

    let html = escapeHtml(text);

    // Blocos de código: ```lang\ncode\n```
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
        return '<pre><code class="language-' + lang + '">' + code.trim() + '</code></pre>';
    });

    // Código inline: `code`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Negrito: **text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Itálico: *text*
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Quebras de linha
    html = html.replace(/\n/g, '<br>');

    return html;
}

// ═══════════════════════════════════════════════════════════
// Utilitários
// ═══════════════════════════════════════════════════════════

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function autoResize() {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 150) + 'px';
}

function scrollToBottom() {
    const chatArea = document.getElementById('chat-area');
    chatArea.scrollTop = chatArea.scrollHeight;
}

// ─── Inicialização ──────────────────────────────────────────
userInput.focus();
