import { LATEX_SNIPPETS } from "../services/LatexSnippets";

export interface Snippet {
    trigger: string;
    insert: string;
    label?: string;
    detail?: string;
}

export const MENU_SNIPPETS: Snippet[] = [
    // ── Fractions, Roots, & Layout ────────────────────────────────────────
    { trigger: "frac",    insert: "\\frac{\0}{}",           detail: "fraction" },
    { trigger: "sqrt",    insert: "\\sqrt{\0}",             detail: "square root" },
    { trigger: "sqrtn",   insert: "\\sqrt[\0]{}",           detail: "nth root" },
    { trigger: "text",    insert: "\\text{\0}",             detail: "text environment" },
    { trigger: "mathbf",  insert: "\\mathbf{\0}",           detail: "bold text" },
    { trigger: "mathrm",  insert: "\\mathrm{\0}",           detail: "roman text" },
    { trigger: "underbrace", insert: "\\underbrace{\0}_{}", detail: "underbrace" },
    { trigger: "overbrace",  insert: "\\overbrace{\0}^{}",  detail: "overbrace" },

    // ── Lowercase Greek ───────────────────────────────────────────────────
    { trigger: "alpha",   insert: "\\alpha",                 detail: "α" },
    { trigger: "beta",    insert: "\\beta",                  detail: "β" },
    { trigger: "gamma",   insert: "\\gamma",                 detail: "γ" },
    { trigger: "delta",   insert: "\\delta",                 detail: "δ" },
    { trigger: "epsilon", insert: "\\epsilon",               detail: "ϵ" },
    { trigger: "varepsilon", insert: "\\varepsilon",         detail: "ε" },
    { trigger: "zeta",    insert: "\\zeta",                  detail: "ζ" },
    { trigger: "eta",     insert: "\\eta",                   detail: "η" },
    { trigger: "theta",   insert: "\\theta",                 detail: "θ" },
    { trigger: "vartheta",insert: "\\vartheta",              detail: "ϑ" },
    { trigger: "iota",    insert: "\\iota",                  detail: "ι" },
    { trigger: "kappa",   insert: "\\kappa",                 detail: "κ" },
    { trigger: "lambda",  insert: "\\lambda",                detail: "λ" },
    { trigger: "mu",      insert: "\\mu",                    detail: "μ" },
    { trigger: "nu",      insert: "\\nu",                    detail: "ν" },
    { trigger: "xi",      insert: "\\xi",                    detail: "ξ" },
    { trigger: "pi",      insert: "\\pi",                    detail: "π" },
    { trigger: "rho",     insert: "\\rho",                   detail: "ρ" },
    { trigger: "sigma",   insert: "\\sigma",                 detail: "σ" },
    { trigger: "tau",     insert: "\\tau",                   detail: "τ" },
    { trigger: "upsilon", insert: "\\upsilon",               detail: "υ" },
    { trigger: "phi",     insert: "\\phi",                   detail: "ϕ" },
    { trigger: "varphi",  insert: "\\varphi",                detail: "φ" },
    { trigger: "chi",     insert: "\\chi",                   detail: "χ" },
    { trigger: "psi",     insert: "\\psi",                   detail: "ψ" },
    { trigger: "omega",   insert: "\\omega",                 detail: "ω" },

    // ── Uppercase Greek ───────────────────────────────────────────────────
    { trigger: "Gamma",   insert: "\\Gamma",                 detail: "Γ" },
    { trigger: "Delta",   insert: "\\Delta",                 detail: "Δ" },
    { trigger: "Theta",   insert: "\\Theta",                 detail: "Θ" },
    { trigger: "Lambda",  insert: "\\Lambda",                detail: "Λ" },
    { trigger: "Xi",      insert: "\\Xi",                    detail: "Ξ" },
    { trigger: "Pi",      insert: "\\Pi",                    detail: "Π" },
    { trigger: "Sigma",   insert: "\\Sigma",                 detail: "Σ" },
    { trigger: "Upsilon", insert: "\\Upsilon",               detail: "Υ" },
    { trigger: "Phi",     insert: "\\Phi",                   detail: "Φ" },
    { trigger: "Psi",     insert: "\\Psi",                   detail: "Ψ" },
    { trigger: "Omega",   insert: "\\Omega",                 detail: "Ω" },

    // ── Arrows ────────────────────────────────────────────────────────────
    { trigger: "to",      insert: "\\to",                    detail: "→" },
    { trigger: "rightarrow", insert: "\\rightarrow",         detail: "→" },
    { trigger: "leftarrow",  insert: "\\leftarrow",          detail: "←" },
    { trigger: "Rightarrow", insert: "\\Rightarrow",         detail: "⇒" },
    { trigger: "Leftarrow",  insert: "\\Leftarrow",          detail: "⇐" },
    { trigger: "leftrightarrow", insert: "\\leftrightarrow", detail: "↔" },
    { trigger: "Leftrightarrow", insert: "\\Leftrightarrow", detail: "⇔" },
    { trigger: "mapsto",  insert: "\\mapsto",                detail: "↦" },
    { trigger: "implies", insert: "\\implies",               detail: "⟹" },
    { trigger: "impliedby", insert: "\\impliedby",           detail: "⟸" },
    { trigger: "iff",     insert: "\\iff",                   detail: "⟺" },

    // ── Operations & Calculus ─────────────────────────────────────────────
    { trigger: "sum",     insert: "\\sum_{\0}^{}",          detail: "Σ sum" },
    { trigger: "prod",    insert: "\\prod_{\0}^{}",         detail: "Π product" },
    { trigger: "int",     insert: "\\int_{\0}^{}",          detail: "∫ integral" },
    { trigger: "iint",    insert: "\\iint_{\0}^{}",         detail: "∬ double int" },
    { trigger: "oint",    insert: "\\oint_{\0}^{}",         detail: "∮ contour int" },
    { trigger: "lim",     insert: "\\lim_{\0 \\to }",       detail: "limit" },
    { trigger: "partial", insert: "\\partial",               detail: "∂" },
    { trigger: "nabla",   insert: "\\nabla",                 detail: "∇ gradient" },
    { trigger: "times",   insert: "\\times",                 detail: "× cross" },
    { trigger: "cdot",    insert: "\\cdot",                  detail: "⋅ dot" },
    { trigger: "pm",      insert: "\\pm",                    detail: "±" },
    { trigger: "mp",      insert: "\\mp",                    detail: "∓" },
    { trigger: "oplus",   insert: "\\oplus",                 detail: "⊕ XOR" },
    { trigger: "otimes",  insert: "\\otimes",                detail: "⊗ tensor" },

    // ── Relations & Logic ─────────────────────────────────────────────────
    { trigger: "equiv",   insert: "\\equiv",                 detail: "≡" },
    { trigger: "neq",     insert: "\\neq",                   detail: "≠" },
    { trigger: "approx",  insert: "\\approx",                detail: "≈" },
    { trigger: "sim",     insert: "\\sim",                   detail: "∼" },
    { trigger: "simeq",   insert: "\\simeq",                 detail: "≃" },
    { trigger: "propto",  insert: "\\propto",                detail: "∝" },
    { trigger: "leq",     insert: "\\leq",                   detail: "≤" },
    { trigger: "geq",     insert: "\\geq",                   detail: "≥" },
    { trigger: "ll",      insert: "\\ll",                    detail: "≪" },
    { trigger: "gg",      insert: "\\gg",                    detail: "≫" },
    { trigger: "forall",  insert: "\\forall",                detail: "∀" },
    { trigger: "exists",  insert: "\\exists",                detail: "∃" },
    { trigger: "nexists", insert: "\\nexists",               detail: "∄" },
    { trigger: "land",    insert: "\\land",                  detail: "∧ AND" },
    { trigger: "lor",     insert: "\\lor",                   detail: "∨ OR" },
    { trigger: "lnot",    insert: "\\lnot",                  detail: "¬ NOT" },

    // ── Sets ──────────────────────────────────────────────────────────────
    { trigger: "in",      insert: "\\in",                    detail: "∈" },
    { trigger: "notin",   insert: "\\notin",                 detail: "∉" },
    { trigger: "subset",  insert: "\\subset",                detail: "⊂" },
    { trigger: "supset",  insert: "\\supset",                detail: "⊃" },
    { trigger: "subseteq",insert: "\\subseteq",              detail: "⊆" },
    { trigger: "supseteq",insert: "\\supseteq",              detail: "⊇" },
    { trigger: "cup",     insert: "\\cup",                   detail: "∪ union" },
    { trigger: "cap",     insert: "\\cap",                   detail: "∩ intersection" },
    { trigger: "setminus",insert: "\\setminus",              detail: "∖" },
    { trigger: "emptyset",insert: "\\emptyset",              detail: "∅" },
    
    // ── Mathbb / Calligraphy ──────────────────────────────────────────────
    { trigger: "mathbb",  insert: "\\mathbb{\0}",           detail: "Blackboard (ℝ, ℕ)" },
    { trigger: "mathcal", insert: "\\mathcal{\0}",          detail: "Calligraphy" },
    { trigger: "mathscr", insert: "\\mathscr{\0}",          detail: "Script" },

    // ── Misc ──────────────────────────────────────────────────────────────
    { trigger: "infty",   insert: "\\infty",                 detail: "∞" },
    { trigger: "dots",    insert: "\\dots",                  detail: "..." },
    { trigger: "vdots",   insert: "\\vdots",                 detail: "⋮" },
    { trigger: "ddots",   insert: "\\ddots",                 detail: "⋱" },
    { trigger: "hat",     insert: "\\hat{\0}",              detail: "x̂" },
    { trigger: "bar",     insert: "\\bar{\0}",              detail: "x̄" },
    { trigger: "vec",     insert: "\\vec{\0}",              detail: "x⃗" },
    { trigger: "dot",     insert: "\\dot{\0}",              detail: "ẋ" },
    { trigger: "ddot",    insert: "\\ddot{\0}",             detail: "ẍ" }
];

