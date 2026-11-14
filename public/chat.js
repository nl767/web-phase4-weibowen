// public/chat.js —— 单独一个文件，记得在 app.js 之后引入
const msgBox = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const stopBtn = document.getElementById("stop-btn");

const history = [];      // 会话上下文：只存在内存里，刷新就没了（够用）
let controller = null;   // 用来「停止生成」

function addMsg(role, text) {
  const div = document.createElement("div");
  div.className = "msg " + (role === "user" ? "user" : "ai");
  div.textContent = text;
  msgBox.appendChild(div);
  msgBox.scrollTop = msgBox.scrollHeight;   // 自动滚到底
  return div;
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  addMsg("user", text);
  history.push({ role: "user", content: text });
  chatInput.value = "";

  while (history.length > 12) history.shift();   // 截断，丢最早的

  const bubble = addMsg("assistant", "");
  let answer = "";

  controller = new AbortController();
  sendBtn.disabled = true;
  stopBtn.disabled = false;

  try {
    const res = await fetch(API_BASE + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
      signal: controller.signal,          // ← 停止按钮靠它中断
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({ msg: "HTTP " + res.status }));
      bubble.textContent = "出错了：" + (j.msg || res.status);
      sendBtn.disabled = false;
      stopBtn.disabled = true;
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const parts = buf.split("\n\n");     // SSE 用空行分隔事件
      buf = parts.pop();                     // 最后一段可能不完整，留到下一轮

      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          const delta = (j.choices && j.choices[0] && j.choices[0].delta.content) || "";
          if (delta) {
            answer += delta;
            bubble.textContent = answer;   // 一个字一个字往上贴
          }
        } catch (err) {
          /* 半包 JSON，跳过，下一轮会补上 */
        }
      }
    }

    history.push({ role: "assistant", content: answer });
  } catch (err) {
    if (err.name === "AbortError") {
      bubble.textContent = (answer || "") + "\n[已停止]";
      history.push({ role: "assistant", content: answer });
    } else {
      bubble.textContent = "网络异常：" + err.message;
    }
  } finally {
    sendBtn.disabled = false;
    stopBtn.disabled = true;
    controller = null;
  }
});

stopBtn.addEventListener("click", () => {
  if (controller) controller.abort();      // 触发 AbortError
});