// ── Theme toggle (Light / Dark) ─────────────────
(function() {
  var STORAGE_KEY = "lp-theme";
  var html = document.documentElement;
  var btn = document.getElementById("theme-toggle");
  var icon = document.getElementById("theme-icon");

  function readInitial() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "dark" || saved === "base") return saved;
    } catch (e) {}
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "base";
  }

  function apply(theme) {
    html.setAttribute("data-theme", theme);
    if (icon) icon.textContent = theme === "dark" ? "☾" : "☀";
    if (btn) btn.setAttribute("aria-label", theme === "dark" ? "ライトモードに切替" : "ダークモードに切替");
  }

  var current = readInitial();
  apply(current);

  if (btn) {
    btn.addEventListener("click", function() {
      current = current === "dark" ? "base" : "dark";
      apply(current);
      try { localStorage.setItem(STORAGE_KEY, current); } catch (e) {}
    });
  }
})();

// ── Hero topic switcher (議題切替＋フェード) ────
(function() {
  var TOPICS = [
    {
      topic:   "「30代会社員、副業で起業すべきか?」",
      claude:  "あなたの価値観を踏まえると、起業の方が後悔しないと思う。長期の自由度を最重視している点が決め手です。",
      chatgpt: "いや、収入の安定性を軽視しすぎだ。最低6ヶ月の生活防衛資金を確保した上で判断するべき。",
      gemini:  "2人とも前提を見落としている。家族の状況と健康保険の切替コストを先に検討するべきです。",
      summary: "3者は「タイミング」で合意。「優先順位」で対立 (価値観 vs 安定性 vs 家族要因)。"
    },
    {
      topic:   "「5年同棲、結婚すべきか同棲を続けるか?」",
      claude:  "結婚を推奨。法的保護と社会的信用が5年後10年後に効きます。価値観が合っているなら早い方が得策です。",
      chatgpt: "急ぐ理由がないなら同棲継続でいい。結婚は「やり直しが難しい契約」。今に不満がないなら現状維持が合理的。",
      gemini:  "二者択一が論点を狭めています。「事実婚 + 公正証書」「結婚 + 別居婚」など中間解の検討が抜けています。",
      summary: "Claude=結婚推奨。ChatGPT=現状維持。Gemini=中間解の検討漏れを指摘。価値観で割れる典型例。"
    },
    {
      topic:   "「住宅ローンは固定金利か変動金利か?」",
      claude:  "あなたの年齢と返済期間なら変動を推奨。過去20年で固定が変動より得だった期間は皆無。期待値で選ぶべきです。",
      chatgpt: "リスク許容度次第。返済が長く家計に余裕がないなら、固定で「最大支払額を確定」する安心料を払う価値あり。",
      gemini:  "金利上昇シナリオの定量分析が必要です。日銀の利上げ余地と、あなたの繰上返済余力で答えが変わります。",
      summary: "Claude=変動。ChatGPT=家計次第で固定。Gemini=シナリオ分析推奨。前提条件の明示が論点。"
    },
    {
      topic:   "「今の会社で昇進待ち vs 転職、どちらが得か?」",
      claude:  "転職を推奨。社内の昇進は不確実性が高く、市場価値は転職時に最も正確に評価される。タイミングを逃すべきでない。",
      chatgpt: "現職での昇進待ちの方が合理的。社内評価が高いなら、転職に伴う再評価リスクと年収一時低下を回避できる。",
      gemini:  "「市場価値の棚卸し」を先に。転職活動だけ進めて内定を取り、現職と比較するのが情報非対称を解消する最短手。",
      summary: "Claude=転職推奨。ChatGPT=現職継続。Gemini=情報収集の手順を提案。決断より「比較材料の入手」が先。"
    }
  ];

  var hero = document.querySelector(".hero");
  if (!hero) return;
  var dialogue = hero.querySelector(".dialogue");
  var tabs = hero.querySelectorAll(".hero-topics .topic-tab");
  if (!dialogue || !tabs.length) return;

  var slots = {
    topic:   dialogue.querySelector('[data-slot="topic"]'),
    claude:  dialogue.querySelector('[data-slot="claude"]'),
    chatgpt: dialogue.querySelector('[data-slot="chatgpt"]'),
    gemini:  dialogue.querySelector('[data-slot="gemini"]'),
    summary: dialogue.querySelector('[data-slot="summary"]')
  };

  function apply(idx) {
    var t = TOPICS[idx];
    if (!t) return;
    dialogue.classList.add("is-switching");
    setTimeout(function() {
      if (slots.topic)   slots.topic.textContent   = t.topic;
      if (slots.claude)  slots.claude.textContent  = t.claude;
      if (slots.chatgpt) slots.chatgpt.textContent = t.chatgpt;
      if (slots.gemini)  slots.gemini.textContent  = t.gemini;
      if (slots.summary) slots.summary.textContent = t.summary;
      dialogue.classList.remove("is-switching");
    }, 150);
  }

  tabs.forEach(function(btn) {
    btn.addEventListener("click", function() {
      tabs.forEach(function(b) { b.setAttribute("aria-selected", "false"); });
      btn.setAttribute("aria-selected", "true");
      var idx = parseInt(btn.getAttribute("data-topic-idx"), 10);
      apply(isNaN(idx) ? 0 : idx);
    });
  });
})();

