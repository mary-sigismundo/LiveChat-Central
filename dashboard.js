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

const botaoNovaTransmissao = document.getElementById("botaoNovaTransmissao");
const botaoPausa = document.getElementById("botaoPausa");
const botaoDesfazer = document.getElementById("botaoDesfazer");


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

    origem.textContent =
        comentario.origem === "youtube"
            ? "YouTube"
            : "Facebook";


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

    texto.textContent = comentario.texto;

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
   ATUALIZAR PAINEL
===================================== */

function atualizarPainel() {

    listaComentarios.innerHTML = "";

    const comentariosVisiveis = comentarios.filter(comentario => {

        return plataformaAtiva(comentario.origem);

    });

    comentariosVisiveis.forEach(comentario => {

        const cartao = criarCartao(comentario);

        listaComentarios.appendChild(cartao);

    });


    /* MENSAGEM DE ESPERA */

    mensagemVazia.hidden = comentariosVisiveis.length > 0;

    if (pausado && comentariosVisiveis.length === 0) {

        mensagemVazia.textContent = "Recebimento pausado.";

    } else {

        mensagemVazia.textContent = "Aguardando novos comentários...";

    }


    atualizarContadores();
    atualizarIndicadores();
    atualizarDesfazer();
    atualizarBotaoPausa();
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

        origem: origem,

        podeExpandir: Boolean(dados.podeExpandir),

        expandindo: false,

        lido: false

    };


    comentarios.push(novoComentario);

    atualizarPainel();
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
   NOVA TRANSMISSÃO
===================================== */

function novaTransmissao() {

    comentarios = [];

    historicoExclusao = [];

    totalRecebidos = 0;

    proximoId = 1;

    pausado = false;

    atualizarPainel();
}


/* =====================================
   CONECTAR BOTÕES
===================================== */

botaoYoutube.addEventListener("click", alternarYoutube);

botaoFacebook.addEventListener("click", alternarFacebook);

diminuirFonte.addEventListener("click", diminuirTamanhoFonte);

aumentarFonte.addEventListener("click", aumentarTamanhoFonte);

botaoNovaTransmissao.addEventListener("click", novaTransmissao);

botaoPausa.addEventListener("click", alternarPausa);

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