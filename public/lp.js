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
