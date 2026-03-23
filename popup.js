(function () {
  "use strict";

  const statusEl = document.getElementById("status");
  const titleInput = document.getElementById("title");
  const exportMdBtn = document.getElementById("exportMd");
  const exportWordBtn = document.getElementById("exportWord");
  const previewBtn = document.getElementById("previewBtn");
  const previewSection = document.getElementById("preview-section");
  const previewEl = document.getElementById("preview");

  let cachedData = null;

  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    if (type === "success") {
      setTimeout(() => {
        statusEl.style.display = "none";
      }, 3000);
    }
  }

  function hideStatus() {
    statusEl.style.display = "none";
    statusEl.className = "status";
  }

  /**
   * Get conversation data from the content script.
   */
  async function getConversationData() {
    if (cachedData) return cachedData;

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab) {
      throw new Error("无法获取当前标签页");
    }

    if (!tab.url || !tab.url.includes("claude.ai")) {
      throw new Error("请在 claude.ai 的对话页面使用此插件");
    }

    // Ensure content script is injected
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
    } catch (e) {
      // Content script may already be injected, ignore error
    }

    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(
        tab.id,
        { action: "extractConversation" },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error("无法与页面通信，请刷新页面后重试"));
            return;
          }
          if (!response) {
            reject(new Error("未收到页面响应"));
            return;
          }
          if (response.error) {
            reject(new Error(response.error));
            return;
          }
          cachedData = response;
          if (response.title && !titleInput.value) {
            titleInput.value = response.title;
          }
          resolve(response);
        }
      );
    });
  }

  /**
   * Format the conversation as Markdown text.
   */
  function formatAsMarkdown(data, options) {
    const title = titleInput.value || data.title || "Claude 对话";
    const lines = [];

    lines.push(`# ${title}`);
    lines.push("");

    if (options.includeTimestamp) {
      lines.push(
        `> 导出时间: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`
      );
      lines.push("");
    }

    data.messages.forEach((msg, index) => {
      if (options.separateMessages && index > 0) {
        lines.push("---");
        lines.push("");
      }

      if (options.includeRole) {
        const roleLabel = msg.role === "human" ? "**Human:**" : "**Claude:**";
        lines.push(roleLabel);
        lines.push("");
      }

      lines.push(msg.content);
      lines.push("");
    });

    return lines.join("\n");
  }

  /**
   * Format the conversation as HTML suitable for Word.
   */
  function formatAsWordHTML(data, options) {
    const title = titleInput.value || data.title || "Claude 对话";

    // Simple Markdown to HTML conversion for Word
    function mdToHtml(md) {
      let html = md;

      // Code blocks
      html = html.replace(
        /```(\w*)\n([\s\S]*?)```/g,
        (_, lang, code) =>
          `<pre style="background:#f5f5f5;padding:12px;border-radius:4px;border:1px solid #ddd;font-family:Consolas,monospace;font-size:13px;overflow-x:auto;"><code>${escapeHtml(code.trim())}</code></pre>`
      );

      // Inline code
      html = html.replace(
        /`([^`]+)`/g,
        '<code style="background:#f0f0f0;padding:2px 5px;border-radius:3px;font-family:Consolas,monospace;font-size:13px;">$1</code>'
      );

      // Headers
      html = html.replace(/^###### (.+)$/gm, "<h6>$1</h6>");
      html = html.replace(/^##### (.+)$/gm, "<h5>$1</h5>");
      html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
      html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
      html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
      html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

      // Bold and italic
      html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
      html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
      html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");

      // Links
      html = html.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" style="color:#2563eb;">$1</a>'
      );

      // Blockquotes
      html = html.replace(
        /^> (.+)$/gm,
        '<blockquote style="border-left:4px solid #c9a0ff;padding-left:12px;color:#666;margin:8px 0;">$1</blockquote>'
      );

      // Unordered lists
      html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
      html = html.replace(
        /(<li>.*<\/li>\n?)+/g,
        '<ul style="margin:8px 0;padding-left:24px;">$&</ul>'
      );

      // Ordered lists
      html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

      // Horizontal rules
      html = html.replace(
        /^---$/gm,
        '<hr style="border:none;border-top:1px solid #e0e0e0;margin:16px 0;" />'
      );

      // Paragraphs: wrap remaining text lines
      html = html.replace(
        /^(?!<[a-z/])((?!<).+)$/gm,
        '<p style="margin:6px 0;line-height:1.7;">$1</p>'
      );

      return html;
    }

    function escapeHtml(text) {
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    let bodyContent = "";

    bodyContent += `<h1 style="color:#1a1a2e;border-bottom:2px solid #c9a0ff;padding-bottom:8px;">${escapeHtml(title)}</h1>`;

    if (options.includeTimestamp) {
      bodyContent += `<p style="color:#888;font-size:12px;">导出时间: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p>`;
    }

    data.messages.forEach((msg, index) => {
      if (options.separateMessages && index > 0) {
        bodyContent +=
          '<hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0;" />';
      }

      if (options.includeRole) {
        const roleStyle =
          msg.role === "human"
            ? "color:#2563eb;font-weight:bold;font-size:14px;margin:16px 0 8px 0;"
            : "color:#9333ea;font-weight:bold;font-size:14px;margin:16px 0 8px 0;";
        const roleLabel = msg.role === "human" ? "Human" : "Claude";
        bodyContent += `<p style="${roleStyle}">${roleLabel}:</p>`;
      }

      bodyContent += `<div style="margin:4px 0 16px 0;">${mdToHtml(msg.content)}</div>`;
    });

    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <meta name="ProgId" content="Word.Document">
  <meta name="Generator" content="Claude Chat Exporter">
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    body {
      font-family: "Microsoft YaHei", "SimSun", Arial, sans-serif;
      font-size: 14px;
      line-height: 1.7;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`;
  }

  /**
   * Trigger a file download.
   */
  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Get a safe filename from title.
   */
  function safeFilename(title) {
    return title
      .replace(/[<>:"/\\|?*]/g, "_")
      .replace(/\s+/g, "_")
      .substring(0, 100);
  }

  function getOptions() {
    return {
      includeTimestamp: document.getElementById("includeTimestamp").checked,
      includeRole: document.getElementById("includeRole").checked,
      separateMessages: document.getElementById("separateMessages").checked,
    };
  }

  // Export as Markdown
  exportMdBtn.addEventListener("click", async () => {
    try {
      exportMdBtn.disabled = true;
      showStatus("正在提取对话...", "info");
      const data = await getConversationData();
      const options = getOptions();
      const markdown = formatAsMarkdown(data, options);
      const title = titleInput.value || data.title || "Claude对话";
      const filename = `${safeFilename(title)}.md`;

      downloadFile(markdown, filename, "text/markdown;charset=utf-8");
      showStatus(
        `已导出 ${data.messages.length} 条消息为 Markdown`,
        "success"
      );
    } catch (err) {
      showStatus(err.message, "error");
    } finally {
      exportMdBtn.disabled = false;
    }
  });

  // Export as Word
  exportWordBtn.addEventListener("click", async () => {
    try {
      exportWordBtn.disabled = true;
      showStatus("正在提取对话...", "info");
      const data = await getConversationData();
      const options = getOptions();
      const html = formatAsWordHTML(data, options);
      const title = titleInput.value || data.title || "Claude对话";
      const filename = `${safeFilename(title)}.doc`;

      downloadFile(html, filename, "application/msword;charset=utf-8");
      showStatus(`已导出 ${data.messages.length} 条消息为 Word`, "success");
    } catch (err) {
      showStatus(err.message, "error");
    } finally {
      exportWordBtn.disabled = false;
    }
  });

  // Preview
  previewBtn.addEventListener("click", async () => {
    try {
      if (previewSection.style.display !== "none") {
        previewSection.style.display = "none";
        previewBtn.textContent = "预览内容";
        return;
      }

      showStatus("正在提取对话...", "info");
      const data = await getConversationData();
      const options = getOptions();
      const markdown = formatAsMarkdown(data, options);

      previewEl.textContent =
        markdown.length > 500 ? markdown.substring(0, 500) + "\n..." : markdown;
      previewSection.style.display = "block";
      previewBtn.textContent = "隐藏预览";
      hideStatus();
    } catch (err) {
      showStatus(err.message, "error");
    }
  });

  // Refresh button - clear cache and re-extract
  const refreshBtn = document.getElementById("refreshBtn");
  refreshBtn.addEventListener("click", async () => {
    cachedData = null;
    try {
      showStatus("正在重新提取...", "info");
      const data = await getConversationData();
      const humanCount = data.messages.filter(m => m.role === "human").length;
      const assistantCount = data.messages.filter(m => m.role === "assistant").length;
      showStatus(
        `提取成功: ${humanCount} 条用户消息, ${assistantCount} 条 Claude 回复`,
        "success"
      );
    } catch (err) {
      showStatus(err.message, "error");
    }
  });

  // Debug button - show DOM diagnostic info
  const debugBtn = document.getElementById("debugBtn");
  const debugSection = document.getElementById("debug-section");
  const debugOutput = document.getElementById("debug-output");

  debugBtn.addEventListener("click", async () => {
    if (debugSection.style.display !== "none") {
      debugSection.style.display = "none";
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });
      } catch (e) { /* already injected */ }

      chrome.tabs.sendMessage(tab.id, { action: "debugDOM" }, (response) => {
        if (chrome.runtime.lastError || !response) {
          debugOutput.textContent = "无法获取诊断信息";
        } else {
          debugOutput.textContent = JSON.stringify(response, null, 2);
        }
        debugSection.style.display = "block";
      });
    } catch (err) {
      debugOutput.textContent = err.message;
      debugSection.style.display = "block";
    }
  });

  // Auto-detect title on load
  (async () => {
    try {
      const data = await getConversationData();
      if (data.title) {
        titleInput.value = data.title;
      }
      const humanCount = data.messages.filter(m => m.role === "human").length;
      const assistantCount = data.messages.filter(m => m.role === "assistant").length;
      if (data.messages.length > 0) {
        showStatus(
          `检测到 ${humanCount} 条用户消息, ${assistantCount} 条 Claude 回复`,
          "info"
        );
      }
    } catch (e) {
      // Silently fail - user can set title manually
    }
  })();
})();
