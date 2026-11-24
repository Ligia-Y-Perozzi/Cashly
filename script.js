// Elementos principais da página
const botoesMenu = document.querySelectorAll(".link-menu");
const paginas = document.querySelectorAll(".pagina");
const tituloPagina = document.querySelector("#titulo-pagina");
const subtituloPagina = document.querySelector("#subtitulo-pagina");

// Textos que aparecem no topo de cada tela
const textosPaginas = {
  inicio: ["Visão Geral", "Acompanhe suas finanças em tempo real."],
  extrato: ["Extrato Bancário", "Acompanhe suas receitas e despesas."],
  metas: ["Metas Financeiras", "Planeje e guarde dinheiro para realizar seus sonhos."],
  categorias: ["Categorias", "Veja para onde está indo o seu dinheiro."],
  insights: ["Insights", "Entenda seus hábitos e receba dicas para economizar."]
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

// O botão "Ver detalhes por categoria" abre a tela de categorias
const botaoDetalhes = document.querySelector(".link-detalhes");

botaoDetalhes.addEventListener("click", function () {
  paginas.forEach(function (pagina) {
    pagina.classList.add("escondido");
  });

  document.querySelector("#pagina-categorias").classList.remove("escondido");

  botoesMenu.forEach(function (itemMenu) {
    itemMenu.classList.remove("ativo");
  });

  tituloPagina.textContent = textosPaginas.categorias[0];
  subtituloPagina.textContent = textosPaginas.categorias[1];
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

  // A barra mostra quanto das movimentações são entradas
  const porcentagemEntradas = Math.round((entradas / (entradas + saidas)) * 100);
  document.querySelector(".barra-resumo span").style.width = porcentagemEntradas + "%";
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
  document.querySelector("#data").value = dataDeHoje();
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
    registrarGasto(categoria, valor, descricao);
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
let dataExibida = new Date(new Date().getFullYear(), new Date().getMonth(), 1); // mês atual
const nomeMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function atualizarMes() {
  document.querySelector("#mes-atual").textContent = nomeMeses[dataExibida.getMonth()] + ", " + dataExibida.getFullYear();
}

atualizarMes();

// Títulos dos grupos do extrato com a data de hoje, de ontem e de anteontem
function textoDia(diasAtras) {
  const dia = new Date();
  dia.setDate(dia.getDate() - diasAtras);
  return dia.getDate() + " de " + nomeMeses[dia.getMonth()];
}

const titulosGrupos = document.querySelectorAll(".titulo-grupo");
titulosGrupos[0].textContent = "Hoje, " + textoDia(0);
titulosGrupos[1].textContent = "Ontem, " + textoDia(1);
titulosGrupos[2].textContent = textoDia(2);

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

// Deixa o campo de data do formulário já preenchido com hoje
document.querySelector("#data").value = dataDeHoje();

// Botão de sair (ainda não existe tela de login, então só reinicia a página)
document.querySelector("#botao-sair").addEventListener("click", function () {
  if (confirm("Deseja realmente sair?")) {
    window.location.reload();
  }
});


// Gastos por categoria: começam com os valores do mês e as novas despesas somam aqui
const categoriasConfig = {
  "Alimentação": { cor: "#f47a4c", classe: "laranja", icone: "☕" },
  "Saúde": { cor: "#2ba99c", classe: "verde-agua", icone: "✚" },
  "Transporte": { cor: "#5965b6", classe: "azul", icone: "➤" },
  "Lazer": { cor: "#a64caa", classe: "roxo", icone: "▭" },
  "Moradia": { cor: "#f6ae35", classe: "amarelo", icone: "⌂" },
  "Outros": { cor: "#8c93a2", classe: "cinza", icone: "•" }
};

const gastosPorCategoria = {
  "Alimentação": 1044,
  "Saúde": 522,
  "Transporte": 391.5,
  "Lazer": 391.5,
  "Moradia": 261,
  "Outros": 0
};

// Gastos do mês passado, usados para comparar nos insights
const gastosMesPassado = {
  "Alimentação": 850,
  "Saúde": 500,
  "Transporte": 400,
  "Lazer": 380,
  "Moradia": 261
};

let totalAssinaturas = 189;

function semAcento(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Se a categoria digitada não for uma das conhecidas, cai em "Outros"
function acharCategoria(texto) {
  const procurada = semAcento(texto);
  let encontrada = "Outros";

  Object.keys(categoriasConfig).forEach(function (nome) {
    if (semAcento(nome) === procurada) encontrada = nome;
  });

  return encontrada;
}

function registrarGasto(categoria, valor, descricao) {
  const nome = acharCategoria(categoria);
  gastosPorCategoria[nome] += valor;

  if (/assinatura|netflix|spotify|youtube|prime|disney|hbo/.test(semAcento(descricao))) {
    totalAssinaturas += valor;
  }

  atualizarCategorias();
  atualizarInsights();
}

// Redesenha o gráfico da tela Início e a tela Categorias com os valores atuais
function atualizarCategorias() {
  const nomes = Object.keys(gastosPorCategoria).filter(function (nome) {
    return gastosPorCategoria[nome] > 0;
  });
  const total = nomes.reduce(function (soma, nome) {
    return soma + gastosPorCategoria[nome];
  }, 0);

  const legenda = document.querySelector(".legenda");
  const legendaHorizontal = document.querySelector(".legenda-horizontal");
  const barra = document.querySelector(".barra-segmentada");
  const lista = document.querySelector(".lista-categorias");
  legenda.innerHTML = "";
  legendaHorizontal.innerHTML = "";
  barra.innerHTML = "";
  lista.innerHTML = "";

  const trechosRosca = [];
  let inicio = 0;

  nomes.forEach(function (nome) {
    const config = categoriasConfig[nome];
    const valor = gastosPorCategoria[nome];
    const porcentagem = (valor / total) * 100;
    const arredondada = Math.round(porcentagem);
    const fim = inicio + porcentagem;

    trechosRosca.push(config.cor + " " + inicio + "% " + fim + "%");
    inicio = fim;

    legenda.innerHTML += '<li><span class="ponto ponto-' + config.classe + '"></span>' + nome + ' <strong>' + arredondada + '%</strong></li>';
    legendaHorizontal.innerHTML += '<li><span class="ponto ponto-' + config.classe + '"></span>' + nome + ' (' + arredondada + '%)</li>';
    barra.innerHTML += '<span class="cor-' + config.classe + '" style="width: ' + porcentagem + '%"></span>';
    lista.innerHTML +=
      '<article class="cartao cartao-categoria">' +
        '<div class="linha-categoria">' +
          '<span class="icone-categoria fundo-' + config.classe + '" aria-hidden="true">' + config.icone + '</span>' +
          '<div class="texto-categoria"><strong>' + nome + '</strong><small>' + arredondada + '% do total de despesas mensais</small></div>' +
          '<strong class="valor-categoria">' + formatarMoeda(valor) + '</strong>' +
        '</div>' +
        '<div class="progresso cat-' + config.classe + '"><span style="width: ' + porcentagem + '%"></span></div>' +
      '</article>';
  });

  document.querySelector(".grafico-rosca").style.background = "conic-gradient(" + trechosRosca.join(", ") + ")";
  document.querySelector(".grafico-rosca strong").textContent = "R$ " + Math.round(total).toLocaleString("pt-BR");
  document.querySelector(".topo-distribuicao strong").textContent = formatarMoeda(total);
}

// Atualiza a tela Insights: categoria que mais subiu e total de assinaturas
function atualizarInsights() {
  let categoriaMaior = null;
  let maiorAumento = 0;

  Object.keys(gastosMesPassado).forEach(function (nome) {
    const aumento = (gastosPorCategoria[nome] - gastosMesPassado[nome]) / gastosMesPassado[nome];
    if (aumento > maiorAumento) {
      maiorAumento = aumento;
      categoriaMaior = nome;
    }
  });

  const textoAlerta = document.querySelector(".texto-alerta");
  const barraAnterior = document.querySelector(".barra-julho");
  const barraAtual = document.querySelector(".barra-agosto");
  const diferenca = document.querySelector(".diferenca strong");

  const mesAtual = new Date().getMonth();
  const rotulos = document.querySelectorAll(".coluna-barra span");
  rotulos[0].textContent = nomeMeses[(mesAtual + 11) % 12];
  rotulos[1].textContent = nomeMeses[mesAtual];

  if (categoriaMaior === null) {
    textoAlerta.textContent = "Nenhuma categoria gastou mais do que no mês passado. Continue assim!";
    barraAnterior.style.height = "60px";
    barraAtual.style.height = "60px";
    diferenca.textContent = formatarMoeda(0);
  } else {
    const anterior = gastosMesPassado[categoriaMaior];
    const atual = gastosPorCategoria[categoriaMaior];

    textoAlerta.innerHTML = "Você gastou <b>" + Math.round(maiorAumento * 100) + "% mais</b> em " + categoriaMaior + " este mês comparado ao mês passado.";
    barraAnterior.style.height = "60px";
    barraAtual.style.height = Math.min(Math.round(60 * (atual / anterior)), 120) + "px";
    diferenca.textContent = "+ " + formatarMoeda(atual - anterior);
  }

  document.querySelector("#texto-assinaturas").textContent = "Totalizam " + formatarMoeda(totalAssinaturas) + " por mês (Netflix, Spotify, etc).";
  document.querySelector("#pilula-assinaturas").textContent = "R$ " + Math.round(totalAssinaturas) + "/mês";
}

// Preenche as telas com os valores iniciais
atualizarCategorias();
atualizarInsights();
