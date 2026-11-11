# AI 待办本

26 级第四阶段作品。一个能存数据、能对话的待办清单。

## 本地打开

用 VS Code 的 Live Server 打开 index.html，或直接跑后端：

    npm install
    node server.js

服务跑在 http://localhost:3000

## 接口文档

| 方法 | 路径 | 参数 | 成功返回 | 失败返回 |
|---|---|---|---|---|
| GET | /api/items | 无 | 200 `{code:0, data:[{id,title,done}], msg:"ok"}` | — |
| POST | /api/items | body: `title`（string，必填，≤100） | 201 `{code:0, data:{id,title,done}, msg:"ok"}` | 400 `{code:400, msg:"title 必填…"}` |
| DELETE | /api/items/:id | path: `id`（number） | 200 `{code:0, data:{id}, msg:"ok"}` | 404 `{code:404, msg:"这条待办不存在"}` |