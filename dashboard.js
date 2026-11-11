/* =====================================
   LIVECHAT CENTRAL
   Painel de comentários da Paróquia Espírito Santo
===================================== */


/* =====================================
   ELEMENTOS DO HTML
===================================== */

const listaComentarios = document.getElementById("listaComentarios");
const mensagemVazia = document.getElementById("mensagemVazia");

const comentariosRecebidos = document.getElementById("comentariosRecebidos");
const comentariosExibidos = document.getElementById("comentariosExibidos");

const botaoYoutube = document.getElementById("botaoYoutube");
const botaoFacebook = document.getElementById("botaoFacebook");

const indicadorYoutube = document.getElementById("indicadorYoutube");
const indicadorFacebook = document.getElementById("indicadorFacebook");

const diminuirFonte = document.getElementById("diminuirFonte");
const aumentarFonte = document.getElementById("aumentarFonte");

const botaoPausa = document.getElementById("botaoPausa");
const botaoDesfazer = document.getElementById("botaoDesfazer");

const botaoFontes = document.getElementById("botaoFontes");
const janelaFontes = document.getElementById("janelaFontes");
const fecharFontes = document.getElementById("fecharFontes");
const listaFontes = document.getElementById("listaFontes");
const fontesVazia = document.getElementById("fontesVazia");


/* =====================================
   ESTADO DO PAINEL
===================================== */

let comentarios = [];
let historicoExclusao = [];

let totalRecebidos = 0;

let pausado = false;

let youtubeAtivo = true;
let facebookAtivo = true;

let youtubeConectado = false;
let facebookConectado = false;

let tamanhoFonte = 15;

let proximoId = 1;

// Páginas (abas) que já enviaram comentários, indexadas por tabId.
let fontes = new Map();


/* =====================================
   VERIFICAR PLATAFORMA ATIVA
===================================== */

function plataformaAtiva(origem) {

    if (origem === "youtube") {
        return youtubeAtivo;
    }

    if (origem === "facebook") {
        return facebookAtivo;
    }

    return false;
}


/* =====================================
   ATUALIZAR INDICADORES
===================================== */

function atualizarIndicador(indicador, botao, conectado, ativo) {

    indicador.classList.remove("desativado", "inativo");
    botao.classList.remove("desativado", "inativo");

    if (!conectado) {

        indicador.classList.add("desativado");
        botao.classList.add("desativado");

        indicador.style.backgroundColor = "#c9c5c0";

    } else if (!ativo) {

        indicador.classList.add("inativo");
        botao.classList.add("inativo");

        indicador.style.backgroundColor = "#d96b6b";

    } else {

        indicador.style.backgroundColor = "#80b99a";

    }
}


function atualizarIndicadores() {

    atualizarIndicador(
        indicadorYoutube,
        botaoYoutube,
        youtubeConectado,
        youtubeAtivo
    );

    atualizarIndicador(
        indicadorFacebook,
        botaoFacebook,
        facebookConectado,
        facebookAtivo
    );
}


/* =====================================
   RECEBER ESTADO DAS ABAS
===================================== */

function atualizarEstadoPlataformas(mensagem) {

    if (!mensagem) return;

    youtubeConectado = Boolean(mensagem.youtube);
    facebookConectado = Boolean(mensagem.facebook);

    atualizarIndicadores();
}


/* =====================================
   SOLICITAR ESTADO DAS PLATAFORMAS
===================================== */

function solicitarEstadoPlataformas() {

    chrome.runtime.sendMessage({
        tipo: "SOLICITAR_ESTADO_PLATAFORMAS"
    }, (resposta) => {

        if (chrome.runtime.lastError) {
            return;
        }

        if (resposta) {
            atualizarEstadoPlataformas(resposta);
        }

    });
}


/* =====================================
   ATUALIZAR CONTADORES
===================================== */

function atualizarContadores() {

    const quantidadeExibida = comentarios.filter(comentario => {

        return plataformaAtiva(comentario.origem);

    }).length;

    comentariosRecebidos.textContent = totalRecebidos;
    comentariosExibidos.textContent = quantidadeExibida;
}


/* =====================================
   ATUALIZAR BOTÃO DE DESFAZER
===================================== */

function atualizarDesfazer() {

    botaoDesfazer.hidden = historicoExclusao.length === 0;
}


/* =====================================
   ATUALIZAR BOTÃO DE PAUSA
===================================== */

