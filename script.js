/**
 * Calculator
 * ----------
 * Feature modules (all self-contained):
 *   • Core arithmetic  — token-based expression, evaluated on "="
 *   • Memory           — MC / MR / M+ / M-
 *   • History          — persisted list of past calculations
 *   • Keyboard         — full key mapping + on-screen hints
 *
 * All display formatting is centralized in render().
 */

(function () {
  "use strict";

  /* -------------------------------------------------- Config */
  const OPERATORS = {
    "+": { symbol: "+", apply: (a, b) => a + b },
    "-": { symbol: "−", apply: (a, b) => a - b },
    "*": { symbol: "×", apply: (a, b) => a * b },
    "/": { symbol: "÷", apply: (a, b) => (b === 0 ? null : a / b) },
  };
  const MAX_DIGITS = 12;
  const STORE_KEY = "calculator.state";

  /* -------------------------------------------------- State */
  let current = "0";
  let previous = null;
  let operator = null;
  let justEvaluated = false;
  let memory = 0;
  let history = [];

  /* -------------------------------------------------- Elements */
  const $ = (id) => document.getElementById(id);
  const currentEl = $("current");
  const expressionEl = $("expression");
  const memIndicator = $("memIndicator");
  const historyPanel = $("historyPanel");
  const historyList = $("historyList");
  const historyEmpty = $("historyEmpty");
  const calc = document.querySelector(".calc");

  /* -------------------------------------------------- Persistence */
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ memory, history }));
    } catch (e) { /* storage unavailable — ignore */ }
  }

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORE_KEY));
      if (!data) return;
      memory = Number(data.memory) || 0;
      history = Array.isArray(data.history) ? data.history : [];
    } catch (e) { /* corrupt or unavailable — start fresh */ }
  }

  /* -------------------------------------------------- Formatting */
  function formatNumber(value) {
    if (value === "Error") return value;
    const num = Number(value);
    if (!isFinite(num)) return "Error";

    // Keep a trailing "." or lone "-" visible while typing.
    if (typeof value === "string" && /[.-]$/.test(value)) return value;

    const abs = Math.abs(num);
    // Compact scientific notation for extreme magnitudes.
    if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) {
      return num.toExponential(6).replace(/\.?0+e/, "e");
    }

    // Strip float noise (e.g. 0.1+0.2) WITHOUT corrupting large integers.
    const cleaned = parseFloat(num.toPrecision(12));
    const [intPart, decPart] = String(cleaned).split(".");
    const grouped = Number(intPart).toLocaleString("en-US");
    return decPart !== undefined ? `${grouped}.${decPart}` : grouped;
  }

  /* -------------------------------------------------- Render */
  // Shrink the result font until the number fits BOTH the width (long numbers)
  // and the available height (squeezed display on notched phones) — never clips.
  // Height must be measured directly: the result is bottom-aligned, so it
  // overflows UPWARD, which scrollHeight does not report.
  function fitResult() {
    currentEl.style.fontSize = "";                 // reset to the responsive size
    const maxW = currentEl.clientWidth;
    const screen = currentEl.parentElement;        // .screen (overflow: hidden)
    if (!maxW) return;
    const cs = getComputedStyle(screen);
    const contentH = screen.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const baseSize = parseFloat(getComputedStyle(currentEl).fontSize);
    const maxH = contentH - 2 - expressionEl.offsetHeight;

    // Text scales ~linearly with font-size, so one measurement gives the
    // target size directly instead of shrink-and-remeasure per pixel.
    const scale = Math.min(1, maxW / currentEl.scrollWidth, maxH / currentEl.offsetHeight);
    let size = Math.max(18, Math.floor(baseSize * scale));
    if (size < baseSize) currentEl.style.fontSize = size + "px";

    // Linear estimate can be off by a hair (rounding, line-height) — nudge.
    let guard = 0;
    while (
      (currentEl.scrollWidth > maxW ||
        expressionEl.offsetHeight + currentEl.offsetHeight > contentH - 2) &&
      size > 18 && guard < 8
    ) {
      size -= 1;
      currentEl.style.fontSize = size + "px";
      guard++;
    }
  }

  function render() {
    currentEl.textContent = formatNumber(current);

    if (operator && previous !== null) {
      expressionEl.textContent = `${formatNumber(previous)} ${OPERATORS[operator].symbol}`;
    } else {
      expressionEl.textContent = "";
    }

    memIndicator.hidden = memory === 0;
    fitResult();
  }

  /* -------------------------------------------------- Input */
  function inputDigit(digit) {
    if (current === "Error" || justEvaluated) {
      current = digit;
      justEvaluated = false;
      return;
    }
    if (current.replace(/[.-]/g, "").length >= MAX_DIGITS) return;
    current = current === "0" ? digit : current + digit;
  }

  function inputDecimal() {
    if (current === "Error" || justEvaluated) {
      current = "0.";
      justEvaluated = false;
      return;
    }
    if (!current.includes(".")) current += ".";
  }

  function chooseOperator(nextOperator) {
    if (current === "Error") return;

    if (operator !== null && previous !== null && !justEvaluated) {
      const result = evaluate();
      if (result === null) return;
      previous = result;
    } else {
      previous = current;
    }
    operator = nextOperator;
    current = previous;
    justEvaluated = true; // next digit starts a fresh operand
  }

  function evaluate() {
    if (operator === null || previous === null) return null;

    const result = OPERATORS[operator].apply(Number(previous), Number(current));

    if (result === null || !isFinite(result)) {
      current = "Error";
      previous = null;
      operator = null;
      justEvaluated = true;
      return null;
    }
    return String(parseFloat(result.toPrecision(12)));
  }

  function equals() {
    if (operator === null || previous === null || current === "Error") return;

    const expr = `${formatNumber(previous)} ${OPERATORS[operator].symbol} ${formatNumber(current)}`;
    const result = evaluate();
    if (result === null) return;

    addHistory(expr, formatNumber(result));
    current = result;
    previous = null;
    operator = null;
    justEvaluated = true;
    expressionEl.textContent = `${expr} =`;
    currentEl.textContent = formatNumber(current);
    memIndicator.hidden = memory === 0;
  }

  function percent() {
    if (current === "Error") return;
    current = String(Number(current) / 100);
    justEvaluated = true;
  }

  function deleteLast() {
    if (current === "Error" || justEvaluated) {
      current = "0";
      justEvaluated = false;
      return;
    }
    current = current.length > 1 ? current.slice(0, -1) : "0";
  }

  function clearAll() {
    current = "0";
    previous = null;
    operator = null;
    justEvaluated = false;
  }

  /* -------------------------------------------------- Memory */
  function memClear() { memory = 0; save(); }

  function memRecall() {
    if (memory === 0 && current === "Error") return;
    current = String(memory);
    justEvaluated = true;
  }

  function memAdd() {
    if (current === "Error") return;
    memory += Number(current);
    justEvaluated = true;
    save();
  }

  function memSub() {
    if (current === "Error") return;
    memory -= Number(current);
    justEvaluated = true;
    save();
  }

  /* -------------------------------------------------- History */
  function addHistory(expr, result) {
    history.unshift({ expr, result });
    if (history.length > 50) history.pop();
    renderHistory();
    save();
  }

  function renderHistory() {
    historyList.innerHTML = "";
    historyEmpty.hidden = history.length > 0;

    history.forEach((item) => {
      const li = document.createElement("li");
      li.className = "history__item";
      li.innerHTML =
        `<div class="history__expr">${item.expr} =</div>` +
        `<div class="history__res">${item.result}</div>`;
      // Tap a past result to reuse it as the current operand.
      li.addEventListener("click", () => {
        current = item.result.replace(/,/g, "");
        justEvaluated = true;
        render();
      });
      historyList.appendChild(li);
    });
  }

  function clearHistory() {
    history = [];
    renderHistory();
    save();
  }

  /* -------------------------------------------------- Dispatch */
  function handleValue(value) {
    if (value === ".") inputDecimal();
    else if (value === "%") percent();
    else if (OPERATORS[value]) chooseOperator(value);
    else inputDigit(value);
  }

  function handleAction(action) {
    switch (action) {
      case "clear": clearAll(); break;
      case "delete": deleteLast(); break;
      case "equals": equals(); break;
      case "mem-clear": memClear(); break;
      case "mem-recall": memRecall(); break;
      case "mem-add": memAdd(); break;
      case "mem-sub": memSub(); break;
    }
  }

  /* -------------------------------------------------- Pointer events */
  // Delegated across the whole calculator; only buttons carrying a
  // data-value / data-action are treated as keys (chrome buttons are ignored).
  function activateKey(key) {
    if (key.dataset.action) handleAction(key.dataset.action);
    else if (key.dataset.value) handleValue(key.dataset.value);
    render();
  }

  // Keys fire on pointerdown, not click: click waits for the finger to LIFT,
  // which reads as lag. Registering on touch-down matches native calculators.
  const handledByPointer = new WeakSet();

  calc.addEventListener("pointerdown", (e) => {
    const key = e.target.closest("button[data-value], button[data-action]");
    if (!key) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    handledByPointer.add(key);
    activateKey(key);
  });

  // The browser still fires a click after pointerup — swallow it so the key
  // doesn't register twice. A click with no preceding pointerdown on the key
  // is keyboard activation (Tab + Enter/Space) and goes through normally.
  calc.addEventListener("click", (e) => {
    const key = e.target.closest("button[data-value], button[data-action]");
    if (!key) return;
    if (handledByPointer.has(key)) {
      handledByPointer.delete(key);
      return;
    }
    activateKey(key);
  });

  /* -------------------------------------------------- Keyboard */
  function flashKey(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.classList.add("is-pressed");
    setTimeout(() => el.classList.remove("is-pressed"), 120);
  }

  window.addEventListener("keydown", (e) => {
    const { key } = e;
    let selector = null;

    if (/^[0-9]$/.test(key)) { handleValue(key); selector = `[data-value="${key}"]`; }
    else if (key === ".") { handleValue("."); selector = '[data-value="."]'; }
    else if (key === "%") { handleValue("%"); selector = '[data-value="%"]'; }
    else if (["+", "-", "*", "/"].includes(key)) { handleValue(key); selector = `[data-value="${key}"]`; }
    else if (key === "Enter" || key === "=") { e.preventDefault(); handleAction("equals"); selector = '[data-action="equals"]'; }
    else if (key === "Backspace") { handleAction("delete"); selector = '[data-action="delete"]'; }
    else if (key === "Escape") { handleAction("clear"); selector = '[data-action="clear"]'; }
    else if (key === "h" || key === "H") { toggleHistory(); return; }
    else return;

    if (selector) flashKey(selector);
    render();
  });

  /* -------------------------------------------------- History panel toggle */
  function toggleHistory() {
    const open = historyPanel.hidden;
    historyPanel.hidden = !open;
    $("historyToggle").classList.toggle("is-active", open);
  }

  /* -------------------------------------------------- Wire up chrome */
  $("historyToggle").addEventListener("click", toggleHistory);
  $("historyClear").addEventListener("click", clearHistory);

  /* -------------------------------------------------- Init */
  load();
  renderHistory();
  render();
})();
