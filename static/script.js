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
// Number() porque a API devolve alguns valores como texto (ex.: "184.90")
function formatarMoeda(valor) {
    return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const nomeMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Data de hoje no formato do campo de data (aaaa-mm-dd), no horário local
function dataDeHoje() {
    const hoje = new Date();
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const dia = String(hoje.getDate()).padStart(2, "0");
    return hoje.getFullYear() + "-" + mes + "-" + dia;
}

// A API manda a data em UTC (ex.: "Tue, 27 Aug 2024 00:00:00 GMT").
// Lendo dia, mês e ano em UTC, a data não "volta" um dia no horário do Brasil.
function lerData(texto) {
    const d = new Date(texto);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Título de cada grupo do extrato: "Hoje, 23 de Novembro", "Ontem, ..." ou só a data
function textoGrupo(data) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diasAtras = Math.round((hoje - data) / 86400000);
    const texto = data.getDate() + " de " + nomeMeses[data.getMonth()];
    if (diasAtras === 0) return "Hoje, " + texto;
    if (diasAtras === 1) return "Ontem, " + texto;
    return texto + (data.getFullYear() !== hoje.getFullYear() ? " de " + data.getFullYear() : "");
}

// Apaga o token guardado e volta para a tela de login
function encerrarSessao() {
    localStorage.removeItem('cashly_token');
    localStorage.removeItem('cashly_user');
    location.reload();
}

// Mostra na lista do formulário só as categorias do tipo escolhido (receita ou despesa)
function preencherCategorias() {
    const tipo = document.querySelector("#tipo").value;
    const datalist = document.getElementById('lista-categorias');
    datalist.innerHTML = CATEGORIAS
        .filter(c => c.tipo === tipo)
        .map(c => `<option value="${c.nome}"></option>`)
        .join('');
}

// Evita que um texto digitado pela pessoa (ex.: "<b>") vire HTML na tela
function escaparHtml(texto) {
    const div = document.createElement("div");
    div.textContent = texto;
    return div.innerHTML;
}

// Primeiro e último dia do mês de uma data, no formato da API (aaaa-mm-dd)
function periodoDoMes(data) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    const ultimoDia = new Date(ano, data.getMonth() + 1, 0).getDate(); // dia 0 do mês seguinte = último dia deste
    return { inicio: `${ano}-${mes}-01`, fim: `${ano}-${mes}-${String(ultimoDia).padStart(2, "0")}` };
}

// Mostra o nome e a inicial de quem está logado na barra lateral
function mostrarUsuario() {
    if (!USUARIO) return;
    document.getElementById('nome-usuario-sidebar').innerText = USUARIO.nome;
    document.getElementById('avatar-usuario').innerText = USUARIO.nome.charAt(0).toUpperCase();
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

    telaAuth.style.display = 'none';
    mostrarUsuario();
    atualizarMes();

    try {
        const resCat = await fetch(`${API_URL}/categorias`, {
            headers: { 'Authorization': `Bearer ${TOKEN}` }
        });

        // Token vencido (24h) ou inválido: volta para o login em vez de travar a tela
        if (resCat.status === 401) {
            encerrarSessao();
            return;
        }

        CATEGORIAS = await resCat.json();
        preencherCategorias();

        await carregarResumo();
        await carregarExtrato();
        await carregarGraficos();

    } catch (error) {
        console.error(error);
    }
}

// --- RESUMO (SALDO) ---
// Saldo: tudo o que já entrou menos tudo o que já saiu (RN03).
// Entradas, saídas e a barra: só o mês atual (RF04), igual aos gráficos.
async function carregarResumo() {
    const headers = { 'Authorization': `Bearer ${TOKEN}` };
    const mes = periodoDoMes(new Date());
    const [resTotal, resMes] = await Promise.all([
        fetch(`${API_URL}/transacoes/resumo`, { headers }),
        fetch(`${API_URL}/transacoes/resumo?inicio=${mes.inicio}&fim=${mes.fim}`, { headers })
    ]);
    const total = await resTotal.json();
    const resumoMes = await resMes.json();

    document.getElementById('saldo').innerText = formatarMoeda(total.saldo);
    document.getElementById('total-entradas').innerText = `+ ${formatarMoeda(resumoMes.receita)}`;
    document.getElementById('total-saidas').innerText = `- ${formatarMoeda(resumoMes.despesa)}`;

    // A barra mostra quanto das movimentações do mês são entradas
    const totalMovimentado = resumoMes.receita + resumoMes.despesa;
    const porcentagemEntradas = totalMovimentado > 0 ? Math.round((resumoMes.receita / totalMovimentado) * 100) : 0;
    document.querySelector(".barra-resumo span").style.width = porcentagemEntradas + "%";
}

