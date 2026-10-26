// Runs before first paint (external file: the production CSP forbids inline scripts).
try {
  var pref = localStorage.getItem("lab-theme") || "system";
  var dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
} catch (e) { document.documentElement.dataset.theme = "dark"; }
