CREATE DATABASE IF NOT EXISTS Cashly;
USE Cashly;

DROP TABLE IF EXISTS metas;
DROP TABLE IF EXISTS transacoes;
DROP TABLE IF EXISTS categorias;
DROP TABLE IF EXISTS usuarios;

CREATE TABLE usuarios (
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categorias (
    id_categoria INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    tipo VARCHAR(10) NOT NULL,

    CONSTRAINT chk_categoria_tipo
        CHECK (tipo IN ('receita', 'despesa')),

    CONSTRAINT uq_categoria_nome_tipo
        UNIQUE (nome, tipo)
);

CREATE TABLE transacoes (
    id_transacao INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    categoria_id INT NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    data_transacao DATE NOT NULL,
    descricao VARCHAR(255),
    observacao VARCHAR(255),

    CONSTRAINT chk_transacao_valor
        CHECK (valor > 0),

    CONSTRAINT fk_transacao_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id_usuario),

    CONSTRAINT fk_transacao_categoria
        FOREIGN KEY (categoria_id)
        REFERENCES categorias(id_categoria),

    INDEX idx_transacao_usuario_data
        (usuario_id, data_transacao)
);

CREATE TABLE metas (
    id_meta INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    titulo VARCHAR(150) NOT NULL,
    valor_alvo DECIMAL(10,2) NOT NULL,
    valor_atual DECIMAL(10,2) NOT NULL DEFAULT 0,
    prazo DATE,

    CONSTRAINT chk_meta_valor_alvo
        CHECK (valor_alvo > 0),

    CONSTRAINT chk_meta_valor_atual
        CHECK (valor_atual >= 0),

    CONSTRAINT fk_meta_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id_usuario),

    INDEX idx_meta_usuario_prazo
        (usuario_id, prazo)
);

INSERT INTO categorias (nome, tipo) VALUES
    ('Salário', 'receita'),
    ('Rendimentos', 'receita'),
    ('Freelance', 'receita'),
    ('Outras receitas', 'receita'),

    ('Alimentação', 'despesa'),
    ('Moradia', 'despesa'),
    ('Transporte', 'despesa'),
    ('Saúde', 'despesa'),
    ('Educação', 'despesa'),
    ('Lazer', 'despesa'),
    ('Contas e serviços', 'despesa'),
    ('Compras', 'despesa'),
    ('Outras despesas', 'despesa');

-- Usuários de teste. Senha dos dois: 123456 (hash bcrypt real, aceito pelo login da API)
INSERT INTO usuarios (nome, email, senha_hash) VALUES
    ('Amanda', 'amanda@teste.com', '$2b$12$899Bkl9p8VNcj4HNOt/HDOQNz0MnlP9TYFL6pB3E7SN6trj4JcY9u'),
    ('Caio', 'caio@teste.com', '$2b$12$899Bkl9p8VNcj4HNOt/HDOQNz0MnlP9TYFL6pB3E7SN6trj4JcY9u');

-- Transações de exemplo da Amanda.
-- As datas são relativas a hoje (CURDATE()), assim o extrato mostra "Hoje" e "Ontem"
-- e existe um "mês passado" para comparar, em qualquer dia em que o script rodar.
-- dias = quantos dias atrás aconteceu a transação
INSERT INTO transacoes (usuario_id, categoria_id, valor, data_transacao, descricao)
SELECT u.id_usuario, c.id_categoria, d.valor, CURDATE() - INTERVAL d.dias DAY, d.descricao
FROM (
    -- Este mês
    SELECT 'Salário' AS categoria, 'receita' AS tipo, 4500.00 AS valor, 1 AS dias, 'Salário Finny Corp' AS descricao UNION ALL
    SELECT 'Alimentação', 'despesa',  184.90,  0, 'Mercado Livre'      UNION ALL
    SELECT 'Transporte',  'despesa',   24.50,  0, 'Uber Trip'          UNION ALL
    SELECT 'Lazer',       'despesa',   55.90,  1, 'Netflix Assinatura' UNION ALL
    SELECT 'Alimentação', 'despesa',   78.00,  1, 'iFood Delivery'     UNION ALL
    SELECT 'Saúde',       'despesa',   42.10,  2, 'Drogaria São Paulo' UNION ALL
    SELECT 'Moradia',     'despesa',  210.40,  2, 'Enel Distribuidora' UNION ALL
    SELECT 'Saúde',       'despesa',  119.90,  2, 'SmartFit Academia'  UNION ALL
    -- Mês passado (para a comparação dos Insights)
    SELECT 'Salário',     'receita', 4500.00, 31, 'Salário Finny Corp' UNION ALL
    SELECT 'Alimentação', 'despesa',  150.00, 35, 'Supermercado'       UNION ALL
    SELECT 'Alimentação', 'despesa',   62.00, 38, 'Restaurante'        UNION ALL
    SELECT 'Lazer',       'despesa',   55.90, 31, 'Netflix Assinatura' UNION ALL
    SELECT 'Moradia',     'despesa',  198.70, 33, 'Enel Distribuidora'
) AS d
JOIN categorias c ON c.nome = d.categoria AND c.tipo = d.tipo
JOIN usuarios u ON u.email = 'amanda@teste.com';

