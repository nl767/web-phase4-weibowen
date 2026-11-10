// ⚠️ 今天数据先写死在本地数组里，Day3 会换成真实的接口数据
const demo = [
  { id: 1, title: "读完第四阶段任务书", done: true },
  { id: 2, title: "把页面部署到 GitHub Pages", done: false },
  { id: 3, title: "抓 3 条请求写进周记", done: false },
];

// ---------- 1. Tab 切换（任务书要求的「至少 1 处 JS 交互」） ----------
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.panel).classList.add("active");
  });
});

// ---------- 2. 渲染列表 ----------
const list = document.getElementById("list");

function render(items) {
  if (items.length === 0) {
    list.innerHTML = '<li class="empty">还没有待办</li>';
    return;
  }
  list.innerHTML = items
    .map((it) => '<li class="' + (it.done ? "done" : "") + '">' + it.title + "</li>")
    .join("");
}

render(demo);

// ---------- 3. 表单校验 + 新增 ----------
document.getElementById("add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("title");
  const err = document.getElementById("error");
  const text = input.value.trim();

  if (text.length === 0) {
    err.textContent = "内容不能为空";
    return;
  }
  if (text.length > 50) {
    err.textContent = "最多 50 个字";
    return;
  }
  err.textContent = "";

  demo.push({ id: Date.now(), title: text, done: false });
  input.value = "";
  render(demo);
});