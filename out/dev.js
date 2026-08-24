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
  function editedText(root2) {
    const edited = {};
    for (const area of root2.querySelectorAll("textarea[data-block]")) {
      edited[area.dataset.block] = area.value;
    }
    return Object.keys(edited).length > 0 ? { edited } : {};
  }
  var MARK = { complete: "\u2713", current: "\u25CF", pending: "" };
  function arrow() {
    const wrap = el("div", "wf-connector");
    wrap.innerHTML = '<svg viewBox="0 0 44 12" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="6" x2="34" y2="6" stroke="currentColor" stroke-width="1.5"/><polygon points="34,1.5 43,6 34,10.5" fill="currentColor"/></svg>';
    return wrap;
  }
  function nodeEl(s) {
    const node = el("button", `wf-node ${s.status}`);
    node.type = "button";
    node.setAttribute("data-step-id", s.id);
    node.setAttribute("aria-label", `Step ${s.index}: ${s.title}`);
    const top = el("div", "wf-node-top");
    top.append(el("span", "wf-node-index", String(s.index)));
    top.append(el("span", `badge badge-${s.badge.toLowerCase()}`, s.badge));
    if (MARK[s.status]) top.append(el("span", "wf-node-mark", MARK[s.status]));
    node.append(top);
    node.append(el("div", "wf-node-title", s.title));
    if (s.summary) node.append(el("div", "wf-node-summary", s.summary));
    return node;
  }
  function renderWorkflow(d, root2, onAction) {
    root2.textContent = "";
    const header = el("header", "task-header");
    header.append(el("h1", void 0, d.task.workflowLabel));
    header.append(el("p", "task-meta", `${d.task.epic} \xB7 ${d.task.platform} \xB7 ${d.task.id}`));
    root2.append(header);
    const canvas = el("div", "wf-canvas");
    const nodes = /* @__PURE__ */ new Map();
    d.steps.forEach((s, i) => {
      if (i > 0) canvas.append(arrow());
      const node = nodeEl(s);
      node.addEventListener("click", () => select(s.id));
      nodes.set(s.id, node);
      canvas.append(node);
    });
    root2.append(canvas);
    const detail = el("section", "wf-detail");
    root2.append(detail);
    let selectedId = d.activeStepId;
    function select(id) {
      selectedId = id;
      for (const [nodeId, node] of nodes) node.classList.toggle("selected", nodeId === id);
      paintDetail();
    }
    function paintDetail() {
      detail.textContent = "";
      const s = d.steps.find((x) => x.id === selectedId);
      if (!s) return;
      const head = el("div", "wf-detail-head");
      head.append(el("h2", void 0, `${s.index}. ${s.title}`));
      head.append(el("span", `badge badge-${s.badge.toLowerCase()}`, s.badge));
      detail.append(head);
      if (s.documentation) detail.append(el("p", "wf-detail-doc", s.documentation));
      if (s.status === "current") {
        const body = el("div", "wf-detail-body");
        if (s.text) body.append(el("p", "step-text", s.text));
        const claimed = new Set((s.fields ?? []).map((f) => f.id));
        const loose = Object.entries(s.errors ?? {}).filter(([id]) => !claimed.has(id));
        if (loose.length > 0) {
          const box = el("div", "error-box");
          for (const [, message] of loose) box.append(el("p", "step-error", message));
          body.append(box);
        }
        for (const f of s.fields ?? []) {
          body.append(renderField(f, (s.values ?? {})[f.id], s.errors?.[f.id]));
        }
        if (s.commands?.length) body.append(commandList(s, onAction));
        detail.append(body);
        detail.append(
          actionRow(
            s,
            // Edited prompts travel with every action, so pressing Done persists
            // what the developer actually sent rather than what was generated.
            () => ({ ...collectValues(body, s.fields ?? []), ...editedText(body) }),
            onAction
          )
        );
        return;
      }
      if (s.status === "complete") {
        const body = el("div", "wf-detail-body");
        if (s.answers?.length) {
          for (const a of s.answers) {
            const row = el("div", "wf-answer");
            row.append(el("div", "wf-answer-label", a.label));
            row.append(el("div", "wf-answer-value", a.value));
            body.append(row);
          }
        } else {
          body.append(el("p", "wf-detail-note", s.summary ?? "Completed."));
        }
        detail.append(body);
        detail.append(actionRow(s, () => ({}), onAction));
        return;
      }
      detail.append(
        el("p", "wf-detail-note", "This step is not available yet. Finish the steps before it.")
      );
    }
    select(selectedId);
    nodes.get(selectedId)?.scrollIntoView({ block: "nearest", inline: "center" });
  }
  function commandList(s, onAction) {
    const wrap = el("div", "cmd-list");
    function button(label, action, block) {
      const b = el("button", "cmd-button", label);
      b.type = "button";
      b.addEventListener("click", () => onAction?.(s.id, action, { block, ...editedText(wrap) }));
      return b;
    }
    const blocks = s.commands ?? [];
    if (blocks.length > 1 && blocks.every((b) => !b.actions)) {
      const toolbar = el("div", "cmd-toolbar");
      toolbar.append(
        button("Copy all", "copy", "all"),
        button("Send all to terminal", "terminal", "all")
      );
      wrap.append(toolbar);
    }
    for (const block of blocks) {
      const box = el("div", "cmd-block");
      box.setAttribute("data-block", block.id);
      const head = el("div", "cmd-head");
      head.append(el("span", "cmd-label", block.label));
      const actions = block.actions ?? [
        { id: "copy", label: "Copy" },
        { id: "terminal", label: "\u2192 Terminal" }
      ];
      for (const a of actions) head.append(button(a.label, a.id, block.id));
      box.append(head);
      if (block.note) box.append(el("div", "cmd-note", block.note));
      if (block.editable) {
        const area = el("textarea", "cmd-lines cmd-editable");
        area.value = block.lines.join("\n");
        area.dataset.block = block.id;
        area.setAttribute("aria-label", block.label);
        area.rows = Math.min(24, Math.max(8, block.lines.length));
        box.append(area);
      } else {
        box.append(el("pre", "cmd-lines", block.lines.join("\n")));
      }
      wrap.append(box);
    }
    return wrap;
  }
  function actionRow(s, values, onAction) {
    const row = el("div", "actions");
    for (const a of s.actions ?? []) {
      const b = el("button", a.primary ? "primary" : void 0, a.label);
      b.addEventListener("click", () => onAction?.(s.id, a.id, values()));
      row.append(b);
    }
    return row;
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

  // webview/fixtures/workflow.json
  var workflow_default = {
    protocolVersion: 2,
    task: {
      id: "PLAT-1234-researchTaskWorkflow-20260815-01",
      platform: "canada-assisted",
      epic: "PLAT-1234",
      workflowLabel: "Research Task"
    },
    activeStepId: "gitClone",
    steps: [
      {
        id: "requirement",
        index: 1,
        title: "Collect the requirement",
        stepType: "task",
        badge: "INPUT",
        status: "complete",
        documentation: "Describe what you need to find out. Be specific about the behaviour you are investigating rather than the fix you have in mind.",
        summary: "why is checkout slow for returning customers",
        answers: [
          {
            label: "What do you need to find out?",
            value: "why is checkout slow for returning customers"
          }
        ],
        actions: [
          {
            id: "edit",
            label: "Edit"
          }
        ]
      },
      {
        id: "gitClone",
        index: 2,
        title: "Get the code",
        stepType: "commandExecution",
        badge: "COMMAND",
        status: "current",
        documentation: "Clones the microservices you selected in the left pane and checks out a branch named after your epic.",
        actions: [
          {
            id: "back",
            label: "Back"
          },
          {
            id: "submit",
            label: "I have run these",
            primary: true
          }
        ],
        text: "Run these in a terminal to put each repository on `develop`, then mark the step done. Nothing here runs on its own.",
        commands: [
          {
            id: "pis",
            label: "party-service (pis)",
            lines: [
              "git clone https://github.com/kumartj/party-service /Users/you/ai-dev-workflow/code/pis",
              "cd /Users/you/ai-dev-workflow/code/pis",
              "git checkout develop",
              "git pull"
            ]
          },
          {
            id: "ris",
            label: "reference-data-service (ris)",
            lines: [
              "cd /Users/you/ai-dev-workflow/code/ris",
              "git fetch origin",
              "git checkout develop",
              "git pull"
            ]
          }
        ]
      },
      {
        id: "aiHandoff",
        index: 3,
        title: "Hand off to Copilot",
        stepType: "aiHandoff",
        badge: "COPILOT",
        status: "pending",
        documentation: "Sends the composed prompt to Copilot. The prompt is recorded in full in the session log before it is sent."
      },
      {
        id: "reviewAnalysis",
        index: 4,
        title: "Review the result",
        stepType: "manual",
        badge: "REVIEW",
        status: "pending",
        documentation: "The analysis opens in an editor tab. Read it, edit it if you want to, then approve it."
      }
    ]
  };

  // webview/fixtures/form-step.json
  var form_step_default = {
    protocolVersion: 2,
    task: {
      id: "",
      platform: "canada-assisted",
      epic: "",
      workflowLabel: "Task setup"
    },
    progress: {
      index: 0,
      total: 0,
      steps: []
    },
    step: {
      id: "setup",
      kind: "form",
      title: "Task setup",
      values: {
        platform: "canada-assisted",
        workflowId: "newFeatureWorkflow",
        epic: "PLAT-1234",
        featureStory: "",
        baseBranch: "develop",
        services: [
          "pis"
        ],
        workDir: "/Users/you/work"
      },
      errors: {
        featureStory: "Enter a story key such as PLAT-1234"
      },
      fields: [
        {
          id: "platform",
          type: "select",
          label: "Platform",
          options: [
            {
              value: "canada-assisted",
              label: "Canada Assisted Platform"
            },
            {
              value: "canada-self-serve",
              label: "Canada Self-serve Platform"
            },
            {
              value: "us-assisted",
              label: "US Assisted Platform"
            },
            {
              value: "us-self-serve",
              label: "US Self-serve Platform"
            }
          ]
        },
        {
          id: "epic",
          type: "text",
          label: "Epic",
          required: true
        },
        {
          id: "workflowId",
          type: "select",
          label: "Task type",
          options: [
            {
              value: "researchTaskWorkflow",
              label: "Research Task"
            },
            {
              value: "newFeatureWorkflow",
              label: "New Feature Workflow"
            }
          ]
        },
        {
          id: "featureStory",
          type: "text",
          label: "Feature story",
          required: true
        },
        {
          id: "baseBranch",
          type: "text",
          label: "Base branch",
          required: true
        },
        {
          id: "services",
          type: "multiselect",
          label: "Microservices",
          required: true,
          options: [
            {
              value: "ris",
              label: "reference-data-service (ris)"
            },
            {
              value: "pis",
              label: "party-service (pis)"
            },
            {
              value: "aos",
              label: "application-onboarding (aos)"
            }
          ]
        }
      ],
      actions: [
        {
          id: "start",
          label: "Start task",
          primary: true
        }
      ]
    },
    footer: {
      title: "Work directory",
      fields: [
        {
          id: "workDir",
          type: "text",
          label: "Where repositories are cloned",
          required: true
        }
      ],
      actions: [
        {
          id: "browse",
          label: "Browse\u2026"
        }
      ]
    }
  };

  // webview/fixtures/dev.ts
  var FIXTURES = {
    "workflow (middle pane)": { kind: "workflow", data: workflow_default },
    "setup form (sidebar)": { kind: "single", data: form_step_default }
  };
  var root = document.getElementById("root");
  var picker = document.getElementById("fixture");
  for (const name of Object.keys(FIXTURES)) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    picker.append(opt);
  }
  function show(name) {
    const fixture = FIXTURES[name];
    if (!fixture) return;
    if (fixture.kind === "workflow") {
      renderWorkflow(
        fixture.data,
        root,
        (stepId, actionId, values) => console.log("step:", stepId, "action:", actionId, "values:", values)
      );
    } else {
      renderStep(
        fixture.data,
        root,
        (actionId, values) => console.log("action:", actionId, "values:", values)
      );
    }
  }
  picker.addEventListener("change", () => show(picker.value));
  show(picker.value || "workflow (middle pane)");
})();
//# sourceMappingURL=dev.js.map
