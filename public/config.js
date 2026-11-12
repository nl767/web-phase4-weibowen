// public/config.js
// 本地打开时用 localhost:3000；线上打开时用你部署的地址
const API_BASE =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://web-phase4-weibowen.onrender.com";   // ← 部署后改这一行

// 说明：这就是「配置项」。以后换服务器只改这一行，业务代码一个字不动。
