/*
 * LIVECHAT CENTRAL
 * Captura comentários do YouTube.
 * Utiliza somente o nome de exibição.
 * Identifica mensagens para evitar duplicações.
 */

let comentariosIdentificados = new WeakSet();

function extensaoDisponivel() {
    try {
        return Boolean(chrome.runtime && chrome.runtime.id);
    } catch (erro) {
        return false;
    }
}

function limparNome(elemento) {
    const copia = elemento.cloneNode(true);

    const extras = copia.querySelectorAll(
        "yt-live-chat-author-badge-renderer, " +
        "#chat-badges, img, svg, yt-icon, " +
        "tp-yt-paper-tooltip"
    );

    extras.forEach((item) => item.remove());

    return (copia.innerText || copia.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
}

// Extrai o texto da mensagem mantendo os emojis.
// O YouTube exibe os emojis como imagens (<img>), e o innerText
// ignora imagens, por isso o emoji vem do atributo "alt".
function extrairTextoComEmojis(elemento) {
    if (!elemento) return "";

    const copia = elemento.cloneNode(true);

    copia.querySelectorAll("img").forEach((imagem) => {
        const emoji = (
            imagem.getAttribute("alt") ||
            imagem.getAttribute("aria-label") ||
            imagem.getAttribute("shared-tooltip-text") ||
            ""
        ).trim();

        if (emoji) {
            imagem.replaceWith(document.createTextNode(" " + emoji + " "));
        } else {
            imagem.remove();
        }
    });

    copia.querySelectorAll("svg, tp-yt-paper-tooltip").forEach((item) => {
        item.remove();
    });

    return (copia.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
}

function identificarId(elemento) {
    const atributos = [
        "id",
        "data-id",
        "data-message-id"
    ];

    for (const atributo of atributos) {
        const valor = elemento.getAttribute(atributo);

        if (valor && valor.trim()) {
            return "youtube:" + valor.trim();
        }
    }

    const timestamp = elemento.querySelector("#timestamp");

    if (timestamp) {
        const link = timestamp.closest("a");

        if (link && link.href) {
            return "youtube:" + link.href;
        }
    }

    return "";
}

function lerComentario(elemento) {
    if (comentariosIdentificados.has(elemento)) return;
    if (!extensaoDisponivel()) return;

    const autor = elemento.querySelector("#author-name");
    const mensagem = elemento.querySelector("#message");

    if (!autor || !mensagem) return;

    const nome = limparNome(autor);

    const texto = extrairTextoComEmojis(mensagem);

    if (!nome || !texto) return;

    const id = identificarId(elemento);

    try {
        chrome.runtime.sendMessage(
            {
                tipo: "NOVO_COMENTARIO_YOUTUBE",
                comentario: {
                    id,
                    nome,
                    texto,
                    origem: "youtube"
                }
            },
            (resposta) => {
                try {
                    if (chrome.runtime.lastError) return;

                    if (resposta && resposta.ok) {
                        comentariosIdentificados.add(elemento);
                    }
                } catch (erro) {
                    // Contexto atualizado.
                }
            }
        );
    } catch (erro) {
        // Não interrompe a captura.
    }
}

function procurarComentarios() {
    if (!extensaoDisponivel()) return;

    const seletores = [
        "yt-live-chat-text-message-renderer",
        "yt-live-chat-paid-message-renderer",
        "yt-live-chat-membership-item-renderer"
    ];

    const encontrados = new Set();

    seletores.forEach((seletor) => {
        document.querySelectorAll(seletor).forEach((elemento) => {
            encontrados.add(elemento);
        });
    });

    encontrados.forEach(lerComentario);
}

function iniciarObservacao() {
    procurarComentarios();

    const observador = new MutationObserver(() => {
        if (!extensaoDisponivel()) {
            observador.disconnect();
            return;
        }

        procurarComentarios();
    });

    observador.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
    });

    const intervalo = setInterval(() => {
        if (!extensaoDisponivel()) {
            clearInterval(intervalo);
            observador.disconnect();
            return;
        }

        procurarComentarios();
    }, 1500);
}

// Quando o painel é aberto, lê novamente os comentários
// que já estavam na página.
chrome.runtime.onMessage.addListener((mensagem) => {
    if (mensagem && mensagem.tipo === "RELER_COMENTARIOS") {
        comentariosIdentificados = new WeakSet();
        procurarComentarios();
    }
});

iniciarObservacao();