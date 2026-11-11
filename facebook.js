/*
 * LIVECHAT CENTRAL
 * Captura comentários do Facebook.
 * Identifica autor, mensagem, emojis e ID.
 * Permite expandir comentários pelo painel.
 */

/* =====================================
   CONFIGURAÇÕES
===================================== */

const DIAGNOSTICO = true;
const AUTO_EXPANDIR = true;
const JANELA_EXPANSAO_MS = 120000;
const MAX_CLIQUES_POR_VARREDURA = 3;

const MAIS_RECENTE_PRIMEIRO = false;

const ESPERA_APOS_RECUSA_MS = 4000;
const ATRASO_VARREDURA_MS = 300;
const INTERVALO_VARREDURA_MS = 1500;

const RE_ROTULO_COMENTARIO =
    /^(Coment[aá]rio|Resposta|Comment|Reply)\b/i;

const RE_EXPANDIR = new RegExp(
    "^(ver mais( \\d+)? (coment[aá]rios?|respostas?)" +
    "|ver mais" +
    "|ver coment[aá]rios anteriores" +
    "|ver (todas as )?\\d+ (coment[aá]rios?|respostas?)" +
    "|view more" +
    "|view (more|previous) comments?" +
    "|view (all )?\\d+ repl(y|ies))",
    "i"
);


/* =====================================
   ESTADO
===================================== */

let enviadosPorElemento = new WeakMap();
const emEnvio = new WeakMap();
let bloqueadoAte = new WeakMap();
const dadosCache = new WeakMap();
const botoesClicados = new WeakMap();

const textoEnviadoPorElemento = new WeakMap();

let expandirAte = Date.now() + JANELA_EXPANSAO_MS;

const estatisticas = {
    artigos: 0,
    comentarios: 0,
    semNome: 0,
    semTexto: 0,
    semIdReal: 0,
    enviados: 0,
    duplicados: 0,
    recusados: 0,
    cliques: 0,
    erro: ""
};


/* =====================================
   DIAGNÓSTICO
===================================== */

let caixaDiagnostico = null;
let ultimoTextoDiagnostico = "";

function atualizarDiagnostico() {
    if (!DIAGNOSTICO || !document.body) return;

    const principal = window === window.top;

    if (!principal && estatisticas.comentarios === 0) return;

    if (!caixaDiagnostico || !caixaDiagnostico.isConnected) {
        caixaDiagnostico = document.createElement("div");

        caixaDiagnostico.style.cssText =
            "position:fixed;left:10px;bottom:10px;" +
            "z-index:2147483647;background:rgba(0,0,0,0.85);" +
            "color:#fff;font:12px/1.5 Arial,sans-serif;" +
            "padding:8px 10px;border-radius:8px;" +
            "pointer-events:none;white-space:pre;max-width:360px;";

        document.body.appendChild(caixaDiagnostico);
        ultimoTextoDiagnostico = "";
    }

    const texto = [
        "LiveChat - diagnóstico (" +
            (principal ? "página" : "quadro interno") + ")",
        "Blocos role=article: " + estatisticas.artigos,
        "Comentários reconhecidos: " + estatisticas.comentarios,
        "Sem nome / sem texto: " +
            estatisticas.semNome + " / " + estatisticas.semTexto,
        "Sem ID do Facebook: " + estatisticas.semIdReal,
        "Enviados ao painel: " + estatisticas.enviados,
        "Já enviados antes (duplicados): " + estatisticas.duplicados,
        "Recusados: " + estatisticas.recusados,
        "Botões 'ver mais' clicados: " + estatisticas.cliques,
        "Erro: " + (estatisticas.erro || "nenhum")
    ].join("\n");

    if (texto !== ultimoTextoDiagnostico) {
        caixaDiagnostico.textContent = texto;
        ultimoTextoDiagnostico = texto;
    }
}


/* =====================================
   UTILITÁRIOS
===================================== */

function extensaoDisponivel() {
    try {
        return Boolean(chrome.runtime && chrome.runtime.id);
    } catch (erro) {
        return false;
    }
}

function hashSimples(texto) {
    let hash = 2166136261;

    for (let i = 0; i < texto.length; i++) {
        hash ^= texto.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16);
}