function atualizarBotaoPausa() {

    botaoPausa.textContent = pausado ? "Continuar" : "Pausar";

    botaoPausa.classList.toggle("pausado", pausado);
}


/* =====================================
   SOLICITAR EXPANSÃO DO FACEBOOK
===================================== */

function solicitarExpansaoFacebook(id) {

    const comentario = comentarios.find(item => item.id === id);

    if (!comentario || comentario.expandindo) return;

    if (
        comentario.origem !== "facebook" ||
        !comentario.podeExpandir
    ) {
        return;
    }

    if (
        typeof comentario.tabId !== "number" ||
        typeof comentario.idOriginal !== "string"
    ) {
        return;
    }

    comentario.expandindo = true;

    atualizarPainel();

    chrome.runtime.sendMessage(
        {
            tipo: "EXPANDIR_COMENTARIO_FACEBOOK",
            tabId: comentario.tabId,
            frameId: comentario.frameId,
            idOriginal: comentario.idOriginal,
            idFacebook: comentario.idFacebook || "",
            nome: comentario.nome,
            texto: comentario.texto
        },
        (resposta) => {

            if (chrome.runtime.lastError) {
                comentario.expandindo = false;
                atualizarPainel();
                return;
            }

            if (!resposta || !resposta.ok) {
                comentario.expandindo = false;
                atualizarPainel();
                return;
            }

            comentario.expandindo = false;
            atualizarPainel();
        }
    );
}


/* =====================================
   CRIAR CARTÃO DE COMENTÁRIO
===================================== */

function criarCartao(comentario) {

    const cartao = document.createElement("article");

    cartao.className = "cartao-comentario";

    cartao.dataset.id = comentario.id;

    if (comentario.lido) {
        cartao.classList.add("comentario-lido");
    }


    /* CABEÇALHO */

    const cabecalho = document.createElement("div");

    cabecalho.className = "cabecalho-comentario";


    /* PLATAFORMA */

    const origem = document.createElement("span");

    origem.className = "origem " + comentario.origem;

    const nomePlataforma =
        comentario.origem === "youtube"
            ? "YouTube"
            : "Facebook";

    origem.title = nomePlataforma;
    origem.setAttribute("aria-label", nomePlataforma);

    origem.appendChild(criarLogoPlataforma(comentario.origem));


    /* NOME */

    const nome = document.createElement("strong");

    nome.className = "nome-comentario";

    nome.textContent = comentario.nome || "Usuário";

    nome.style.fontSize = tamanhoFonte + "px";


    /* ÁREA DOS BOTÕES */

    const acoes = document.createElement("div");

    acoes.className = "acoes-comentario";


    /* BOTÃO DE EXCLUSÃO */

    const botaoExcluir = document.createElement("button");

    botaoExcluir.className = "botao-remover";
    botaoExcluir.type = "button";
    botaoExcluir.title = "Excluir comentário";
    botaoExcluir.setAttribute("aria-label", "Excluir comentário");
    botaoExcluir.textContent = "×";

    botaoExcluir.addEventListener("click", () => {
        excluirComentario(comentario.id);
    });


    /* BOTÃO DE MARCAR COMO LIDO */

    const botaoLido = document.createElement("button");

    botaoLido.className = "botao-lido";
    botaoLido.type = "button";

    botaoLido.title = comentario.lido
        ? "Marcar como não lido"
        : "Marcar como lido";

    botaoLido.setAttribute("aria-label", botaoLido.title);

    botaoLido.textContent = comentario.lido ? "✓" : "○";

    botaoLido.classList.toggle("marcado", comentario.lido);

    botaoLido.addEventListener("click", () => {
        alternarLido(comentario.id);
    });


    /* TEXTO DO COMENTÁRIO */

    const texto = document.createElement("p");

    texto.className = "texto-comentario";

    const temImagem = comentario.partes.some(p => p.tipo === "imagem");

    if (temImagem) {

        comentario.partes.forEach(parte => {

            if (parte.tipo === "imagem") {

                const imagem = document.createElement("img");

                imagem.className = "emoji-comentario";
                imagem.src = parte.src;
                imagem.alt = parte.alt || "";
                imagem.referrerPolicy = "no-referrer";

                texto.appendChild(imagem);

            } else {

                texto.appendChild(document.createTextNode(parte.valor));
            }
        });

    } else {

        texto.textContent = comentario.texto;
    }

    texto.style.fontSize = tamanhoFonte + "px";


    /* MONTAGEM DO CABEÇALHO */

    acoes.appendChild(botaoExcluir);
    acoes.appendChild(botaoLido);

    cabecalho.appendChild(origem);
    cabecalho.appendChild(nome);
    cabecalho.appendChild(acoes);


    /* MONTAGEM DO CARTÃO */

    cartao.appendChild(cabecalho);
    cartao.appendChild(texto);

    if (comentario.recebidoEm) {

        const horario = document.createElement("time");

        horario.className = "horario-comentario";

        if (comentario.horarioPlataforma !== null) {

            const aproximado = comentario.origem === "facebook";

            horario.dateTime =
                new Date(comentario.horarioPlataforma).toISOString();

            horario.textContent =
                (aproximado ? "≈ " : "") +
                formatarDataHora(comentario.horarioPlataforma, false);

            horario.title = aproximado
                ? "Horário aproximado, calculado a partir do tempo relativo do Facebook"
                : "Horário exibido pelo YouTube";

        } else {

            horario.dateTime = new Date(comentario.recebidoEm).toISOString();

            horario.textContent = formatarDataHora(comentario.recebidoEm);

            horario.title = "Horário em que o painel recebeu o comentário";
        }

        cartao.appendChild(horario);
    }


    /* BOTÃO VER MAIS DO FACEBOOK */

    if (
        comentario.origem === "facebook" &&
        comentario.podeExpandir
    ) {

        const botaoVerMais = document.createElement("button");

        botaoVerMais.type = "button";
        botaoVerMais.className = "botao-ver-mais";

        botaoVerMais.textContent = comentario.expandindo
            ? "Buscando comentário..."
            : "Ver mais";

        botaoVerMais.disabled = Boolean(comentario.expandindo);

        botaoVerMais.addEventListener("click", () => {
            solicitarExpansaoFacebook(comentario.id);
        });

        cartao.appendChild(botaoVerMais);
    }

    return cartao;
}


