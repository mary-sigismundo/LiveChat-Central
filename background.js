/*
 * LIVECHAT CENTRAL
 * Gerencia a comunicação entre as abas
 * do YouTube, Facebook e o painel.
 * Controla comentários duplicados.
 * Encaminha pedidos de expansão de comentários.
 */

const CHAVE_COMENTARIOS = "livechat_comentarios_processados";
const LIMITE_COMENTARIOS = 6000;
const VALIDADE_COMENTARIOS = 30 * 24 * 60 * 60 * 1000;

let filaDeProcessamento = Promise.resolve();


/* =====================================
   IDENTIFICAR PLATAFORMA
===================================== */

function identificarPlataforma(url) {
    if (!url) return null;

    try {
        const host = new URL(url).hostname.toLowerCase();

        if (host === "youtube.com" || host.endsWith(".youtube.com")) {
            return "youtube";
        }

        if (host === "facebook.com" || host.endsWith(".facebook.com")) {
            return "facebook";
        }
    } catch (erro) {
        return null;
    }

    return null;
}


/* =====================================
   CONSULTAR ESTADO DAS PLATAFORMAS
===================================== */

async function consultarEstadoPlataformas() {
    const abas = await chrome.tabs.query({});

    const estado = {
        youtube: false,
        facebook: false
    };

    for (const aba of abas) {
        const plataforma = identificarPlataforma(aba.url);

        if (plataforma) {
            estado[plataforma] = true;
        }
    }

    return estado;
}


/* =====================================
   ENVIAR AO PAINEL
===================================== */

function enviarAoPainel(mensagem) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(mensagem, (resposta) => {
            if (chrome.runtime.lastError) {
                resolve(false);
                return;
            }

            resolve(Boolean(resposta && resposta.recebido));
        });
    });
}


/* =====================================
   ATUALIZAR ESTADO DO PAINEL
===================================== */

async function atualizarEstadoPainel() {
    try {
        const estado = await consultarEstadoPlataformas();

        enviarAoPainel({
            tipo: "ESTADO_PLATAFORMAS",
            youtube: estado.youtube,
            facebook: estado.facebook
        });
    } catch (erro) {
        // Evita interrupções durante alterações nas abas.
    }
}


/* =====================================
   IDENTIFICADOR ALTERNATIVO
===================================== */