function escopoDaPagina() {
    try {
        const url = new URL(location.href);
        const v = url.searchParams.get("v");

        return url.pathname + (v ? "?v=" + v : "");
    } catch (erro) {
        return location.pathname;
    }
}

function normalizarTexto(texto) {
    return (texto || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}


/* =====================================
   EXTRAÇÃO DO COMENTÁRIO
===================================== */

function extrairTextoComEmojis(elemento) {
    if (!elemento) return "";

    const copia = elemento.cloneNode(true);

    copia.querySelectorAll("img").forEach((imagem) => {
        const emoji = imagem.getAttribute("alt");

        if (emoji && emoji.trim()) {
            imagem.replaceWith(document.createTextNode(emoji));
        } else {
            imagem.remove();
        }
    });

    copia.querySelectorAll(
        "svg, button, [role='button']"
    ).forEach((item) => {
        item.remove();
    });

    return (copia.innerText || copia.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
}

function identificarNome(comentario) {
    const links = comentario.querySelectorAll(
        'a[role="link"]:not([aria-hidden="true"])'
    );

    for (const link of links) {
        const elementoNome = link.querySelector(
            'span[dir="auto"]'
        );

        if (!elementoNome) continue;

        const nome = extrairTextoComEmojis(elementoNome);

        if (
            nome &&
            nome.length < 100 &&
            !/^\d+\s*(s|seg|min|h|d|sem|semanas?)\.?$/i.test(nome)
        ) {
            return nome;
        }
    }

    return "";
}

function identificarBotaoVerMais(comentario) {
    if (!comentario) return null;

    const botoes = comentario.querySelectorAll(
        'button, [role="button"]'
    );

    for (const botao of botoes) {
        const texto = normalizarTexto(
            botao.innerText || botao.textContent
        );

        if (/^(ver mais|see more)$/i.test(texto)) {
            return botao;
        }
    }

    return null;
}

function identificarTexto(comentario) {
    const elementos = comentario.querySelectorAll(
        'span[lang][dir="auto"]'
    );

    for (const elemento of elementos) {
        if (elemento.closest('a[role="link"]')) continue;
        if (elemento.closest('[role="button"]')) continue;

        const texto = extrairTextoComEmojis(elemento);

        if (texto && texto.length < 10000) {
            return texto;
        }
    }

    const alternativas = comentario.querySelectorAll(
        'div[dir="auto"]'
    );

    for (const elemento of alternativas) {
        if (elemento.closest('a[role="link"]')) continue;
        if (elemento.closest('[role="button"]')) continue;

        const texto = extrairTextoComEmojis(elemento);

        if (texto && texto.length < 10000) {
            return texto;
        }
    }

    return "";
}

function identificarId(comentario) {
    const links = comentario.querySelectorAll("a[href]");

    for (const link of links) {
        try {
            const url = new URL(link.href);

            const id =
                url.searchParams.get("reply_comment_id") ||
                url.searchParams.get("comment_id");

            if (id) {
                return "facebook:" + id;
            }
        } catch (erro) {
            // Continua procurando.
        }
    }

    return "";
}

/*
 * O Facebook mostra apenas tempos relativos ("há 5 minutos", "2 h").
 * Converte para um horário aproximado, relativo ao momento da leitura.
 * Retorna null quando não for possível interpretar.
 */
const UNIDADES_MS = [
    [/^(segundo|second|seg|sec|s)s?\b/i, 1000],
    [/^(minuto|minute|min|m)s?\b/i, 60 * 1000],
    [/^(hora|hour|hr|h)s?\b/i, 60 * 60 * 1000],
    [/^(dia|day|d)s?\b/i, 24 * 60 * 60 * 1000],
    [/^(semana|week|sem|w)s?\b/i, 7 * 24 * 60 * 60 * 1000]
];

function converterTempoRelativo(quantidade, unidade) {
    // Meses e anos não têm duração fixa: não estimamos.
    if (/^(m[eê]s|month|ano|year|y)/i.test(unidade)) return null;

    for (const [padrao, ms] of UNIDADES_MS) {
        if (padrao.test(unidade)) {
            return Date.now() - quantidade * ms;
        }
    }

    // Meses e anos não têm duração fixa: não estimamos.
    return null;
}

function lerHorario(elemento, rotulo) {
    if (/\b(agora( mesmo)?|just now)\b/i.test(rotulo)) {
        return Date.now();
    }

    // Ex.: "Comentário de Fulano há 5 minutos" / "... 5 minutes ago".
    const m = rotulo.match(
        /(?:h[áa]\s+)?(\d+)\s*([a-zA-Zçãáê]+)\.?(?:\s+(?:ago|atr[áa]s))?\s*$/i
    );

    if (m && (/^h[áa]\s/i.test(m[0]) || /(ago|atr[áa]s)\s*$/i.test(m[0]))) {
        return converterTempoRelativo(Number(m[1]), m[2]);
    }

    // Alternativa: texto do link de horário do comentário ("5 min", "2 h").
    for (const link of elemento.querySelectorAll("a[href]")) {
        const t = (link.textContent || "").trim();
        const r = t.match(/^(\d+)\s*([a-zA-Zçã]+)\.?$/);

        if (r) {
            const valor = converterTempoRelativo(Number(r[1]), r[2]);

            if (valor !== null) return valor;
        }
    }

    return null;
}

function obterDados(elemento) {
    const rotulo = elemento.getAttribute("aria-label") || "";

    // Importante: não reutilizamos o texto antigo do cache.
    // Assim percebemos quando o Facebook expande o comentário.

    const nome = identificarNome(elemento);
    const texto = identificarTexto(elemento);

    const botaoVerMais = identificarBotaoVerMais(elemento);

    if (!nome) estatisticas.semNome++;
    if (!texto) estatisticas.semTexto++;

    if (!nome || !texto) return null;

    const dados = {
        rotulo,
        nome,
        texto,
        idReal: identificarId(elemento),
        horario: lerHorario(elemento, rotulo),
        podeExpandir: Boolean(botaoVerMais)
    };

    dadosCache.set(elemento, dados);

    return dados;
}


/* =====================================
   ENVIO DE ATUALIZAÇÃO
===================================== */

function atualizarComentarioNoPainel(id, dados) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            {
                tipo: "ATUALIZAR_COMENTARIO_FACEBOOK",
                comentario: {
                    idOriginal: id,
                    idFacebook: dados.idReal || "",
                    nome: dados.nome,
                    texto: dados.texto,
                    podeExpandir: dados.podeExpandir
                }
            },
            (resposta) => {
                if (chrome.runtime.lastError) {
                    resolve(false);
                    return;
                }

                resolve(Boolean(resposta && resposta.ok));
            }
        );
    });
}


