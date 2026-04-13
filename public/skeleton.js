(function(){
  var themes = {
    dark:     { bg: "#1a1814", text: "#f0ece4" },
    base:     { bg: "#f5f0e8", text: "#2a2520" },
    feminine: { bg: "#fdf2f8", text: "#4a2040" }
  };
  var t = themes[localStorage.getItem("ai-discussion-theme")] || themes.dark;
  var el = document.querySelector(".sk");
  if (el) {
    el.style.background = t.bg;
    el.style.color = t.text;
  }
})();
