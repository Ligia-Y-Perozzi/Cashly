// --- CONFIGURAÇÃO DA API ---
const API_URL = 'http://localhost:5000/api';
let TOKEN = localStorage.getItem('cashly_token');
let USUARIO = JSON.parse(localStorage.getItem('cashly_user') || 'null');
let CATEGORIAS = [];

// --- ELEMENTOS DO DOM ---
const telaAuth = document.getElementById('tela-auth');
const formAuth = document.getElementById('form-auth');
const linkAlternarAuth = document.getElementById('link-alternar-auth');
let isLoginMode = true;

// --- UTILITÁRIOS ---
function formatarMoeda(valor) {
    return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// --- AUTENTICAÇÃO ---
linkAlternarAuth.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    document.getElementById('titulo-auth').innerText = isLoginMode ? 'Entrar no Cashly' : 'Criar Conta';
    document.getElementById('subtitulo-auth').innerText = isLoginMode ? 'Acesse sua conta para continuar.' : 'Preencha os dados para começar.';
    document.getElementById('campo-nome').style.display = isLoginMode ? 'none' : 'block';
    document.getElementById('btn-submit-auth').innerText = isLoginMode ? 'Entrar' : 'Cadastrar';
    linkAlternarAuth.innerText = isLoginMode ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Faça login';
});

formAuth.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const senha = document.getElementById('auth-senha').value;
    const nome = document.getElementById('auth-nome').value;
    
    const endpoint = isLoginMode ? '/auth/login' : '/auth/registro';
    const body = isLoginMode ? { email, senha } : { nome, email, senha };

    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.erro || 'Erro na autenticação');

        TOKEN = data.token;
        USUARIO = data;
        localStorage.setItem('cashly_token', TOKEN);
        localStorage.setItem('cashly_user', JSON.stringify(USUARIO));
        
        telaAuth.style.display = 'none';
        document.getElementById('nome-usuario-sidebar').innerText = USUARIO.nome;
        inicializarApp();
        
    } catch (err) {
        alert(err.message);
    }
});

// --- INICIALIZAÇÃO ---
async function inicializarApp() {
    if (!TOKEN) {
        telaAuth.style.display = 'flex';
        return;
    }
    
    try {
        const resCat = await fetch(`${API_URL}/categorias`, {
            headers: { 'Authorization': `Bearer ${TOKEN}` }
        });
        CATEGORIAS = await resCat.json();
        
        const datalist = document.getElementById('lista-categorias');
        datalist.innerHTML = CATEGORIAS.map(c => `<option value="${c.nome}"></option>`).join('');

        await carregarResumo();
        await carregarExtrato();
        
    } catch (error) {
        console.error(error);
        if (error.message.includes('401')) {
            localStorage.removeItem('cashly_token');
            location.reload();
        }
    }
}