/* =====================================
   ENVIO AO BACKGROUND
===================================== */

function enviarComentario(item) {
    const { elemento, dados, id } = item;

    const idAnterior = enviadosPorElemento.get(elemento);
    const textoAnterior = textoEnviadoPorElemento.get(elemento);

    // Já foi enviado: só atualiza quando o texto realmente mudou.
    if (idAnterior === id) {
        if (textoAnterior === dados.texto) return;

        atualizarComentarioNoPainel(id, dados).then((ok) => {
            if (ok) {
                textoEnviadoPorElemento.set(elemento, dados.texto);
            }
        });

        return;
    }

    if (emEnvio.get(elemento) === id) return;

    emEnvio.set(elemento, id);

    try {
        chrome.runtime.sendMessage(
            {
                tipo: "NOVO_COMENTARIO_FACEBOOK",
                comentario: {
                    id,
                    idFacebook: dados.idReal || "",
                    nome: dados.nome,
                    texto: dados.texto,
                    horario: dados.horario,
                    podeExpandir: dados.podeExpandir,
                    origem: "facebook"
                }
            },
            (resposta) => {
                emEnvio.delete(elemento);

                try {
                    if (chrome.runtime.lastError) {
                        estatisticas.erro =
                            chrome.runtime.lastError.message;

                        bloqueadoAte.set(
                            elemento,
                            Date.now() + ESPERA_APOS_RECUSA_MS
                        );

                        return;
                    }

                    if (resposta && resposta.ok) {
                        enviadosPorElemento.set(elemento, id);
                        textoEnviadoPorElemento.set(elemento, dados.texto);

                        estatisticas.erro = "";

                        if (resposta.duplicado) {
                            estatisticas.duplicados++;
                        } else {
                            estatisticas.enviados++;
                        }
                    } else {
                        estatisticas.recusados++;

                        bloqueadoAte.set(
                            elemento,
                            Date.now() + ESPERA_APOS_RECUSA_MS
                        );
                    }
                } catch (erro) {
                    // Contexto atualizado.
                }
            }
        );
    } catch (erro) {
        emEnvio.delete(elemento);
        estatisticas.erro = String(erro && erro.message || erro);
    }
}