// --- EXTRATO (LISTA DE TRANSAÇÕES) ---
// Mostra só as transações do mês escolhido nas setas (ERR02)
async function carregarExtrato() {
    const mes = periodoDoMes(dataExibida);
    const res = await fetch(`${API_URL}/transacoes?inicio=${mes.inicio}&fim=${mes.fim}`, {
        headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const transacoes = await res.json();
    
    const container = document.getElementById('lista-transacoes');
    container.innerHTML = '';

    if (transacoes.length === 0) {
        document.getElementById('mensagem-vazia').classList.remove('escondido');
        return;
    }
    document.getElementById('mensagem-vazia').classList.add('escondido');

    // As transações já vêm da mais nova para a mais antiga.
    // Cada vez que o dia muda, abre um grupo novo com o título do dia.
    let grupoAtual = null;
    let diaAtual = '';

    transacoes.forEach(t => {
        const data = lerData(t.data_transacao);
        const dia = data.toDateString();
        if (dia !== diaAtual) {
            diaAtual = dia;
            grupoAtual = document.createElement('div');
            grupoAtual.classList.add('grupo-transacoes');
            grupoAtual.innerHTML = `<h2 class="titulo-grupo">${textoGrupo(data)}</h2>`;
            container.appendChild(grupoAtual);
        }

        const isReceita = t.tipo === 'receita';
        const valorFormatado = isReceita ? `+ ${formatarMoeda(t.valor)}` : `- ${formatarMoeda(t.valor)}`;
        
        const article = document.createElement('article');
        article.classList.add('transacao');
        article.dataset.tipo = t.tipo;
        article.dataset.busca = `${t.descricao || ''} ${t.categoria} ${t.observacao || ''}`.toLowerCase();

        article.innerHTML = `
            <span class="icone-transacao ${isReceita ? 'verde-claro' : 'coral-claro'}">${isReceita ? '＋' : '−'}</span>
            <div class="detalhe-transacao">
                <strong>${escaparHtml(t.descricao || 'Sem descrição')}</strong>
                <small>${t.categoria}${t.observacao ? ' · ' + escaparHtml(t.observacao) : ''}</small>
            </div>
            <strong class="valor-transacao ${isReceita ? 'positivo' : 'negativo'}">${valorFormatado}</strong>
        `;
        grupoAtual.appendChild(article);
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
  categorias: ["Categorias", "Veja para onde está indo o seu dinheiro."],
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

// O botão "Ver detalhes por categoria" abre a tela de categorias
document.querySelector(".link-detalhes").addEventListener("click", () => {
  paginas.forEach(p => p.classList.add("escondido"));
  document.querySelector("#pagina-categorias").classList.remove("escondido");
  botoesMenu.forEach(item => item.classList.remove("ativo"));

  tituloPagina.textContent = textosPaginas.categorias[0];
  subtituloPagina.textContent = textosPaginas.categorias[1];
});

// Botão de sair: apaga o token guardado e volta para a tela de login
document.querySelector("#botao-sair").addEventListener("click", () => {
  if (confirm("Deseja realmente sair?")) {
    encerrarSessao();
  }
});

// --- MODAL NOVA TRANSAÇÃO ---
const modal = document.querySelector("#modal-transacao");
document.querySelector("#botao-nova-transacao").addEventListener("click", () => {
  modal.classList.remove("escondido");
  document.querySelector("#descricao").focus();
  document.querySelector("#data").value = dataDeHoje();
  preencherCategorias();
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

    // Troca a lista de categorias e limpa a categoria que era do outro tipo
    preencherCategorias();
    document.querySelector("#categoria").value = "";
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
  const tipo = document.querySelector("#tipo").value;
  const observacao = document.querySelector("#observacao").value.trim();

  if (!descricao || !categoriaNome || valor <= 0) {
    alert("Preencha todos os campos com informações válidas.");
    return;
  }

  // Procura pelo nome E pelo tipo: uma receita só aceita categoria de receita
  const categoria = CATEGORIAS.find(c =>
      c.nome.toLowerCase() === categoriaNome.toLowerCase() && c.tipo === tipo
  );
  if (!categoria) {
      alert("Categoria não encontrada para " + (tipo === "receita" ? "receita" : "despesa") + ". Selecione uma das opções da lista.");
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
              tipo: tipo,
              valor: valor,
              data_transacao: data,
              descricao: descricao,
              observacao: observacao
          })
      });

      if (res.status === 401) {
          encerrarSessao();
          return;
      }
      if (!res.ok) {
          // Mostra a mensagem que veio da API (ex.: categoria de outro tipo)
          const resposta = await res.json();
          throw new Error(resposta.erro || (resposta.erros || []).join("\n") || "Erro ao salvar transação");
      }

      formulario.reset();
      modal.classList.add("escondido");
      
      await carregarResumo();
      await carregarExtrato();
      await carregarGraficos();
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

  // Esconde o título do dia quando nenhuma transação daquele dia aparece
  document.querySelectorAll(".grupo-transacoes").forEach(grupo => {
    const temVisivel = grupo.querySelector(".transacao:not(.escondido)") !== null;
    grupo.classList.toggle("escondido", !temVisivel);
  });

  document.querySelector("#mensagem-vazia").classList.toggle("escondido", quantidadeVisivel > 0);
}

// --- SELETOR DE MÊS DO EXTRATO ---
// As setas trocam o mês e buscam na API só as transações daquele mês
let dataExibida = new Date(new Date().getFullYear(), new Date().getMonth(), 1); // mês atual

function atualizarMes() {
  document.querySelector("#mes-atual").textContent = nomeMeses[dataExibida.getMonth()] + ", " + dataExibida.getFullYear();
}

document.querySelector("#mes-anterior").addEventListener("click", () => {
  dataExibida.setMonth(dataExibida.getMonth() - 1);
  atualizarMes();
  carregarExtrato();
});

document.querySelector("#mes-proximo").addEventListener("click", () => {
  dataExibida.setMonth(dataExibida.getMonth() + 1);
  atualizarMes();
  carregarExtrato();
});

// --- METAS ---
// Cores que se alternam entre os cartões de meta (verde, azul, roxo)
const coresMetas = [
    { selo: "verde-suave", barra: "" },
    { selo: "azul-suave", barra: "azul" },
    { selo: "roxo-suave", barra: "roxo" }
];

async function carregarMetas() {
    const container = document.getElementById('lista-metas');
    const res = await fetch(`${API_URL}/metas`, {
        headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    if (res.status === 401) {
        encerrarSessao();
        return;
    }
    const metas = await res.json();
    
    container.innerHTML = '';

    if(metas.length === 0) {
        container.innerHTML = '<p style="grid-column: 1/-1;">Nenhuma meta cadastrada. Clique em "+ Nova Meta" para começar.</p>';
        return;
    }

    metas.forEach((meta, i) => {
        const cor = coresMetas[i % coresMetas.length];
        const progresso = Math.min((meta.valor_atual / meta.valor_alvo) * 100, 100);
        const dataFormatada = meta.prazo
            ? lerData(meta.prazo).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
            : 'sem prazo';
        
        container.innerHTML += `
            <article class="cartao cartao-meta">
                <div class="cabecalho-meta">
                    <span class="emoji-meta">${progresso >= 100 ? '🏆' : '🎯'}</span>
                    <div class="nome-meta">
                        <h2>${escaparHtml(meta.titulo)}</h2>
                        <p>Prazo: ${dataFormatada}</p>
                    </div>
                    <span class="porcentagem ${cor.selo}">${progresso.toFixed(0)}%</span>
                </div>
                <div class="valores-meta">
                    <strong>${formatarMoeda(meta.valor_atual)}</strong>
                    <span>acumulados</span>
                    <strong>Meta: ${formatarMoeda(meta.valor_alvo)}</strong>
                </div>
                <div class="progresso ${cor.barra}"><span style="width: ${progresso}%"></span></div>
                <button class="botao botao-meta adicionar-fundos" type="button" data-id="${meta.id_meta}">＋ Adicionar Fundos</button>
            </article>
        `;
    });
}

// Adicionar fundos: um único "ouvinte" na lista atende todos os botões,
// inclusive os dos cartões criados depois
document.getElementById('lista-metas').addEventListener('click', async (evento) => {
    const botao = evento.target.closest('.adicionar-fundos');
    if (!botao) return;

    const valorDigitado = prompt("Quanto deseja adicionar à meta? Digite um valor em reais:");
    if (valorDigitado === null || valorDigitado.trim() === "") return;

    const valor = Number(valorDigitado.replace(",", "."));
    if (Number.isNaN(valor) || valor <= 0) {
        alert("Digite um valor maior que zero.");
        return;
    }

    try {
        const res = await fetch(`${API_URL}/metas/${botao.dataset.id}/fundos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
            body: JSON.stringify({ valor: valor })
        });
        if (res.status === 401) {
            encerrarSessao();
            return;
        }
        if (!res.ok) {
            const resposta = await res.json();
            throw new Error(resposta.erro || "Erro ao adicionar fundos");
        }
        await carregarMetas();
    } catch (err) {
        alert(err.message);
    }
});

// --- NOVA META ---
const modalMeta = document.querySelector("#modal-meta");
const formMeta = document.querySelector("#form-meta");

function fecharModalMeta() {
    modalMeta.classList.add("escondido");
    formMeta.reset();
}

document.querySelector("#botao-nova-meta").addEventListener("click", () => {
    modalMeta.classList.remove("escondido");
    document.querySelector("#meta-titulo").focus();
});
document.querySelector("#fechar-modal-meta").addEventListener("click", fecharModalMeta);
document.querySelector("#voltar-modal-meta").addEventListener("click", fecharModalMeta);
modalMeta.addEventListener("click", (e) => {
    if (e.target === modalMeta) fecharModalMeta();
});

formMeta.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const titulo = document.querySelector("#meta-titulo").value.trim();
    const valorAlvo = Number(document.querySelector("#meta-valor-alvo").value);
    const valorAtual = Number(document.querySelector("#meta-valor-atual").value || 0);
    const prazo = document.querySelector("#meta-prazo").value;

    if (!titulo || valorAlvo <= 0 || valorAtual < 0) {
        alert("Preencha o nome e um valor total maior que zero.");
        return;
    }

    try {
        const res = await fetch(`${API_URL}/metas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
            body: JSON.stringify({ titulo: titulo, valor_alvo: valorAlvo, valor_atual: valorAtual, prazo: prazo || null })
        });
        if (res.status === 401) {
            encerrarSessao();
            return;
        }
        if (!res.ok) {
            const resposta = await res.json();
            throw new Error(resposta.erro || (resposta.erros || []).join("\n") || "Erro ao salvar meta");
        }
        fecharModalMeta();
        await carregarMetas();
    } catch (err) {
        alert(err.message);
    }
});

// --- GRÁFICOS E TELA CATEGORIAS ---
// Cor de cada categoria. Categorias que não estão aqui usam o cinza.
const categoriasConfig = {
    "Alimentação": { cor: "#f47a4c", classe: "laranja", icone: "☕" },
    "Saúde": { cor: "#2ba99c", classe: "verde-agua", icone: "✚" },
    "Transporte": { cor: "#5965b6", classe: "azul", icone: "➤" },
    "Lazer": { cor: "#a64caa", classe: "roxo", icone: "▭" },
    "Moradia": { cor: "#f6ae35", classe: "amarelo", icone: "⌂" }
};
const configPadrao = { cor: "#8c93a2", classe: "cinza", icone: "•" };

// Busca os dados dos gráficos na API (despesas do mês atual e dos últimos 7 dias)
async function carregarGraficos() {
    const headers = { 'Authorization': `Bearer ${TOKEN}` };
    const [resCategorias, resSemana, resInsights] = await Promise.all([
        fetch(`${API_URL}/transacoes/por-categoria`, { headers }),
        fetch(`${API_URL}/transacoes/ultimos-7-dias`, { headers }),
        fetch(`${API_URL}/transacoes/insights`, { headers })
    ]);

    if (resCategorias.status === 401 || resSemana.status === 401 || resInsights.status === 401) {
        encerrarSessao();
        return;
    }

    const categorias = await resCategorias.json();
    const semana = await resSemana.json();
    const insights = await resInsights.json();

    desenharCategorias(categorias);
    desenharSemana(semana.map(dia => dia.total));
    desenharInsights(insights);
}

// Preenche a tela Insights.
// dados: { mes: {receita, despesa}, comparacao: {categoria, atual, anterior, aumento_pct} ou null,
//          pico: {dia, total} ou null, assinaturas: número }
function desenharInsights(dados) {
    const mesAtual = new Date().getMonth();
    document.getElementById("rotulo-mes-anterior").textContent = nomeMeses[(mesAtual + 11) % 12];
    document.getElementById("rotulo-mes-atual").textContent = nomeMeses[mesAtual];

    // Alerta: categoria que mais subiu em relação ao mês passado
    const textoAlerta = document.getElementById("texto-alerta");
    const barraAnterior = document.getElementById("barra-mes-anterior");
    const barraAtual = document.getElementById("barra-mes-atual");
    const diferenca = document.getElementById("diferenca-valor");
    const comp = dados.comparacao;

    if (comp) {
        textoAlerta.innerHTML = "Você gastou <b>" + comp.aumento_pct + "% mais</b> em " + comp.categoria + " este mês comparado ao mês passado.";
        barraAnterior.style.height = "60px";
        barraAtual.style.height = Math.min(Math.round(60 * (comp.atual / comp.anterior)), 120) + "px";
        diferenca.textContent = "+ " + formatarMoeda(comp.atual - comp.anterior);
    } else {
        textoAlerta.textContent = "Nenhuma categoria gastou mais do que no mês passado. Continue assim!";
        barraAnterior.style.height = "60px";
        barraAtual.style.height = "60px";
        diferenca.textContent = formatarMoeda(0);
    }

    // Padrão: dia da semana com mais gastos
    if (dados.pico) {
        document.getElementById("texto-pico").textContent =
            "Nos últimos 30 dias, " + dados.pico.dia.toLowerCase() + " foi o dia da semana com mais gastos (" + formatarMoeda(dados.pico.total) + ").";
        document.getElementById("pilula-pico").textContent = dados.pico.dia.split("-")[0];
    } else {
        document.getElementById("texto-pico").textContent = "Ainda não há despesas suficientes para identificar um padrão.";
        document.getElementById("pilula-pico").textContent = "—";
    }

    // Padrão: assinaturas
    document.getElementById("texto-assinaturas").textContent = dados.assinaturas > 0
        ? "Totalizam " + formatarMoeda(dados.assinaturas) + " este mês (Netflix, Spotify, etc)."
        : "Nenhuma assinatura identificada este mês.";
    document.getElementById("pilula-assinaturas").textContent = "R$ " + Math.round(dados.assinaturas) + "/mês";

    // Dicas: montadas a partir dos próprios dados (sem números inventados)
    const dicas = [];
    if (dados.mes.despesa > dados.mes.receita) {
        dicas.push({ icone: "⚠", classe: "fundo-laranja", titulo: "Gastos acima das receitas",
            texto: "Neste mês as despesas (" + formatarMoeda(dados.mes.despesa) + ") passaram das receitas (" + formatarMoeda(dados.mes.receita) + "). Rever gastos agora ajuda a não depender de cartão ou empréstimo." });
    }
    if (comp) {
        dicas.push({ icone: "☕", classe: "fundo-amarelo", titulo: "Reveja os gastos com " + comp.categoria,
            texto: "Este mês você já gastou " + formatarMoeda(comp.atual - comp.anterior) + " a mais do que no mês passado nessa categoria." });
    }
    if (dados.assinaturas > 0) {
        dicas.push({ icone: "▭", classe: "fundo-roxo", titulo: "Confira suas assinaturas",
            texto: "Serviços recorrentes somam " + formatarMoeda(dados.assinaturas) + " por mês. Vale ver se você ainda usa todos." });
    }
    if (dicas.length === 0 && dados.mes.despesa === 0) {
        dicas.push({ icone: "💡", classe: "fundo-verde", titulo: "Comece registrando seus gastos",
            texto: "As dicas aparecem aqui conforme você lança receitas e despesas." });
    } else if (dicas.length === 0) {
        dicas.push({ icone: "🛡️", classe: "fundo-verde", titulo: "Bom ritmo",
            texto: "Seus gastos estão sob controle neste mês. Que tal guardar a diferença em uma das suas metas?" });
    }

    document.getElementById("lista-dicas").innerHTML = dicas.map(d =>
        '<article class="cartao cartao-insight dica">' +
            '<span class="icone-dica ' + d.classe + '" aria-hidden="true">' + d.icone + '</span>' +
            '<div class="textos"><h3>' + d.titulo + '</h3><p>' + d.texto + '</p></div>' +
        '</article>'
    ).join("");
}

// Desenha a rosca e a legenda (Início) e a tela Categorias.
// lista: [{ categoria: "Alimentação", total: 1044 }, ...]
function desenharCategorias(lista) {
    const itens = lista.filter(item => Number(item.total) > 0);
    const total = itens.reduce((soma, item) => soma + Number(item.total), 0);

    const legenda = document.getElementById("legenda-rosca");
    const legendaHorizontal = document.getElementById("legenda-horizontal");
    const barra = document.getElementById("barra-segmentada");
    const listaDetalhe = document.getElementById("lista-categorias-detalhe");
    legenda.innerHTML = "";
    legendaHorizontal.innerHTML = "";
    barra.innerHTML = "";
    listaDetalhe.innerHTML = "";

    document.getElementById("total-rosca").textContent = "R$ " + Math.round(total).toLocaleString("pt-BR");
    document.getElementById("total-distribuicao").textContent = formatarMoeda(total);

    if (itens.length === 0) {
        document.getElementById("grafico-rosca").style.background = "#f1f2f5";
        legenda.innerHTML = '<li class="sem-dados">Nenhuma despesa no período.</li>';
        listaDetalhe.innerHTML = '<p class="sem-dados">Nenhuma despesa no período.</p>';
        return;
    }

    const trechosRosca = [];
    let inicio = 0;

    itens.forEach(item => {
        const config = categoriasConfig[item.categoria] || configPadrao;
        const valor = Number(item.total);
        const porcentagem = (valor / total) * 100;
        const arredondada = Math.round(porcentagem);
        const fim = inicio + porcentagem;

        trechosRosca.push(config.cor + " " + inicio + "% " + fim + "%");
        inicio = fim;

        legenda.innerHTML += '<li><span class="ponto ponto-' + config.classe + '"></span>' + item.categoria + ' <strong>' + arredondada + '%</strong></li>';
        legendaHorizontal.innerHTML += '<li><span class="ponto ponto-' + config.classe + '"></span>' + item.categoria + ' (' + arredondada + '%)</li>';
        barra.innerHTML += '<span class="cor-' + config.classe + '" style="width: ' + porcentagem + '%"></span>';
        listaDetalhe.innerHTML +=
            '<article class="cartao cartao-categoria">' +
                '<div class="linha-categoria">' +
                    '<span class="icone-categoria fundo-' + config.classe + '" aria-hidden="true">' + config.icone + '</span>' +
                    '<div class="texto-categoria"><strong>' + item.categoria + '</strong><small>' + arredondada + '% do total de despesas mensais</small></div>' +
                    '<strong class="valor-categoria">' + formatarMoeda(valor) + '</strong>' +
                '</div>' +
                '<div class="progresso cat-' + config.classe + '"><span style="width: ' + porcentagem + '%"></span></div>' +
            '</article>';
    });

    document.getElementById("grafico-rosca").style.background = "conic-gradient(" + trechosRosca.join(", ") + ")";
}

// Desenha o gráfico de linha dos últimos 7 dias.
// valores: 7 números, do dia mais antigo até hoje (ex.: [0, 24.5, 0, 130, 0, 0, 184.9])
function desenharSemana(valores) {
    const nomesDias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const rotulos = [];
    for (let i = 6; i >= 0; i--) {
        const dia = new Date();
        dia.setDate(dia.getDate() - i);
        rotulos.push("<span>" + nomesDias[dia.getDay()] + "</span>");
    }
    document.getElementById("dias-semana").innerHTML = rotulos.join("");

    const dados = valores.length === 7 ? valores.map(Number) : [0, 0, 0, 0, 0, 0, 0];
    const maior = Math.max(...dados, 1);
    // x vai de 5 a 495; y vai de 115 (zero) até 10 (maior valor)
    const pontos = dados.map((valor, i) => {
        const x = Math.round(5 + i * (490 / 6));
        const y = 115 - (valor / maior) * 105;
        return x + "," + Math.round(y);
    });
    document.getElementById("linha-semana").setAttribute("points", pontos.join(" "));
}

// --- INICIALIZAÇÃO GERAL ---
inicializarApp();