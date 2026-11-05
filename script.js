// Elementos principais da página
const botoesMenu = document.querySelectorAll(".link-menu");
const paginas = document.querySelectorAll(".pagina");
const tituloPagina = document.querySelector("#titulo-pagina");
const subtituloPagina = document.querySelector("#subtitulo-pagina");

// Textos que aparecem no topo de cada tela
const textosPaginas = {
  inicio: ["Visão Geral", "Acompanhe suas finanças em tempo real."],
  extrato: ["Extrato Bancário", "Acompanhe suas receitas e despesas."],
  metas: ["Metas Financeiras", "Planeje e guarde dinheiro para realizar seus sonhos."]
};

// Troca a tela visível
botoesMenu.forEach(function (botao) {
  botao.addEventListener("click", function () {
    const nomePagina = botao.dataset.pagina;

    paginas.forEach(function (pagina) {
      pagina.classList.add("escondido");
    });

    document.querySelector("#pagina-" + nomePagina).classList.remove("escondido");

    botoesMenu.forEach(function (itemMenu) {
      itemMenu.classList.remove("ativo");
    });
    botao.classList.add("ativo");

    tituloPagina.textContent = textosPaginas[nomePagina][0];
    subtituloPagina.textContent = textosPaginas[nomePagina][1];
  });
});

// Abre e fecha o formulário de nova transação
const modal = document.querySelector("#modal-transacao");
const botaoNovaTransacao = document.querySelector("#botao-nova-transacao");
const botaoFecharModal = document.querySelector("#fechar-modal");

botaoNovaTransacao.addEventListener("click", function () {
  modal.classList.remove("escondido");
  document.querySelector("#descricao").focus();
});

botaoFecharModal.addEventListener("click", function () {
  modal.classList.add("escondido");
});

// Fecha a janela se a pessoa clicar na área escura ao redor do formulário
modal.addEventListener("click", function (evento) {
  if (evento.target === modal) {
    modal.classList.add("escondido");
  }
});

// Valores iniciais mostrados na tela Início
let saldo = 6420.50;
let entradas = 4250.00;
let saidas = 2610.00;