/* =====================================
   LOGOS DAS PLATAFORMAS
===================================== */

const LOGOS_PLATAFORMAS = {
    youtube: {
                caminho:
            "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
    },
    facebook: {
                caminho:
            "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"
    }
};

function criarLogoPlataforma(origem) {

    const logo = LOGOS_PLATAFORMAS[origem];

    const ns = "http://www.w3.org/2000/svg";

    const svg = document.createElementNS(ns, "svg");

    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "logo-plataforma");
    svg.setAttribute("aria-hidden", "true");

    const caminho = document.createElementNS(ns, "path");

    caminho.setAttribute("d", logo.caminho);
    
    svg.appendChild(caminho);

    return svg;
}


/* =====================================
   FONTES DOS COMENTÁRIOS
===================================== */

function registrarFonte(dados, origem) {

    if (typeof dados.tabId !== "number") return;

    const fonte = fontes.get(dados.tabId) || {
        origem: origem,
        total: 0
    };

    fonte.url = dados.urlAba || fonte.url || "";
    fonte.titulo = dados.tituloAba || fonte.titulo || "";
    fonte.total++;
    fonte.ultimoEm = Date.now();

    fontes.set(dados.tabId, fonte);

    if (janelaFontes.open) {
        renderizarFontes();
    }
}

function renderizarFontes() {

    listaFontes.innerHTML = "";

    fontes.forEach(fonte => {

        const item = document.createElement("li");
        item.className = "item-fonte";

        const logo = criarLogoPlataforma(fonte.origem);
        logo.classList.add("logo-fonte");

        const dadosFonte = document.createElement("div");
        dadosFonte.className = "dados-fonte";

        const titulo = document.createElement("strong");
        titulo.textContent = fonte.titulo || "(sem título)";

        const url = document.createElement("span");
        url.className = "url-fonte";
        url.textContent = fonte.url || "(URL indisponível)";

        const detalhe = document.createElement("small");
        detalhe.textContent =
            fonte.total + (fonte.total === 1 ? " comentário" : " comentários") +
            " · último em " + formatarDataHora(fonte.ultimoEm);

        dadosFonte.append(titulo, url, detalhe);
        item.append(logo, dadosFonte);
        listaFontes.appendChild(item);
    });

    fontesVazia.hidden = fontes.size > 0;
}

function abrirFontes() {

    renderizarFontes();

    janelaFontes.showModal();
}