/* =====================================
   LOCALIZAR COMENTÁRIO
===================================== */

function localizarComentario(mensagem) {
    const artigos = document.querySelectorAll('[role="article"]');

    const idFacebook = mensagem.idFacebook || "";
    const nomeProcurado = normalizarTexto(mensagem.nome);
    const textoProcurado = normalizarTexto(mensagem.texto);

    // Primeiro tentamos pelo ID original do Facebook.
    if (idFacebook) {
        for (const artigo of artigos) {
            if (identificarId(artigo) === idFacebook) {
                return artigo;
            }
        }
    }

    // Alternativa: nome + início do texto capturado.
    for (const artigo of artigos) {
        const rotulo = artigo.getAttribute("aria-label") || "";

        if (!RE_ROTULO_COMENTARIO.test(rotulo)) continue;

        const dados = obterDados(artigo);

        if (!dados) continue;

        if (
            normalizarTexto(dados.nome) !== nomeProcurado
        ) {
            continue;
        }

        const textoAtual = normalizarTexto(dados.texto);

        const trecho = textoProcurado.slice(
            0,
            Math.min(45, textoProcurado.length)
        );

        if (trecho && textoAtual.startsWith(trecho)) {
            return artigo;
        }
    }

    return null;
}


/* =====================================
   EXPANDIR COMENTÁRIO SOLICITADO
===================================== */

function expandirComentarioSolicitado(mensagem, responder) {
    if (!mensagem || !mensagem.idOriginal) {
        responder({ ok: false, erro: "Identificação ausente." });
        return;
    }

    const artigo = localizarComentario(mensagem);

    if (!artigo) {
        responder({
            ok: false,
            erro: "Não foi possível localizar o comentário no Facebook."
        });
        return;
    }

    const botao = identificarBotaoVerMais(artigo);

    // Se já estiver expandido, apenas atualiza o painel.
    if (!botao) {
        const dados = obterDados(artigo);

        if (dados) {
            atualizarComentarioNoPainel(
                mensagem.idOriginal,
                dados
            );
        }

        responder({ ok: true, jaExpandido: true });
        return;
    }

    try {
        botao.click();
        estatisticas.cliques++;

        const inicio = Date.now();

        function verificarExpansao() {
            if (!extensaoDisponivel()) {
                responder({ ok: false });
                return;
            }

            const dados = obterDados(artigo);

            const botaoAindaExiste =
                Boolean(identificarBotaoVerMais(artigo));

            if (
                dados &&
                (!botaoAindaExiste || dados.texto.length > (mensagem.texto || "").length)
            ) {
                atualizarComentarioNoPainel(
                    mensagem.idOriginal,
                    dados
                ).then((ok) => {
                    responder({ ok });
                });

                return;
            }

            if (Date.now() - inicio >= 5000) {
                responder({
                    ok: false,
                    erro: "O Facebook não confirmou a expansão."
                });

                return;
            }

            setTimeout(verificarExpansao, 300);
        }

        setTimeout(verificarExpansao, 300);

    } catch (erro) {
        responder({
            ok: false,
            erro: String(erro && erro.message || erro)
        });
    }
}


/* =====================================
   CARREGAR COMENTÁRIOS ANTIGOS
===================================== */

function textoCurto(elemento) {
    const texto = elemento.textContent;

    if (!texto || texto.length > 60) return "";

    return texto.replace(/\s+/g, " ").trim();
}

