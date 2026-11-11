/*
 * LIVECHAT CENTRAL
 * Converte o conteúdo de uma mensagem em partes de texto e imagem.
 * Emojis Unicode viram texto. Emojis personalizados (sem equivalente
 * Unicode) permanecem como imagem, para aparecerem no painel.
 */

function extrairPartes(elemento) {
    if (!elemento) return [];

    const copia = elemento.cloneNode(true);

    copia.querySelectorAll("svg, tp-yt-paper-tooltip").forEach((item) => {
        item.remove();
    });

    const partes = [];

    function adicionarTexto(valor) {
        if (!valor) return;

        const ultima = partes[partes.length - 1];

        if (ultima && ultima.tipo === "texto") {
            ultima.valor += valor;
        } else {
            partes.push({ tipo: "texto", valor });
        }
    }

    const percorredor = document.createTreeWalker(
        copia,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT
    );

    while (percorredor.nextNode()) {
        const no = percorredor.currentNode;

        if (no.nodeType === Node.TEXT_NODE) {
            adicionarTexto(no.nodeValue);
            continue;
        }

        if (no.tagName !== "IMG") continue;

        const alt = (
            no.getAttribute("alt") ||
            no.getAttribute("aria-label") ||
            no.getAttribute("shared-tooltip-text") ||
            ""
        ).trim();

        // Emoji Unicode: o "alt" já é o próprio caractere.
        if (alt && !/^[\w:\-\s]+$/.test(alt)) {
            adicionarTexto(" " + alt + " ");
            continue;
        }

        const origem = no.currentSrc || no.getAttribute("src") || "";

        if (/^https:\/\//i.test(origem)) {
            partes.push({ tipo: "imagem", src: origem, alt });
        } else if (alt) {
            adicionarTexto(" " + alt + " ");
        }
    }

    // Normaliza espaços sem juntar imagens ao texto vizinho.
    partes.forEach((parte) => {
        if (parte.tipo === "texto") {
            parte.valor = parte.valor.replace(/\s+/g, " ");
        }
    });

    if (partes.length && partes[0].tipo === "texto") {
        partes[0].valor = partes[0].valor.trimStart();
    }

    const ultima = partes[partes.length - 1];

    if (ultima && ultima.tipo === "texto") {
        ultima.valor = ultima.valor.trimEnd();
    }

    return partes.filter((parte) => {
        return parte.tipo === "imagem" || parte.valor;
    });
}
