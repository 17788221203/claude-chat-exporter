// Content script: extracts conversation data from claude.ai

(function () {
  "use strict";

  /**
   * Convert an HTML element's content to Markdown.
   */
  function htmlToMarkdown(element) {
    if (!element) return "";
    return convertNode(element).trim();
  }

  /**
   * Try to extract LaTeX source from a KaTeX/MathJax rendered element.
   * Returns the LaTeX string or null if not found.
   */
  function extractLatex(node) {
    // Strategy 1: <annotation encoding="application/x-tex"> inside MathML
    const annotation = node.querySelector('annotation[encoding="application/x-tex"]');
    if (annotation) {
      return annotation.textContent.trim();
    }

    // Strategy 2: aria-label attribute (KaTeX sets this)
    const ariaLabel = node.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.length > 0) {
      return ariaLabel;
    }

    // Strategy 3: Look for a <math> element's alttext
    const mathEl = node.querySelector("math");
    if (mathEl) {
      const alttext = mathEl.getAttribute("alttext");
      if (alttext) return alttext;
    }

    // Strategy 4: data-latex or data-formula attributes
    const dataLatex = node.getAttribute("data-latex") || node.getAttribute("data-formula");
    if (dataLatex) return dataLatex;

    return null;
  }

  /**
   * Check if an element is a KaTeX/MathJax math element.
   * Returns { isBlock: boolean, latex: string } or null.
   */
  function detectMathElement(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const className = (typeof node.className === 'string') ? node.className : '';

    // KaTeX display math: <span class="katex-display"> or <div class="katex-display">
    if (className.includes("katex-display")) {
      const latex = extractLatex(node);
      if (latex) return { isBlock: true, latex };
    }

    // KaTeX inline math: <span class="katex">
    if (className.includes("katex") && !className.includes("katex-display")) {
      const latex = extractLatex(node);
      if (latex) return { isBlock: false, latex };
    }

    // MathJax display: <div class="MathJax_Display"> or <mjx-container display="true">
    if (className.includes("MathJax_Display") || className.includes("MathJax")) {
      const latex = extractLatex(node);
      if (latex) return { isBlock: className.includes("Display"), latex };
    }

    // MathJax v3: <mjx-container>
    if (node.tagName && node.tagName.toLowerCase() === "mjx-container") {
      const latex = extractLatex(node);
      const isBlock = node.getAttribute("display") === "true" || node.hasAttribute("display");
      if (latex) return { isBlock, latex };
    }

    return null;
  }

  function convertNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    // ---- Math/formula detection (must come before tag-based dispatch) ----
    const mathInfo = detectMathElement(node);
    if (mathInfo) {
      if (mathInfo.isBlock) {
        return `\n\n$$${mathInfo.latex}$$\n\n`;
      } else {
        return `$${mathInfo.latex}$`;
      }
    }

    const tag = node.tagName.toLowerCase();
    const children = () =>
      Array.from(node.childNodes).map(convertNode).join("");

    switch (tag) {
      case "h1":
        return `\n# ${children().trim()}\n\n`;
      case "h2":
        return `\n## ${children().trim()}\n\n`;
      case "h3":
        return `\n### ${children().trim()}\n\n`;
      case "h4":
        return `\n#### ${children().trim()}\n\n`;
      case "h5":
        return `\n##### ${children().trim()}\n\n`;
      case "h6":
        return `\n###### ${children().trim()}\n\n`;

      case "p":
        return `\n${children().trim()}\n\n`;

      case "br":
        return "\n";

      case "strong":
      case "b":
        return `**${children().trim()}**`;

      case "em":
      case "i":
        return `*${children().trim()}*`;

      case "del":
      case "s":
        return `~~${children().trim()}~~`;

      case "code": {
        const parent = node.parentElement;
        if (parent && parent.tagName.toLowerCase() === "pre") {
          return node.textContent;
        }
        return `\`${node.textContent}\``;
      }

      case "pre": {
        const codeEl = node.querySelector("code");
        const text = codeEl ? codeEl.textContent : node.textContent;
        let lang = "";
        if (codeEl) {
          const langClass = Array.from(codeEl.classList).find(
            (c) => c.startsWith("language-") || c.startsWith("hljs-")
          );
          if (langClass) {
            lang = langClass.replace(/^(language-|hljs-)/, "");
          }
        }
        // Look for a language label in the code block header
        const codeBlock = node.closest('[class*="code-block"], [class*="codeblock"], [class*="CodeBlock"]');
        if (!lang && codeBlock) {
          const langLabel = codeBlock.querySelector(
            '[class*="lang"], [class*="language"], span, div'
          );
          if (langLabel && langLabel.textContent.trim().length < 30) {
            const candidate = langLabel.textContent.trim().toLowerCase();
            if (/^[a-z0-9+#.-]+$/.test(candidate)) {
              lang = candidate;
            }
          }
        }
        return `\n\`\`\`${lang}\n${text}\n\`\`\`\n\n`;
      }

      case "a": {
        const href = node.getAttribute("href") || "";
        const text = children().trim();
        return `[${text}](${href})`;
      }

      case "img": {
        const alt = node.getAttribute("alt") || "image";
        const src = node.getAttribute("src") || "";
        return `![${alt}](${src})`;
      }

      case "ul": {
        const items = Array.from(node.children)
          .filter((li) => li.tagName.toLowerCase() === "li")
          .map((li) => {
            const checkbox = li.querySelector('input[type="checkbox"]');
            let prefix = "- ";
            if (checkbox) {
              prefix = checkbox.checked ? "- [x] " : "- [ ] ";
            }
            return prefix + convertNode(li).trim();
          })
          .join("\n");
        return `\n${items}\n\n`;
      }

      case "ol": {
        const items = Array.from(node.children)
          .filter((li) => li.tagName.toLowerCase() === "li")
          .map((li, idx) => `${idx + 1}. ${convertNode(li).trim()}`)
          .join("\n");
        return `\n${items}\n\n`;
      }

      case "li":
        return children();

      case "blockquote": {
        const lines = children()
          .trim()
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
        return `\n${lines}\n\n`;
      }

      case "table": {
        return convertTable(node);
      }

      case "hr":
        return "\n---\n\n";

      // Skip MathML elements (already handled by extractLatex)
      case "math":
      case "semantics":
      case "mrow":
      case "mi":
      case "mo":
      case "mn":
      case "msup":
      case "msub":
      case "mfrac":
      case "msqrt":
      case "mover":
      case "munder":
      case "mtable":
      case "mtr":
      case "mtd":
      case "mtext":
      case "mspace":
      case "annotation":
      case "annotation-xml":
        return "";

      case "div":
      case "span":
      case "section":
      case "article":
      case "main":
      case "aside":
      case "header":
      case "footer":
      case "nav":
      case "figure":
      case "figcaption":
        return children();

      // Skip non-content elements
      case "button":
      case "svg":
      case "path":
      case "input":
      case "textarea":
      case "select":
      case "style":
      case "script":
      case "noscript":
        return "";

      default:
        return children();
    }
  }

  function convertTable(table) {
    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length === 0) return "";

    const matrix = rows.map((row) =>
      Array.from(row.querySelectorAll("th, td")).map((cell) =>
        convertNode(cell).trim().replace(/\|/g, "\\|").replace(/\n/g, " ")
      )
    );

    if (matrix.length === 0) return "";

    const colCount = Math.max(...matrix.map((r) => r.length));
    matrix.forEach((row) => {
      while (row.length < colCount) row.push("");
    });

    const header = `| ${matrix[0].join(" | ")} |`;
    const separator = `| ${matrix[0].map(() => "---").join(" | ")} |`;
    const body = matrix
      .slice(1)
      .map((row) => `| ${row.join(" | ")} |`)
      .join("\n");

    return `\n${header}\n${separator}\n${body}\n\n`;
  }

  /**
   * Extract conversation title from the page.
   */
  function getConversationTitle() {
    const docTitle = document.title || "";
    if (docTitle && docTitle !== "Claude" && !docTitle.startsWith("Claude")) {
      return docTitle.replace(/ [-–|] Claude$/, "").trim();
    }

    // Look for a title element in the sidebar or header
    const selectors = [
      'button[data-testid*="conversation"] span',
      '[class*="conversation-title"]',
      '[class*="chat-title"]',
      'nav button[class*="truncate"]',
      'header h1',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }

    return "Claude 对话";
  }

  /**
   * Check if an element or its ancestors match a selector.
   */
  function closestMatches(el, patterns) {
    let current = el;
    for (let i = 0; i < 15 && current; i++) {
      const cls = current.className || "";
      const testId = current.getAttribute && current.getAttribute("data-testid") || "";
      const combined = cls + " " + testId;
      for (const pattern of patterns) {
        if (pattern instanceof RegExp) {
          if (pattern.test(combined)) return { el: current, matched: pattern };
        } else {
          if (combined.includes(pattern)) return { el: current, matched: pattern };
        }
      }
      current = current.parentElement;
    }
    return null;
  }

  /**
   * Get text content of an element, excluding content from nested interactive elements.
   */
  function getCleanTextContent(el) {
    const clone = el.cloneNode(true);
    // Remove buttons, toolbars, and other interactive elements
    clone.querySelectorAll('button, [role="toolbar"], [class*="toolbar"], [class*="action"], [class*="copy"]').forEach(e => e.remove());
    return clone.textContent.trim();
  }

  /**
   * Main extraction: find all messages in the Claude.ai conversation.
   * Updated to work with Claude.ai's current DOM structure.
   */
  function extractConversation() {
    const messages = [];

    // ======================================================================
    // Strategy 1: Look for Claude.ai's message turn containers
    // Claude.ai typically renders conversation as alternating turn blocks
    // with specific data attributes or class patterns.
    // ======================================================================

    // Claude.ai commonly uses these patterns for message containers:
    const humanSelectors = [
      '[data-testid*="human"]',
      '[data-testid*="user"]',
      '[class*="human-turn"]',
      '[class*="user-turn"]',
      '[class*="human-message"]',
      '[class*="user-message"]',
    ];

    const assistantSelectors = [
      '[data-testid*="assistant"]',
      '[data-testid*="ai-turn"]',
      '[data-testid*="claude"]',
      '[class*="assistant-turn"]',
      '[class*="ai-turn"]',
      '[class*="assistant-message"]',
      '[class*="claude-message"]',
      '[class*="response-"]',
    ];

    // Try direct selectors first
    const humanEls = document.querySelectorAll(humanSelectors.join(", "));
    const assistantEls = document.querySelectorAll(assistantSelectors.join(", "));

    if (humanEls.length > 0 || assistantEls.length > 0) {
      // Collect all message elements with their positions
      const allMsgEls = [];
      humanEls.forEach(el => allMsgEls.push({ el, role: "human" }));
      assistantEls.forEach(el => allMsgEls.push({ el, role: "assistant" }));

      // Sort by DOM order
      allMsgEls.sort((a, b) => {
        const pos = a.el.compareDocumentPosition(b.el);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });

      // Remove nested duplicates (if a parent and child both matched)
      const filtered = allMsgEls.filter((item, index) => {
        for (let j = 0; j < allMsgEls.length; j++) {
          if (j !== index && allMsgEls[j].el.contains(item.el) && allMsgEls[j].el !== item.el) {
            return false; // Skip this one, it's a child of another match
          }
        }
        return true;
      });

      for (const { el, role } of filtered) {
        // Find the content area within the message
        const contentArea = el.querySelector(
          '[class*="prose"], [class*="markdown"], [class*="message-content"], [class*="msg-content"]'
        ) || el;
        const md = htmlToMarkdown(contentArea);
        if (md.trim()) {
          messages.push({ role, content: md.trim() });
        }
      }

      if (messages.length > 0) {
        return { title: getConversationTitle(), messages: dedup(messages), error: null };
      }
    }

    // ======================================================================
    // Strategy 2: DOM structure analysis
    // Walk the main conversation area and identify message turns by
    // analyzing class names, structure, and content patterns.
    // ======================================================================

    // Find the main scrollable conversation area
    const conversationContainer = findConversationContainer();

    if (conversationContainer) {
      const turns = identifyTurns(conversationContainer);
      if (turns.length > 0) {
        for (const turn of turns) {
          const md = htmlToMarkdown(turn.contentEl);
          if (md.trim()) {
            messages.push({ role: turn.role, content: md.trim() });
          }
        }

        if (messages.length > 0) {
          return { title: getConversationTitle(), messages: dedup(messages), error: null };
        }
      }
    }

    // ======================================================================
    // Strategy 3: Generic deep scan
    // Scan all elements for content that looks like conversation messages.
    // ======================================================================
    const genericMessages = genericDeepScan();
    if (genericMessages.length > 0) {
      return { title: getConversationTitle(), messages: dedup(genericMessages), error: null };
    }

    return {
      title: getConversationTitle(),
      messages: [],
      error: "未找到对话内容。请确保当前页面是 Claude 的对话页面，且对话已加载完成。",
    };
  }

  /**
   * Find the main conversation container element.
   */
  function findConversationContainer() {
    // Try specific selectors first
    const selectors = [
      '[class*="conversation-content"]',
      '[class*="chat-content"]',
      '[class*="thread-content"]',
      'main [role="presentation"]',
      'main [class*="react-scroll"]',
      'main [class*="overflow"]',
      'main',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 50) {
        return el;
      }
    }

    // Try to find the largest scrollable div with conversation content
    const scrollables = document.querySelectorAll('div[style*="overflow"], div[class*="scroll"], div[class*="overflow"]');
    let best = null;
    let bestScore = 0;
    for (const el of scrollables) {
      const text = el.textContent.trim();
      if (text.length > 200 && text.length > bestScore) {
        // Check it contains multiple text blocks (likely a conversation)
        const childDivs = el.querySelectorAll(':scope > div');
        if (childDivs.length >= 2) {
          bestScore = text.length;
          best = el;
        }
      }
    }

    return best;
  }

  /**
   * Identify conversation turns within a container.
   * Returns an array of { role, contentEl } objects.
   */
  function identifyTurns(container) {
    const turns = [];

    // Look for top-level children that represent message turns
    // Claude.ai usually has direct child divs for each turn
    const topChildren = Array.from(container.querySelectorAll(':scope > div, :scope > section'));

    if (topChildren.length < 2) {
      // Try going one level deeper
      const inner = container.querySelector(':scope > div');
      if (inner) {
        const innerChildren = Array.from(inner.querySelectorAll(':scope > div'));
        if (innerChildren.length >= 2) {
          return identifyTurnsFromElements(innerChildren);
        }
      }
      return turns;
    }

    return identifyTurnsFromElements(topChildren);
  }

  /**
   * Given a list of elements that may represent turns, identify role and content.
   */
  function identifyTurnsFromElements(elements) {
    const turns = [];
    let lastRole = null;

    for (const el of elements) {
      const text = getCleanTextContent(el);
      if (!text || text.length < 1) continue;

      // Skip elements that are clearly UI chrome (very small, nav elements, etc.)
      const tag = el.tagName.toLowerCase();
      if (["nav", "header", "footer", "aside"].includes(tag)) continue;

      // Determine role using multiple signals
      const role = detectRoleAdvanced(el, lastRole);
      if (role === "skip") continue;

      // Find the best content element within this turn
      const contentEl = findContentElement(el, role);
      if (!contentEl) continue;

      const cleanText = getCleanTextContent(contentEl);
      if (!cleanText || cleanText.length < 1) continue;

      turns.push({ role, contentEl });
      lastRole = role;
    }

    return turns;
  }

  /**
   * Advanced role detection combining multiple signals.
   */
  function detectRoleAdvanced(el, lastRole) {
    // 1. Check data-testid
    const testId = el.getAttribute("data-testid") || "";
    if (/human|user/i.test(testId)) return "human";
    if (/assistant|ai|claude|response/i.test(testId)) return "assistant";

    // 2. Check data-role
    const dataRole = el.getAttribute("data-role") || "";
    if (/human|user/i.test(dataRole)) return "human";
    if (/assistant|ai|claude/i.test(dataRole)) return "assistant";

    // 3. Check class names on the element itself
    const className = (typeof el.className === 'string') ? el.className : '';
    if (/human|user/i.test(className)) return "human";
    if (/assistant|claude|response/i.test(className)) return "assistant";

    // 4. Check for class patterns in child elements
    const hasProseChild = el.querySelector('[class*="prose"], [class*="markdown"], [class*="rendered"]');
    const hasCodeBlock = el.querySelector('pre code, [class*="code-block"], [class*="codeblock"]');

    // 5. Check for user avatar or assistant icon in the element
    const imgs = el.querySelectorAll('img[alt], [class*="avatar"], [class*="icon"]');
    for (const img of imgs) {
      const alt = (img.getAttribute("alt") || "").toLowerCase();
      const cls = (typeof img.className === 'string') ? img.className.toLowerCase() : '';
      if (/user|human|you|profile/i.test(alt + " " + cls)) return "human";
      if (/claude|assistant|ai|bot/i.test(alt + " " + cls)) return "assistant";
    }

    // 6. Check for specific structural patterns
    // Assistant messages typically contain rendered markdown (prose), code blocks, lists etc.
    // Human messages are typically shorter and simpler
    if (hasProseChild || hasCodeBlock) {
      // This is likely an assistant message
      return "assistant";
    }

    // 7. Check all descendants for role indicators
    const allDescendants = el.querySelectorAll('*');
    for (const desc of allDescendants) {
      const descClass = (typeof desc.className === 'string') ? desc.className : '';
      const descTestId = desc.getAttribute("data-testid") || "";
      const combined = descClass + " " + descTestId;
      if (/human-turn|user-turn|human-message|user-message/i.test(combined)) return "human";
      if (/assistant-turn|ai-turn|claude-turn|assistant-message|claude-message/i.test(combined)) return "assistant";
    }

    // 8. Alternate based on last role
    if (lastRole === "human") return "assistant";
    if (lastRole === "assistant") return "human";

    // Default: first message is usually from the human
    return "human";
  }

  /**
   * Find the best content element within a turn element.
   */
  function findContentElement(turnEl, role) {
    // For assistant messages, look for rendered markdown containers
    if (role === "assistant") {
      const proseEl = turnEl.querySelector(
        '[class*="prose"], [class*="markdown"], [class*="rendered-markdown"], [class*="message-content"]'
      );
      if (proseEl) return proseEl;
    }

    // For human messages, look for the text content area
    if (role === "human") {
      const userContent = turnEl.querySelector(
        '[class*="user-message"], [class*="human-message"], [class*="whitespace-pre"], [class*="break-words"]'
      );
      if (userContent) return userContent;
    }

    // Generic: look for the largest text container within the turn
    const candidates = turnEl.querySelectorAll('div, p, span');
    let best = null;
    let bestLen = 0;
    for (const c of candidates) {
      const text = getCleanTextContent(c);
      // Prefer elements that are direct content holders (not deeply nested containers)
      if (text.length > bestLen && !c.querySelector('[class*="prose"], [class*="markdown"]')) {
        bestLen = text.length;
        best = c;
      }
    }

    // If best is the same as turnEl's full text, use turnEl itself
    if (best) return best;
    return turnEl;
  }

  /**
   * Generic deep scan - last resort strategy.
   * Looks for all text blocks and tries to classify them.
   */
  function genericDeepScan() {
    const messages = [];

    // Find all substantial text-containing elements that might be messages
    const allElements = document.querySelectorAll(
      '[class*="prose"], [class*="markdown"], [class*="whitespace-pre"], [class*="break-words"], [class*="font-message"], [class*="message"]'
    );

    const seen = new Set();
    const candidates = [];

    for (const el of allElements) {
      const text = getCleanTextContent(el);
      if (!text || text.length < 2) continue;
      // Skip if this element is inside another candidate
      let dominated = false;
      for (const c of candidates) {
        if (c.el.contains(el) && c.el !== el) {
          dominated = true;
          break;
        }
      }
      if (dominated) continue;

      // Remove any existing candidates that this element contains
      for (let i = candidates.length - 1; i >= 0; i--) {
        if (el.contains(candidates[i].el) && el !== candidates[i].el) {
          candidates.splice(i, 1);
        }
      }

      if (seen.has(text)) continue;
      seen.add(text);

      candidates.push({ el, text });
    }

    // Sort by DOM order
    candidates.sort((a, b) => {
      const pos = a.el.compareDocumentPosition(b.el);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    // Assign roles based on pattern analysis
    let lastRole = null;
    for (const { el } of candidates) {
      const role = detectRoleAdvanced(el, lastRole);
      if (role === "skip") continue;

      const md = htmlToMarkdown(el);
      if (md.trim()) {
        messages.push({ role, content: md.trim() });
        lastRole = role;
      }
    }

    return messages;
  }

  /**
   * Collapse assistant message content into a single paragraph.
   * Removes markdown formatting and joins all text into one continuous paragraph.
   */
  function collapseToOneParagraph(mdContent) {
    let text = mdContent;
    // Remove code block markers
    text = text.replace(/```[\s\S]*?```/g, (match) => {
      // Extract just the code text without the ``` markers
      return match.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();
    });
    // Remove heading markers
    text = text.replace(/^#{1,6}\s+/gm, '');
    // Remove bold/italic markers
    text = text.replace(/\*{1,3}(.*?)\*{1,3}/g, '$1');
    // Remove list markers
    text = text.replace(/^[\s]*[-*+]\s+/gm, '');
    text = text.replace(/^[\s]*\d+\.\s+/gm, '');
    // Remove blockquote markers
    text = text.replace(/^>\s?/gm, '');
    // Remove horizontal rules
    text = text.replace(/^---+$/gm, '');
    // Remove inline code backticks
    text = text.replace(/`([^`]+)`/g, '$1');
    // Remove link markdown but keep text
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    // Remove image markdown
    text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
    // Collapse all whitespace (newlines, tabs, multiple spaces) into single spaces
    text = text.replace(/\s+/g, ' ');
    return text.trim();
  }

  /**
   * Remove exact consecutive duplicate messages.
   */
  function dedup(messages) {
    const result = [];
    for (let i = 0; i < messages.length; i++) {
      if (
        i > 0 &&
        messages[i].role === messages[i - 1].role &&
        messages[i].content === messages[i - 1].content
      ) {
        continue;
      }
      // Collapse assistant messages into a single paragraph
      if (messages[i].role === "assistant") {
        result.push({
          role: messages[i].role,
          content: collapseToOneParagraph(messages[i].content),
        });
      } else {
        result.push(messages[i]);
      }
    }
    return result;
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extractConversation") {
      try {
        const data = extractConversation();
        sendResponse(data);
      } catch (err) {
        sendResponse({
          title: "Claude 对话",
          messages: [],
          error: `提取失败: ${err.message}`,
        });
      }
    }

    if (request.action === "debugDOM") {
      // Debug helper: return info about the page structure
      try {
        const info = debugPageStructure();
        sendResponse(info);
      } catch (err) {
        sendResponse({ error: err.message });
      }
    }

    return true;
  });

  /**
   * Debug helper: inspect the page DOM to understand message structure.
   * Can be triggered from popup for diagnostics.
   */
  function debugPageStructure() {
    const info = {
      url: window.location.href,
      title: document.title,
      strategies: {},
    };

    // Check what selectors match
    const selectorTests = {
      'data-testid*="human"': '[data-testid*="human"]',
      'data-testid*="user"': '[data-testid*="user"]',
      'data-testid*="assistant"': '[data-testid*="assistant"]',
      'data-testid*="ai"': '[data-testid*="ai"]',
      'data-testid*="message"': '[data-testid*="message"]',
      'data-testid*="turn"': '[data-testid*="turn"]',
      'data-testid*="conversation"': '[data-testid*="conversation"]',
      'class*="prose"': '[class*="prose"]',
      'class*="markdown"': '[class*="markdown"]',
      'class*="human"': '[class*="human"]',
      'class*="assistant"': '[class*="assistant"]',
      'class*="user"': '[class*="user"]',
      'class*="message"': '[class*="message"]',
      'class*="turn"': '[class*="turn"]',
      'class*="chat"': '[class*="chat"]',
      'class*="whitespace-pre"': '[class*="whitespace-pre"]',
      'class*="break-words"': '[class*="break-words"]',
      'class*="font"': '[class*="font"]',
      'data-role': '[data-role]',
      'role="presentation"': '[role="presentation"]',
      // Math/formula selectors
      'class*="katex"': '[class*="katex"]',
      'class*="MathJax"': '[class*="MathJax"]',
      'mjx-container': 'mjx-container',
      'annotation[encoding]': 'annotation[encoding="application/x-tex"]',
      'math': 'math',
      // Mermaid/diagram selectors
      'class*="mermaid"': '[class*="mermaid"]',
      'class*="diagram"': '[class*="diagram"]',
    };

    for (const [name, sel] of Object.entries(selectorTests)) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        info.strategies[name] = {
          count: els.length,
          samples: Array.from(els).slice(0, 3).map(el => ({
            tag: el.tagName,
            className: (typeof el.className === 'string' ? el.className : '').slice(0, 200),
            testId: el.getAttribute("data-testid") || "",
            textPreview: el.textContent.trim().slice(0, 100),
          })),
        };
      }
    }

    // Also check the main element structure
    const main = document.querySelector('main');
    if (main) {
      info.mainElement = {
        childCount: main.children.length,
        firstChildren: Array.from(main.children).slice(0, 5).map(el => ({
          tag: el.tagName,
          className: (typeof el.className === 'string' ? el.className : '').slice(0, 200),
          childCount: el.children.length,
          textLength: el.textContent.trim().length,
        })),
      };
    }

    return info;
  }
})();