/* =====================================
   FORMATAR DATA E HORA
===================================== */

function formatarDataHora(timestamp, comSegundos = true) {

    const opcoes = {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    };

    if (comSegundos) opcoes.second = "2-digit";

    return new Date(timestamp).toLocaleString("pt-BR", opcoes);
}


/* =====================================
   COLUNAS INDEPENDENTES
   Cada cartão vai para a coluna mais baixa,
   mantendo o espaçamento uniforme.
===================================== */

function criarColunas() {

    return [0, 1].map(() => {

        const coluna = document.createElement("div");

        coluna.className = "coluna-comentarios";

        listaComentarios.appendChild(coluna);

        return coluna;
    });
}


/* =====================================
   ATUALIZAR PAINEL
===================================== */

function atualizarPainel() {

    // Reconstruir a lista zera a rolagem: guardamos para restaurar.
    const rolagem = listaComentarios.scrollTop;

    listaComentarios.innerHTML = "";

    const colunas = criarColunas();
    const alturas = [0, 0];

    const comentariosVisiveis = comentarios.filter(comentario => {

        return plataformaAtiva(comentario.origem);

    });

    comentariosVisiveis.forEach(comentario => {

        const cartao = criarCartao(comentario);

        const indice = alturas[0] <= alturas[1] ? 0 : 1;

        colunas[indice].appendChild(cartao);

        alturas[indice] += cartao.offsetHeight;

    });


    /* MENSAGEM DE ESPERA */

    mensagemVazia.hidden = comentariosVisiveis.length > 0;

    if (pausado && comentariosVisiveis.length === 0) {

        mensagemVazia.textContent = "Recebimento pausado.";

    } else {

        mensagemVazia.textContent = "Aguardando novos comentários...";

    }


    listaComentarios.scrollTop = rolagem;

    atualizarContadores();
    atualizarIndicadores();
    atualizarDesfazer();
    atualizarBotaoPausa();
}


/* =====================================
   ADICIONAR UM CARTÃO NOVO
   Evita reconstruir a lista inteira a cada
   comentário, preservando a rolagem.
===================================== */

function adicionarCartao(comentario) {

    const colunas = listaComentarios.querySelectorAll(
        ".coluna-comentarios"
    );

    if (colunas.length !== 2) {
        atualizarPainel();
        return;
    }

    const cartao = criarCartao(comentario);

    const indice =
        colunas[0].offsetHeight <= colunas[1].offsetHeight ? 0 : 1;

    colunas[indice].appendChild(cartao);

    mensagemVazia.hidden = true;

    atualizarContadores();
}


/* =====================================
   RECEBER COMENTÁRIO NOVO
===================================== */

function receberComentario(dados) {

    if (!dados || typeof dados.texto !== "string") {
        return;
    }

    const texto = dados.texto.trim();

    if (!texto) {
        return;
    }

    const origem = dados.origem;

    if (origem !== "youtube" && origem !== "facebook") {
        return;
    }

    totalRecebidos++;

    registrarFonte(dados, origem);

    if (pausado) {
        atualizarContadores();
        return;
    }

    if (!plataformaAtiva(origem)) {
        atualizarContadores();
        return;
    }


    const novoComentario = {

        id: proximoId++,

        // Identificador original preservado.
        idOriginal: dados.idOriginal || dados.id || "",

        idFacebook: dados.idFacebook || "",

        tabId: dados.tabId,

        frameId: dados.frameId,

        nome: dados.nome || "Usuário",

        texto: texto,

        // Texto e imagens (emojis personalizados), quando houver.
        partes: Array.isArray(dados.partes) ? dados.partes : [],

        origem: origem,

        // Momento em que o painel recebeu o comentário (fallback).
        recebidoEm: Date.now(),

        // Horário lido da própria plataforma, quando disponível.
        horarioPlataforma:
            typeof dados.horario === "number" ? dados.horario : null,

        podeExpandir: Boolean(dados.podeExpandir),

        expandindo: false,

        lido: false

    };


    comentarios.push(novoComentario);

    adicionarCartao(novoComentario);
}


/* =====================================
   ATUALIZAR COMENTÁRIO EXISTENTE
===================================== */