-- Metas de exemplo da Amanda (mesmos nomes do protótipo), com prazos no futuro
INSERT INTO metas (usuario_id, titulo, valor_alvo, valor_atual, prazo)
SELECT u.id_usuario, m.titulo, m.valor_alvo, m.valor_atual, CURDATE() + INTERVAL m.meses MONTH
FROM (
    SELECT 'Fundo de Emergência' AS titulo, 15000.00 AS valor_alvo, 8200.00 AS valor_atual, 6 AS meses UNION ALL
    SELECT 'Viagem Europa', 12000.00, 3400.00, 12 UNION ALL
    SELECT 'MacBook Pro',    9500.00, 6800.00,  4
) AS m
JOIN usuarios u ON u.email = 'amanda@teste.com';

SHOW TABLES;

DESCRIBE usuarios;
DESCRIBE categorias;
DESCRIBE transacoes;
DESCRIBE metas;

SELECT * FROM categorias;

-- Gasto por categoria no mês atual
SELECT c.nome AS categoria,
       SUM(t.valor) AS total_gasto
FROM transacoes t
JOIN categorias c ON c.id_categoria = t.categoria_id
WHERE t.usuario_id = 1
  AND c.tipo = 'despesa'
  AND t.data_transacao BETWEEN DATE_FORMAT(CURDATE(), '%Y-%m-01') AND LAST_DAY(CURDATE())
GROUP BY c.nome
ORDER BY total_gasto DESC;

-- Total de receitas e de despesas no mês atual
SELECT c.tipo,
       SUM(t.valor) AS total
FROM transacoes t
JOIN categorias c ON c.id_categoria = t.categoria_id
WHERE t.usuario_id = 1
  AND t.data_transacao BETWEEN DATE_FORMAT(CURDATE(), '%Y-%m-01') AND LAST_DAY(CURDATE())
GROUP BY c.tipo;

SELECT YEAR(t.data_transacao) AS ano,
       MONTH(t.data_transacao) AS mes,
       SUM(t.valor) AS total_gasto
FROM transacoes t
JOIN categorias c ON c.id_categoria = t.categoria_id
WHERE t.usuario_id = 1
  AND c.tipo = 'despesa'
GROUP BY YEAR(t.data_transacao), MONTH(t.data_transacao)
ORDER BY ano, mes;

SELECT MONTH(t.data_transacao) AS mes,
       SUM(t.valor) AS total_alimentacao
FROM transacoes t
JOIN categorias c ON c.id_categoria = t.categoria_id
WHERE t.usuario_id = 1
  AND c.nome = 'Alimentação'
GROUP BY MONTH(t.data_transacao)
ORDER BY mes;

SELECT c.nome AS categoria,
       COUNT(*) AS quantidade,
       SUM(t.valor) AS total
FROM transacoes t
JOIN categorias c ON c.id_categoria = t.categoria_id
WHERE t.usuario_id = 1
  AND c.tipo = 'despesa'
GROUP BY c.nome
HAVING COUNT(*) >= 2
ORDER BY quantidade DESC;

SELECT DAYOFWEEK(t.data_transacao) AS dia_da_semana,
       SUM(t.valor) AS total_gasto
FROM transacoes t
JOIN categorias c ON c.id_categoria = t.categoria_id
WHERE t.usuario_id = 1
  AND c.tipo = 'despesa'
GROUP BY DAYOFWEEK(t.data_transacao)
ORDER BY dia_da_semana;

SELECT SUM(CASE WHEN c.tipo = 'receita' THEN t.valor ELSE -t.valor END) AS saldo
FROM transacoes t
JOIN categorias c ON c.id_categoria = t.categoria_id
WHERE t.usuario_id = 1;

SELECT titulo,
       valor_atual,
       valor_alvo,
       ROUND(valor_atual / valor_alvo * 100) AS porcentagem
FROM metas
WHERE usuario_id = 1;