export default class DslAutocomplete {
    private dropdown: HTMLDivElement;
    private items: Snippet[] = [];
    private activeIdx = 0;
    private query = "";
    private mathStart = -1;
    
    // THE FIX: Prevent synthetic input events from triggering recursive snippets
    private isProcessingSnippet = false; 

    constructor(private textarea: HTMLInputElement | HTMLTextAreaElement) {
        this.dropdown = document.createElement("div");
        this.dropdown.style.cssText = [
            "position:fixed",
            "z-index:10000",
            "background:var(--background-primary)",
            "border:1px solid var(--background-modifier-border)",
            "border-radius:6px",
            "box-shadow:0 4px 16px rgba(0,0,0,0.25)",
            "max-height:220px",
            "overflow-y:auto",
            "min-width:220px",
            "font-size:12px",
            "display:none"
        ].join(";");
        document.body.appendChild(this.dropdown);

        textarea.addEventListener("keydown", this.onKeyDown.bind(this), true);
        textarea.addEventListener("input", this.onInput.bind(this));
        textarea.addEventListener("blur", () => setTimeout(() => this.hide(), 120));
        textarea.addEventListener("scroll", () => this.reposition());
    }

    destroy() {
        this.dropdown.remove();
    }

    private onKeyDown(e: Event) {
        const ke = e as KeyboardEvent;
        if (this.dropdown.style.display === "none") return;
        switch (ke.key) {
            case "ArrowDown":
                ke.preventDefault(); ke.stopPropagation();
                this.activeIdx = Math.min(this.activeIdx + 1, this.items.length - 1);
                this.renderList();
                break;
            case "ArrowUp":
                ke.preventDefault(); ke.stopPropagation();
                this.activeIdx = Math.max(this.activeIdx - 1, 0);
                this.renderList();
                break;
            case "Enter":
            case "Tab":
                if (this.items.length) {
                    ke.preventDefault(); ke.stopPropagation();
                    this.commit(this.items[this.activeIdx]);
                }
                break;
            case "Escape":
                ke.stopPropagation();
                this.hide();
                break;
        }
    }

