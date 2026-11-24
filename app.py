from flask import Flask, Blueprint, request, jsonify, g, render_template, send_from_directory

import os
import functools
from datetime import date, datetime, timedelta

import bcrypt
import jwt
import mysql.connector
from mysql.connector import pooling
from dotenv import load_dotenv
from flask import Flask, Blueprint, request, jsonify, g
from flask_cors import CORS

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------
load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 3306))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "cashly")

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-troque-em-producao")
JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", 24))
FLASK_PORT = int(os.getenv("FLASK_PORT", 5000))

# Banco de dados
_pool = pooling.MySQLConnectionPool(
    pool_name="cashly_pool",
    pool_size=5,
    host=DB_HOST,
    port=DB_PORT,
    user=DB_USER,
    password=DB_PASSWORD,
    database=DB_NAME,
    autocommit=False,
)


def execute_query(query, params=None, fetch=False, commit=False):
    """Executa query usando o pool. Retorna rows (fetch) ou lastrowid (commit)."""
    conn = _pool.get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(query, params or ())
        result = None
        if fetch:
            result = cursor.fetchall() if cursor.with_rows else None
        if commit:
            conn.commit()
            result = cursor.lastrowid
        return result
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


# Autenticação (JWT)
def gerar_token(usuario_id: int, email: str) -> str:
    payload = {
        "sub": str(usuario_id),
        "email": email,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def token_required(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"erro": "Token ausente ou inválido"}), 401
        token = auth.split(" ", 1)[1]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            g.usuario_id = int(payload["sub"])
            g.usuario_email = payload.get("email")
        except jwt.ExpiredSignatureError:
            return jsonify({"erro": "Token expirado"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"erro": "Token inválido"}), 401
        return f(*args, **kwargs)
    return decorated



