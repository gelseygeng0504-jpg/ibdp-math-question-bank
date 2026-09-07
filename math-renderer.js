// This file connects the website to local KaTeX math rendering.

function appendMathText(parent, text) {
  const boldPattern = /\*\*([\s\S]*?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = boldPattern.exec(text)) !== null) {
    parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));

    const strong = document.createElement("strong");
    strong.textContent = match[1];
    parent.appendChild(strong);

    lastIndex = boldPattern.lastIndex;
  }

  parent.appendChild(document.createTextNode(text.slice(lastIndex)));
}

function renderLocalMath(element) {
  if (typeof renderMathInElement !== "function") {
    return;
  }

  renderMathInElement(element, {
    delimiters: [
      { left: "\\(", right: "\\)", display: false },
      { left: "\\[", right: "\\]", display: true }
    ],
    throwOnError: false
  });
}