// --- RESUMO (SALDO) ---
async function carregarResumo() {
    const res = await fetch(`${API_URL}/transacoes/resumo`, {
        headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const resumo = await res.json();
    
    document.getElementById('saldo').innerText = formatarMoeda(resumo.saldo);
    document.getElementById('total-entradas').innerText = `+ ${formatarMoeda(resumo.receita)}`;
    document.getElementById('total-saidas').innerText = `- ${formatarMoeda(resumo.despesa)}`;
}

// --- EXTRATO (LISTA DE TRANSAÇÕES) ---
async function carregarExtrato() {
    const res = await fetch(`${API_URL}/transacoes`, {
        headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const transacoes = await res.json();
    
    const container = document.getElementById('lista-hoje');
    container.innerHTML = '';

    if (transacoes.length === 0) {
        document.getElementById('mensagem-vazia').classList.remove('escondido');
        return;
    }
    document.getElementById('mensagem-vazia').classList.add('escondido');

    transacoes.forEach(t => {
        const isReceita = t.tipo === 'receita';
        const valorFormatado = isReceita ? `+ ${formatarMoeda(t.valor)}` : `- ${formatarMoeda(t.valor)}`;
        
        const article = document.createElement('article');
        article.classList.add('transacao');
        article.dataset.tipo = t.tipo;
        article.dataset.busca = `${t.descricao || ''} ${t.categoria}`.toLowerCase();

        article.innerHTML = `
            <span class="icone-transacao ${isReceita ? 'verde-claro' : 'coral-claro'}">${isReceita ? '＋' : '−'}</span>
            <div class="detalhe-transacao">
                <strong>${t.descricao || 'Sem descrição'}</strong>
                <small>${t.categoria} • ${new Date(t.data_transacao).toLocaleDateString('pt-BR')}</small>
            </div>
            <strong class="valor-transacao ${isReceita ? 'positivo' : 'negativo'}">${valorFormatado}</strong>
        `;
        container.appendChild(article);
    });

    filtrarTransacoes();
}

// --- NAVEGAÇÃO ENTRE PÁGINAS ---
const botoesMenu = document.querySelectorAll(".link-menu");
const paginas = document.querySelectorAll(".pagina");
const tituloPagina = document.querySelector("#titulo-pagina");
const subtituloPagina = document.querySelector("#subtitulo-pagina");

const textosPaginas = {
  inicio: ["Visão Geral", "Acompanhe suas finanças em tempo real."],
  extrato: ["Extrato Bancário", "Acompanhe suas receitas e despesas."],
  metas: ["Metas Financeiras", "Planeje e guarde dinheiro para realizar seus sonhos."],
  insights: ["Insights", "Entenda seus padrões de gastos."]
};

botoesMenu.forEach(botao => {
  botao.addEventListener("click", () => {
    const nomePagina = botao.dataset.pagina;

    paginas.forEach(p => p.classList.add("escondido"));
    document.querySelector("#pagina-" + nomePagina).classList.remove("escondido");

    botoesMenu.forEach(item => item.classList.remove("ativo"));
    botao.classList.add("ativo");

    if(textosPaginas[nomePagina]) {
        tituloPagina.textContent = textosPaginas[nomePagina][0];
        subtituloPagina.textContent = textosPaginas[nomePagina][1];
    }

    if (nomePagina === 'metas') carregarMetas();
    if (nomePagina === 'extrato') carregarExtrato();
  });
});

// --- MODAL NOVA TRANSAÇÃO ---
const modal = document.querySelector("#modal-transacao");
document.querySelector("#botao-nova-transacao").addEventListener("click", () => {
  modal.classList.remove("escondido");
  document.querySelector("#descricao").focus();
  document.querySelector("#data").valueAsDate = new Date();
});

document.querySelector("#fechar-modal").addEventListener("click", () => modal.classList.add("escondido"));
document.querySelector("#voltar-modal").addEventListener("click", () => modal.classList.add("escondido"));

modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.classList.add("escondido");
});

// Controle Receita / Despesa do formulário
const abasTipo = document.querySelectorAll(".aba-tipo");
const campoTipo = document.querySelector("#tipo");
const botaoSalvar = document.querySelector("#botao-salvar");

abasTipo.forEach(aba => {
  aba.addEventListener("click", () => {
    campoTipo.value = aba.dataset.tipo;
    abasTipo.forEach(a => a.classList.toggle("ativo", a.dataset.tipo === aba.dataset.tipo));
    botaoSalvar.textContent = aba.dataset.tipo === "receita" ? "Salvar Receita" : "Salvar Despesa";
  });
});

// --- SUBMIT NOVA TRANSAÇÃO ---
const formulario = document.querySelector("#form-transacao");
formulario.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const descricao = document.querySelector("#descricao").value.trim();
  const categoriaNome = document.querySelector("#categoria").value.trim();
  const valor = Number(document.querySelector("#valor").value);
  const data = document.querySelector("#data").value;

  if (!descricao || !categoriaNome || valor <= 0) {
    alert("Preencha todos os campos com informações válidas.");
    return;
  }

  const categoria = CATEGORIAS.find(c => c.nome.toLowerCase() === categoriaNome.toLowerCase());
  if (!categoria) {
      alert("Categoria não encontrada. Selecione uma das opções.");
      return;
  }

  try {
      const res = await fetch(`${API_URL}/transacoes`, {
          method: 'POST',
          headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${TOKEN}`
          },
          body: JSON.stringify({
              categoria_id: categoria.id_categoria,
              valor: valor,
              data_transacao: data,
              descricao: descricao
          })
      });

      if (!res.ok) throw new Error("Erro ao salvar transação");

      formulario.reset();
      modal.classList.add("escondido");
      
      await carregarResumo();
      await carregarExtrato();
      alert("Transação salva com sucesso!");

  } catch (err) {
      alert(err.message);
  }
});

// --- FILTROS DO EXTRATO ---
let filtroAtual = "todas";
const campoBusca = document.querySelector("#busca-transacao");
const botoesFiltro = document.querySelectorAll(".filtro");

botoesFiltro.forEach(botao => {
  botao.addEventListener("click", () => {
    filtroAtual = botao.dataset.filtro;
    botoesFiltro.forEach(item => item.classList.remove("ativo"));
    botao.classList.add("ativo");
    filtrarTransacoes();
  });
});

campoBusca.addEventListener("input", filtrarTransacoes);

function filtrarTransacoes() {
  const textoBusca = campoBusca.value.toLowerCase().trim();
  const transacoes = document.querySelectorAll(".transacao");
  let quantidadeVisivel = 0;

  transacoes.forEach(transacao => {
    const correspondeTipo = filtroAtual === "todas" || transacao.dataset.tipo === filtroAtual;
    const correspondeBusca = transacao.dataset.busca.includes(textoBusca);
    const deveMostrar = correspondeTipo && correspondeBusca;

    transacao.classList.toggle("escondido", !deveMostrar);
    if (deveMostrar) quantidadeVisivel++;
  });

  document.querySelector("#mensagem-vazia").classList.toggle("escondido", quantidadeVisivel > 0);
}

// --- METAS ---
async function carregarMetas() {
    const container = document.getElementById('lista-metas');
    const res = await fetch(`${API_URL}/metas`, {
        headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const metas = await res.json();
    
    container.innerHTML = '';

    if(metas.length === 0) {
        container.innerHTML = '<p style="grid-column: 1/-1;">Nenhuma meta cadastrada.</p>';
        return;
    }

    metas.forEach(meta => {
        const progresso = Math.min((meta.valor_atual / meta.valor_alvo) * 100, 100);
        const dataFormatada = new Date(meta.prazo).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
        
        container.innerHTML += `
            <article class="cartao cartao-meta">
                <div class="cabecalho-meta">
                    <span class="emoji-meta">🎯</span>
                    <div class="nome-meta">
                        <h2>${meta.titulo}</h2>
                        <p>Prazo: ${dataFormatada}</p>
                    </div>
                    <span class="porcentagem verde-suave">${progresso.toFixed(0)}%</span>
                </div>
                <div class="valores-meta">
                    <strong>${formatarMoeda(meta.valor_atual)}</strong>
                    <span>acumulados</span>
                    <strong>Meta: ${formatarMoeda(meta.valor_alvo)}</strong>
                </div>
                <div class="progresso"><span style="width: ${progresso}%"></span></div>
                <button class="botao botao-meta adicionar-fundos" onclick="alert('Função em desenvolvimento')">＋ Adicionar Fundos</button>
            </article>
        `;
    });
}

// --- INICIALIZAÇÃO GERAL ---
inicializarApp();