function expandirComentarios() {
    if (!AUTO_EXPANDIR) return;

    const agora = Date.now();

    if (agora > expandirAte) return;

    let cliques = 0;

    const botoes = document.querySelectorAll(
        '[role="button"]'
    );

    for (const botao of botoes) {
        if (cliques >= MAX_CLIQUES_POR_VARREDURA) break;

        const texto = textoCurto(botao);

        if (!texto || !RE_EXPANDIR.test(texto)) continue;

        const ultimo = botoesClicados.get(botao) || 0;

        if (agora - ultimo < 5000) continue;

        botoesClicados.set(botao, agora);

        try {
            botao.click();
            cliques++;
            estatisticas.cliques++;
        } catch (erro) {
            // Segue para o próximo botão.
        }
    }
}


/* =====================================
   VARREDURA
===================================== */

function procurarComentarios() {
    if (!extensaoDisponivel()) return;

    expandirComentarios();

    const artigos = document.querySelectorAll('[role="article"]');

    estatisticas.artigos = artigos.length;
    estatisticas.comentarios = 0;
    estatisticas.semNome = 0;
    estatisticas.semTexto = 0;
    estatisticas.semIdReal = 0;

    const escopo = escopoDaPagina();
    const ocorrencias = new Map();
    const pendentes = [];
    const agora = Date.now();

    for (const elemento of artigos) {
        const rotulo = elemento.getAttribute("aria-label") || "";

        if (!RE_ROTULO_COMENTARIO.test(rotulo)) continue;

        estatisticas.comentarios++;

        const dados = obterDados(elemento);

        if (!dados) continue;

        let id = dados.idReal;

        if (!id) {
            estatisticas.semIdReal++;

            // Se o elemento já foi enviado, preserva o ID anterior.
            // Isso evita mudar o ID quando o comentário é expandido.
            const idAnterior = enviadosPorElemento.get(elemento);

            if (idAnterior) {
                id = idAnterior;
            } else {
                const base = hashSimples(
                    escopo + "|" +
                    dados.nome.toLowerCase() + "|" +
                    dados.texto.toLowerCase()
                );

                const numero = (ocorrencias.get(base) || 0) + 1;

                ocorrencias.set(base, numero);

                id = "facebook:" + base + "#" + numero;
            }
        }

        if (agora < (bloqueadoAte.get(elemento) || 0)) continue;

        pendentes.push({ elemento, dados, id });
    }

    if (MAIS_RECENTE_PRIMEIRO && pendentes.length > 1) {
        pendentes.reverse();
    }

    pendentes.forEach(enviarComentario);

    atualizarDiagnostico();
}


/* =====================================
   OBSERVAÇÃO DO FACEBOOK
===================================== */

function iniciarObservacao() {
    procurarComentarios();

    let agendado = false;

    const observador = new MutationObserver((mutacoes) => {
        if (!extensaoDisponivel()) {
            observador.disconnect();
            return;
        }

        if (
            caixaDiagnostico &&
            mutacoes.every((m) =>
                caixaDiagnostico.contains(m.target)
            )
        ) {
            return;
        }

        if (agendado) return;

        agendado = true;

        setTimeout(() => {
            agendado = false;
            procurarComentarios();
        }, ATRASO_VARREDURA_MS);
    });

    observador.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    let ultimaUrl = location.href;

    const intervalo = setInterval(() => {
        if (!extensaoDisponivel()) {
            clearInterval(intervalo);
            observador.disconnect();
            return;
        }

        if (location.href !== ultimaUrl) {
            ultimaUrl = location.href;
            expandirAte = Date.now() + JANELA_EXPANSAO_MS;
        }

        procurarComentarios();
    }, INTERVALO_VARREDURA_MS);
}


/* =====================================
   MENSAGENS RECEBIDAS
===================================== */

chrome.runtime.onMessage.addListener(
    (mensagem, remetente, responder) => {

        if (!mensagem) return;

        if (mensagem.tipo === "RELER_COMENTARIOS") {
            enviadosPorElemento = new WeakMap();
            bloqueadoAte = new WeakMap();

            expandirAte = Date.now() + JANELA_EXPANSAO_MS;

            procurarComentarios();
            return;
        }

        if (
            mensagem.tipo === "EXPANDIR_COMENTARIO_FACEBOOK"
        ) {
            expandirComentarioSolicitado(
                mensagem,
                responder
            );

            return true;
        }
    }
);


/* =====================================
   INICIALIZAÇÃO
===================================== */

iniciarObservacao();