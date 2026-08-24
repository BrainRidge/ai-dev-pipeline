"use strict";
(() => {
  // webview/render/fields.ts
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }
  function renderField(field, value, error) {
    const wrap = el("div", "field");
    wrap.append(el("label", "field-label", field.label));
    switch (field.type) {
      case "textarea": {
        const t = el("textarea");
        t.name = field.id;
        t.value = String(value ?? "");
        t.required = Boolean(field.required);
        wrap.append(t);
        break;
      }
      case "multiselect": {
        const selected = new Set(Array.isArray(value) ? value.map(String) : []);
        const options = field.options ?? [];
        const filter = el("input", "option-filter");
        filter.type = "text";
        filter.placeholder = "type to filter\u2026";
        filter.setAttribute("aria-label", `Filter ${field.label}`);
        const group = el("div", "options");
        const lines = [];
        for (const opt of options) {
          const line = el("label", "option");
          const box = el("input");
          box.type = "checkbox";
          box.name = field.id;
          box.value = opt.value;
          box.checked = selected.has(opt.value);
          line.append(box, document.createTextNode(opt.label));
          group.append(line);
          lines.push({ line, label: opt.label.toLowerCase(), value: opt.value });
        }
        filter.addEventListener("input", () => {
          const q = filter.value.trim().toLowerCase();
          for (const { line, label, value: v } of lines) {
            const box = line.querySelector("input");
            const keep = q === "" || label.includes(q) || v.includes(q) || Boolean(box?.checked);
            line.style.display = keep ? "" : "none";
          }
        });
        if (options.length > 5) wrap.append(filter);
        wrap.append(group);
        break;
      }
      case "select": {
        const s = el("select");
        s.name = field.id;
        for (const opt of field.options ?? []) {
          const o = el("option");
          o.value = opt.value;
          o.textContent = opt.label;
          o.selected = opt.value === value;
          s.append(o);
        }
        wrap.append(s);
        break;
      }
      case "boolean": {
        const b = el("input");
        b.type = "checkbox";
        b.name = field.id;
        b.checked = Boolean(value);
        wrap.append(b);
        break;
      }
      default: {
        const i = el("input");
        i.type = "text";
        i.name = field.id;
        i.value = String(value ?? "");
        i.required = Boolean(field.required);
        wrap.append(i);
      }
    }
    if (error) wrap.append(el("div", "field-error", error));
    return wrap;
  }
  function collectValues(root2, fields) {
    const out = {};
    for (const f of fields) {
      if (f.type === "multiselect") {
        out[f.id] = [
          ...root2.querySelectorAll(`input[name="${f.id}"]:checked`)
        ].map((b) => b.value);
      } else if (f.type === "boolean") {
        out[f.id] = root2.querySelector(`input[name="${f.id}"]`)?.checked ?? false;
      } else {
        const node = root2.querySelector(
          `[name="${f.id}"]`
        );
        out[f.id] = node?.value ?? "";
      }
    }
    return out;
  }
  function renderStep(d, root2, onAction) {
    root2.textContent = "";
    const header = el("header", "task-header");
    header.append(el("h1", void 0, d.step.title));
    header.append(
      el(
        "p",
        "task-meta",
        `${d.task.workflowLabel} \xB7 ${d.task.epic} \xB7 step ${d.progress.index} of ${d.progress.total}`
      )
    );
    root2.append(header);
    const nav = el("ol", "progress");
    for (const s of d.progress.steps) {
      const li = el("li", `progress-item ${s.status}`, s.title);
      li.setAttribute("data-step-id", s.id);
      nav.append(li);
    }
    root2.append(nav);
    if (d.notice) root2.append(el("div", "notice-box", d.notice));
    const body = el("div", "step-body");
    if (d.step.text) body.append(el("p", "step-text", d.step.text));
    for (const f of d.step.fields ?? []) {
      body.append(renderField(f, d.step.values[f.id], d.step.errors?.[f.id]));
    }
    root2.append(body);
    const footer = d.footer ? el("section", "step-footer") : void 0;
    const actions = el("div", "actions");
    for (const a of d.step.actions) {
      const b = el("button", a.primary ? "primary" : void 0, a.label);
      b.addEventListener("click", () => onAction?.(a.id, collect()));
      actions.append(b);
    }
    root2.append(actions);
    if (!d.footer || !footer) {
      stampVersion();
      return;
    }
    if (d.footer.title) footer.append(el("h2", "step-footer-title", d.footer.title));
    const footerBody = el("div", "step-footer-body");
    for (const f of d.footer.fields) {
      footerBody.append(renderField(f, d.step.values[f.id], d.step.errors?.[f.id]));
    }
    footer.append(footerBody);
    const footerActions = el("div", "actions");
    for (const a of d.footer.actions) {
      const b = el("button", a.primary ? "primary" : void 0, a.label);
      b.addEventListener("click", () => onAction?.(a.id, collect()));
      footerActions.append(b);
    }
    footer.append(footerActions);
    root2.append(footer);
    stampVersion();
    function stampVersion() {
      if (d.version) root2.append(el("div", "setup-version", d.version));
    }
    function collect() {
      return {
        ...collectValues(body, d.step.fields ?? []),
        // Footer values travel with every action, so the host always sees the
        // whole form regardless of which button was pressed.
        ...footer ? collectValues(footer, d.footer?.fields ?? []) : {}
      };
    }
  }

  // webview/setup.ts
  var vscode = acquireVsCodeApi();
  var root = document.getElementById("root");
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg.type === "render" && msg.descriptor) {
      const fields = msg.descriptor.step.fields ?? [];
      renderStep(
        msg.descriptor,
        root,
        (actionId, values) => vscode.postMessage({ type: "action", stepId: "setup", actionId, values })
      );
      for (const select of root.querySelectorAll("select[name]")) {
        select.addEventListener(
          "change",
          () => vscode.postMessage({
            type: "action",
            stepId: "setup",
            actionId: "refresh",
            values: collectValues(root, fields)
          })
        );
      }
      return;
    }
    if (msg.type === "error") {
      const box = document.createElement("div");
      box.className = "error-box";
      box.textContent = String(msg.message);
      root.prepend(box);
    }
  });
  vscode.postMessage({ type: "ready" });
})();
//# sourceMappingURL=setup.js.map