function gerarIdentificadorAlternativo(plataforma, nome, texto) {
    const conteudo = [
        plataforma,
        (nome || "").trim().toLowerCase(),
        (texto || "").trim().toLowerCase()
    ].join("|");

    let hash = 2166136261;

    for (let i = 0; i < conteudo.length; i++) {
        hash ^= conteudo.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return plataforma + ":fallback:" + (hash >>> 0).toString(16);
}


/* =====================================
   VALIDAR HORÁRIO DA PLATAFORMA
===================================== */

function validarHorario(valor) {
    if (typeof valor !== "number" || !Number.isFinite(valor)) {
        return null;
    }

    const agora = Date.now();

    // Rejeita horários no futuro (além de 5 min) ou com mais de 1 ano.
    if (valor > agora + 5 * 60 * 1000) return null;
    if (valor < agora - 365 * 24 * 60 * 60 * 1000) return null;

    return valor;
}


/* =====================================
   VALIDAR PARTES DA MENSAGEM
===================================== */

function validarPartes(valor) {
    if (!Array.isArray(valor) || valor.length > 200) return [];

    const partes = [];

    for (const parte of valor) {
        if (!parte || typeof parte !== "object") continue;

        if (parte.tipo === "texto" && typeof parte.valor === "string") {
            partes.push({ tipo: "texto", valor: parte.valor });
        } else if (
            parte.tipo === "imagem" &&
            typeof parte.src === "string" &&
            /^https:\/\//i.test(parte.src)
        ) {
            partes.push({
                tipo: "imagem",
                src: parte.src,
                alt: typeof parte.alt === "string" ? parte.alt : ""
            });
        }
    }

    return partes;
}


/* =====================================
   REGISTRAR COMENTÁRIO
===================================== */

async function registrarComentario(id) {
    const agora = Date.now();

    const resultado = await chrome.storage.local.get(
        CHAVE_COMENTARIOS
    );

    const registros = resultado[CHAVE_COMENTARIOS] || {};

    for (const [chave, horario] of Object.entries(registros)) {
        if (
            typeof horario !== "number" ||
            agora - horario > VALIDADE_COMENTARIOS
        ) {
            delete registros[chave];
        }
    }

    if (registros[id]) {
        await chrome.storage.local.set({
            [CHAVE_COMENTARIOS]: registros
        });

        return false;
    }

    registros[id] = agora;

    const entradas = Object.entries(registros)
        .sort((a, b) => b[1] - a[1]);

    const limitadas = Object.fromEntries(
        entradas.slice(0, LIMITE_COMENTARIOS)
    );

    await chrome.storage.local.set({
        [CHAVE_COMENTARIOS]: limitadas
    });

    return true;
}


/* =====================================
   REMOVER REGISTRO
===================================== */

async function removerRegistro(id) {
    const resultado = await chrome.storage.local.get(
        CHAVE_COMENTARIOS
    );

    const registros = resultado[CHAVE_COMENTARIOS] || {};

    delete registros[id];

    await chrome.storage.local.set({
        [CHAVE_COMENTARIOS]: registros
    });
}


/* =====================================
   REINICIAR CAPTURA
===================================== */

async function reiniciarCaptura() {
    await chrome.storage.local.remove(CHAVE_COMENTARIOS);

    const abas = await chrome.tabs.query({});

    for (const aba of abas) {
        if (identificarPlataforma(aba.url)) {
            chrome.tabs.sendMessage(
                aba.id,
                { tipo: "RELER_COMENTARIOS" },
                () => {
                    void chrome.runtime.lastError;
                }
            );
        }
    }
}


/* =====================================
   VALIDAR PAINEL
===================================== */

function mensagemVeioDoPainel(remetente) {
    if (!remetente || remetente.id !== chrome.runtime.id) {
        return false;
    }

    const urlPainel = chrome.runtime.getURL("dashboard.html");

    return Boolean(
        remetente.url &&
        remetente.url.startsWith(urlPainel)
    );
}


/* =====================================
   EXPANDIR COMENTÁRIO NO FACEBOOK
===================================== */

function encaminharExpansaoFacebook(mensagem, remetente, responder) {

    if (!mensagemVeioDoPainel(remetente)) {
        responder({ ok: false });
        return;
    }

    const tabId = mensagem.tabId;
    const frameId = mensagem.frameId;

    if (
        typeof tabId !== "number" ||
        typeof mensagem.idOriginal !== "string" ||
        !mensagem.idOriginal
    ) {
        responder({ ok: false });
        return;
    }

    const dados = {
        tipo: "EXPANDIR_COMENTARIO_FACEBOOK",
        idOriginal: mensagem.idOriginal,
        idFacebook: mensagem.idFacebook || "",
        nome: mensagem.nome || "",
        texto: mensagem.texto || ""
    };

    const opcoes = {};

    if (typeof frameId === "number") {
        opcoes.frameId = frameId;
    }

    chrome.tabs.sendMessage(
        tabId,
        dados,
        opcoes,
        (resposta) => {

            if (chrome.runtime.lastError) {
                responder({
                    ok: false,
                    erro: chrome.runtime.lastError.message
                });

                return;
            }

            responder(resposta || { ok: false });

        }
    );
}


/* =====================================
   RECEBER ATUALIZAÇÃO DO FACEBOOK
===================================== */

async function receberAtualizacaoFacebook(mensagem, remetente, responder) {

    const plataforma = identificarPlataforma(
        remetente.tab?.url
    );

    if (plataforma !== "facebook") {
        responder({ ok: false });
        return;
    }

    const dados = mensagem.comentario;

    if (
        !dados ||
        typeof dados.idOriginal !== "string" ||
        !dados.idOriginal ||
        typeof dados.texto !== "string" ||
        !dados.texto.trim()
    ) {
        responder({ ok: false });
        return;
    }

    const entregue = await enviarAoPainel({
        tipo: "ATUALIZAR_COMENTARIO_FACEBOOK",
        comentario: {
            idOriginal: dados.idOriginal,
            idFacebook: dados.idFacebook || "",
            nome: dados.nome || "Usuário",
            texto: dados.texto.trim(),
            podeExpandir: Boolean(dados.podeExpandir)
        }
    });

    responder({ ok: entregue });
}


/* =====================================
   EVENTOS DAS ABAS
===================================== */

chrome.tabs.onCreated.addListener(atualizarEstadoPainel);

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url || changeInfo.status === "complete") {
        atualizarEstadoPainel();
    }
});

chrome.tabs.onRemoved.addListener(atualizarEstadoPainel);


/* =====================================
   ABRIR PAINEL
===================================== */

