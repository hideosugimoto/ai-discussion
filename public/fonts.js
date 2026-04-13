(function(){
  var fonts = [
    ["preconnect", "https://fonts.googleapis.com"],
    ["preconnect", "https://fonts.gstatic.com"],
    ["stylesheet", "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Noto+Sans+JP:wght@400;500;700&display=swap"]
  ];
  fonts.forEach(function(f){
    var l = document.createElement("link");
    l.rel = f[0];
    l.href = f[1];
    if (f[0] === "preconnect" && f[1].indexOf("gstatic") > -1) l.crossOrigin = "";
    document.head.appendChild(l);
  });
})();
