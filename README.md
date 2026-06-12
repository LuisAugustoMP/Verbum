# Verbum — Assistente Teológico Reformado

Sistema de assistência teológica baseado em inteligência artificial, fundamentado **exclusivamente** na tradição cristã reformada histórica. Utiliza RAG (Retrieval-Augmented Generation) com busca vetorial para fornecer respostas embasadas em documentos teológicos próprios e nas Escrituras Sagradas.

**100% client-side** — hospedado no GitHub Pages, sem servidor próprio.

---

## Índice

1. [Visão Geral](#visão-geral)
2. [Funcionalidades](#funcionalidades)
3. [Arquitetura](#arquitetura)
4. [Pré-requisitos](#pré-requisitos)
5. [Configuração — Passo a Passo](#configuração--passo-a-passo)
   - [5.1 Supabase](#51-supabase)
   - [5.2 OpenRouter](#52-openrouter)
   - [5.3 Google Drive](#53-google-drive)
   - [5.4 Constantes no index.html](#54-constantes-no-indexhtml)
6. [Deploy no GitHub Pages](#deploy-no-github-pages)
7. [Uso do Sistema](#uso-do-sistema)
8. [Solução de Problemas](#solução-de-problemas)
9. [Segurança](#segurança)
10. [Tecnologias](#tecnologias)

---

## Visão Geral

O Verbum é um assistente teológico que opera dentro da cosmovisão cristã reformada histórica, fundamentado nos **Cinco Solas** da Reforma Protestante. O sistema utiliza:

- **RAG real** com busca vetorial (pgvector) para fundamentar respostas em documentos teológicos
- **Memória semântica** persistente por usuário
- **Base de conhecimento** indexada a partir do Google Drive
- **LLM gratuito** via OpenRouter com streaming de resposta
- **Interface premium** com esfera 3D animada (Three.js)

O sistema foi modularizado e consiste nos seguintes arquivos principais:
- `index.html` (Estrutura e bibliotecas)
- `styles.css` (Estilização visual)
- `script.js` (Lógica e integrações)
- `system-prompt.md` (Instruções da IA reformada)
- `README.md` (Documentação)

---

## Funcionalidades

| Funcionalidade | Descrição |
|---|---|
| **Autenticação** | Registro e login com bcryptjs (hash no navegador) + Supabase |
| **Chat com Streaming** | Respostas em tempo real, token a token, com Markdown renderizado |
| **RAG Completo** | Busca vetorial em documentos + memórias → contexto para o LLM |
| **Base de Conhecimento** | Sincronização manual de PDFs, DOCXs, TXTs e MDs do Google Drive |
| **Memória Semântica** | Cada interação gera embeddings salvos por usuário para personalização |
| **Esfera 3D** | Partículas animadas com shaders customizados — identidade visual do sistema |
| **Histórico** | Conversas persistentes com navegação por sidebar |
| **Cosmovisão Reformada** | Respostas estruturadas com fundamentação bíblica e exegese |

---

## Arquitetura

```
┌─────────────────────────────────────────────────────┐
│               NAVEGADOR (Client-Side)                │
│                                                       │
│  index.html                                           │
│  ├── styles.css (Estilos CSS customizados)           │
│  ├── script.js (Lógica principal do aplicativo)      │
│  ├── system-prompt.md (Carregado via fetch)          │
│  ├── Three.js (Esfera 3D fluida)                     │
│  ├── Supabase JS (Auth, Banco, pgvector via RPC)     │
│  ├── bcryptjs (Hash de senha)                        │
│  ├── marked.js (Renderização Markdown)               │
│  ├── pdf.js (Extração de texto de PDF)               │
│  └── mammoth.js (Extração de texto de DOCX)          │
└───────────────┬────────────┬──────────────┬──────────┘
                │            │              │
        ┌───────▼──────┐ ┌──▼───────┐ ┌───▼──────────┐
        │   Supabase   │ │OpenRouter│ │ Google Drive  │
        │  PostgreSQL  │ │  (LLM)   │ │   (Docs)     │
        │  + pgvector  │ │          │ │              │
        └──────────────┘ └──────────┘ └──────────────┘
```

---

## Pré-requisitos

Antes de começar, você precisará criar contas (gratuitas) em:

1. **[Supabase](https://supabase.com)** — banco de dados PostgreSQL com pgvector
2. **[OpenRouter](https://openrouter.ai)** — acesso a modelos de LLM
3. **[Google Cloud Console](https://console.cloud.google.com)** — API Key para Google Drive
4. **[GitHub](https://github.com)** — para hospedar no GitHub Pages

---

## Configuração — Passo a Passo

### 5.1 Supabase

#### 5.1.1 Criar Projeto

1. Acesse [supabase.com](https://supabase.com) e crie uma conta
2. Clique em **"New Project"**
3. Escolha um nome (ex: `verbum`), defina uma senha para o banco, e selecione a região mais próxima
4. Aguarde a criação do projeto

#### 5.1.2 Obter Credenciais

1. No painel do projeto, vá em **Settings → API**
2. Copie:
   - **Project URL** → será o `SUPABASE_URL`
   - **anon public key** → será o `SUPABASE_ANON_KEY`

#### 5.1.3 Executar SQL de Setup

Vá em **SQL Editor** no painel do Supabase e cole **todo** o SQL abaixo. Execute uma única vez:

```sql
-- ===========================================================
-- VERBUM — SQL DE SETUP COMPLETO
-- Execute este script UMA ÚNICA VEZ no SQL Editor do Supabase
-- ===========================================================

-- 1. Habilitar extensão pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabela de Usuários
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabela de Conversas
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  titulo TEXT DEFAULT 'Nova Conversa',
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabela de Mensagens
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  conteudo TEXT NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabela de Memórias (embeddings por usuário)
CREATE TABLE IF NOT EXISTS memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  conteudo TEXT NOT NULL,
  embedding vector(1536),
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Tabela de Documentos (metadados dos arquivos do Drive)
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  drive_file_id TEXT UNIQUE NOT NULL,
  hash TEXT,
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Tabela de Chunks de Documentos (fragmentos com embeddings)
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  conteudo TEXT NOT NULL,
  embedding vector(1536)
);

-- ===========================================================
-- ÍNDICES
-- ===========================================================

-- Índices para busca vetorial (HNSW — eficiente para qualquer volume)
CREATE INDEX IF NOT EXISTS idx_memories_embedding
  ON memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
  ON document_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages (conversation_id, criado_em);

CREATE INDEX IF NOT EXISTS idx_conversations_user
  ON conversations (user_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_memories_user
  ON memories (user_id);

-- ===========================================================
-- FUNÇÕES RPC (busca por similaridade via pgvector)
-- ===========================================================

-- Busca em chunks de documentos
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1536),
  match_count INT DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.4
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  conteudo TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.conteudo,
    (1 - (dc.embedding <=> query_embedding))::FLOAT AS similarity
  FROM document_chunks dc
  WHERE dc.embedding IS NOT NULL
    AND (1 - (dc.embedding <=> query_embedding)) > similarity_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Busca em memórias do usuário
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(1536),
  p_user_id UUID,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  conteudo TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.conteudo,
    (1 - (m.embedding <=> query_embedding))::FLOAT AS similarity
  FROM memories m
  WHERE m.user_id = p_user_id
    AND m.embedding IS NOT NULL
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

> **Nota sobre dimensão de vetores:** O SQL acima usa `vector(1536)`, compatível com o modelo de embeddings `openai/text-embedding-3-small`. Se você usar outro modelo com dimensão diferente, altere todos os `vector(1536)` para a dimensão correspondente antes de executar.

---

### 5.2 OpenRouter

#### 5.2.1 Criar Conta e Obter API Key

1. Acesse [openrouter.ai](https://openrouter.ai) e crie uma conta
2. Vá em **Keys** e clique em **"Create Key"**
3. Copie a chave gerada → será o `OPENROUTER_API_KEY`

#### 5.2.2 Escolher Modelos

**Modelo de Chat (LLM)** — modelos gratuitos recomendados:

| Modelo | ID no OpenRouter |
|---|---|
| DeepSeek Chat V3 | `deepseek/deepseek-chat-v3-0324:free` |
| Llama 4 Maverick | `meta-llama/llama-4-maverick:free` |
| Qwen3 30B | `qwen/qwen3-30b-a3b:free` |
| Gemma 3 27B | `google/gemma-3-27b-it:free` |

O modelo padrão configurado é `deepseek/deepseek-chat-v3-0324:free`. Você pode alterar a constante `OPENROUTER_MODEL` para qualquer modelo disponível.

**Modelo de Embeddings** — o modelo padrão é `openai/text-embedding-3-small` (pago, mas muito barato — ~$0.02 por 1M tokens). Certifique-se de que sua conta no OpenRouter tem créditos para embeddings.

> **Importante:** O modelo de embeddings precisa estar disponível no seu plano do OpenRouter. Verifique em [openrouter.ai/models](https://openrouter.ai/models) filtrando por "embedding".

---

### 5.3 Google Drive

#### 5.3.1 Preparar a Pasta de Documentos

1. No Google Drive, crie uma pasta para seus documentos teológicos (ex: `Base Teológica`)
2. Coloque seus arquivos na pasta: **PDFs, DOCXs, TXTs, MDs**
3. Clique com botão direito na pasta → **"Compartilhar"**
4. Altere o acesso para **"Qualquer pessoa com o link"** → **"Leitor"**
5. Copie o **ID da pasta** da URL: `https://drive.google.com/drive/folders/ESTE_ID_AQUI`
   - O ID é a parte após `/folders/` → será o `GOOGLE_DRIVE_FOLDER_ID`

#### 5.3.2 Criar API Key no Google Cloud

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Crie um novo projeto (ou selecione um existente)
3. Vá em **APIs & Services → Library**
4. Busque **"Google Drive API"** e clique em **Enable**
5. Vá em **APIs & Services → Credentials**
6. Clique em **"Create Credentials" → "API Key"**
7. Copie a chave → será o `GOOGLE_DRIVE_API_KEY`
8. **(Recomendado)** Restrinja a API Key:
   - Clique na chave criada
   - Em **"API restrictions"**, selecione **"Restrict key"** e escolha apenas **"Google Drive API"**
   - Em **"Application restrictions"**, selecione **"HTTP referrers"** e adicione o domínio do seu GitHub Pages (ex: `https://seuusuario.github.io/*`)

---

### 5.4 Constantes no script.js

Abra o arquivo `script.js` em um editor de texto e localize o bloco de configuração no início. Preencha todas as constantes:

```javascript
const AGENT_NAME        = "Verbum";              // Nome do agente (personalizável)
const OPENROUTER_API_KEY = "sk-or-v1-...";       // Sua API Key do OpenRouter
const OPENROUTER_MODEL  = "deepseek/deepseek-chat-v3-0324:free"; // Modelo de chat
const SUPABASE_URL      = "https://xxx.supabase.co";  // URL do seu projeto Supabase
const SUPABASE_ANON_KEY = "eyJ...";              // Anon Key do Supabase
const GOOGLE_DRIVE_API_KEY  = "AIza...";         // API Key do Google Cloud
const GOOGLE_DRIVE_FOLDER_ID = "1abc...";        // ID da pasta no Google Drive
const EMBEDDING_MODEL   = "openai/text-embedding-3-small"; // Modelo de embeddings
const MAX_HISTORY       = 20;                    // Mensagens de contexto por conversa
const TOP_K_RESULTS     = 10;                    // Resultados de busca vetorial
const TEMPERATURE       = 0.4;                   // Temperatura do LLM (0-1)
```

---

## Deploy no GitHub Pages

### Passo a Passo

1. **Crie um repositório** no GitHub (pode ser privado)

2. **Faça upload dos arquivos:**
   ```
   seu-repositorio/
   ├── index.html
   ├── styles.css
   ├── script.js
   ├── system-prompt.md
   └── README.md
   ```

3. **Ative o GitHub Pages:**
   - Vá em **Settings → Pages**
   - Em **Source**, selecione **"Deploy from a branch"**
   - Em **Branch**, selecione `main` e pasta `/root`
   - Clique em **Save**

4. **Aguarde o deploy** (1-2 minutos)

5. **Acesse** em: `https://seuusuario.github.io/nome-do-repositorio/`

> **Dica:** Se quiser acessar apenas em `https://seuusuario.github.io/`, nomeie o repositório como `seuusuario.github.io`.

---

## Uso do Sistema

### Primeiro Acesso

1. Acesse a URL do GitHub Pages
2. Na tela de login, insira um **Nome** e **Senha**
3. Clique em **"Criar Conta"**
4. Pronto! Você está logado

### Sincronizar Base de Conhecimento

1. Clique no ícone de **sincronização** (⟳) no canto superior direito
2. O sistema irá:
   - Listar os arquivos da pasta do Google Drive
   - Comparar com arquivos já indexados (por hash/data)
   - Baixar, extrair texto, fragmentar e gerar embeddings dos novos arquivos
   - Salvar tudo no Supabase
3. A esfera 3D muda para modo **"Pensando"** durante o processo
4. Uma barra de progresso mostra o arquivo sendo processado

> **Nota:** A sincronização pode demorar dependendo da quantidade e tamanho dos arquivos, e dos limites de rate da API de embeddings. Para bases grandes, é recomendável sincronizar em etapas.

### Fazer Perguntas

1. Digite sua pergunta teológica no campo inferior
2. Pressione **Enter** ou clique no botão de enviar
3. O sistema executa o fluxo RAG completo:
   - Gera embedding da pergunta
   - Busca memórias relevantes do usuário
   - Busca documentos relevantes na base de conhecimento
   - Constrói contexto e envia ao LLM
4. A resposta aparece em **streaming** (token a token)
5. A resposta segue a estrutura: Resposta Breve → Fundamentação Bíblica → Aplicação Prática → Fontes

### Gerenciar Conversas

- Clique no ícone de **menu** (☰) para abrir a sidebar
- Clique em **"Nova Conversa"** para iniciar um tema novo
- Clique em uma conversa existente para retomá-la
- Clique em **"Sair"** para fazer logout

---

## Solução de Problemas

### Erro: "Configure as credenciais do Supabase"

As constantes `SUPABASE_URL` e/ou `SUPABASE_ANON_KEY` estão vazias. Abra o `script.js` e preencha as credenciais conforme a seção 5.4.

### Erro: Tabelas não encontradas / relation does not exist

O SQL de setup não foi executado no Supabase. Vá em **SQL Editor** no painel do Supabase e execute todo o SQL da seção 5.1.3.

### Erro ao gerar embeddings

- Verifique se `OPENROUTER_API_KEY` está correta
- Verifique se o modelo de embeddings (`EMBEDDING_MODEL`) está disponível na sua conta OpenRouter
- Verifique se há créditos disponíveis (embeddings geralmente são pagos)

### Erro ao listar arquivos do Drive

- Verifique se a `GOOGLE_DRIVE_API_KEY` está correta
- Verifique se o `GOOGLE_DRIVE_FOLDER_ID` está correto
- Verifique se a pasta está compartilhada como **"Qualquer pessoa com o link"**
- Verifique se a **Google Drive API** está ativada no Google Cloud Console

### Erro CORS

- Todas as APIs usadas (Supabase, OpenRouter, Google Drive) suportam CORS nativamente
- Se estiver testando localmente com `file://`, alguns navegadores podem bloquear requests. Use um servidor local:
  ```bash
  npx serve .
  ```
  Ou abra com o Live Server do VS Code

### Respostas sem contexto dos documentos

- Verifique se a sincronização foi executada (ícone ⟳)
- Verifique se os documentos foram processados corretamente (veja o console do navegador)
- A busca vetorial requer similaridade mínima de 40% — perguntas muito genéricas podem não retornar resultados

### Esfera 3D não aparece

- Verifique o console do navegador para erros de Three.js
- Certifique-se de que o CDN do Three.js está acessível
- Em dispositivos mais antigos, WebGL pode não estar disponível

### Limites de API

- **OpenRouter:** Modelos gratuitos têm limites de requests por minuto. Aguarde alguns segundos entre mensagens se receber erro 429
- **Google Drive API:** 10.000 requests por dia (gratuito). Suficiente para sincronizações frequentes
- **Supabase (Free Tier):** 500MB de banco, 50.000 requests/mês. Suficiente para uso pessoal/grupo pequeno

---

## Segurança

> **⚠️ AVISO IMPORTANTE**

Este sistema foi projetado para um **pequeno grupo privado de usuários**. As seguintes decisões de segurança foram tomadas **intencionalmente**:

1. **API Keys no client-side:** As chaves de API (OpenRouter, Google Drive, Supabase) ficam expostas no código-fonte do `script.js`. Isso é intencional — o administrador do sistema é responsável por:
   - Restringir as API Keys por domínio (HTTP referrer)
   - Configurar limites de uso nas plataformas
   - Monitorar consumo

2. **Row Level Security (RLS):** O SQL de setup **não** inclui políticas RLS. O administrador deve configurar RLS manualmente no Supabase para:
   - Garantir que cada usuário só acesse seus próprios dados
   - Proteger tabelas sensíveis

3. **Senhas:** São hasheadas com bcryptjs (10 rounds) no navegador antes de serem armazenadas. A senha em texto plano **nunca** é enviada ou armazenada.

4. **Sessão:** Mantida via `localStorage` com user_id e nome. Não utiliza tokens JWT próprios — depende da Anon Key do Supabase para acesso ao banco.

O administrador do sistema (que é formado em Segurança de Dados) gerencia políticas de segurança, criptografia e RLS manualmente.

---

## Tecnologias

| Tecnologia | Uso | CDN |
|---|---|---|
| **Three.js** r128 | Esfera 3D de partículas com shaders | cdnjs |
| **Supabase JS** v2 | Auth, banco de dados, pgvector (RPC) | jsdelivr |
| **bcryptjs** 2.4.3 | Hash de senhas no navegador | jsdelivr |
| **marked.js** 9.1.6 | Renderização de Markdown | jsdelivr |
| **pdf.js** 3.11 | Extração de texto de PDF | cdnjs |
| **mammoth.js** 1.6 | Extração de texto de DOCX | cdnjs |

**Hospedagem:**
- Frontend: GitHub Pages
- Banco/Vetores: Supabase (PostgreSQL + pgvector)
- Conhecimento: Google Drive
- LLM: OpenRouter

---

## Estrutura das Respostas do Agente

Toda resposta do Verbum segue obrigatoriamente esta estrutura:

1. **Resposta Breve** — resumo direto da resposta
2. **Fundamentação Bíblica** — versículos com contexto exegético (exegese histórico-gramatical, analogia da fé)
3. **Aplicação Prática** — relevância para o cristão moderno
4. **Fontes Consultadas** — documentos da base de conhecimento utilizados

A hierarquia de autoridade é rigorosamente mantida: Escrituras → Idiomas Originais → Confissões Reformadas → Autores Reformados → Literatura Cristã Histórica.

---

## Licença

Projeto privado para uso pessoal e de grupo restrito.

---

*Soli Deo Gloria* 🕊️
# Verbum