    private processLiveSnippets(textBefore: string, textAfter: string): boolean {
        // Detect Math mode (odd number of $ signs)
        const mathMatches = textBefore.match(/(?<!\\)\$/g);
        const inMathMode = mathMatches ? mathMatches.length % 2 === 1 : false;

        for (const snippet of LATEX_SNIPPETS) {
            if (snippet.options.includes("m") && !inMathMode) continue;
            if (snippet.options.includes("t") && inMathMode) continue;

            let match: RegExpMatchArray | null = null;
            let matchLength = 0;

            if (snippet.trigger instanceof RegExp || snippet.options.includes("r")) {
                const regex = new RegExp((snippet.trigger instanceof RegExp ? snippet.trigger.source : snippet.trigger) + "$");
                match = textBefore.match(regex);
                if (match) matchLength = match[0].length;
            } else {
                const trig = snippet.trigger as string;
                if (snippet.options.includes("w")) {
                    const regex = new RegExp("(^|\\W)" + trig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "$");
                    const wMatch = textBefore.match(regex);
                    if (wMatch) { match = wMatch; matchLength = trig.length; }
                } else {
                    if (textBefore.endsWith(trig)) { match = [trig]; matchLength = trig.length; }
                }
            }

            if (match) {
                let repStr = "";
                if (typeof snippet.replacement === "function") {
                    repStr = snippet.replacement(match);
                } else {
                    repStr = snippet.replacement;
                    // Remove ${VISUAL} tags
                    repStr = repStr.replace(/\$\{VISUAL\}/g, "");
                    
                    if (snippet.trigger instanceof RegExp || snippet.options.includes("r")) {
                        for (let i = 0; i < match.length; i++) {
                            repStr = repStr.split(`[[${i}]]`).join(match[i + 1] ?? "");
                        }
                    }
                }

                // Process $0 and ${1:text} cursor markers
                let cursorStart = -1;
                let cursorEnd = -1;
                const markerRegex = /\$\{([0-9]+):([^}]+)\}|\$([0-9]+)/;
                
                let firstStopMarker = Infinity;
                for (let m = repStr.match(markerRegex); m; m = repStr.match(markerRegex)) {
                    const markerId = parseInt(m[1] || m[3]);
                    const defaultText = m[2] || "";
                    
                    // Prioritize $1, $2, etc., over $0 for initial cursor placement
                    const rank = markerId === 0 ? Infinity : markerId;
                    
                    if (rank < firstStopMarker || cursorStart === -1) {
                        firstStopMarker = rank;
                        cursorStart = m.index!;
                        cursorEnd = cursorStart + defaultText.length;
                    }
                    repStr = repStr.slice(0, m.index!) + defaultText + repStr.slice(m.index! + m[0].length);
                }

                const newValue = textBefore.slice(0, textBefore.length - matchLength) + repStr + textAfter;
                const newPos = textBefore.length - matchLength + (cursorStart !== -1 ? cursorStart : repStr.length);
                const newEnd = textBefore.length - matchLength + (cursorEnd !== -1 ? cursorEnd : repStr.length);

                // Lock snippet processing to prevent infinite loops!
                this.isProcessingSnippet = true;
                this.textarea.value = newValue;
                this.textarea.setSelectionRange(newPos, newEnd);
                this.textarea.dispatchEvent(new Event("input"));
                this.isProcessingSnippet = false;
                
                return true; 
            }
        }
        return false;
    }

    private onInput(e: Event) {
        if (this.isProcessingSnippet) return; // Ignore synthetic events

        const inputEvent = e as InputEvent;
        const isDeletion = inputEvent.inputType && inputEvent.inputType.startsWith("delete");

        const pos = this.textarea.selectionStart ?? 0;
        const before = this.textarea.value.slice(0, pos);
        const after = this.textarea.value.slice(pos);

        // 1. Try real-time expanding snippets first (Only if NOT deleting)
        if (!isDeletion && this.processLiveSnippets(before, after)) {
            this.hide();
            return;
        }

        // 2. Fallback to basic drop-down logic
        let depth = 0;
        let lastOpen = -1;
        for (let i = 0; i < before.length; i++) {
            if (before[i] === '$') {
                if (depth === 0) { depth = 1; lastOpen = i; }
                else { depth = 0; lastOpen = -1; }
            }
        }
        this.mathStart = lastOpen;

        if (lastOpen === -1) { this.hide(); return; }

        const mathContent = before.slice(lastOpen + 1);
        const bsIdx = mathContent.lastIndexOf('\\');
        if (bsIdx === -1) { this.hide(); return; }

        const afterBs = mathContent.slice(bsIdx + 1);
        if (/[\s\\]/.test(afterBs) && afterBs.length > 0) { this.hide(); return; }

        this.query = afterBs.toLowerCase();
        this.items = MENU_SNIPPETS.filter(s =>
            s.trigger.startsWith(this.query) && s.trigger !== this.query
        ).slice(0, 12);

        if (!this.items.length) { this.hide(); return; }
        this.activeIdx = 0;
        this.renderList();
        this.reposition();
        this.dropdown.style.display = "block";
    }

    private commit(snippet: Snippet) {
        const pos = this.textarea.selectionStart ?? 0;
        const val = this.textarea.value;
        const before = val.slice(0, pos);

        const bsIdx = before.lastIndexOf('\\');
        if (bsIdx === -1) { this.hide(); return; }

        const cursorMark = snippet.insert.indexOf('\0');
        const insertText = snippet.insert.replace('\0', '');
        const newVal = val.slice(0, bsIdx) + insertText + val.slice(pos);
        const newCursor = bsIdx + (cursorMark !== -1 ? cursorMark : insertText.length);

        this.textarea.value = newVal;
        this.textarea.setSelectionRange(newCursor, newCursor);
        this.textarea.dispatchEvent(new Event('input'));
        this.hide();
        this.textarea.focus();
    }

    private hide() {
        this.dropdown.style.display = "none";
        this.items = [];
    }

    private renderList() {
        this.dropdown.innerHTML = "";
        this.items.forEach((item, idx) => {
            const row = document.createElement("div");
            row.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:5px 10px;cursor:pointer;gap:12px;";
            if (idx === this.activeIdx) {
                row.style.background = "var(--interactive-accent)";
                row.style.color = "var(--text-on-accent)";
            }

            const left = document.createElement("span");
            left.style.fontFamily = "var(--font-monospace)";
            left.style.fontWeight = "500";
            const qLen = this.query.length;
            if (qLen > 0 && item.trigger.startsWith(this.query) && idx !== this.activeIdx) {
                left.innerHTML = `<span style="color:var(--text-accent)">${item.trigger.slice(0, qLen)}</span>` + item.trigger.slice(qLen);
            } else {
                left.textContent = item.trigger;
            }

            const right = document.createElement("span");
            right.textContent = item.detail ?? "";
            right.style.cssText = "font-size:11px;opacity:0.7;white-space:nowrap";

            row.appendChild(left);
            row.appendChild(right);

            row.addEventListener("mousedown", (e) => {
                e.preventDefault();
                this.activeIdx = idx;
                this.commit(item);
            });
            row.addEventListener("mouseenter", () => {
                this.activeIdx = idx;
                this.renderList();
            });

            this.dropdown.appendChild(row);
        });

        const activeEl = this.dropdown.children[this.activeIdx] as HTMLElement;
        activeEl?.scrollIntoView({ block: "nearest" });
    }

    private reposition() {
        if (this.dropdown.style.display === "none") return;
        const rect = this.textarea.getBoundingClientRect();

        const pos = this.textarea.selectionStart ?? 0;
        const textBefore = this.textarea.value.slice(0, pos);
        const linesBefore = textBefore.split("\n").length;
        const lineHeight = parseFloat(getComputedStyle(this.textarea).lineHeight) || 18;
        const paddingTop = parseFloat(getComputedStyle(this.textarea).paddingTop) || 6;
        const caretTop = rect.top + paddingTop + (linesBefore - 1) * lineHeight - this.textarea.scrollTop;

        const dropH = Math.min(220, this.items.length * 30);
        const spaceBelow = window.innerHeight - caretTop - lineHeight;
        const top = spaceBelow >= dropH
            ? caretTop + lineHeight + 2
            : caretTop - dropH - 4;

        this.dropdown.style.left = `${rect.left + 6}px`;
        this.dropdown.style.top = `${Math.max(4, top)}px`;
    }
}