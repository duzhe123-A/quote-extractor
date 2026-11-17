"use strict";

const MAX_LENGTH = 50000;
const SAMPLE = "我以前做视频，最花时间的事是找工具。看到别人推荐一个软件，我就下载一个，最后桌面上全是图标，作品却没多一条。\n你有没有发现，我们有时不是缺一个工具，而是缺一个今天就能做完的小任务？\n后来我只给自己留一个要求：每试一个工具，就用它做一个能发出去的东西。哪怕只是一段十秒的旁白，也比收藏十个教程更有用。\n与其等设备齐全，不如先把手边那段素材剪完。工具再好，也替你做不了第一个决定。\n真正让我进步的，是把做完的东西拿给别人看。反馈不一定好听，但它能告诉我下一次该改哪里。";

const form = document.querySelector("#extract-form");
const source = document.querySelector("#source");
const counter = document.querySelector("#character-count");
const example = document.querySelector("#example");
const clearButton = document.querySelector("#clear");
const submit = document.querySelector("#extract");
const limit = document.querySelector("#limit");
const modes = document.querySelector("#modes");
const empty = document.querySelector("#empty");
const emptyMessage = document.querySelector("#empty-message");
const results = document.querySelector("#results");
const resultStatus = document.querySelector("#result-status");
const inputError = document.querySelector("#input-error");
const copyAll = document.querySelector("#copy-all");
const toast = document.querySelector("#toast");
const useLabels = { hook: "适合开头", title: "适合标题", close: "适合收尾" };

let activeMode = "all";
let extracted = false;
let renderedQuotes = [];
let toastTimer;

document.querySelector("#shortcut").textContent = /Mac|iPhone|iPad/i.test(navigator.platform) ? "⌘ ↵" : "Ctrl ↵";

function showEmpty(message) {
  results.replaceChildren();
  results.hidden = true;
  empty.hidden = false;
  emptyMessage.textContent = message;
  resultStatus.textContent = "";
  renderedQuotes = [];
  copyAll.disabled = true;
}

function updateInput() {
  const length = Array.from(source.value).length;
  const tooLong = length > MAX_LENGTH;
  counter.textContent = length.toLocaleString("zh-CN") + " / 50,000 字";
  source.setAttribute("aria-invalid", String(tooLong));
  inputError.hidden = !tooLong;
  inputError.textContent = tooLong ? "超过 50,000 字，请分段提取。" : "";
  submit.disabled = tooLong;
  clearButton.disabled = length === 0;
  example.disabled = length !== 0;
  if (extracted) {
    extracted = false;
    showEmpty(length ? "原文已修改，点击「提取金句」更新结果。" : "粘贴原文后，点击「提取金句」。");
  }
}

function notify(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2500);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
    const previousFocus = document.activeElement;
    document.body.append(area);
    area.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch { /* The browser denied clipboard access. */ }
    area.remove();
    previousFocus?.focus({ preventScroll: true });
    if (!copied) {
      notify("浏览器未允许复制，请选中文本后手动复制。");
      return;
    }
  }
  notify("已复制");
}

function createResult(quote) {
  const row = document.createElement("li");
  row.className = "result";
  const sentence = document.createElement("p");
  sentence.textContent = quote.text;

  const footer = document.createElement("div");
  footer.className = "result-footer";
  const label = document.createElement("span");
  label.className = "result-label";
  label.textContent = quote.reason ? useLabels[quote.use] + " · " + quote.reason : useLabels[quote.use];

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "quiet";
  copyButton.textContent = "复制";
  copyButton.setAttribute("aria-label", "复制原句");
  copyButton.addEventListener("click", () => copy(quote.text));
  footer.append(label, copyButton);
  row.append(sentence, footer);
  return row;
}

function runExtraction() {
  if (submit.disabled) return;
  if (!source.value.trim()) {
    source.focus();
    showEmpty("请先粘贴一段原文。");
    return;
  }
  const { quotes, sentenceCount } = QuoteExtractor.extract(source.value, activeMode, Number(limit.value));
  extracted = true;
  if (!quotes.length) {
    showEmpty("没找到可提取的句子，可以试一段完整的原文。");
    return;
  }
  renderedQuotes = quotes;
  results.replaceChildren(...quotes.map(createResult));
  results.hidden = false;
  empty.hidden = true;
  copyAll.disabled = false;
  resultStatus.textContent = "从 " + sentenceCount + " 句中提取 " + quotes.length + " 条";
}

source.addEventListener("input", updateInput);
source.addEventListener("keydown", event => {
  if (event.isComposing || event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
  event.preventDefault();
  runExtraction();
});
form.addEventListener("submit", event => {
  event.preventDefault();
  runExtraction();
});
example.addEventListener("click", () => {
  source.value = SAMPLE;
  updateInput();
  runExtraction();
});
clearButton.addEventListener("click", () => {
  source.value = "";
  updateInput();
  showEmpty("粘贴原文后，点击「提取金句」。");
  source.focus();
});
limit.addEventListener("change", () => { if (extracted) runExtraction(); });
modes.addEventListener("click", event => {
  const selected = event.target.closest("button[data-mode]");
  if (!selected) return;
  activeMode = selected.dataset.mode;
  for (const button of modes.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button === selected));
  }
  if (extracted) runExtraction();
});
copyAll.addEventListener("click", () => {
  if (renderedQuotes.length) copy(renderedQuotes.map(quote => quote.text).join("\n\n"));
});

updateInput();