function formatarMoeda(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function atualizarResumo() {
  document.querySelector("#saldo").textContent = formatarMoeda(saldo);
  document.querySelector("#total-entradas").textContent = "+ " + formatarMoeda(entradas);
  document.querySelector("#total-saidas").textContent = "- " + formatarMoeda(saidas);
}

// Adiciona uma transação ao extrato quando o formulário é enviado
const formulario = document.querySelector("#form-transacao");

formulario.addEventListener("submit", function (evento) {
  evento.preventDefault();

  const descricao = document.querySelector("#descricao").value.trim();
  const categoria = document.querySelector("#categoria").value.trim();
  const valor = Number(document.querySelector("#valor").value);
  const tipo = document.querySelector("#tipo").value;

  if (!descricao || !categoria || valor <= 0) {
    alert("Preencha todos os campos com informações válidas.");
    return;
  }

  adicionarTransacao(descricao, categoria, valor, tipo);
  formulario.reset();
  modal.classList.add("escondido");
  atualizarResumo();
});

function adicionarTransacao(descricao, categoria, valor, tipo) {
  const novaTransacao = document.createElement("article");
  novaTransacao.classList.add("transacao");
  novaTransacao.dataset.tipo = tipo;
  novaTransacao.dataset.busca = (descricao + " " + categoria).toLowerCase();

  const icone = document.createElement("span");
  icone.classList.add("icone-transacao", tipo === "receita" ? "verde-claro" : "coral-claro");
  icone.textContent = tipo === "receita" ? "＋" : "−";

  const detalhes = document.createElement("div");
  detalhes.classList.add("detalhe-transacao");

  const nome = document.createElement("strong");
  nome.textContent = descricao;
  const textoCategoria = document.createElement("small");
  textoCategoria.textContent = categoria;
  detalhes.append(nome, textoCategoria);

  const textoValor = document.createElement("strong");
  textoValor.classList.add("valor-transacao", tipo === "receita" ? "positivo" : "negativo");
  textoValor.textContent = (tipo === "receita" ? "+ " : "- ") + formatarMoeda(valor);

  novaTransacao.append(icone, detalhes, textoValor);

  // Novas transações aparecem no começo da lista "Hoje"
  document.querySelector("#lista-hoje").prepend(novaTransacao);

  if (tipo === "receita") {
    entradas += valor;
    saldo += valor;
  } else {
    saidas += valor;
    saldo -= valor;
  }

  filtrarTransacoes();
}

// Busca e filtros de receita/despesa no extrato
let filtroAtual = "todas";
const campoBusca = document.querySelector("#busca-transacao");
const botoesFiltro = document.querySelectorAll(".filtro");

botoesFiltro.forEach(function (botao) {
  botao.addEventListener("click", function () {
    filtroAtual = botao.dataset.filtro;

    botoesFiltro.forEach(function (item) {
      item.classList.remove("ativo");
    });
    botao.classList.add("ativo");
    filtrarTransacoes();
  });
});

campoBusca.addEventListener("input", filtrarTransacoes);

function filtrarTransacoes() {
  const textoBusca = campoBusca.value.toLowerCase().trim();
  const transacoes = document.querySelectorAll(".transacao");
  let quantidadeVisivel = 0;

  transacoes.forEach(function (transacao) {
    const correspondeTipo = filtroAtual === "todas" || transacao.dataset.tipo === filtroAtual;
    const correspondeBusca = transacao.dataset.busca.includes(textoBusca);
    const deveMostrar = correspondeTipo && correspondeBusca;

    transacao.classList.toggle("escondido", !deveMostrar);
    if (deveMostrar) quantidadeVisivel++;
  });

  document.querySelector("#mensagem-vazia").classList.toggle("escondido", quantidadeVisivel > 0);
}

// Os botões de seta mudam o mês mostrado no extrato
let dataExibida = new Date(2024, 7, 1); // 7 representa agosto
const nomeMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function atualizarMes() {
  document.querySelector("#mes-atual").textContent = nomeMeses[dataExibida.getMonth()] + ", " + dataExibida.getFullYear();
}

document.querySelector("#mes-anterior").addEventListener("click", function () {
  dataExibida.setMonth(dataExibida.getMonth() - 1);
  atualizarMes();
});

document.querySelector("#mes-proximo").addEventListener("click", function () {
  dataExibida.setMonth(dataExibida.getMonth() + 1);
  atualizarMes();
});

// Permite adicionar dinheiro às metas usando uma janela simples do navegador
const botoesAdicionarFundos = document.querySelectorAll(".adicionar-fundos");

botoesAdicionarFundos.forEach(function (botao) {
  botao.addEventListener("click", function () {
    const cartaoMeta = botao.closest(".cartao-meta");
    const campoAtual = Number(cartaoMeta.dataset.atual);
    const alvo = Number(cartaoMeta.dataset.alvo);
    const valorDigitado = prompt("Quanto deseja adicionar à meta? Digite um valor em reais:");

    if (valorDigitado === null || valorDigitado.trim() === "") return;

    const valorAdicionado = Number(valorDigitado.replace(",", "."));
    if (Number.isNaN(valorAdicionado) || valorAdicionado <= 0) {
      alert("Digite um valor maior que zero.");
      return;
    }

    const novoTotal = campoAtual + valorAdicionado;
    const porcentagem = Math.min(Math.round((novoTotal / alvo) * 100), 100);
    cartaoMeta.dataset.atual = novoTotal;
    cartaoMeta.querySelector(".valores-meta strong").textContent = formatarMoeda(novoTotal);
    cartaoMeta.querySelector(".progresso span").style.width = porcentagem + "%";
    cartaoMeta.querySelector(".porcentagem").textContent = porcentagem + "%";
  });
});

// O botão "Nova Meta" cria uma meta simples com os dados digitados
const botaoNovaMeta = document.createElement("button");
botaoNovaMeta.type = "button";
botaoNovaMeta.className = "botao botao-coral botao-nova-meta";
botaoNovaMeta.textContent = "+ Nova Meta";
document.querySelector("#pagina-metas").prepend(botaoNovaMeta);

botaoNovaMeta.addEventListener("click", function () {
  const nome = prompt("Qual é o nome da nova meta?");
  if (!nome || !nome.trim()) return;

  const valorAlvoTexto = prompt("Qual é o valor total da meta?");
  if (valorAlvoTexto === null) return;
  const valorAlvo = Number(valorAlvoTexto.replace(",", "."));

  if (Number.isNaN(valorAlvo) || valorAlvo <= 0) {
    alert("Digite um valor maior que zero.");
    return;
  }

  const cartao = document.createElement("article");
  cartao.className = "cartao cartao-meta";
  cartao.dataset.atual = "0";
  cartao.dataset.alvo = valorAlvo;

  const cabecalho = document.createElement("div");
  cabecalho.className = "cabecalho-meta";
  cabecalho.innerHTML = '<span class="emoji-meta">🎯</span><div class="nome-meta"><h2></h2><p>Nova meta</p></div><span class="porcentagem azul-suave">0%</span>';
  cabecalho.querySelector("h2").textContent = nome.trim();

  const valores = document.createElement("div");
  valores.className = "valores-meta";
  valores.innerHTML = '<strong>R$ 0,00</strong><span>acumulados</span><strong></strong>';
  valores.querySelectorAll("strong")[1].textContent = "Meta: " + formatarMoeda(valorAlvo);

  const progresso = document.createElement("div");
  progresso.className = "progresso azul";
  progresso.innerHTML = "<span style='width: 0%'></span>";

  const botaoFundos = document.createElement("button");
  botaoFundos.type = "button";
  botaoFundos.className = "botao botao-meta adicionar-fundos";
  botaoFundos.textContent = "+ Adicionar Fundos";
  botaoFundos.addEventListener("click", function () {
    const valor = prompt("Quanto deseja adicionar à meta?");
    if (valor === null || valor.trim() === "") return;
    const numero = Number(valor.replace(",", "."));
    if (Number.isNaN(numero) || numero <= 0) {
      alert("Digite um valor maior que zero.");
      return;
    }
    const atual = Number(cartao.dataset.atual) + numero;
    const percentual = Math.min(Math.round((atual / valorAlvo) * 100), 100);
    cartao.dataset.atual = atual;
    cartao.querySelector(".valores-meta strong").textContent = formatarMoeda(atual);
    cartao.querySelector(".progresso span").style.width = percentual + "%";
    cartao.querySelector(".porcentagem").textContent = percentual + "%";
  });

  cartao.append(cabecalho, valores, progresso, botaoFundos);
  document.querySelector("#lista-metas").append(cartao);
});


// Controle Receita / Despesa do formulário
const abasTipo = document.querySelectorAll(".aba-tipo");
const campoTipo = document.querySelector("#tipo");
const botaoSalvar = document.querySelector("#botao-salvar");

function definirTipo(tipo) {
  campoTipo.value = tipo;
  abasTipo.forEach(function (aba) {
    aba.classList.toggle("ativo", aba.dataset.tipo === tipo);
  });
  botaoSalvar.textContent = tipo === "receita" ? "Salvar Receita" : "Salvar Despesa";
}

abasTipo.forEach(function (aba) {
  aba.addEventListener("click", function () {
    definirTipo(aba.dataset.tipo);
  });
});

// O botão "Voltar" fecha o formulário sem salvar
document.querySelector("#voltar-modal").addEventListener("click", function () {
  modal.classList.add("escondido");
});

// Data de hoje no formato do campo de data (aaaa-mm-dd)
function dataDeHoje() {
  const hoje = new Date();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");
  return hoje.getFullYear() + "-" + mes + "-" + dia;
}
