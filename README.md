# Cashly

**Projeto Cashly: Desenvolvimento de Plataforma Web para Gestão Financeira Pessoal e Prevenção do Endividamento de Jovens e Adultos**

O Cashly é um gerenciador financeiro pessoal na web. Com ele, o usuário registra receitas e despesas, acompanha o saldo do mês, define metas de economia e recebe insights sobre os próprios hábitos de consumo, para gastar com mais consciência e evitar dívidas.

---

## Funcionalidades

- **Cadastro e login**: senhas guardadas com hash bcrypt e autenticação por token JWT.
- **Visão Geral (Início)**: saldo, receitas e despesas do mês, gastos por categoria e evolução dos gastos nos últimos 7 dias.
- **Extrato**: lista de transações com filtros, além de criar, editar e excluir receitas e despesas.
- **Metas**: criação de metas de economia com valor-alvo e prazo, adição de fundos e acompanhamento do progresso.
- **Categorias**: distribuição geral dos gastos e detalhes de cada categoria.
- **Insights**:
  - categoria cujo gasto mais aumentou em relação ao mês anterior;
  - dia da semana com mais gastos nos últimos 30 dias;
  - total gasto no mês com assinaturas e serviços recorrentes (Netflix, Spotify, etc.);
  - dicas e recomendações.

## Tecnologias

| Camada         | Tecnologias                                                  |
| -------------- | ------------------------------------------------------------ |
| Frontend       | HTML5, CSS3 e JavaScript puro (SPA servida pelo Flask)       |
| Backend        | Python, Flask, Flask-CORS, PyJWT, bcrypt, python-dotenv      |
| Banco de dados | MySQL (`mysql-connector-python` com pool de conexões)        |

## Estrutura do projeto

```
Cashly/
├── app.py                 # Backend Flask: API REST e entrega do frontend
├── codigo pi banco.sql    # Script de criação do banco, com dados de exemplo
├── templates/
│   └── index.html         # Página única da aplicação
└── static/
    ├── script.js          # Lógica do frontend e chamadas à API
    └── style.css          # Estilos
```

## Banco de dados

O script `codigo pi banco.sql` cria o banco `Cashly` com estas tabelas:

- **usuarios**: nome, e-mail (único) e hash da senha.
- **categorias**: categorias de `receita` ou `despesa` (Salário, Alimentação, Moradia, Lazer, etc.).
- **transacoes**: valor, data, descrição e observação, ligadas a um usuário e a uma categoria.
- **metas**: título, valor-alvo, valor atual e prazo, ligadas a um usuário.

O script também insere as categorias padrão, dois usuários de teste e transações de exemplo. As datas dessas transações são calculadas a partir do dia em que o script roda.

> ⚠️ O script apaga (`DROP TABLE`) as tabelas existentes antes de criá-las de novo.

## Como executar

### Pré-requisitos

- Python 3.10 ou superior
- MySQL 8 ou superior

### 1. Criar o banco

```bash
mysql -u root -p < "codigo pi banco.sql"
```

### 2. Instalar as dependências

```bash
pip install flask flask-cors mysql-connector-python bcrypt pyjwt python-dotenv
```

### 3. Configurar as variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto. Os valores abaixo são os padrões usados quando a variável não é definida:

```env
DB_PASSWORD="senha do banco"
DB_NAME=cashly
```

### 4. Iniciar a aplicação

```bash
python app.py
```

Depois, acesse **http://localhost:5000**.

> O frontend chama a API em `http://localhost:5000/api` (definido em `static/script.js`). Se você mudar a porta, atualize também a constante `API_URL`.

### Usuários de teste

| Nome   | E-mail             | Senha    |
| ------ | ------------------ | -------- |
| Amanda | amanda@teste.com   | 123456   |
| Caio   | caio@teste.com     | 123456   |

A usuária Amanda já vem com transações de exemplo.

## API

Todas as rotas, exceto registro e login, exigem o cabeçalho `Authorization: Bearer <token>`.

### Autenticação: `/api/auth`

| Método | Rota        | Descrição                       |
| ------ | ----------- | ------------------------------- |
| POST   | `/registro` | Cria uma conta                  |
| POST   | `/login`    | Faz login e devolve o token JWT |
| GET    | `/me`       | Dados do usuário logado         |

### Categorias: `/api/categorias`

| Método | Rota | Descrição            |
| ------ | ---- | -------------------- |
| GET    | `/`  | Lista as categorias  |

### Transações: `/api/transacoes`

| Método | Rota              | Descrição                                   |
| ------ | ----------------- | ------------------------------------------- |
| GET    | `/`               | Lista as transações do usuário              |
| POST   | `/`               | Cria uma transação                          |
| PUT    | `/<id>`           | Atualiza uma transação                      |
| DELETE | `/<id>`           | Remove uma transação                        |
| GET    | `/resumo`         | Totais de receitas, despesas e saldo        |
| GET    | `/por-categoria`  | Gastos do mês por categoria                 |
| GET    | `/ultimos-7-dias` | Gastos de cada um dos últimos 7 dias        |
| GET    | `/insights`       | Dados da tela de Insights                   |

### Metas: `/api/metas`

| Método | Rota           | Descrição                  |
| ------ | -------------- | -------------------------- |
| GET    | `/`            | Lista as metas do usuário  |
| POST   | `/`            | Cria uma meta              |
| PUT    | `/<id>`        | Atualiza uma meta          |
| POST   | `/<id>/fundos` | Adiciona valor a uma meta  |
| DELETE | `/<id>`        | Remove uma meta            |