# Rotas: Auth
auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/registro", methods=["POST"])
def registro():
    dados = request.get_json(silent=True) or {}
    nome = (dados.get("nome") or "").strip()
    email = (dados.get("email") or "").strip().lower()
    senha = dados.get("senha") or ""

    if not nome or not email or not senha:
        return jsonify({"erro": "nome, email e senha são obrigatórios"}), 400
    if len(senha) < 6:
        return jsonify({"erro": "A senha deve ter ao menos 6 caracteres"}), 400

    if execute_query("SELECT id_usuario FROM usuarios WHERE email = %s", (email,), fetch=True):
        return jsonify({"erro": "Email já cadastrado"}), 409

    senha_hash = bcrypt.hashpw(senha.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    novo_id = execute_query(
        "INSERT INTO usuarios (nome, email, senha_hash) VALUES (%s, %s, %s)",
        (nome, email, senha_hash),
        commit=True,
    )
    return jsonify({
        "id_usuario": novo_id, "nome": nome, "email": email,
        "token": gerar_token(novo_id, email),
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    dados = request.get_json(silent=True) or {}
    email = (dados.get("email") or "").strip().lower()
    senha = dados.get("senha") or ""

    if not email or not senha:
        return jsonify({"erro": "email e senha são obrigatórios"}), 400

    rows = execute_query(
        "SELECT id_usuario, nome, email, senha_hash FROM usuarios WHERE email = %s",
        (email,), fetch=True,
    )
    if not rows:
        return jsonify({"erro": "Credenciais inválidas"}), 401

    u = rows[0]
    if not bcrypt.checkpw(senha.encode("utf-8"), u["senha_hash"].encode("utf-8")):
        return jsonify({"erro": "Credenciais inválidas"}), 401

    return jsonify({
        "id_usuario": u["id_usuario"], "nome": u["nome"], "email": u["email"],
        "token": gerar_token(u["id_usuario"], u["email"]),
    })


@auth_bp.route("/me", methods=["GET"])
@token_required
def me():
    rows = execute_query(
        "SELECT id_usuario, nome, email, criado_em FROM usuarios WHERE id_usuario = %s",
        (g.usuario_id,), fetch=True,
    )
    if not rows:
        return jsonify({"erro": "Usuário não encontrado"}), 404
    return jsonify(rows[0])


# Rotas: Categorias
cat_bp = Blueprint("categorias", __name__, url_prefix="/api/categorias")


@cat_bp.route("", methods=["GET"])
@token_required
def listar_categorias():
    tipo = request.args.get("tipo")
    if tipo and tipo not in ("receita", "despesa"):
        return jsonify({"erro": "tipo inválido"}), 400
    if tipo:
        rows = execute_query(
            "SELECT * FROM categorias WHERE tipo = %s ORDER BY nome", (tipo,), fetch=True
        )
    else:
        rows = execute_query("SELECT * FROM categorias ORDER BY tipo, nome", fetch=True)
    return jsonify(rows)


# Rotas: Transações
trans_bp = Blueprint("transacoes", __name__, url_prefix="/api/transacoes")


def _validar_transacao(dados, parcial=False):
    erros = []
    if not parcial or "categoria_id" in dados:
        try:
            int(dados.get("categoria_id"))
        except (TypeError, ValueError):
            erros.append("categoria_id inválido")
    if not parcial or "valor" in dados:
        try:
            if float(dados.get("valor")) <= 0:
                erros.append("valor deve ser maior que zero")
        except (TypeError, ValueError):
            erros.append("valor inválido")
    if not parcial or "data_transacao" in dados:
        try:
            date.fromisoformat(dados.get("data_transacao"))
        except (TypeError, ValueError):
            erros.append("data_transacao deve ser YYYY-MM-DD")
    if len(dados.get("observacao") or "") > 255:
        erros.append("observacao deve ter no máximo 255 caracteres")
    return erros


@trans_bp.route("", methods=["GET"])
@token_required
def listar_transacoes():
    inicio = request.args.get("inicio")
    fim = request.args.get("fim")
    tipo = request.args.get("tipo")

    sql = """
        SELECT t.id_transacao, t.valor, t.data_transacao, t.descricao, t.observacao,
               c.id_categoria, c.nome AS categoria, c.tipo
        FROM transacoes t
        JOIN categorias c ON c.id_categoria = t.categoria_id
        WHERE t.usuario_id = %s
    """
    params = [g.usuario_id]
    if inicio:
        sql += " AND t.data_transacao >= %s"; params.append(inicio)
    if fim:
        sql += " AND t.data_transacao <= %s"; params.append(fim)
    if tipo in ("receita", "despesa"):
        sql += " AND c.tipo = %s"; params.append(tipo)
    sql += " ORDER BY t.data_transacao DESC, t.id_transacao DESC"
    return jsonify(execute_query(sql, tuple(params), fetch=True))


@trans_bp.route("", methods=["POST"])
@token_required
def criar_transacao():
    dados = request.get_json(silent=True) or {}
    erros = _validar_transacao(dados)
    if dados.get("tipo") not in ("receita", "despesa"):
        erros.append("tipo deve ser 'receita' ou 'despesa'")
    if erros:
        return jsonify({"erros": erros}), 400

    categoria = execute_query(
        "SELECT id_categoria, tipo FROM categorias WHERE id_categoria = %s",
        (dados["categoria_id"],), fetch=True,
    )
    if not categoria:
        return jsonify({"erro": "Categoria não encontrada"}), 404

    # RN02: o tipo escolhido na tela precisa ser o mesmo tipo da categoria
    # (evita uma receita ser gravada numa categoria de despesa)
    if categoria[0]["tipo"] != dados["tipo"]:
        return jsonify({"erro": f"A categoria escolhida não é de {dados['tipo']}"}), 400

    novo_id = execute_query(
        """INSERT INTO transacoes (usuario_id, categoria_id, valor, data_transacao, descricao, observacao)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (g.usuario_id, dados["categoria_id"], dados["valor"],
         dados["data_transacao"], dados.get("descricao"), dados.get("observacao") or None),
        commit=True,
    )
    return jsonify({"id_transacao": novo_id}), 201


@trans_bp.route("/<int:id_transacao>", methods=["PUT"])
@token_required
def atualizar_transacao(id_transacao):
    dados = request.get_json(silent=True) or {}
    erros = _validar_transacao(dados, parcial=True)
    if erros:
        return jsonify({"erros": erros}), 400

    if not execute_query(
        "SELECT id_transacao FROM transacoes WHERE id_transacao = %s AND usuario_id = %s",
        (id_transacao, g.usuario_id), fetch=True,
    ):
        return jsonify({"erro": "Transação não encontrada"}), 404

    # RN02: se trocar a categoria informando o tipo, os dois precisam combinar
    if "categoria_id" in dados and "tipo" in dados:
        categoria = execute_query(
            "SELECT tipo FROM categorias WHERE id_categoria = %s",
            (dados["categoria_id"],), fetch=True,
        )
        if not categoria:
            return jsonify({"erro": "Categoria não encontrada"}), 404
        if categoria[0]["tipo"] != dados["tipo"]:
            return jsonify({"erro": f"A categoria escolhida não é de {dados['tipo']}"}), 400

    campos, params = [], []
    for c in ("categoria_id", "valor", "data_transacao", "descricao", "observacao"):
        if c in dados:
            campos.append(f"{c} = %s"); params.append(dados[c])
    if not campos:
        return jsonify({"erro": "Nenhum campo para atualizar"}), 400

    params.extend([id_transacao, g.usuario_id])
    execute_query(
        f"UPDATE transacoes SET {', '.join(campos)} WHERE id_transacao = %s AND usuario_id = %s",
        tuple(params), commit=True,
    )
    return jsonify({"mensagem": "Transação atualizada"})


@trans_bp.route("/<int:id_transacao>", methods=["DELETE"])
@token_required
def deletar_transacao(id_transacao):
    if not execute_query(
        "SELECT id_transacao FROM transacoes WHERE id_transacao = %s AND usuario_id = %s",
        (id_transacao, g.usuario_id), fetch=True,
    ):
        return jsonify({"erro": "Transação não encontrada"}), 404
    execute_query(
        "DELETE FROM transacoes WHERE id_transacao = %s AND usuario_id = %s",
        (id_transacao, g.usuario_id), commit=True,
    )
    return jsonify({"mensagem": "Transação removida"})


@trans_bp.route("/resumo", methods=["GET"])
@token_required
def resumo_transacoes():
    inicio = request.args.get("inicio")
    fim = request.args.get("fim")
    sql = """
        SELECT c.tipo, SUM(t.valor) AS total
        FROM transacoes t
        JOIN categorias c ON c.id_categoria = t.categoria_id
        WHERE t.usuario_id = %s
    """
    params = [g.usuario_id]
    if inicio:
        sql += " AND t.data_transacao >= %s"; params.append(inicio)
    if fim:
        sql += " AND t.data_transacao <= %s"; params.append(fim)
    sql += " GROUP BY c.tipo"

    totais = {"receita": 0.0, "despesa": 0.0}
    for r in execute_query(sql, tuple(params), fetch=True):
        totais[r["tipo"]] = float(r["total"] or 0)
    totais["saldo"] = totais["receita"] - totais["despesa"]
    return jsonify(totais)


def _periodo_do_mes_atual():
    """Primeiro e último dia do mês atual (ex.: 2026-11-01 e 2026-11-30)."""
    hoje = date.today()
    inicio = hoje.replace(day=1)
    proximo_mes = (inicio + timedelta(days=32)).replace(day=1)
    return inicio, proximo_mes - timedelta(days=1)


@trans_bp.route("/por-categoria", methods=["GET"])
@token_required
def gastos_por_categoria():
    """Total de despesas por categoria. Sem inicio/fim, usa o mês atual.
    Alimenta a rosca da tela Início e a tela Categorias."""
    inicio_padrao, fim_padrao = _periodo_do_mes_atual()
    inicio = request.args.get("inicio") or inicio_padrao.isoformat()
    fim = request.args.get("fim") or fim_padrao.isoformat()

    rows = execute_query(
        """SELECT c.nome AS categoria, SUM(t.valor) AS total
           FROM transacoes t
           JOIN categorias c ON c.id_categoria = t.categoria_id
           WHERE t.usuario_id = %s
             AND c.tipo = 'despesa'
             AND t.data_transacao BETWEEN %s AND %s
           GROUP BY c.nome
           ORDER BY total DESC""",
        (g.usuario_id, inicio, fim), fetch=True,
    )
    return jsonify([
        {"categoria": r["categoria"], "total": float(r["total"] or 0)} for r in rows
    ])


@trans_bp.route("/ultimos-7-dias", methods=["GET"])
@token_required
def gastos_ultimos_7_dias():
    """Total de despesas em cada um dos últimos 7 dias (hoje incluído).
    Dias sem gasto aparecem com total 0. Alimenta o gráfico semanal."""
    hoje = date.today()
    inicio = hoje - timedelta(days=6)

    rows = execute_query(
        """SELECT t.data_transacao AS dia, SUM(t.valor) AS total
           FROM transacoes t
           JOIN categorias c ON c.id_categoria = t.categoria_id
           WHERE t.usuario_id = %s
             AND c.tipo = 'despesa'
             AND t.data_transacao BETWEEN %s AND %s
           GROUP BY t.data_transacao""",
        (g.usuario_id, inicio.isoformat(), hoje.isoformat()), fetch=True,
    )
    totais = {r["dia"]: float(r["total"] or 0) for r in rows}

    dias = []
    for i in range(7):
        dia = inicio + timedelta(days=i)
        dias.append({"data": dia.isoformat(), "total": totais.get(dia, 0.0)})
    return jsonify(dias)


NOMES_DIAS_SEMANA = {1: "Domingo", 2: "Segunda-feira", 3: "Terça-feira", 4: "Quarta-feira",
                     5: "Quinta-feira", 6: "Sexta-feira", 7: "Sábado"}  # DAYOFWEEK do MySQL


@trans_bp.route("/insights", methods=["GET"])
@token_required
def insights():
    """Dados da tela Insights:
    - mes: receitas e despesas do mês atual
    - comparacao: categoria cujo gasto mais subiu em relação ao mês passado (ou null)
    - pico: dia da semana com mais gastos nos últimos 30 dias (ou null)
    - assinaturas: total do mês em serviços recorrentes (Netflix, Spotify...)"""
    inicio_atual, fim_atual = _periodo_do_mes_atual()
    fim_anterior = inicio_atual - timedelta(days=1)
    inicio_anterior = fim_anterior.replace(day=1)

    # Receitas e despesas do mês atual
    mes = {"receita": 0.0, "despesa": 0.0}
    for r in execute_query(
        """SELECT c.tipo, SUM(t.valor) AS total
           FROM transacoes t
           JOIN categorias c ON c.id_categoria = t.categoria_id
           WHERE t.usuario_id = %s AND t.data_transacao BETWEEN %s AND %s
           GROUP BY c.tipo""",
        (g.usuario_id, inicio_atual, fim_atual), fetch=True,
    ):
        mes[r["tipo"]] = float(r["total"] or 0)

    # Gasto de cada categoria neste mês e no mês passado
    rows = execute_query(
        """SELECT c.nome AS categoria,
                  SUM(CASE WHEN t.data_transacao >= %s THEN t.valor ELSE 0 END) AS atual,
                  SUM(CASE WHEN t.data_transacao <  %s THEN t.valor ELSE 0 END) AS anterior
           FROM transacoes t
           JOIN categorias c ON c.id_categoria = t.categoria_id
           WHERE t.usuario_id = %s
             AND c.tipo = 'despesa'
             AND t.data_transacao BETWEEN %s AND %s
           GROUP BY c.nome""",
        (inicio_atual, inicio_atual, g.usuario_id, inicio_anterior, fim_atual), fetch=True,
    )
    comparacao = None
    for r in rows:
        atual, anterior = float(r["atual"] or 0), float(r["anterior"] or 0)
        if anterior > 0 and atual > anterior:
            aumento = (atual - anterior) / anterior * 100
            if comparacao is None or aumento > comparacao["aumento_pct"]:
                comparacao = {"categoria": r["categoria"], "atual": atual,
                              "anterior": anterior, "aumento_pct": round(aumento)}

    # Dia da semana com mais gastos nos últimos 30 dias
    hoje = date.today()
    rows = execute_query(
        """SELECT DAYOFWEEK(t.data_transacao) AS dia, SUM(t.valor) AS total
           FROM transacoes t
           JOIN categorias c ON c.id_categoria = t.categoria_id
           WHERE t.usuario_id = %s
             AND c.tipo = 'despesa'
             AND t.data_transacao BETWEEN %s AND %s
           GROUP BY DAYOFWEEK(t.data_transacao)
           ORDER BY total DESC
           LIMIT 1""",
        (g.usuario_id, hoje - timedelta(days=29), hoje), fetch=True,
    )
    pico = None
    if rows:
        pico = {"dia": NOMES_DIAS_SEMANA[rows[0]["dia"]], "total": float(rows[0]["total"] or 0)}

    # Assinaturas: despesas do mês cuja descrição cita um serviço recorrente
    rows = execute_query(
        """SELECT COALESCE(SUM(t.valor), 0) AS total
           FROM transacoes t
           JOIN categorias c ON c.id_categoria = t.categoria_id
           WHERE t.usuario_id = %s
             AND c.tipo = 'despesa'
             AND t.data_transacao BETWEEN %s AND %s
             AND LOWER(t.descricao) REGEXP 'assinatura|netflix|spotify|youtube|amazon prime|disney|hbo|globoplay|deezer'""",
        (g.usuario_id, inicio_atual, fim_atual), fetch=True,
    )
    assinaturas = float(rows[0]["total"] or 0)

    return jsonify({"mes": mes, "comparacao": comparacao, "pico": pico, "assinaturas": assinaturas})


# Rotas: Metas
metas_bp = Blueprint("metas", __name__, url_prefix="/api/metas")


@metas_bp.route("", methods=["GET"])
@token_required
def listar_metas():
    # Metas sem prazo vão para o fim da lista (prazo IS NULL vale 1, as outras 0)
    return jsonify(execute_query(
        """SELECT id_meta, titulo, valor_alvo, valor_atual, prazo,
                  (valor_atual / valor_alvo * 100) AS progresso_pct
           FROM metas WHERE usuario_id = %s
           ORDER BY prazo IS NULL, prazo, id_meta""",
        (g.usuario_id,), fetch=True,
    ))


def _validar_meta(dados, parcial=False):
    """Confere os campos de uma meta (RN01: valores numéricos e maiores que zero).
    Devolve (erros, valores_limpos)."""
    erros, limpos = [], {}

    if not parcial or "titulo" in dados:
        titulo = (dados.get("titulo") or "").strip()
        if not titulo:
            erros.append("titulo é obrigatório")
        elif len(titulo) > 150:
            erros.append("titulo deve ter no máximo 150 caracteres")
        limpos["titulo"] = titulo

    if not parcial or "valor_alvo" in dados:
        try:
            limpos["valor_alvo"] = float(dados.get("valor_alvo"))
            if limpos["valor_alvo"] <= 0:
                raise ValueError
        except (TypeError, ValueError):
            erros.append("valor_alvo deve ser um número maior que zero")

    if "valor_atual" in dados or not parcial:
        try:
            limpos["valor_atual"] = float(dados.get("valor_atual") or 0)
            if limpos["valor_atual"] < 0:
                raise ValueError
        except (TypeError, ValueError):
            erros.append("valor_atual deve ser um número maior ou igual a zero")

    # Prazo é opcional: vazio vira NULL no banco
    if not parcial or "prazo" in dados:
        prazo = dados.get("prazo") or None
        if prazo:
            try:
                date.fromisoformat(prazo)
            except (TypeError, ValueError):
                erros.append("prazo deve ser YYYY-MM-DD")
        limpos["prazo"] = prazo

    return erros, limpos


@metas_bp.route("", methods=["POST"])
@token_required
def criar_meta():
    dados = request.get_json(silent=True) or {}
    erros, m = _validar_meta(dados)
    if erros:
        return jsonify({"erros": erros}), 400

    novo_id = execute_query(
        """INSERT INTO metas (usuario_id, titulo, valor_alvo, valor_atual, prazo)
           VALUES (%s, %s, %s, %s, %s)""",
        (g.usuario_id, m["titulo"], m["valor_alvo"], m["valor_atual"], m["prazo"]),
        commit=True,
    )
    return jsonify({"id_meta": novo_id}), 201


@metas_bp.route("/<int:id_meta>", methods=["PUT"])
@token_required
def atualizar_meta(id_meta):
    dados = request.get_json(silent=True) or {}
    if not execute_query(
        "SELECT id_meta FROM metas WHERE id_meta = %s AND usuario_id = %s",
        (id_meta, g.usuario_id), fetch=True,
    ):
        return jsonify({"erro": "Meta não encontrada"}), 404

    erros, m = _validar_meta(dados, parcial=True)
    if erros:
        return jsonify({"erros": erros}), 400
    if not m:
        return jsonify({"erro": "Nenhum campo para atualizar"}), 400

    campos = [f"{c} = %s" for c in m]
    params = list(m.values()) + [id_meta, g.usuario_id]
    execute_query(
        f"UPDATE metas SET {', '.join(campos)} WHERE id_meta = %s AND usuario_id = %s",
        tuple(params), commit=True,
    )
    return jsonify({"mensagem": "Meta atualizada"})


@metas_bp.route("/<int:id_meta>/fundos", methods=["POST"])
@token_required
def adicionar_fundos(id_meta):
    """Soma um valor ao que já foi guardado na meta.
    A soma é feita no próprio banco (valor_atual = valor_atual + valor),
    assim dois cliques seguidos nunca apagam um ao outro."""
    dados = request.get_json(silent=True) or {}
    try:
        valor = float(dados.get("valor"))
        if valor <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"erro": "valor deve ser um número maior que zero"}), 400

    if not execute_query(
        "SELECT id_meta FROM metas WHERE id_meta = %s AND usuario_id = %s",
        (id_meta, g.usuario_id), fetch=True,
    ):
        return jsonify({"erro": "Meta não encontrada"}), 404

    execute_query(
        "UPDATE metas SET valor_atual = valor_atual + %s WHERE id_meta = %s AND usuario_id = %s",
        (valor, id_meta, g.usuario_id), commit=True,
    )
    meta = execute_query(
        "SELECT id_meta, valor_atual, valor_alvo FROM metas WHERE id_meta = %s AND usuario_id = %s",
        (id_meta, g.usuario_id), fetch=True,
    )[0]
    return jsonify({"id_meta": meta["id_meta"], "valor_atual": float(meta["valor_atual"]),
                    "valor_alvo": float(meta["valor_alvo"])})


@metas_bp.route("/<int:id_meta>", methods=["DELETE"])
@token_required
def deletar_meta(id_meta):
    if not execute_query(
        "SELECT id_meta FROM metas WHERE id_meta = %s AND usuario_id = %s",
        (id_meta, g.usuario_id), fetch=True,
    ):
        return jsonify({"erro": "Meta não encontrada"}), 404
    execute_query(
        "DELETE FROM metas WHERE id_meta = %s AND usuario_id = %s",
        (id_meta, g.usuario_id), commit=True,
    )
    return jsonify({"mensagem": "Meta removida"})


# App
def create_app():
    # Ajuste os caminhos para o Flask encontrar as pastas
    app = Flask(__name__, 
                template_folder='templates', 
                static_folder='static')
                
    # CORS: Permite que o frontend (rodando na mesma porta ou não) acesse a API
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    app.register_blueprint(auth_bp)
    app.register_blueprint(cat_bp)
    app.register_blueprint(trans_bp)
    app.register_blueprint(metas_bp)

    # Rota principal que serve o HTML do frontend
    @app.route("/")
    def index():
        return render_template("index.html")

    # Rotas para servir arquivos estáticos caso o Flask não pegue automaticamente
    @app.route("/static/<path:path>")
    def serve_static(path):
        return send_from_directory("static", path)

    @app.errorhandler(404)
    def not_found(e):
        # Se a rota não começar com /api, devolve o frontend (Single Page App)
        if not request.path.startswith('/api'):
            return render_template("index.html")
        return jsonify({"erro": "Rota não encontrada"}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"erro": "Erro interno do servidor"}), 500

    return app

if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=FLASK_PORT, debug=True)