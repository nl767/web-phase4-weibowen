// public/app.js —— Day3 版：数据全部来自接口
const listEl = document.getElementById("list");
const errEl = document.getElementById("error");
const formEl = document.getElementById("add-form");
const inputEl = document.getElementById("title");

// ---------- 渲染三态：加载中 / 空 / 有数据 ----------
function showLoading() {
  listEl.innerHTML = '<li class="empty">加载中…</li>';
}
function showEmpty() {
  listEl.innerHTML = '<li class="empty">还没有待办，先加一条</li>';
}
function showError(msg) {
  // 错误态必须带「重试」按钮，只写一行红字不算完成
  listEl.innerHTML =
    '<li class="empty">加载失败：' + msg +
    '<br><button id="retry" class="retry">重试</button></li>';
  document.getElementById("retry").addEventListener("click", loadItems);
}

// ---------- 查：加载列表 ----------
async function loadItems() {
  showLoading();
  try {
    const res = await fetch(API_BASE + "/api/items");
    const json = await res.json();          // 统一格式，先解包
    if (json.code !== 0) throw new Error(json.msg);
    const items = json.data;
    if (items.length === 0) return showEmpty();

    listEl.innerHTML = items
      .map(
        (it) =>
          '<li class="' + (it.done ? "done" : "") + '">' +
            '<span>' + it.title + '</span>' +
            '<button class="del" data-id="' + it.id + '">删除</button>' +
          "</li>"
      )
      .join("");
  } catch (e) {
    showError(e.message || "网络异常");
  }
}

// ---------- 增 ----------
formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) { errEl.textContent = "内容不能为空"; return; }
  if (text.length > 50) { errEl.textContent = "最多 50 个字"; return; }
  errEl.textContent = "";

  try {
    const res = await fetch(API_BASE + "/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },  // 不写这行，后端收不到 body
      body: JSON.stringify({ title: text }),
    });
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.msg);
    inputEl.value = "";
    loadItems();            // 加完立刻重新拉列表，保证和服务端一致
  } catch (e) {
    errEl.textContent = "添加失败：" + e.message;
  }
});

// ---------- 删（事件委托：列表是动态生成的，只能挂在父元素上） ----------
listEl.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("del")) return;
  const id = e.target.dataset.id;
  if (!confirm("确定删除这条待办？")) return;
  try {
    const res = await fetch(API_BASE + "/api/items/" + id, { method: "DELETE" });
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.msg);
    loadItems();
  } catch (err) {
    errEl.textContent = "删除失败：" + err.message;
  }
});

loadItems();   // 页面一打开就拉一次