// ── Trial: ログイン不要お試し ───────────────────
(function() {
  var launchBtn  = document.getElementById("trial-launch-btn");
  var panel      = document.getElementById("trial-panel");
  var closeBtn   = document.getElementById("trial-close-btn");
  var runBtn     = document.getElementById("trial-run-btn");
  var status     = document.getElementById("trial-status");
  var followup   = document.getElementById("trial-followup");
  if (!launchBtn || !panel || !runBtn) return;

  var topicBtns = panel.querySelectorAll(".trial-topic-pill");
  var slots = {
    claude:  panel.querySelector('[data-trial-slot="claude"]'),
    chatgpt: panel.querySelector('[data-trial-slot="chatgpt"]'),
    gemini:  panel.querySelector('[data-trial-slot="gemini"]'),
  };
  var selectedTopic = 0;
  var running = false;
  var turnstileToken = null;
  var turnstileWidgetId = null;
  var turnstileMount = document.getElementById("trial-turnstile");

  function siteKey() {
    var meta = document.querySelector('meta[name="turnstile-site-key"]');
    return meta && meta.getAttribute("content");
  }

  function setRunEnabled(enabled) {
    runBtn.disabled = !enabled || running;
  }

  function renderTurnstileIfReady() {
    if (turnstileWidgetId !== null) return;
    if (!window.turnstile || !turnstileMount) return;
    var key = siteKey();
    if (!key) return;
    turnstileWidgetId = window.turnstile.render(turnstileMount, {
      sitekey: key,
      theme: "auto",
      callback: function(token) {
        turnstileToken = token;
        setRunEnabled(true);
        status.textContent = "準備完了。議題を選んで「議論開始」をクリックしてください。";
      },
      "expired-callback": function() {
        turnstileToken = null;
        setRunEnabled(false);
        status.textContent = "認証が期限切れになりました。再認証中…";
      },
      "error-callback": function() {
        turnstileToken = null;
        setRunEnabled(false);
        status.textContent = "認証に失敗しました。ページを更新してお試しください。";
      },
    });
  }

  function openPanel() {
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    launchBtn.setAttribute("aria-expanded", "true");
    panel.scrollIntoView({ behavior: "smooth", block: "center" });
    if (window.turnstile) {
      renderTurnstileIfReady();
    } else {
      // Turnstile script の読み込みを待つ
      status.textContent = "認証コンポーネントを読み込み中…";
      var interval = setInterval(function() {
        if (window.turnstile) {
          clearInterval(interval);
          renderTurnstileIfReady();
        }
      }, 100);
      setTimeout(function() {
        clearInterval(interval);
        if (turnstileWidgetId === null) {
          status.textContent = "認証コンポーネントの読み込みに失敗しました。広告ブロッカーやネットワーク制限を解除してページを再読込してください。";
        }
      }, 8000);
    }
  }
  function closePanel() {
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    launchBtn.setAttribute("aria-expanded", "false");
    launchBtn.focus();
  }

  launchBtn.addEventListener("click", openPanel);
  closeBtn.addEventListener("click", closePanel);

  topicBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      if (running) return;
      topicBtns.forEach(function(b) { b.setAttribute("aria-pressed", "false"); });
      btn.setAttribute("aria-pressed", "true");
      selectedTopic = parseInt(btn.getAttribute("data-trial-topic"), 10) || 0;
    });
  });

  function resetSlots(message) {
    Object.keys(slots).forEach(function(p) {
      var slot = slots[p];
      if (!slot) return;
      slot.classList.add("is-waiting");
      slot.classList.remove("is-done");
      var body = slot.querySelector(".trial-result-body");
      if (body) {
        body.textContent = message;
        body.classList.add("placeholder");
      }
    });
  }

  function setSlotResponse(provider, text, isError) {
    var slot = slots[provider];
    if (!slot) return;
    slot.classList.remove("is-waiting");
    if (!isError) slot.classList.add("is-done");
    var body = slot.querySelector(".trial-result-body");
    if (body) {
      body.textContent = text;
      body.classList.remove("placeholder");
    }
  }

  async function runTrial() {
    if (running) return;
    if (!turnstileToken) {
      status.textContent = "認証が完了していません。少々お待ちください。";
      return;
    }
    running = true;
    runBtn.disabled = true;
    runBtn.textContent = "議論中…";
    followup.classList.remove("is-visible");
    resetSlots("思考中…");
    status.textContent = "3つのAIに同時に問いを投げています…";

    var tokenForThisRun = turnstileToken;
    turnstileToken = null; // ワンタイム使い切り

    try {
      var res = await fetch("/api/trial/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: selectedTopic, turnstileToken: tokenForThisRun }),
      });

      if (res.status === 429) {
        var errJson = await res.json().catch(function() { return {}; });
        status.textContent = errJson.error || "本日のお試し上限に達しました。";
        resetSlots("お試し上限に達したため、応答を取得できません。");
        followup.classList.add("is-visible");
        return;
      }
      if (!res.ok) {
        status.textContent = "エラーが発生しました（HTTP " + res.status + "）。時間を置いて再度お試しください。";
        resetSlots("応答取得に失敗しました。");
        return;
      }
      if (!res.body) {
        status.textContent = "応答ストリームを取得できませんでした。";
        return;
      }

      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";

      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });

        var lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (!line.startsWith("data: ")) continue;
          var payloadStr = line.slice(6).trim();
          if (!payloadStr) continue;
          try {
            var payload = JSON.parse(payloadStr);
            if (payload.type === "start") {
              status.textContent = "議題: " + payload.topic + " · 残り " + (payload.remaining ?? 0) + " 回";
            } else if (payload.type === "response") {
              setSlotResponse(payload.provider, payload.text || "（応答なし）", !!payload.error);
            } else if (payload.type === "done") {
              status.textContent = "議論完了。続きはログインで！";
              followup.classList.add("is-visible");
            }
          } catch (_) { /* JSON 不正は無視 */ }
        }
      }
    } catch (e) {
      status.textContent = "通信エラーが発生しました。時間を置いて再度お試しください。";
      resetSlots("応答取得に失敗しました。");
    } finally {
      running = false;
      runBtn.textContent = "もう一度試す →";
      // Turnstile を reset してワンタイム新トークンを取得（再認証成功で run ボタン再有効化）
      if (window.turnstile && turnstileWidgetId !== null) {
        try { window.turnstile.reset(turnstileWidgetId); } catch (_) {}
      }
      setRunEnabled(false); // 新トークン到着までは無効
    }
  }

  runBtn.addEventListener("click", runTrial);
})();

// ── Sticky mobile CTA visibility ────────────────
(function() {
  var cta = document.getElementById("mobile-cta");
  if (!cta) return;
  var hero = document.querySelector(".hero");
  if (!hero) return;

  function update() {
    var rect = hero.getBoundingClientRect();
    var heroBottom = rect.bottom;
    // Show after user scrolls past the hero, hide near the end of page
    var nearEnd = (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 100);
    if (heroBottom < 0 && !nearEnd) {
      cta.classList.add("visible");
      cta.removeAttribute("aria-hidden");
    } else {
      cta.classList.remove("visible");
      cta.setAttribute("aria-hidden", "true");
    }
  }

  var ticking = false;
  window.addEventListener("scroll", function() {
    if (!ticking) {
      window.requestAnimationFrame(function() { update(); ticking = false; });
      ticking = true;
    }
  }, { passive: true });
  update();
})();