function atualizarComentarioFacebook(dados) {

    if (!dados || !dados.idOriginal) return;

    if (typeof dados.texto !== "string") return;

    const comentario = comentarios.find(item => {

        return (
            item.origem === "facebook" &&
            item.idOriginal === dados.idOriginal
        );

    });

    if (!comentario) return;

    const textoNovo = dados.texto.trim();

    if (!textoNovo) return;

    // Atualiza o mesmo cartão, sem criar outro.
    comentario.texto = textoNovo;

    if (dados.nome) {
        comentario.nome = dados.nome;
    }

    comentario.podeExpandir = Boolean(dados.podeExpandir);

    comentario.expandindo = false;

    atualizarPainel();
}


/* =====================================
   RECEBER MENSAGENS
===================================== */

chrome.runtime.onMessage.addListener(
    (mensagem, remetente, responder) => {

        if (!mensagem) return;

        if (
            mensagem.tipo === "NOVO_COMENTARIO" &&
            mensagem.comentario
        ) {

            receberComentario(mensagem.comentario);

            responder({ recebido: true });

            return;
        }

        if (
            mensagem.tipo === "ATUALIZAR_COMENTARIO_FACEBOOK" &&
            mensagem.comentario
        ) {

            atualizarComentarioFacebook(mensagem.comentario);

            responder({ recebido: true });

            return;
        }

        if (mensagem.tipo === "ESTADO_PLATAFORMAS") {

            atualizarEstadoPlataformas(mensagem);

        }

    }
);


/* =====================================
   EXCLUIR COMENTÁRIO
===================================== */

function excluirComentario(id) {

    const indice = comentarios.findIndex(comentario => {

        return comentario.id === id;

    });

    if (indice === -1) return;

    const comentarioRemovido = comentarios.splice(indice, 1)[0];

    historicoExclusao.push({

        comentario: comentarioRemovido,

        indice: indice

    });

    atualizarPainel();
}


/* =====================================
   DESFAZER EXCLUSÃO
===================================== */

function desfazerExclusao() {

    if (historicoExclusao.length === 0) return;

    const ultimo = historicoExclusao.pop();

    comentarios.splice(
        ultimo.indice,
        0,
        ultimo.comentario
    );

    atualizarPainel();
}


/* =====================================
   MARCAR COMO LIDO
===================================== */

function alternarLido(id) {

    const comentario = comentarios.find(item => {

        return item.id === id;

    });

    if (!comentario) return;

    comentario.lido = !comentario.lido;

    atualizarPainel();
}


/* =====================================
   PAUSAR E CONTINUAR
===================================== */

function alternarPausa() {

    pausado = !pausado;

    atualizarPainel();
}


/* =====================================
   FILTRO DO YOUTUBE
===================================== */

function alternarYoutube() {

    youtubeAtivo = !youtubeAtivo;

    atualizarPainel();
}


/* =====================================
   FILTRO DO FACEBOOK
===================================== */

function alternarFacebook() {

    facebookAtivo = !facebookAtivo;

    atualizarPainel();
}


/* =====================================
   ALTERAR TAMANHO DA FONTE
===================================== */

function atualizarFonte() {

    document.querySelectorAll(
        ".nome-comentario, .texto-comentario"
    ).forEach(elemento => {

        elemento.style.fontSize = tamanhoFonte + "px";

    });
}


function aumentarTamanhoFonte() {

    tamanhoFonte = Math.min(25, tamanhoFonte + 1);

    atualizarFonte();
}


function diminuirTamanhoFonte() {

    tamanhoFonte = Math.max(10, tamanhoFonte - 1);

    atualizarFonte();
}


/* =====================================
   CONECTAR BOTÕES
===================================== */

botaoYoutube.addEventListener("click", alternarYoutube);

botaoFacebook.addEventListener("click", alternarFacebook);

diminuirFonte.addEventListener("click", diminuirTamanhoFonte);

aumentarFonte.addEventListener("click", aumentarTamanhoFonte);

botaoPausa.addEventListener("click", alternarPausa);

botaoFontes.addEventListener("click", abrirFontes);

fecharFontes.addEventListener("click", () => janelaFontes.close());

janelaFontes.addEventListener("click", (evento) => {
    // Clique fora da janela fecha.
    if (evento.target === janelaFontes) janelaFontes.close();
});

botaoDesfazer.addEventListener("click", desfazerExclusao);


/* =====================================
   INICIALIZAÇÃO
===================================== */

atualizarPainel();

solicitarEstadoPlataformas();

chrome.runtime.sendMessage(
    { tipo: "PAINEL_INICIADO" },
    () => {
        void chrome.runtime.lastError;
    }
);