// server.js —— 一个最小的「待办」后端
require("dotenv").config();   // 必须在最上面
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;          // 部署到云上时，平台会给它一个端口
const DB = path.join(__dirname, "data.json");   // 数据文件放在项目根目录

app.use(cors()); 
app.use(express.json());            // 中间件：把请求体里的 JSON 解析成 req.body
app.use(express.static("public"));  // 中间件：把 public 目录当静态网站发布（Day3 用）

// ---------- 读写数据：就两个函数，别做复杂封装 ----------
function readAll() {
  if (!fs.existsSync(DB)) return [];            // 文件还不存在 = 空列表
  const raw = fs.readFileSync(DB, "utf8").trim();
  return raw ? JSON.parse(raw) : [];
}
function saveAll(list) {
  fs.writeFileSync(DB, JSON.stringify(list, null, 2), "utf8"); // 写回文件 = 落盘
}

// ---------- 统一返回格式 ----------
const ok  = (data, msg = "ok") => ({ code: 0, data, msg });
const fail = (code, msg)       => ({ code, data: null, msg });

// ---------- 接口 1：查列表 ----------
app.get("/api/items", (req, res) => {
  res.json(ok(readAll()));
});

// ---------- 接口 2：新增（带真正的参数校验） ----------
app.post("/api/items", (req, res) => {
  const { title } = req.body || {};             // 解构，拿不到就是 undefined

  if (typeof title !== "string" || title.trim() === "") {
    return res.status(400).json(fail(400, "title 必填，且必须是非空字符串"));
  }
  if (title.length > 100) {
    return res.status(400).json(fail(400, "title 最多 100 个字"));
  }

  const list = readAll();
  const item = {
    id: Date.now(),                             // 用时间戳当 id，够用且不会重复
    title: title.trim(),
    done: false,
    createdAt: new Date().toISOString(),
  };
  list.push(item);
  saveAll(list);                                // ← 这一行才是「落盘」
  res.status(201).json(ok(item));
});

// ---------- 接口 3：删除 ----------
app.delete("/api/items/:id", (req, res) => {
  const id = Number(req.params.id);              // 路径里的东西永远是字符串，要转数字
  const list = readAll();
  const next = list.filter((it) => it.id !== id);

  if (next.length === list.length) {             // 长度没变 = 没删到
    return res.status(404).json(fail(404, "这条待办不存在"));
  }
  saveAll(next);
  res.json(ok({ id }));
});
// ---------- 接口 4：流式对话（Key 只在这里出现） ----------
app.post("/api/chat", async (req, res) => {
  const { messages } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json(fail(400, "messages 必须是非空数组"));
  }

  const system = {
    role: "system",
    content:
      "你是「AI 待办本」的助手，帮用户记录和查询待办。\n" +
      "规则：1) 回答用中文，简短，不超过 3 句；2) 不编造用户没说过的事；\n" +
      "3) 遇到与待办无关的问题，也可以回答，但不要假装自己能上网；4) 不确定就说不知道。",
  };

  const history = [system, ...messages.slice(-12)];

  try {
    const upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + process.env.DEEPSEEK_API_KEY,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: history,
        stream: true,
        temperature: 0.7,
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      const map = {
        401: "API Key 不正确或已失效，请检查 .env",
        402: "账户余额不足，请去平台充值",
        429: "请求太频繁（限流），等 10 秒再试",
        500: "模型服务临时故障，稍后再试",
      };
      console.error("[upstream]", upstream.status, text.slice(0, 200));
      return res
        .status(upstream.status)
        .json(fail(upstream.status, map[upstream.status] || "模型服务出错"));
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (e) {
    console.error("[chat]", e);
    res.status(500).json(fail(500, "连接模型失败，检查服务器网络"));
  }
});
// ---------- 兜底：404 和 500 必须放在所有路由之后 ----------
app.use((req, res) => res.status(404).json(fail(404, "接口不存在：" + req.path)));

// 注意：错误处理中间件必须是 4 个参数，少一个 Express 就不认
app.use((e, req, res, next) => {
  console.error("[500]", e);
  res.status(500).json(fail(500, "服务器内部错误，请稍后再试"));
});

app.listen(PORT, () => {
  console.log("服务已启动：http://localhost:" + PORT);
});