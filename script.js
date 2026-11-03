(function () {
  // ---- Fact labels and form layout ----
  var LABEL = {
    breathing_difficulty: "breathing difficulty", chest_pain: "chest pain", severe_bleeding: "severe bleeding",
    fever: "fever", high_fever: "high fever", chills: "chills", sweating: "sweating", loss_of_taste: "loss of taste",
    mosquito_exposure: "mosquito exposure", cough: "cough", sore_throat: "sore throat", sneezing: "sneezing",
    runny_nose: "runny nose", rash: "rash", joint_pain: "joint pain", persistent_vomiting: "persistent vomiting",
    abdominal_pain: "abdominal pain", high_risk: "high-risk patient",
    suspected_dengue: "suspected dengue", suspected_malaria: "suspected malaria", suspected_covid19: "suspected COVID-19",
    level_emergency: "level Emergency", level_urgent: "level Urgent", level_routine: "level Routine", level_self_care: "level Self-care"
  };

  var FORM = {
    red: [["breathing_difficulty", "Difficulty breathing"], ["chest_pain", "Chest pain"], ["severe_bleeding", "Severe bleeding"]],
    fever: [["fever", "Fever", "Any temperature above normal"], ["high_fever", "High fever", "About 39 °C / 102 °F or above"],
            ["chills", "Chills"], ["sweating", "Sweating"], ["loss_of_taste", "Loss of taste"], ["mosquito_exposure", "Recent mosquito exposure"]],
    resp: [["cough", "Cough"], ["sore_throat", "Sore throat"], ["sneezing", "Sneezing"], ["runny_nose", "Runny nose"]],
    body: [["rash", "Rash"], ["joint_pain", "Joint pain"], ["persistent_vomiting", "Persistent vomiting"], ["abdominal_pain", "Abdominal pain"]],
    who: [["high_risk", "High-risk patient", "Infant, elderly, pregnant or chronic illness"]]
  };

  // ---- Knowledge base: rules are data, the engine below never changes ----
  // Rule fields: all = every fact needed, any = at least one needed, none = must be absent.
  var RULES = [
    { id: "R1",  all: ["high_fever"], then: "fever" },
    { id: "R2",  all: ["breathing_difficulty"], then: "level_emergency" },
    { id: "R3",  all: ["chest_pain"], then: "level_emergency" },
    { id: "R4",  all: ["severe_bleeding"], then: "level_emergency" },
    { id: "R5",  all: ["high_fever", "rash", "joint_pain", "mosquito_exposure"], then: "suspected_dengue" },
    { id: "R6",  all: ["fever", "chills", "sweating", "mosquito_exposure"], then: "suspected_malaria" },
    { id: "R7",  all: ["fever", "cough", "loss_of_taste"], then: "suspected_covid19" },
    { id: "R8",  any: ["suspected_dengue", "suspected_malaria", "suspected_covid19"], then: "level_urgent" },
    { id: "R9",  all: ["persistent_vomiting", "abdominal_pain"], then: "level_urgent" },
    { id: "R10", all: ["fever", "high_risk"], then: "level_urgent" },
    { id: "R11", all: ["fever"], any: ["cough", "sore_throat"], then: "level_routine" },
    { id: "R12", all: ["sneezing", "runny_nose"], none: ["fever"], then: "level_self_care" }
  ];

  var LEVELS = {
    level_emergency: { rank: 4, name: "Emergency", cls: "emergency", action: "Send to the emergency room now." },
    level_urgent:    { rank: 3, name: "Urgent", cls: "urgent", action: "Patient should see a doctor today." },
    level_routine:   { rank: 2, name: "Routine", cls: "routine", action: "Book a normal appointment." },
    level_self_care: { rank: 1, name: "Self-care", cls: "selfcare", action: "Rest and drink fluids. See a doctor if symptoms get worse." }
  };

  var SAMPLES = [
    { name: "P1 Cold", facts: ["sneezing", "runny_nose", "sore_throat"] },
    { name: "P2 Flu", facts: ["high_fever", "cough", "sore_throat"] },
    { name: "P3 Dengue", facts: ["high_fever", "rash", "joint_pain", "mosquito_exposure"] },
    { name: "P4 Malaria", facts: ["fever", "chills", "sweating", "mosquito_exposure"] },
    { name: "P5 COVID-19", facts: ["fever", "cough", "loss_of_taste"] },
    { name: "Chest pain", facts: ["chest_pain"] },
    { name: "Infant with fever", facts: ["fever", "high_risk"] }
  ];

  // ---- Helpers ----
  function lab(f) { return LABEL[f] || f; }

  function describe(r) {
    var parts = [];
    if (r.all) parts.push(r.all.map(lab).join(" AND "));
    if (r.any) parts.push("(" + r.any.map(lab).join(" OR ") + ")");
    if (r.none) parts.push("NOT " + r.none.map(lab).join(" AND NOT "));
    return parts.join(" AND ");
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ---- Inference engine: forward chaining ----
  // R1 is listed first so that "fever" is derived before the NOT fever test in R12 runs.
  function infer(given) {
    var wm = {};
    given.forEach(function (f) { wm[f] = true; });
    var fired = [], pass = 0, changed = true;

    while (changed) {
      changed = false;
      pass++;
      RULES.forEach(function (r) {
        if (fired.some(function (x) { return x.rule.id === r.id; })) return;
        var allOk = (r.all || []).every(function (f) { return wm[f]; });
        var anyOk = !r.any || r.any.some(function (f) { return wm[f]; });
        var noneOk = (r.none || []).every(function (f) { return !wm[f]; });
        if (allOk && anyOk && noneOk) {
          var used = (r.all || []).concat(r.any ? r.any.filter(function (f) { return wm[f]; }) : []);
          fired.push({ rule: r, pass: pass, used: used });
          if (!wm[r.then]) { wm[r.then] = true; changed = true; }
        }
      });
    }

    // Conflict resolution: highest-priority level in working memory wins
    var best = null;
    Object.keys(wm).forEach(function (f) {
      if (LEVELS[f] && (!best || LEVELS[f].rank > LEVELS[best].rank)) best = f;
    });
    return { wm: wm, fired: fired, level: best };
  }

  // ---- Build the form ----
  document.querySelectorAll("[data-group]").forEach(function (box) {
    FORM[box.getAttribute("data-group")].forEach(function (item) {
      var label = el("label", "check");
      var input = document.createElement("input");
      input.type = "checkbox";
      input.id = "f-" + item[0];
      input.value = item[0];
      var span = el("span", null, item[1]);
      if (item[2]) span.appendChild(el("small", null, item[2]));
      label.appendChild(input);
      label.appendChild(span);
      box.appendChild(label);
    });
  });

  var boxes = Array.prototype.slice.call(document.querySelectorAll("#form input"));
  function selected() { return boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; }); }
  function setFacts(list) { boxes.forEach(function (b) { b.checked = list.indexOf(b.value) !== -1; }); }

  // ---- Sample buttons ----
  var sampleBtns = [];
  SAMPLES.forEach(function (s) {
    var b = el("button", "chip-btn", s.name);
    b.type = "button";
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", function () { setFacts(s.facts); render(); });
    document.getElementById("samples").appendChild(b);
    sampleBtns.push({ btn: b, sample: s });
  });

  function markSamples(cur) {
    sampleBtns.forEach(function (x) {
      var a = x.sample.facts.slice().sort().join("|");
      var c = cur.slice().sort().join("|");
      x.btn.setAttribute("aria-pressed", a === c ? "true" : "false");
    });
  }

  // ---- Knowledge base table ----
  var kbBody = document.getElementById("kb-body");
  RULES.forEach(function (r) {
    var tr = document.createElement("tr");
    tr.id = "kb-" + r.id;
    tr.appendChild(el("td", "id", r.id));
    tr.appendChild(el("td", null, describe(r)));
    tr.appendChild(el("td", null, lab(r.then)));
    kbBody.appendChild(tr);
  });

  // ---- Render the decision and the explanation ----
  var out = document.getElementById("out");

  function render() {
    var given = selected();
    markSamples(given);
    var res = infer(given);
    out.textContent = "";

    var card = el("div", "level");

    if (!given.length) {
      card.className = "level none";
      card.appendChild(el("p", "tag", "No report yet"));
      card.appendChild(el("div", "name", "Waiting"));
      card.appendChild(el("p", "action", "Tick at least one symptom or load a sample patient."));
      out.appendChild(card);
      document.querySelectorAll("#kb-body tr").forEach(function (tr) { tr.classList.remove("fired"); });
      return;
    }

    var info = res.level ? LEVELS[res.level] : LEVELS.level_routine;
    card.className = "level " + info.cls;
    card.appendChild(el("p", "tag", "Triage level"));
    var name = el("div", "name", info.name);
    name.appendChild(el("span", "prio", "Priority " + info.rank + " of 4"));
    card.appendChild(name);
    card.appendChild(el("p", "action", res.level ? info.action : "No triage rule matched these facts, so the safe default applies. " + info.action));
    out.appendChild(card);

    // Explanation: which rules fired and why
    out.appendChild(el("h3", null, "Why this decision?"));
    var ol = el("ol", "why");
    if (!res.fired.length) {
      ol.appendChild(el("li", null, "No rule matched the reported facts."));
    }
    res.fired.forEach(function (f) {
      var li = document.createElement("li");
      var meta = el("div", "meta");
      meta.appendChild(el("b", null, f.rule.id));
      meta.appendChild(el("span", null, "pass " + f.pass));
      li.appendChild(meta);

      var g = el("div", "gives");
      var because = f.used.map(lab).join(" + ");
      if (f.rule.none) because += (because ? " + " : "") + "no " + f.rule.none.map(lab).join(", no ");
      g.appendChild(document.createTextNode(because + " → "));
      g.appendChild(el("code", null, lab(f.rule.then)));
      li.appendChild(g);
      ol.appendChild(li);
    });
    out.appendChild(ol);

    // Working memory
    out.appendChild(el("h3", null, "Working memory"));
    var mem = el("ul", "mem");
    Object.keys(res.wm).forEach(function (f) {
      var li = el("li", given.indexOf(f) === -1 ? "derived" : "given");
      li.appendChild(el("code", null, lab(f)));
      mem.appendChild(li);
    });
    out.appendChild(mem);
    out.appendChild(el("p", "note",
      "Light chips were reported. Dark chips were derived by rules. When several levels appear, the highest priority wins. " +
      (RULES.length - res.fired.length) + " of " + RULES.length + " rules did not fire."));

    // Highlight fired rules in the knowledge base table
    var firedIds = res.fired.map(function (f) { return f.rule.id; });
    RULES.forEach(function (r) {
      document.getElementById("kb-" + r.id).classList.toggle("fired", firedIds.indexOf(r.id) !== -1);
    });
  }

  // ---- Wire up events and start ----
  boxes.forEach(function (b) { b.addEventListener("change", render); });
  document.getElementById("clear").addEventListener("click", function () { setFacts([]); render(); });
  setFacts(SAMPLES[2].facts);
  render();
})();