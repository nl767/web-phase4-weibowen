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
       "你是「AI 待办本」的聊天助手。\n" +
      "重要：你没有读写待办清单的权限，不能真的添加、删除或查询待办。\n" +
      "当用户要求添加、删除或查看待办时，必须明确回答：" +
      "「这件事请点『让它做』按钮，我才能真的操作你的待办清单」，绝不要假装已经完成。\n" +
      "其余问题正常回答：中文、简短、不超过 3 句，不编造，不确定就说不知道。",
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

// ---------- 工具定义（description 一定要写清楚「什么时候用」） ----------
const TOOLS = [
  {
    type: "function",
    function: {
      name: "add_item",
      description:
  "新增一条待办事项。当用户表达「记一下 / 帮我加一条 / 提醒我 / 别忘了」时，必须调用这个工具，不要只口头答应。",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "待办内容，尽量保留用户原话，例如「明天交实验报告」",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_items",
      description:
        "按关键字查询待办列表。当用户问「我还有哪些事 / 有没有关于作业的 / 列出全部」时调用。",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "查询关键字；空字符串表示查全部" },
        },
        required: ["keyword"],
      },
    },
  },
];
// ---------- 工具的真实执行（改数据库就在这几行） ----------
// ---------- 工具的真实执行（改数据库就在这几行） ----------
function runTool(name, args) {
  if (name === "add_item") {
    const title = String(args.title || "").trim();
    if (!title) return { ok: false, error: "title 不能为空" };

    const list = readAll();

    // 去重：已经有同名且未完成的，就不再加一条
    const dup = list.find((it) => !it.done && it.title === title);
    if (dup) {
      return {
        ok: false,
        duplicated: true,
        error: "该待办已存在，本次没有添加",
        item: dup,
        total: list.length,
      };
    }

    const item = { id: Date.now(), title: title.slice(0, 100), done: false };
    list.push(item);
    saveAll(list);
    return { ok: true, item, total: list.length };
  }

  if (name === "query_items") {
    const kw = String(args.keyword || "");
    const all = readAll();
    const items = kw ? all.filter((it) => it.title.includes(kw)) : all;
    return { ok: true, total: items.length, items: items.slice(0, 20) };
  }

  return { ok: false, error: "未知工具：" + name };
}
// ---------- 接口 5：带工具调用的对话 ----------
app.post("/api/agent", async (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json(fail(400, "message 必填"));
  }

  const messages = [
    {
      role: "system",
     content:
  "你是「AI 待办本」的助手。规则：\n" +
  "1) 用户要记事情、加待办时，必须调用 add_item，不要只说「好的」；\n" +
  "2) 用户要查看、询问有哪些待办时，必须调用 query_items；\n" +
  "3) 如果工具返回 duplicated: true，要明确告诉用户「这条已经存在，没有重复添加」；\n" +   // ← 新增
  "4) 拿到工具结果后，用一句中文告诉用户实际发生了什么。",
    },
    { role: "user", content: message },
  ];

  const trace = [];          // 给前端调试面板看的「调用轨迹」

  try {
    // 最多循环 3 轮，防止模型死循环把额度烧光
    for (let round = 0; round < 3; round++) {
      const r = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + process.env.DEEPSEEK_API_KEY,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: messages,
          tools: TOOLS,
          tool_choice: "auto",       // 让模型自己决定调不调
        }),
      });

      const j = await r.json();
      if (!r.ok) {
        const map = { 401: "Key 不对", 402: "余额不足", 429: "限流了" };
        return res.status(r.status).json(fail(r.status, map[r.status] || "模型出错"));
      }

      const msg = j.choices[0].message;
      messages.push(msg);            // 关键：把模型的「我要调工具」也存进历史

      // 没有 tool_calls = 模型认为不需要工具，直接给答案，结束
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return res.json(ok({ answer: msg.content, trace }));
      }

      // 有 tool_calls：逐个执行，再把结果塞回 messages
      for (const call of msg.tool_calls) {
        let args = {};
        let parseError = null;
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch (e) {
          parseError = "模型给的参数不是合法 JSON：" + call.function.arguments;
        }

        const result = parseError
          ? { ok: false, error: parseError }
          : runTool(call.function.name, args);

        trace.push({ tool: call.function.name, args: args, result: result });

        messages.push({
          role: "tool",
          tool_call_id: call.id,          // 必须原样带回这个 id，模型才认得出是哪次调用
          content: JSON.stringify(result),
        });
      }
    }

    return res.json(ok({ answer: "工具调用轮数超过上限，已停止。", trace: trace }));
  } catch (e) {
    console.error("[agent]", e);
    res.status(500).json(fail(500, "调用失败：" + e.message));
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
