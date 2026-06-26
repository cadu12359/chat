# 💬 Chat IA Local

Chat com inteligência artificial rodando **100% local** na sua máquina, usando **Phi-3 Mini** via Ollama.  
Suporta **PDF** (extração de texto) e **áudio** (transcrição com Whisper).

---

## ✨ Funcionalidades

| Fase | Funcionalidade | Descrição |
|------|---------------|-----------|
| 1 | 💬 Chat Local | Converse com Phi-3 Mini via interface web |
| 2 | 📄 Chat com PDF | Upload de PDF, extrai texto no browser (PDF.js) |
| 3 | 🎤 Chat com Áudio | Upload de áudio (.mp3/.wav/.mp4), transcrição com Whisper |

---

## 📋 Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e rodando
- Mínimo **8 GB de RAM**
- ~5 GB de espaço em disco (para modelos)
- Conexão com internet (apenas no primeiro uso, para baixar modelos)

---

## 🚀 Como Rodar

```bash
# 1. Clone o repositório
git clone <url-do-repo>
cd chat

# 2. Suba todos os serviços
docker compose up -d

# 3. Acompanhe o download do modelo phi3 (~2.3 GB, primeira vez apenas)
docker logs -f ollama-init

# 4. Acesse no browser
# http://localhost:8080
```

> **Nota:** Na primeira execução, o modelo Phi-3 (~2.3 GB) e o modelo Whisper Small (~500 MB) 
> serão baixados automaticamente. Isso pode levar alguns minutos dependendo da sua conexão.
> Nas execuções seguintes, os modelos ficam em cache e a inicialização é rápida.

### Parar os serviços

```bash
docker compose down
```

### Reconstruir (após alterações no código)

```bash
docker compose up -d --build
```

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────┐
│                    Browser                       │
│              http://localhost:8080                │
│                                                  │
│   HTML/CSS/JS  ·  PDF.js (extração no browser)   │
└──────────────┬──────────────┬────────────────────┘
               │              │
         fetch /api/chat   fetch /transcribe
               │              │
┌──────────────┴──────────────┴────────────────────┐
│               nginx (porta 8080)                  │
│           Frontend + Reverse Proxy                │
├──────────────────────┬───────────────────────────┤
│                      │                            │
│    ollama:11434      │    whisper-api:9000         │
│    Phi-3 Mini        │    faster-whisper (small)   │
│    (LLM local)       │    (transcrição CPU)        │
└──────────────────────┴───────────────────────────┘
```

| Serviço | Imagem | Função | Porta |
|---------|--------|--------|-------|
| `nginx` | `nginx:alpine` | Frontend + Reverse Proxy | **8080** (host) |
| `ollama` | `ollama/ollama` | LLM Phi-3 Mini | 11434 (interno) |
| `whisper-api` | Python 3.11 (custom) | Transcrição de áudio | 9000 (interno) |
| `ollama-init` | `ollama/ollama` | Download automático do modelo | — (sai após completar) |

---

## 📁 Estrutura do Projeto

```
chat/
├── docker-compose.yml          # Orquestra todos os serviços
├── README.md
├── frontend/                   # Interface web (HTML/CSS/JS puro)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── nginx/
│   └── nginx.conf              # Reverse proxy configuration
└── whisper-api/                # Serviço de transcrição de áudio
    ├── Dockerfile
    ├── requirements.txt
    └── app.py
```

---

## 🔧 Tecnologias

- **Ollama** — Roda LLMs localmente (Phi-3 Mini, ~2.3 GB)
- **PDF.js** — Extração de texto de PDF direto no browser (sem backend)
- **faster-whisper** — Transcrição de áudio em CPU (modelo small, int8)
- **Nginx** — Servidor web + reverse proxy
- **Docker Compose** — Orquestração dos serviços
- **HTML/CSS/JS** — Interface sem frameworks

---

## 📖 Uso

1. Acesse `http://localhost:8080`
2. **Chat:** Digite uma mensagem e converse com a IA
3. **PDF:** Clique no ícone 📄 para carregar um PDF — o texto será extraído automaticamente
4. **Áudio:** Clique no ícone 🎤 para carregar um áudio — será transcrito pelo Whisper
5. Faça perguntas sobre o conteúdo carregado!
6. Use o botão **"Nova conversa"** para limpar o histórico

---

## ⚠️ Notas

- A transcrição de áudio roda em **CPU** — pode levar alguns segundos/minutos dependendo do tamanho do arquivo
- PDFs muito longos: apenas as **primeiras 10 páginas** são extraídas para caber no contexto do modelo
- O Phi-3 Mini tem contexto limitado (~4K tokens) — prompts muito longos podem ser truncados
- Formatos de áudio aceitos: `.mp3`, `.mp4`, `.wav`, `.m4a`, `.ogg`, `.webm`