chrome.action.onClicked.addListener(async () => {

    const url = chrome.runtime.getURL("dashboard.html");

    const abas = await chrome.tabs.query({});

    const painelExistente = abas.find(
        aba => aba.url === url
    );

    if (painelExistente) {

        await chrome.tabs.update(painelExistente.id, {
            active: true
        });

        return;
    }

    await chrome.tabs.create({
        url,
        active: true
    });

});


/* =====================================
   RECEBER MENSAGENS
===================================== */

chrome.runtime.onMessage.addListener(
    (mensagem, remetente, responder) => {

        if (!mensagem || !mensagem.tipo) return;


        /* ESTADO DAS PLATAFORMAS */

        if (mensagem.tipo === "SOLICITAR_ESTADO_PLATAFORMAS") {

            consultarEstadoPlataformas()
                .then(responder)
                .catch(() => {
                    responder({
                        youtube: false,
                        facebook: false
                    });
                });

            return true;
        }


        /* PAINEL INICIADO */

        if (mensagem.tipo === "PAINEL_INICIADO") {

            filaDeProcessamento = filaDeProcessamento
                .then(reiniciarCaptura)
                .catch(() => {});

            responder({ ok: true });

            return;
        }


        /* PEDIDO DE EXPANSÃO DO FACEBOOK */

        if (
            mensagem.tipo === "EXPANDIR_COMENTARIO_FACEBOOK"
        ) {

            encaminharExpansaoFacebook(
                mensagem,
                remetente,
                responder
            );

            return true;
        }


        /* ATUALIZAÇÃO DE COMENTÁRIO DO FACEBOOK */

        if (
            mensagem.tipo === "ATUALIZAR_COMENTARIO_FACEBOOK"
        ) {

            receberAtualizacaoFacebook(
                mensagem,
                remetente,
                responder
            ).catch(() => {
                responder({ ok: false });
            });

            return true;
        }


        /* NOVOS COMENTÁRIOS */

        if (
            mensagem.tipo !== "NOVO_COMENTARIO_YOUTUBE" &&
            mensagem.tipo !== "NOVO_COMENTARIO_FACEBOOK"
        ) {
            return;
        }

        const plataformaEsperada =
            mensagem.tipo === "NOVO_COMENTARIO_YOUTUBE"
                ? "youtube"
                : "facebook";

        const plataformaReal = identificarPlataforma(
            remetente.tab?.url
        );

        if (plataformaReal !== plataformaEsperada) {
            responder({ ok: false });
            return;
        }

        const dados = mensagem.comentario;

        if (
            !dados ||
            typeof dados.texto !== "string" ||
            !dados.texto.trim()
        ) {
            responder({ ok: false });
            return;
        }

        const nome = (
            typeof dados.nome === "string" && dados.nome.trim()
                ? dados.nome.trim()
                : "Usuário"
        );

        const texto = dados.texto.trim();

        const id = (
            typeof dados.id === "string" && dados.id.trim()
                ? dados.id.trim()
                : gerarIdentificadorAlternativo(
                    plataformaEsperada,
                    nome,
                    texto
                )
        );


        /* PROCESSAMENTO EM FILA */

        filaDeProcessamento = filaDeProcessamento
            .then(async () => {

                const novo = await registrarComentario(id);

                if (!novo) {
                    responder({
                        ok: true,
                        duplicado: true
                    });

                    return;
                }

                const entregue = await enviarAoPainel({
                    tipo: "NOVO_COMENTARIO",
                    comentario: {
                        id,
                        idOriginal: id,
                        idFacebook: dados.idFacebook || "",
                        nome,
                        texto,
                        partes: validarPartes(dados.partes),
                        origem: plataformaEsperada,

                        // Horário lido da plataforma (ms), se for plausível.
                        horario: validarHorario(dados.horario),

                        podeExpandir: Boolean(dados.podeExpandir),

                        // Guarda a aba que originou o comentário.
                        tabId: remetente.tab.id,

                        // Página da aba, exibida na lista de fontes do painel.
                        urlAba: remetente.tab.url || "",
                        tituloAba: remetente.tab.title || "",

                        // Guarda o quadro correto, quando existir.
                        frameId: remetente.frameId
                    }
                });

                if (!entregue) {

                    await removerRegistro(id);

                    responder({ ok: false });

                    return;
                }

                responder({
                    ok: true,
                    duplicado: false
                });

            })
            .catch((erro) => {

                responder({ ok: false });

            });

        return true;
    }
);


/* =====================================
   INICIALIZAÇÃO
===================================== */

atualizarEstadoPainel();