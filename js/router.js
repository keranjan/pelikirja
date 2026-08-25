// Kevyt reititys: näkymät navigoivat tämän kautta, jolloin ne eivät riipu app.js:stä.
let renderer = () => {};

export const setRenderer = (fn) => { renderer = fn; };

export function navigate(hash) {
  if (location.hash === hash) renderer();
  else location.hash = hash;
}
