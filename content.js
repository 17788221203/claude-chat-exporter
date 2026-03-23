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

  function convertNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
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
        // Inline code (not inside <pre>)
        const parent = node.parentElement;
        if (parent && parent.tagName.toLowerCase() === "pre") {
          return node.textContent;
        }
        return `\`${node.textContent}\``;
      }

      case "pre": {
        const codeEl = node.querySelector("code");
        const text = codeEl ? codeEl.textContent : node.textContent;
        // Try to detect language from class
        let lang = "";
        if (codeEl) {
          const langClass = Array.from(codeEl.classList).find(
            (c) => c.startsWith("language-") || c.startsWith("hljs-")
          );
          if (langClass) {
            lang = langClass.replace(/^(language-|hljs-)/, "");
          }
        }
        // Also check for a language label element that Claude often renders
        const langLabel = node.parentElement?.querySelector(
          '[class*="code-block"] [class*="lang"], [class*="language-label"], [class*="text-text-"]'
        );
        if (!lang && langLabel) {
          lang = langLabel.textContent.trim().toLowerCase();
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
    // Pad rows
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
   * Extract the conversation title from the page.
   */
  function getConversationTitle() {
    // Try several strategies
    // 1. Document title
    const docTitle = document.title || "";
    if (docTitle && docTitle !== "Claude") {
      return docTitle.replace(/ - Claude$/, "").trim();
    }

    // 2. Look for a title in the header/nav area
    const headerTitle = document.querySelector(
      '[class*="conversation-title"], [class*="chat-title"], header h1, nav button[class*="truncate"]'
    );
    if (headerTitle) {
      return headerTitle.textContent.trim();
    }

    return "Claude 对话";
  }

  /**
   * Detect the role of a message element.
   * Returns "human" or "assistant".
   */
  function detectRole(messageEl) {
    // Check data attributes
    const dataRole =
      messageEl.getAttribute("data-role") ||
      messageEl.getAttribute("data-message-role") ||
      messageEl.getAttribute("data-testid") ||
      "";

    if (/human|user/i.test(dataRole)) return "human";
    if (/assistant|claude|ai|bot/i.test(dataRole)) return "assistant";

    // Check class names
    const className = messageEl.className || "";
    if (/human|user/i.test(className)) return "human";
    if (/assistant|claude|bot|response/i.test(className)) return "assistant";

    // Check inner content for role indicators
    const roleIndicator = messageEl.querySelector(
      '[class*="role"], [class*="sender"], [class*="author"], [data-testid*="role"]'
    );
    if (roleIndicator) {
      const text = roleIndicator.textContent.toLowerCase();
      if (/human|user|you/i.test(text)) return "human";
      if (/assistant|claude/i.test(text)) return "assistant";
    }

    // Check for user avatar vs assistant icon
    const avatar = messageEl.querySelector(
      '[class*="avatar"], [class*="icon"], img[alt]'
    );
    if (avatar) {
      const alt = (avatar.getAttribute("alt") || "").toLowerCase();
      const cls = (avatar.className || "").toLowerCase();
      if (/user|human|you/i.test(alt + cls)) return "human";
      if (/claude|assistant|ai/i.test(alt + cls)) return "assistant";
    }

    return "unknown";
  }

  /**
   * Main extraction: find all messages in the conversation.
   */
  function extractConversation() {
    const messages = [];

    // Strategy 1: data-testid based selectors (common in React apps)
    let messageEls = document.querySelectorAll(
      '[data-testid*="message"], [data-testid*="turn"], [data-testid*="conversation"]'
    );

    // Strategy 2: role-based attributes
    if (messageEls.length === 0) {
      messageEls = document.querySelectorAll(
        '[data-role="human"], [data-role="assistant"], [data-message-role]'
      );
    }

    // Strategy 3: class-based selectors for Claude.ai
    if (messageEls.length === 0) {
      messageEls = document.querySelectorAll(
        '[class*="message-row"], [class*="chat-message"], [class*="conversation-turn"], [class*="msg-"]'
      );
    }

    // Strategy 4: structural detection - alternating message blocks
    if (messageEls.length === 0) {
      // Claude.ai typically wraps messages in specific container divs
      // Look for the main conversation container
      const containers = document.querySelectorAll(
        '[class*="conversation"], [class*="chat-messages"], [class*="thread"], main [class*="react-scroll"]'
      );

      for (const container of containers) {
        const children = container.children;
        if (children.length >= 2) {
          messageEls = children;
          break;
        }
      }
    }

    // Strategy 5: Claude.ai specific - look for the message content areas
    if (messageEls.length === 0) {
      // On Claude.ai, human messages are often in elements with specific font styling
      // and assistant messages contain rendered markdown
      const allDivs = document.querySelectorAll(
        'div[class*="font-"], div[class*="prose"], div[class*="markdown"]'
      );
      const contentAreas = Array.from(allDivs).filter((el) => {
        const text = el.textContent.trim();
        return text.length > 0 && text.length < 50000;
      });

      if (contentAreas.length >= 2) {
        // Group by parent to find message containers
        const parentMap = new Map();
        contentAreas.forEach((el) => {
          let parent = el.parentElement;
          // Walk up a few levels to find the message container
          for (let i = 0; i < 5 && parent; i++) {
            if (parent.children.length <= 5) {
              parent = parent.parentElement;
            } else {
              break;
            }
          }
          if (parent && !parentMap.has(parent)) {
            parentMap.set(parent, []);
          }
          if (parent) {
            parentMap.get(parent).push(el);
          }
        });

        // Find the container with the most content areas
        let bestParent = null;
        let maxChildren = 0;
        parentMap.forEach((children, parent) => {
          if (children.length > maxChildren) {
            maxChildren = children.length;
            bestParent = parent;
          }
        });

        if (bestParent) {
          messageEls = bestParent.children;
        }
      }
    }

    if (messageEls.length === 0) {
      return { title: getConversationTitle(), messages: [], error: "未找到对话内容。请确保当前页面是 Claude 的对话页面。" };
    }

    // Process each message element
    let roleAlternator = "human"; // Assume first message is from human
    Array.from(messageEls).forEach((el) => {
      // Skip elements that are clearly not messages (toolbars, headers, etc.)
      const text = el.textContent.trim();
      if (!text || text.length < 1) return;

      // Skip navigation, header, footer elements
      const tag = el.tagName.toLowerCase();
      if (["nav", "header", "footer", "aside"].includes(tag)) return;

      let role = detectRole(el);

      // If role detection failed, alternate between human and assistant
      if (role === "unknown") {
        role = roleAlternator;
        roleAlternator = roleAlternator === "human" ? "assistant" : "human";
      } else {
        // Update alternator based on detected role
        roleAlternator = role === "human" ? "assistant" : "human";
      }

      // Extract content
      // Try to find the actual content area within the message
      const contentArea = el.querySelector(
        '[class*="prose"], [class*="markdown"], [class*="message-content"], [class*="msg-content"]'
      ) || el;

      const markdown = htmlToMarkdown(contentArea);

      if (markdown.trim()) {
        messages.push({
          role: role,
          content: markdown.trim(),
        });
      }
    });

    // De-duplicate: if we have consecutive same-role messages, they might be duplicates
    const deduped = [];
    for (let i = 0; i < messages.length; i++) {
      if (i > 0 && messages[i].role === messages[i - 1].role && messages[i].content === messages[i - 1].content) {
        continue; // Skip exact duplicates
      }
      deduped.push(messages[i]);
    }

    return {
      title: getConversationTitle(),
      messages: deduped,
      error: deduped.length === 0 ? "提取到的对话内容为空。" : null,
    };
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
    return true; // Keep message channel open for async response
  });
})();
