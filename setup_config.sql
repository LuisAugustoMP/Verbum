-- Query para criar e popular a tabela de configurações do Verbum

-- 1. Criar a tabela de configuração
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Habilitar RLS (Segurança de Nível de Linha) para leitura pública via Anon Key
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso de leitura público" ON config FOR SELECT USING (true);

-- 3. Inserir os dados iniciais
INSERT INTO config (key, value, description) VALUES
('AGENT_NAME', 'Verbum', 'Nome do assistente AI'),
('OPENROUTER_API_KEY', '[SUA_CHAVE_OPENROUTER_AQUI]', 'Chave da API OpenRouter'),
('OPENROUTER_MODEL', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'Modelo de linguagem principal'),
('GOOGLE_DRIVE_API_KEY', '[ENCRYPTION_KEY]', 'Chave da API Google Drive'),
('GOOGLE_DRIVE_FOLDER_ID', '15X83X57J1Wp_h3278n84rP3i19kQ1u9d', 'Pasta raiz para sincronização RAG'),
('EMBEDDING_MODEL', 'openai/text-embedding-3-small', 'Modelo para geração de vetores'),
('MAX_HISTORY', '20', 'Número máximo de mensagens no histórico'),
('TOP_K_RESULTS', '10', 'Número de fragmentos recuperados no RAG'),
('TEMPERATURE', '0.4', 'Criatividade da resposta (0 a 1)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
