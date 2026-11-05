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
    return erros


@trans_bp.route("", methods=["GET"])
@token_required
def listar_transacoes():
    inicio = request.args.get("inicio")
    fim = request.args.get("fim")
    tipo = request.args.get("tipo")

    sql = """
        SELECT t.id_transacao, t.valor, t.data_transacao, t.descricao,
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
    if erros:
        return jsonify({"erros": erros}), 400

    if not execute_query(
        "SELECT id_categoria FROM categorias WHERE id_categoria = %s",
        (dados["categoria_id"],), fetch=True,
    ):
        return jsonify({"erro": "Categoria não encontrada"}), 404

    novo_id = execute_query(
        """INSERT INTO transacoes (usuario_id, categoria_id, valor, data_transacao, descricao)
           VALUES (%s, %s, %s, %s, %s)""",
        (g.usuario_id, dados["categoria_id"], dados["valor"],
         dados["data_transacao"], dados.get("descricao")),
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

    campos, params = [], []
    for c in ("categoria_id", "valor", "data_transacao", "descricao"):
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


# Rotas: Metas
metas_bp = Blueprint("metas", __name__, url_prefix="/api/metas")


@metas_bp.route("", methods=["GET"])
@token_required
def listar_metas():
    return jsonify(execute_query(
        """SELECT id_meta, titulo, valor_alvo, valor_atual, prazo,
                  (valor_atual / valor_alvo * 100) AS progresso_pct
           FROM metas WHERE usuario_id = %s ORDER BY prazo""",
        (g.usuario_id,), fetch=True,
    ))


@metas_bp.route("", methods=["POST"])
@token_required
def criar_meta():
    dados = request.get_json(silent=True) or {}
    titulo = (dados.get("titulo") or "").strip()
    if not titulo:
        return jsonify({"erro": "titulo é obrigatório"}), 400
    try:
        valor_alvo = float(dados.get("valor_alvo"))
        if valor_alvo <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"erro": "valor_alvo inválido"}), 400
    try:
        date.fromisoformat(dados.get("prazo"))
    except (TypeError, ValueError):
        return jsonify({"erro": "prazo deve ser YYYY-MM-DD"}), 400

    novo_id = execute_query(
        """INSERT INTO metas (usuario_id, titulo, valor_alvo, valor_atual, prazo)
           VALUES (%s, %s, %s, %s, %s)""",
        (g.usuario_id, titulo, valor_alvo,
         float(dados.get("valor_atual", 0)), dados["prazo"]),
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

    campos, params = [], []
    for c in ("titulo", "valor_alvo", "valor_atual", "prazo"):
        if c in dados:
            campos.append(f"{c} = %s"); params.append(dados[c])
    if not campos:
        return jsonify({"erro": "Nenhum campo para atualizar"}), 400

    params.extend([id_meta, g.usuario_id])
    execute_query(
        f"UPDATE metas SET {', '.join(campos)} WHERE id_meta = %s AND usuario_id = %s",
        tuple(params), commit=True,
    )
    return jsonify({"mensagem": "Meta atualizada"})


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