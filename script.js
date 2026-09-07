// This file controls the website behavior, such as filters and buttons.

// Keep all questions in data.js while temporarily hiding selected exam years.
// Remove a year from this set whenever its questions should become visible again.
const hiddenExamYears = new Set([2023, 2024, 2025]);
const visibleQuestions = questions.filter(function(question) {
  return !hiddenExamYears.has(question.examYear);
});

const indexPanel = document.querySelector(".index-panel");
const questionList = document.querySelector("#question-list");
const questionIndexToggleButton = document.querySelector("#question-index-toggle");
const questionIndexPopover = document.querySelector("#question-index-popover");
const currentQuestionIndicator = document.querySelector("#current-question-indicator");
const studyView = document.querySelector("#study-view");
const selectionToggleButton = document.querySelector("#selection-toggle");
const answerModal = document.querySelector("#answer-modal");
const answerModalTitle = document.querySelector("#answer-modal-title");
const answerModalQuestion = document.querySelector("#answer-modal-question");
const answerModalAnswer = document.querySelector("#answer-modal-answer");
const answerModalCloseButton = document.querySelector("#answer-modal-close");
const markedModal = document.querySelector("#marked-modal");
const markedModalSummary = document.querySelector("#marked-modal-summary");
const markedModalList = document.querySelector("#marked-modal-list");
const markedModalCloseButton = document.querySelector("#marked-modal-close");
const exportBar = document.querySelector("#export-bar");
const selectAllCurrentButton = document.querySelector("#select-all-current");
const exportModal = document.querySelector("#export-modal");
const exportModalSummary = document.querySelector("#export-modal-summary");
const exportModalList = document.querySelector("#export-modal-list");
const exportModalPreview = document.querySelector("#export-modal-preview");
const exportCancelButton = document.querySelector("#export-cancel");
const exportPdfButton = document.querySelector("#export-pdf");
const exportWordButton = document.querySelector("#export-word");
const exportFileNameInput = document.querySelector("#export-file-name");
const includeAnswersCheckbox = document.querySelector("#include-answers");
let pendingExportQuestions = [];
let exportReviewQuestions = [];
let exportReviewIncludedIds = new Set();
let activeExportReviewQuestionId = "";
const topicFilter = document.querySelector("#topic-filter");
const goToQuestionSelect = document.querySelector("#go-to-question");
const paperFilterInputs = document.querySelectorAll('input[name="paper-filter"]');
const difficultyFilterInputs = document.querySelectorAll('input[name="difficulty-filter"]');
const filterClearButtons = document.querySelectorAll(".filter-clear");

let currentFilteredQuestions = [];
let selectedQuestionIndex = -1;
let selectionMode = false;
let answerModalTrigger = null;
const selectedQuestionIds = new Set();
const markedQuestionIds = new Set(loadMarkedQuestionIds());

function addOptions(selectElement, values) {
  values.forEach(function(value) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectElement.appendChild(option);
  });
}

function getUniqueValues(fieldName) {
  const values = visibleQuestions.map(function(question) {
    return question[fieldName];
  });

  return [...new Set(values)];
}

function appendFormattedMathText(parent, text) {
  const displayMathPattern = /\\\[[\s\S]*?\\\]/g;
  let lastIndex = 0;
  let match;

  function isMarkCode(value) {
    return /^\(?(?:[MAR]\d+(?:[MAR]\d+)*|AG|FT|CAO|OE|ISW|N\d+|G\d+)\)?$/.test(value.trim());
  }

  function splitTrailingLineMark(line) {
    const scorePattern = "\\[(?:\\d+)(?:\\s+marks?)?\\]";
    const codePattern = "(?:\\(?[MAR]\\d+(?:[MAR]\\d+)*\\)?|\\(?AG\\)?|\\(?FT\\)?|\\(?CAO\\)?|\\(?OE\\)?|\\(?ISW\\)?|\\(?N\\d+\\)?|\\(?G\\d+\\)?)";
    const trailingPattern = new RegExp("^(.*?)(?:\\s+)?(" + codePattern + "(?:\\s+" + scorePattern + ")?|" + scorePattern + ")\\s*$");
    const trailingMatch = line.match(trailingPattern);

    if (!trailingMatch) {
      return null;
    }

    return {
      content: trailingMatch[1].trimEnd(),
      mark: trailingMatch[2]
    };
  }

  function splitTrailingDisplayMark(displayText) {
    const innerMath = displayText.slice(2, -2);
    const trailingMatch = innerMath.match(/^([\s\S]*?)(?:\\qquad\s*)?\\text\{([^{}]+)\}\s*$/);

    if (!trailingMatch || !isMarkCode(trailingMatch[2])) {
      return null;
    }

    return {
      math: "\\[" + trailingMatch[1].trimEnd() + "\\]",
      mark: trailingMatch[2].trim()
    };
  }

  function alignLeadingEquals(displayText) {
    const innerMath = displayText.slice(2, -2);

    if (innerMath.includes("\\begin{aligned}")) {
      return displayText.replace(/\\\\(?!\[)(?=\s*\n)/g, "\\\\[1em]");
    }

    const lines = innerMath.split("\n").map(function(line) {
      return line.trim();
    }).filter(function(line) {
      return line !== "";
    });

    if (lines.length < 2 || !lines.slice(1).every(function(line) {
      return line.startsWith("=");
    })) {
      return displayText;
    }

    if (lines.length === 2) {
      return "\\[\n"
        + lines[0]
        + " "
        + lines[1]
        + "\n\\]";
    }

    const alignedLines = [
      lines[0] + " &" + lines[1]
    ].concat(lines.slice(2).map(function(line) {
      return "&" + line;
    })).join("\\\\[1em]\n");

    return "\\[\n\\begin{aligned}\n"
      + alignedLines
      + "\n\\end{aligned}\n\\]";
  }

  function createMarkElement(markText, extraClassName) {
    const markElement = document.createElement("span");
    markElement.className = "mark-token" + (extraClassName ? " " + extraClassName : "");
    markElement.textContent = markText;
    return markElement;
  }

  function isMarkdownTableLine(line) {
    const trimmedLine = line.trim();
    return trimmedLine.startsWith("|") && trimmedLine.endsWith("|") && trimmedLine.includes("|", 1);
  }

  function isTableSeparatorLine(line) {
    return /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|$/.test(line.trim());
  }

  function splitTableRow(line) {
    return line.trim().slice(1, -1).split("|").map(function(cell) {
      return cell.trim();
    });
  }

  function appendTable(tableLines) {
    const tableWrapper = document.createElement("div");
    tableWrapper.className = "table-wrapper";

    const table = document.createElement("table");
    table.className = "data-table";

    tableLines.forEach(function(line, index) {
      if (isTableSeparatorLine(line)) {
        return;
      }

      const row = document.createElement("tr");
      const cellTag = index === 0 ? "th" : "td";

      splitTableRow(line).forEach(function(cellText) {
        const cell = document.createElement(cellTag);
        appendMathText(cell, cellText);
        row.appendChild(cell);
      });

      table.appendChild(row);
    });

    tableWrapper.appendChild(table);
    parent.appendChild(tableWrapper);
  }

  function appendLine(line) {
    const trimmedLine = line.trim();
    const guideMatch = trimmedLine.match(/^\*\*Guide:\*\*\s+(.+)$/);
    const stepMatch = trimmedLine.match(/^\*\*(Step\s+\d+:\s*.+)\*\*$/);
    const conclusionMatch = trimmedLine.match(/^\*\*Conclusion:\*\*\s+(.+)$/);
    const noteMatch = trimmedLine.match(/^>\s+\*\*Note:\*\*\s+(.+)$/);

    if (guideMatch) {
      const guideElement = document.createElement("div");
      guideElement.className = "student-guide";
      appendMathText(guideElement, guideMatch[1]);
      parent.appendChild(guideElement);
      return;
    }

    if (stepMatch) {
      const stepElement = document.createElement("div");
      stepElement.className = "answer-step-heading";
      appendMathText(stepElement, stepMatch[1]);
      parent.appendChild(stepElement);
      return;
    }

    if (conclusionMatch) {
      const conclusionElement = document.createElement("div");
      conclusionElement.className = "answer-conclusion final-answer";
      appendMathText(conclusionElement, conclusionMatch[1]);
      parent.appendChild(conclusionElement);
      return;
    }

    if (noteMatch) {
      const noteElement = document.createElement("blockquote");
      noteElement.className = "examiner-note";
      const noteLabel = document.createElement("strong");
      noteLabel.textContent = "Note: ";
      noteElement.appendChild(noteLabel);
      appendMathText(noteElement, noteMatch[1]);
      parent.appendChild(noteElement);
      return;
    }

    const lineElement = document.createElement("div");
    const trailingMark = splitTrailingLineMark(line);

    if (line.trim().startsWith("Final answer:")) {
      lineElement.className = "final-answer";
    }

    if (trailingMark) {
      lineElement.classList.add("line-with-mark");

      const lineContent = document.createElement("span");
      lineContent.className = "line-content";
      appendMathText(lineContent, trailingMark.content);

      lineElement.appendChild(lineContent);
      lineElement.appendChild(createMarkElement(trailingMark.mark));
    } else {
      appendMathText(lineElement, line);
    }

    parent.appendChild(lineElement);
  }

  function appendPlainText(plainText) {
    const normalizedText = plainText
      .replace(/^\n/, "")
      .replace(/\n$/, "");

    if (normalizedText === "") {
      return;
    }

    const lines = normalizedText.split("\n");
    let tableLines = [];

    function flushTable() {
      if (tableLines.length > 0) {
        appendTable(tableLines);
        tableLines = [];
      }
    }

    lines.forEach(function(line, index) {
      const imageMatch = line.trim().match(/^!\[([^\]]+)\]\(([^)]+)\)$/);

      if (imageMatch) {
        flushTable();

        const image = document.createElement("img");
        image.className = "graph-image answer-inline-image";
        image.src = imageMatch[2];
        image.alt = imageMatch[1];
        parent.appendChild(image);
        return;
      }

      if (isMarkdownTableLine(line)) {
        tableLines.push(line);
        return;
      }

      flushTable();

      if (line !== "" || index < lines.length - 1) {
        appendLine(line);
      }
    });

    flushTable();
  }

  while ((match = displayMathPattern.exec(text)) !== null) {
    appendPlainText(text.slice(lastIndex, match.index));

    const displayMark = splitTrailingDisplayMark(match[0]);

    if (displayMark) {
      const mathRow = document.createElement("div");
      mathRow.className = "display-math-with-mark";

      const mathElement = document.createElement("div");
      mathElement.className = "display-math-formula";
      appendMathText(mathElement, alignLeadingEquals(displayMark.math));

      mathRow.appendChild(mathElement);
      mathRow.appendChild(createMarkElement(displayMark.mark, "display-math-mark"));
      parent.appendChild(mathRow);
    } else {
      const mathElement = document.createElement("div");
      appendMathText(mathElement, alignLeadingEquals(match[0]));
      parent.appendChild(mathElement);
    }

    lastIndex = displayMathPattern.lastIndex;
  }

  appendPlainText(text.slice(lastIndex));
}

function appendStructuredAnswerText(parent, text) {
  const partPattern = /^\s*(?:\*\*)?(\([a-z](?:\.[ivx]+)?\)(?:\([ivx]+\))?)(?:\*\*)?\s*/;
  const lines = text.split("\n");
  const parts = [];
  let currentPart = null;
  let preambleLines = [];

  function breakIntroAfterColon(bodyText) {
    const firstLineEnd = bodyText.indexOf("\n");
    const firstLine = firstLineEnd === -1 ? bodyText : bodyText.slice(0, firstLineEnd);
    const remainingText = firstLineEnd === -1 ? "" : bodyText.slice(firstLineEnd);
    const colonIndex = firstLine.indexOf(":");
    const isSemanticParagraph = /^(?:\*\*(?:Guide|Step\s+\d+|Conclusion):|>\s+\*\*Note:)/.test(firstLine.trim());

    if (isSemanticParagraph || colonIndex === -1 || firstLine.slice(colonIndex + 1).trim() === "") {
      return bodyText;
    }

    return firstLine.slice(0, colonIndex + 1)
      + "\n"
      + firstLine.slice(colonIndex + 1).trimStart()
      + remainingText;
  }

  function mergeShortConclusionLines(bodyText) {
    const conclusionPattern = /(^|\n)([^\n]+?)\s*\n\\\[\s*\n?([^\n]+?)\n?\s*\\\]/g;

    return bodyText.replace(conclusionPattern, function(match, prefix, leadIn, formulaLine) {
      const normalizedLeadIn = leadIn.trim();
      const leadMarkMatch = normalizedLeadIn.match(
        /^(.*?)(?:\s+)(\(?[MAR]\d+(?:[MAR]\d+)*\)?|\(?AG\)?|\(?FT\)?|\(?CAO\)?|\(?OE\)?|\(?ISW\)?|\(?N\d+\)?|\(?G\d+\)?)$/
      );
      const leadText = leadMarkMatch ? leadMarkMatch[1].trimEnd() : normalizedLeadIn;
      const leadMark = leadMarkMatch ? leadMarkMatch[2] : "";
      const canJoinFormula = /(?:\bis|\bgives|\bas|since|thus|and|so|therefore,?|hence|then|but)\s*$/i.test(leadText);

      if (!canJoinFormula || leadText.endsWith(":")) {
        return match;
      }

      const trailingMark = formulaLine.match(/^([\s\S]*?)(?:\s*\\qquad\s*)?\\text\{([^{}]+)\}\s*$/);
      let formula = formulaLine.trim();
      let mark = "";

      if (trailingMark && /^(?:\(?(?:[MAR]\d+(?:[MAR]\d+)*|AG|FT|CAO|OE|ISW|N\d+|G\d+)\)?)$/.test(trailingMark[2].trim())) {
        formula = trailingMark[1].trim();
        mark = trailingMark[2].trim();
      }

      if (leadMark !== "" && mark !== "") {
        return match;
      }

      mark = mark || leadMark;

      return prefix
        + leadText
        + " \\("
        + formula
        + "\\)"
        + (mark === "" ? "" : " " + mark);
    });
  }

  function mergeEquivalentAnswerLines(bodyText) {
    const equivalentPattern = /\\\[\s*([\s\S]*?)\s*\\\]\s*\n\s*or equivalently\s+\\\(([\s\S]*?)\\\)\.?\s*(\(?[MAR]\d+(?:[MAR]\d+)*\)?|\(?AG\)?|\(?FT\)?|\(?CAO\)?|\(?OE\)?|\(?ISW\)?|\(?N\d+\)?|\(?G\d+\)?)?(?=\s*(?:\n|$))/gi;

    return bodyText.replace(equivalentPattern, function(match, displayFormula, alternativeFormula, mark) {
      const primaryFormula = displayFormula.trim().replace(/,\s*$/, "");
      const markText = typeof mark === "string" ? mark.replace(/[()]/g, "").trim() : "";

      return "\\[\n"
        + primaryFormula
        + "\\qquad \\textsf{or equivalently}\\qquad "
        + alternativeFormula.trim()
        + "."
        + (markText === "" ? "" : " \\qquad \\text{" + markText + "}")
        + "\n\\]";
    });
  }

  function moveMarkTotalsToOwnLine(bodyText) {
    return bodyText.replace(/[ \t]+(\[\d+\s+marks?\])(?=\s*(?:\n|$))/g, "\n$1");
  }

  function savePreamble() {
    const preamble = preambleLines.join("\n").trim();

    if (preamble !== "") {
      parts.push({
        label: "",
        body: preamble
      });
    }

    preambleLines = [];
  }

  function saveCurrentPart() {
    if (!currentPart) {
      return;
    }

    parts.push({
      label: currentPart.label,
      body: currentPart.lines.join("\n").trim()
    });
    currentPart = null;
  }

  lines.forEach(function(line) {
    const partMatch = line.match(partPattern);

    if (partMatch) {
      if (currentPart) {
        saveCurrentPart();
      } else {
        savePreamble();
      }

      currentPart = {
        label: partMatch[1],
        lines: [line.slice(partMatch[0].length)]
      };
      return;
    }

    if (currentPart) {
      currentPart.lines.push(line);
    } else {
      preambleLines.push(line);
    }
  });

  saveCurrentPart();
  savePreamble();

  const numberedParts = parts.filter(function(part) {
    return part.label !== "";
  });

  if (numberedParts.length === 0) {
    appendFormattedMathText(
      parent,
      moveMarkTotalsToOwnLine(
        mergeEquivalentAnswerLines(mergeShortConclusionLines(breakIntroAfterColon(text)))
      )
    );
    return;
  }

  parts.forEach(function(part) {
    if (part.label === "") {
      const preamble = document.createElement("div");
      preamble.className = "answer-preamble";
      appendFormattedMathText(preamble, part.body);
      parent.appendChild(preamble);
      return;
    }

    const row = document.createElement("section");
    row.className = "answer-part-row";

    const label = document.createElement("div");
    label.className = "answer-part-label";
    label.textContent = part.label;

    const body = document.createElement("div");
    body.className = "answer-part-body";
    const formattedBody = moveMarkTotalsToOwnLine(
      mergeEquivalentAnswerLines(mergeShortConclusionLines(breakIntroAfterColon(part.body)))
    );
    appendFormattedMathText(body, formattedBody);

    row.appendChild(label);
    row.appendChild(body);
    parent.appendChild(row);
  });
}

function getQuestionNumber(question) {
  return visibleQuestions.indexOf(question) + 1;
}

function createSourceLabel(question) {
  if (!question.examYear || !question.examSession || !question.sourceQuestionNumber) return null;
  const label = document.createElement("span");
  label.className = "question-source-label";
  label.textContent = question.examYear + " " + question.examSession + " · "
    + question.paper + " · Question " + question.sourceQuestionNumber;
  label.title = question.sourceReferenceId || label.textContent;
  return label;
}

function getSelectedQuestionsForExport() {
  return visibleQuestions.filter(function(question) {
    return selectedQuestionIds.has(question.id);
  });
}

function loadMarkedQuestionIds() {
  try {
    const storedValue = window.localStorage.getItem("aa-sl-marked-question-ids");
    const parsedValue = storedValue ? JSON.parse(storedValue) : [];

    if (Array.isArray(parsedValue)) {
      return parsedValue.filter(function(id) {
        return typeof id === "string";
      });
    }
  } catch (error) {
    return [];
  }

  return [];
}

function saveMarkedQuestionIds() {
  try {
    window.localStorage.setItem("aa-sl-marked-question-ids", JSON.stringify([...markedQuestionIds]));
  } catch (error) {
    // Marked questions are an optional local convenience feature.
  }
}

function isQuestionMarked(question) {
  return markedQuestionIds.has(question.id);
}

function getMarkedQuestions() {
  return visibleQuestions.filter(function(question) {
    return markedQuestionIds.has(question.id);
  });
}

function updateMarkedCount() {
  const count = getMarkedQuestions().length;

  document.querySelectorAll(".marked-count").forEach(function(countElement) {
    countElement.textContent = String(count);
  });

  document.querySelectorAll(".marked-panel-button").forEach(function(button) {
    button.classList.toggle("has-marked", count > 0);
  });
}

function updateVisibleMarkedState() {
  updateMarkedCount();

  questionList.querySelectorAll(".result-item").forEach(function(item) {
    const question = currentFilteredQuestions[Number(item.dataset.index)];

    if (!question) {
      return;
    }

    const isMarked = isQuestionMarked(question);
    item.classList.toggle("is-marked", isMarked);

    const title = item.querySelector(".result-title");
    if (title) {
      title.textContent = (isMarked ? "★ " : "") + "Question " + getQuestionNumber(question);
    }
  });
}

function toggleMarkedQuestion(question) {
  if (isQuestionMarked(question)) {
    markedQuestionIds.delete(question.id);
  } else {
    markedQuestionIds.add(question.id);
  }

  saveMarkedQuestionIds();
  updateVisibleMarkedState();
  renderMarkedModalList();
  renderStudyQuestion();
}

function openQuestionById(questionId) {
  let targetIndex = currentFilteredQuestions.findIndex(function(question) {
    return question.id === questionId;
  });

  if (targetIndex === -1) {
    topicFilter.value = "All";
    paperFilterInputs.forEach(function(input) {
      input.checked = false;
    });
    difficultyFilterInputs.forEach(function(input) {
      input.checked = false;
    });
    currentFilteredQuestions = getFilteredQuestions();
    targetIndex = currentFilteredQuestions.findIndex(function(question) {
      return question.id === questionId;
    });
    updateFilterClearButtons();
    renderResultsList();
    updateSelectionModeUi();
  }

  if (targetIndex !== -1) {
    selectedQuestionIndex = targetIndex;
    closeMarkedModal();
    renderStudyQuestion();
  }
}

function renderMarkedModalList() {
  const markedQuestions = getMarkedQuestions();
  markedModalList.innerHTML = "";
  markedModalSummary.textContent = markedQuestions.length === 1 ? "1 marked question" : markedQuestions.length + " marked questions";

  if (markedQuestions.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "marked-empty-message";
    emptyMessage.textContent = "No marked questions yet. Use ☆ Mark on a question to save it here.";
    markedModalList.appendChild(emptyMessage);
    return;
  }

  markedQuestions.forEach(function(question) {
    const item = document.createElement("div");
    item.className = "marked-modal-item";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "marked-open-button";
    openButton.setAttribute("aria-label", "Open Question " + getQuestionNumber(question));

    const title = document.createElement("strong");
    title.textContent = "Question " + getQuestionNumber(question);

    const meta = document.createElement("span");
    meta.textContent = question.paper + " · " + question.difficulty;

    const subtopic = document.createElement("p");
    subtopic.textContent = question.subtopic;

    openButton.appendChild(title);
    openButton.appendChild(meta);
    openButton.appendChild(subtopic);
    openButton.addEventListener("click", function() {
      openQuestionById(question.id);
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "marked-remove-button";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", "Remove Question " + getQuestionNumber(question) + " from marked questions");
    removeButton.addEventListener("click", function() {
      markedQuestionIds.delete(question.id);
      saveMarkedQuestionIds();
      updateVisibleMarkedState();
      renderMarkedModalList();
      renderStudyQuestion();
    });

    item.appendChild(openButton);
    item.appendChild(removeButton);
    markedModalList.appendChild(item);
  });
}

function openMarkedModal() {
  renderMarkedModalList();
  markedModal.hidden = false;
}

function closeMarkedModal() {
  markedModal.hidden = true;
}

function createToolIcon(symbol) {
  const icon = document.createElement("span");
  icon.className = "tool-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = symbol;
  return icon;
}

function updateMarkButtonState(button, question) {
  const isMarked = isQuestionMarked(question);
  let icon = button.querySelector(".tool-icon");

  if (!icon) {
    icon = createToolIcon(isMarked ? "★" : "☆");
    button.appendChild(icon);
  } else {
    icon.textContent = isMarked ? "★" : "☆";
  }

  button.title = isMarked ? "Remove from marked questions" : "Mark this question";
  button.setAttribute("aria-pressed", String(isMarked));
  button.setAttribute("aria-label", isMarked ? "Remove from marked questions" : "Add to marked questions");
}

function createMarkButton(question) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "mark-question-button";
  updateMarkButtonState(button, question);
  button.addEventListener("click", function() {
    toggleMarkedQuestion(question);
    updateMarkButtonState(button, question);
  });

  return button;
}

function createMarkedPanelButton() {
  const button = document.createElement("button");
  const icon = document.createElement("span");
  const count = document.createElement("span");

  button.type = "button";
  button.className = "marked-panel-button";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-label", "Open marked questions");

  icon.className = "tool-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "✓";

  count.className = "marked-count";
  count.textContent = String(markedQuestionIds.size);

  button.appendChild(icon);
  button.appendChild(count);
  button.addEventListener("click", openMarkedModal);

  return button;
}

function updateExportButtons() {
  const selectedCount = selectedQuestionIds.size;
  const exportButtons = document.querySelectorAll(".export-button");
  const allCurrentSelected = currentFilteredQuestions.length > 0 && currentFilteredQuestions.every(function(question) {
    return selectedQuestionIds.has(question.id);
  });

  exportButtons.forEach(function(button) {
    button.disabled = selectedCount === 0;
    button.textContent = selectedCount === 0 ? "Export" : "Export (" + selectedCount + ")";
  });

  selectAllCurrentButton.disabled = currentFilteredQuestions.length === 0;
  selectAllCurrentButton.textContent = allCurrentSelected ? "Clear all" : "Select all";
}

function updateSelectionModeUi() {
  indexPanel.classList.toggle("selection-mode", selectionMode);
  exportBar.hidden = !selectionMode;
  selectionToggleButton.textContent = selectionMode ? "Cancel" : "Select";
  updateExportButtons();
}

function setQuestionSelected(question, isSelected, filteredIndex) {
  if (isSelected) {
    selectedQuestionIds.add(question.id);

    if (typeof filteredIndex === "number") {
      selectedQuestionIndex = filteredIndex;
      renderStudyQuestion();
      return;
    }
  } else {
    selectedQuestionIds.delete(question.id);
  }

  updateExportButtons();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function copyComputedStyles(sourceElement, targetElement) {
  const computedStyle = window.getComputedStyle(sourceElement);
  let cssText = "";

  for (let index = 0; index < computedStyle.length; index += 1) {
    const propertyName = computedStyle[index];
    cssText += propertyName + ":" + computedStyle.getPropertyValue(propertyName) + ";";
  }

  targetElement.setAttribute("style", cssText);

  Array.from(sourceElement.children).forEach(function(child, index) {
    copyComputedStyles(child, targetElement.children[index]);
  });
}

function renderMathImageDataUrl(latex, displayMode) {
  return new Promise(function(resolve) {
    if (!window.katex || typeof window.katex.render !== "function") {
      resolve("");
      return;
    }

    const source = document.createElement(displayMode ? "div" : "span");
    source.className = "word-math-render-source";
    source.style.position = "fixed";
    source.style.left = "-10000px";
    source.style.top = "0";
    source.style.zIndex = "-1";
    source.style.background = "#ffffff";
    source.style.color = "#1f2933";
    source.style.fontSize = displayMode ? "18px" : "16px";
    source.style.lineHeight = "1.4";
    source.style.padding = displayMode ? "6px 8px" : "2px 3px";
    source.style.display = displayMode ? "block" : "inline-block";

    try {
      window.katex.render(latex, source, {
        displayMode: displayMode,
        throwOnError: false,
        output: "html"
      });
    } catch (error) {
      resolve("");
      return;
    }

    document.body.appendChild(source);

    requestAnimationFrame(function() {
      try {
        const rect = source.getBoundingClientRect();
        const width = Math.max(1, Math.ceil(rect.width) + 8);
        const height = Math.max(1, Math.ceil(rect.height) + 8);
        const clone = source.cloneNode(true);

        copyComputedStyles(source, clone);
        clone.style.position = "static";
        clone.style.left = "auto";
        clone.style.top = "auto";
        clone.style.zIndex = "auto";
        clone.style.margin = "0";
        clone.style.boxSizing = "border-box";
        clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");

        const serializedHtml = new XMLSerializer().serializeToString(clone);
        const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + width + "\" height=\"" + height + "\">" +
          "<foreignObject width=\"100%\" height=\"100%\">" +
          serializedHtml +
          "</foreignObject></svg>";
        const image = new Image();

        image.onload = function() {
          try {
            const scale = 2;
            const canvas = document.createElement("canvas");
            canvas.width = width * scale;
            canvas.height = height * scale;

            const context = canvas.getContext("2d");
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.scale(scale, scale);
            context.drawImage(image, 0, 0, width, height);
            resolve(canvas.toDataURL("image/png"));
          } catch (error) {
            resolve("");
          } finally {
            source.remove();
          }
        };

        image.onerror = function() {
          source.remove();
          resolve("");
        };

        image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      } catch (error) {
        source.remove();
        resolve("");
      }
    });
  });
}

function renderExportMathFallback(latex, displayMode) {
  if (window.katex && typeof window.katex.renderToString === "function") {
    return window.katex.renderToString(latex, {
      displayMode: displayMode,
      throwOnError: false,
      output: "html"
    });
  }

  return escapeHtml(displayMode ? "\\[" + latex + "\\]" : "\\(" + latex + "\\)");
}

async function renderExportMath(latex, displayMode) {
  const imageDataUrl = await renderMathImageDataUrl(latex, displayMode);

  if (imageDataUrl !== "") {
    const className = displayMode ? "word-math-image word-math-display" : "word-math-image word-math-inline";
    return "<img class=\"" + className + "\" src=\"" + imageDataUrl + "\" alt=\"" + escapeHtml(latex) + "\">";
  }

  return renderExportMathFallback(latex, displayMode);
}

async function formatExportInlineMath(line) {
  const inlineMathPattern = /\\\((.*?)\\\)/g;
  let lastIndex = 0;
  let match;
  let html = "";

  while ((match = inlineMathPattern.exec(line)) !== null) {
    html += escapeHtml(line.slice(lastIndex, match.index));
    html += await renderExportMath(match[1], false);
    lastIndex = inlineMathPattern.lastIndex;
  }

  html += escapeHtml(line.slice(lastIndex));
  return html;
}

async function formatExportPlainText(text) {
  const lines = text.split("\n");
  const renderedLines = [];

  for (const line of lines) {
    const renderedLine = await formatExportInlineMath(line);

    if (line.trim().startsWith("Final answer:")) {
      renderedLines.push("<span class=\"final-answer\">" + renderedLine + "</span>");
    } else {
      renderedLines.push(renderedLine);
    }
  }

  return renderedLines.join("<br>");
}

async function formatExportText(text) {
  const displayMathPattern = /\\\[[\s\S]*?\\\]/g;
  let lastIndex = 0;
  let match;
  let html = "";

  while ((match = displayMathPattern.exec(text)) !== null) {
    html += await formatExportPlainText(text.slice(lastIndex, match.index));
    html += "<div class=\"export-display-math\">" + await renderExportMath(match[0].slice(2, -2), true) + "</div>";
    lastIndex = displayMathPattern.lastIndex;
  }

  html += await formatExportPlainText(text.slice(lastIndex));
  return html;
}

function getExportImageHtml(question) {
  if (question.image === "") {
    return "";
  }

  const baseUrl = window.location.href.split("/").slice(0, -1).join("/") + "/";
  const imageBlocks = question.image.split(";").map(function(path) {
    return path.trim();
  }).filter(function(path) {
    return path !== "";
  }).map(function(path) {
    return "<p><img src=\"" + escapeHtml(baseUrl + path) + "\" style=\"max-width:520px;height:auto;\"></p>" +
      "<p class=\"image-path\">Image: " + escapeHtml(path) + "</p>";
  });

  return imageBlocks.join("");
}

function appendExportImagesDom(parent, question) {
  if (question.image === "") {
    return;
  }

  const baseUrl = window.location.href.split("/").slice(0, -1).join("/") + "/";
  question.image.split(";").map(function(path) {
    return path.trim();
  }).filter(function(path) {
    return path !== "";
  }).forEach(function(path) {
    const figure = document.createElement("figure");
    figure.className = "pdf-image-block";

    const image = document.createElement("img");
    image.src = baseUrl + path;
    image.alt = "Question image";

    figure.appendChild(image);
    parent.appendChild(figure);
  });
}

function createPdfSection(question, includeAnswers) {
  const section = document.createElement("section");
  section.className = "pdf-question-section";

  const title = document.createElement("h2");
  title.textContent = "Question " + getQuestionNumber(question);

  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = createMetadataLine(question);

  const subtopic = document.createElement("p");
  subtopic.className = "subtopic";
  subtopic.innerHTML = "<strong>Subtopic:</strong> " + escapeHtml(question.subtopic);

  const questionHeading = document.createElement("h3");
  questionHeading.textContent = "Question";

  const questionBlock = document.createElement("div");
  questionBlock.className = "question-block";
  appendQuestionTextWithInlineImages(questionBlock, question);

  section.appendChild(title);
  section.appendChild(meta);
  section.appendChild(subtopic);
  section.appendChild(questionHeading);
  section.appendChild(questionBlock);

  if (includeAnswers) {
    const answerBlock = document.createElement("div");
    answerBlock.className = "answer-block";

    const answerHeading = document.createElement("h3");
    answerHeading.textContent = "Answer / Markscheme";

    const answerText = document.createElement("div");
    appendFormattedMathText(answerText, question.answer);

    answerBlock.appendChild(answerHeading);
    answerBlock.appendChild(answerText);
    section.appendChild(answerBlock);
  }

  return section;
}

function buildPdfPrintHtml(selectedQuestions, includeAnswers, fileName) {
  const generatedDate = new Date().toLocaleString();
  const container = document.createElement("div");

  selectedQuestions.forEach(function(question) {
    container.appendChild(createPdfSection(question, includeAnswers));
  });

  renderLocalMath(container);

  return "<!DOCTYPE html>" +
    "<html><head><meta charset=\"UTF-8\">" +
    "<title>" + escapeHtml(fileName) + "</title>" +
    "<link rel=\"stylesheet\" href=\"" + escapeHtml(new URL("katex/katex.min.css", window.location.href).href) + "\">" +
    "<style>" +
    "@page{margin:18mm;}" +
    "body{font-family:Arial,sans-serif;color:#1f2933;line-height:1.55;font-size:11pt;}" +
    "h1{font-size:20pt;margin:0 0 8pt;}h2{font-size:14pt;margin:18pt 0 5pt;}h3{font-size:10.5pt;margin:10pt 0 6pt;text-transform:uppercase;color:#334155;}" +
    ".meta,.subtopic{color:#555;font-size:9.5pt;margin:3pt 0;}" +
    ".question-block{margin:8pt 0 12pt;font-size:11.5pt;}" +
    ".answer-block{margin:12pt 0;padding:10pt 12pt;background:#eef8f1;border:1px solid #b8d9c2;border-left:5pt solid #78a986;}" +
    ".final-answer{color:#8B1E1E;font-weight:bold;}" +
    ".line-with-mark,.display-math-with-mark{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:10pt;align-items:baseline;}" +
    ".mark-token{justify-self:end;white-space:nowrap;font-weight:bold;}" +
    ".pdf-question-section{page-break-inside:avoid;border-bottom:1px solid #d7dde3;padding-bottom:14pt;margin-bottom:14pt;}" +
    ".pdf-image-block{margin:10pt 0;text-align:center;} .pdf-image-block img{max-width:440pt;height:auto;}" +
    ".table-wrapper{max-width:100%;overflow:visible;margin:8pt 0;} .data-table{border-collapse:collapse;width:auto;max-width:100%;font-size:9.5pt;}" +
    ".data-table th,.data-table td{border:1px solid #9ca3af;padding:4pt 6pt;text-align:center;vertical-align:middle;} .data-table th{background:#eef2f5;font-weight:bold;}" +
    ".katex-display{margin:0.45em 0;}" +
    "</style></head><body>" +
    "<h1>IBDP Mathematics AA SL Question Export</h1>" +
    "<p class=\"meta\">Exported questions: " + selectedQuestions.length + "</p>" +
    "<p class=\"meta\">Answers included: " + (includeAnswers ? "Yes" : "No") + "</p>" +
    "<p class=\"meta\">Generated locally: " + escapeHtml(generatedDate) + "</p>" +
    container.innerHTML +
    "<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},350);});<\/script>" +
    "</body></html>";
}

function exportSelectedQuestionsToPdf(selectedQuestions, includeAnswers, fileName) {
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    window.alert("Please allow pop-ups for this local page, then try Export PDF again.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildPdfPrintHtml(selectedQuestions, includeAnswers, fileName));
  printWindow.document.close();
}

async function buildWordDocumentHtml(selectedQuestions, includeAnswers, fileName) {
  const generatedDate = new Date().toLocaleString();
  const questionSections = [];

  for (const question of selectedQuestions) {
    const answerSection = includeAnswers ?
      "<div class=\"answer-block\"><h3>Answer / Markscheme</h3>" +
      "<div>" + await formatExportText(question.answer) + "</div></div>" :
      "";

    questionSections.push("<section>" +
      "<h2>Question " + getQuestionNumber(question) + "</h2>" +
      "<p class=\"meta\">" + escapeHtml(createMetadataLine(question)) + "</p>" +
      "<p class=\"subtopic\"><strong>Subtopic:</strong> " + escapeHtml(question.subtopic) + "</p>" +
      "<h3>Question</h3>" +
      "<div class=\"question-block\">" + await formatExportText(question.question) + "</div>" +
      getExportImageHtml(question) +
      answerSection +
      "</section>");
  }

  return "<!DOCTYPE html>" +
    "<html><head><meta charset=\"UTF-8\">" +
    "<title>" + escapeHtml(fileName) + "</title>" +
    "<style>" +
    "body{font-family:Arial,sans-serif;color:#1f2933;line-height:1.58;}" +
    "h1{font-size:22pt;}h2{font-size:15pt;margin-top:20pt;}h3{font-size:11pt;margin:0 0 8pt;text-transform:uppercase;color:#334155;}" +
    ".meta,.subtopic,.image-path{color:#555;font-size:10pt;}" +
    ".question-block{margin:8pt 0 12pt;font-size:12pt;}" +
    ".answer-block{margin:12pt 0;padding:12pt 14pt;background:#eef8f1;border:1px solid #b8d9c2;border-left:5pt solid #78a986;}" +
    ".final-answer{color:#8B1E1E;font-weight:bold;}" +
    ".export-display-math{margin:8pt 0;text-align:center;}" +
    ".word-math-image{vertical-align:middle;max-width:100%;height:auto;}" +
    ".word-math-inline{display:inline-block;margin:0 2pt;}" +
    ".word-math-display{display:block;margin:6pt auto;}" +
    "section{page-break-inside:avoid;}hr{border:0;border-top:1px solid #ccc;margin:18pt 0;}" +
    "</style></head><body>" +
    "<h1>IBDP Mathematics AA SL Question Export</h1>" +
    "<p>Exported questions: " + selectedQuestions.length + "</p>" +
    "<p class=\"meta\">Answers included: " + (includeAnswers ? "Yes" : "No") + "</p>" +
    "<p class=\"meta\">Generated locally: " + escapeHtml(generatedDate) + "</p>" +
    questionSections.join("<hr>") +
    "</body></html>";
}

async function downloadWordDocument(selectedQuestions, includeAnswers, fileName) {
  const documentHtml = await buildWordDocumentHtml(selectedQuestions, includeAnswers, fileName);
  const blob = new Blob([documentHtml], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName + ".doc";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function closeExportReviewModal() {
  exportModal.hidden = true;
  exportModalList.innerHTML = "";
  exportModalPreview.innerHTML = "";
  pendingExportQuestions = [];
  exportReviewQuestions = [];
  exportReviewIncludedIds.clear();
  activeExportReviewQuestionId = "";
  includeAnswersCheckbox.checked = false;
  exportFileNameInput.value = getDefaultExportFileName();
}

function getIncludedExportReviewQuestions() {
  return exportReviewQuestions.filter(function(question) {
    return exportReviewIncludedIds.has(question.id);
  });
}

function shouldIncludeAnswersInExport() {
  return includeAnswersCheckbox.checked === true;
}

function getDefaultExportFileName() {
  const dateStamp = new Date().toISOString().slice(0, 10);
  return "AA_SL_Selected_Questions_" + dateStamp;
}

function sanitizeExportFileName(fileName) {
  return fileName.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

function getExportFileName() {
  const typedName = sanitizeExportFileName(exportFileNameInput.value);

  if (typedName !== "") {
    return typedName;
  }

  return getDefaultExportFileName();
}

function updateExportReviewSummary() {
  const includedCount = getIncludedExportReviewQuestions().length;
  const totalCount = exportReviewQuestions.length;

  pendingExportQuestions = getIncludedExportReviewQuestions();
  exportPdfButton.disabled = includedCount === 0;
  exportWordButton.disabled = includedCount === 0;

  if (includedCount === 0) {
    exportModalSummary.textContent = "No questions are selected for export. Select at least one question to continue.";
    return;
  }

  exportModalSummary.textContent = "Questions to export: " + includedCount + " of " + totalCount + ". Answers included: " + (shouldIncludeAnswersInExport() ? "Yes" : "No") + ". Click a question card or clear its checkbox to remove it from the export.";
}

function renderEmptyExportReviewPreview() {
  exportModalPreview.innerHTML = "";

  const message = document.createElement("p");
  message.className = "export-preview-empty";
  message.textContent = "No questions remain in this export.";

  exportModalPreview.appendChild(message);
}

function renderExportReviewPreview(question) {
  exportModalPreview.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = "Question " + getQuestionNumber(question);

  const meta = document.createElement("p");
  meta.className = "export-preview-meta";
  meta.textContent = question.paper + " · " + question.difficulty + " · " + question.subtopic;

  const questionBlock = document.createElement("div");
  questionBlock.className = "export-preview-question";
  appendQuestionTextWithInlineImages(questionBlock, question);

  exportModalPreview.appendChild(title);
  exportModalPreview.appendChild(meta);
  exportModalPreview.appendChild(questionBlock);
  renderLocalMath(exportModalPreview);
}

function updateExportReviewSelection(questionId) {
  const items = exportModalList.querySelectorAll(".export-review-item");

  items.forEach(function(item) {
    item.classList.toggle("is-active", item.dataset.id === questionId);
    item.classList.toggle("is-excluded", !exportReviewIncludedIds.has(item.dataset.id));
  });
}

function selectExportReviewQuestion(question) {
  activeExportReviewQuestionId = question.id;
  renderExportReviewPreview(question);
  updateExportReviewSelection(question.id);
}

function removeExportReviewQuestion(question) {
  if (!exportReviewIncludedIds.has(question.id)) {
    return;
  }

  exportReviewIncludedIds.delete(question.id);

  const items = exportModalList.querySelectorAll(".export-review-item");
  items.forEach(function(item) {
    if (item.dataset.id === question.id) {
      item.remove();
    }
  });

  updateExportReviewSummary();

  const includedQuestions = getIncludedExportReviewQuestions();
  if (includedQuestions.length === 0) {
    activeExportReviewQuestionId = "";
    renderEmptyExportReviewPreview();
    updateExportReviewSelection("");
    return;
  }

  if (activeExportReviewQuestionId === question.id) {
    selectExportReviewQuestion(includedQuestions[0]);
    return;
  }

  updateExportReviewSelection(activeExportReviewQuestionId);
}

function openExportReviewModal(selectedQuestions) {
  includeAnswersCheckbox.checked = false;
  exportFileNameInput.value = getDefaultExportFileName();
  exportReviewQuestions = selectedQuestions;
  exportReviewIncludedIds = new Set(selectedQuestions.map(function(question) {
    return question.id;
  }));
  pendingExportQuestions = selectedQuestions.slice();
  exportModalList.innerHTML = "";
  exportModalPreview.innerHTML = "";

  selectedQuestions.forEach(function(question) {
    const item = document.createElement("div");
    item.className = "export-review-item";
    item.dataset.id = question.id;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "export-review-checkbox";
    checkbox.checked = true;
    checkbox.setAttribute("aria-label", "Include Question " + getQuestionNumber(question) + " in export");

    const contentButton = document.createElement("button");
    contentButton.type = "button";
    contentButton.className = "export-review-content";

    const title = document.createElement("strong");
    title.textContent = "Question " + getQuestionNumber(question);

    const subtopic = document.createElement("p");
    subtopic.textContent = question.subtopic;

    contentButton.appendChild(title);
    contentButton.appendChild(subtopic);
    contentButton.addEventListener("click", function() {
      selectExportReviewQuestion(question);
    });

    checkbox.addEventListener("change", function() {
      if (checkbox.checked) {
        exportReviewIncludedIds.add(question.id);
      } else {
        exportReviewIncludedIds.delete(question.id);
      }

      updateExportReviewSummary();
      updateExportReviewSelection(activeExportReviewQuestionId);
    });

    item.appendChild(checkbox);
    item.appendChild(contentButton);
    exportModalList.appendChild(item);
  });

  updateExportReviewSummary();

  if (selectedQuestions.length > 0) {
    selectExportReviewQuestion(selectedQuestions[0]);
  } else {
    renderEmptyExportReviewPreview();
  }

  exportModal.hidden = false;
}

function exportSelectedQuestionsToWord() {
  const selectedQuestions = getSelectedQuestionsForExport();

  if (selectedQuestions.length === 0) {
    window.alert("Please select at least one question from the Question Index first.");
    return;
  }

  openExportReviewModal(selectedQuestions);
}

function getSelectedFilters() {
  return {
    topic: topicFilter.value,
    papers: Array.from(paperFilterInputs).filter(function(input) {
      return input.checked;
    }).map(function(input) {
      return input.value;
    }),
    difficulties: Array.from(difficultyFilterInputs).filter(function(input) {
      return input.checked;
    }).map(function(input) {
      return input.value;
    })
  };
}

function getFilteredQuestions() {
  const selected = getSelectedFilters();

  return visibleQuestions.filter(function(question) {
    const topicMatches = selected.topic === "All" || question.topic === selected.topic;
    const paperMatches = selected.papers.length === 0 || selected.papers.includes(question.paper);
    const difficultyMatches = selected.difficulties.length === 0 || selected.difficulties.includes(question.difficulty);

    return topicMatches && paperMatches && difficultyMatches;
  });
}

function updateFilterClearButtons() {
  filterClearButtons.forEach(function(button) {
    const target = document.querySelector(button.dataset.target);
    button.hidden = !target || target.value === "All";
  });
}

function createMetadataLine(question) {
  return question.topic + " · " + question.paper + " · " + question.difficulty;
}

function getPaperClassName(paper) {
  if (paper === "Paper 1") {
    return "paper-one";
  }

  if (paper === "Paper 2") {
    return "paper-two";
  }

  return "";
}

function getDifficultyClassName(difficulty) {
  return "difficulty-" + difficulty.toLowerCase();
}

function appendMetadataChips(parent, question, includeTopic) {
  if (includeTopic) {
    const topic = document.createElement("span");
    topic.className = "metadata-topic";
    topic.textContent = question.topic;
    parent.appendChild(topic);
  }

  const paper = document.createElement("span");
  paper.className = "metadata-chip paper-chip " + getPaperClassName(question.paper);
  paper.textContent = question.paper;

  const difficulty = document.createElement("span");
  difficulty.className = "metadata-chip difficulty-chip " + getDifficultyClassName(question.difficulty);
  difficulty.textContent = question.difficulty;

  parent.appendChild(paper);
  parent.appendChild(difficulty);
}

function createResultItem(question, filteredIndex) {
  const item = document.createElement("div");
  item.className = "result-item";
  item.classList.toggle("is-marked", isQuestionMarked(question));
  item.dataset.index = filteredIndex;
  item.tabIndex = 0;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "result-checkbox";
  checkbox.checked = selectedQuestionIds.has(question.id);
  checkbox.setAttribute("aria-label", "Select Question " + getQuestionNumber(question) + " for export");

  checkbox.addEventListener("click", function(event) {
    event.stopPropagation();
  });

  checkbox.addEventListener("change", function() {
    setQuestionSelected(question, checkbox.checked, filteredIndex);
  });

  const title = document.createElement("span");
  title.className = "result-title";
  title.textContent = (isQuestionMarked(question) ? "★ " : "") + "Question " + getQuestionNumber(question);

  const subtopic = document.createElement("span");
  subtopic.className = "result-subtopic";
  subtopic.textContent = question.subtopic;

  const meta = document.createElement("span");
  meta.className = "result-meta metadata-line";
  appendMetadataChips(meta, question, false);

  item.appendChild(checkbox);
  item.appendChild(title);
  item.appendChild(subtopic);
  item.appendChild(meta);

  item.addEventListener("click", function() {
    if (selectionMode) {
      checkbox.checked = !checkbox.checked;
      setQuestionSelected(question, checkbox.checked, filteredIndex);
      return;
    }

    openStudyQuestion(filteredIndex);
  });

  item.addEventListener("keydown", function(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();

      if (selectionMode) {
        checkbox.checked = !checkbox.checked;
        setQuestionSelected(question, checkbox.checked, filteredIndex);
      } else {
        openStudyQuestion(filteredIndex);
      }
    }
  });

  return item;
}

function updateResultSelection() {
  const items = questionList.querySelectorAll(".result-item");

  items.forEach(function(item) {
    const itemIndex = Number(item.dataset.index);
    item.classList.toggle("is-selected", itemIndex === selectedQuestionIndex);
  });
}

function renderResultsList() {
  questionList.innerHTML = "";

  if (currentFilteredQuestions.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "empty-message";
    emptyMessage.textContent = "No questions match these filters.";
    questionList.appendChild(emptyMessage);
    return;
  }

  currentFilteredQuestions.forEach(function(question, index) {
    questionList.appendChild(createResultItem(question, index));
  });
}

function setQuestionIndexOpen(isOpen) {
  questionIndexPopover.hidden = !isOpen;
  questionIndexToggleButton.setAttribute("aria-expanded", String(isOpen));
}

function toggleQuestionIndex() {
  setQuestionIndexOpen(questionIndexPopover.hidden);
}

function appendImages(parent, question) {
  if (question.image === "") {
    return;
  }

  const imagePaths = question.image.split(";").map(function(path) {
    return path.trim();
  }).filter(function(path) {
    return path !== "";
  });
  const imageAltTexts = typeof question.imageAlt === "string"
    ? question.imageAlt.split(";")
    : [];

  imagePaths.forEach(function(imagePath, index) {
    const image = document.createElement("img");
    image.className = "graph-image";
    image.src = imagePath;
    image.alt = imageAltTexts[index] || "Graph or diagram for " + question.id;
    parent.appendChild(image);
  });
}

function shouldPlaceImagesAfterTextBlock(textBlock) {
  const normalized = textBlock.toLowerCase();
  const visualWords = ["diagram", "graph", "figure", "image", "table", "plot", "curve", "box-and-whisker", "scatter"];
  const placementWords = ["shown", "shows", "show", "given", "below", "following"];
  const hasVisualWord = visualWords.some(function(word) {
    return normalized.includes(word);
  });
  const hasPlacementWord = placementWords.some(function(word) {
    return normalized.includes(word);
  });

  return hasVisualWord && hasPlacementWord;
}

function appendStructuredQuestionText(parent, text) {
  const partPattern = /^\s*(?:\*\*)?(\([a-z](?:\.[ivx]+)?\)(?:\([ivx]+\))?)(?:\*\*)?\s*/;
  const lines = text.split("\n");
  const parts = [];
  let currentPart = null;
  let preambleLines = [];

  function savePreamble() {
    const preamble = preambleLines.join("\n").trim();

    if (preamble !== "") {
      parts.push({
        label: "",
        body: preamble
      });
    }

    preambleLines = [];
  }

  function saveCurrentPart() {
    if (!currentPart) {
      return;
    }

    parts.push({
      label: currentPart.label,
      body: currentPart.lines.join("\n").trim()
    });
    currentPart = null;
  }

  lines.forEach(function(line) {
    const partMatch = line.match(partPattern);

    if (partMatch) {
      if (currentPart) {
        saveCurrentPart();
      } else {
        savePreamble();
      }

      currentPart = {
        label: partMatch[1],
        lines: [line.slice(partMatch[0].length)]
      };
      return;
    }

    if (currentPart) {
      currentPart.lines.push(line);
    } else {
      preambleLines.push(line);
    }
  });

  saveCurrentPart();
  savePreamble();

  if (!parts.some(function(part) {
    return part.label !== "";
  })) {
    appendFormattedMathText(parent, text);
    return;
  }

  parts.forEach(function(part) {
    if (part.label === "") {
      const preamble = document.createElement("div");
      preamble.className = "question-part-preamble";
      appendFormattedMathText(preamble, part.body);
      parent.appendChild(preamble);
      return;
    }

    const row = document.createElement("section");
    row.className = "question-part-row";

    const label = document.createElement("div");
    label.className = "question-part-label";
    label.textContent = part.label;

    const body = document.createElement("div");
    body.className = "question-part-body";
    appendFormattedMathText(body, part.body);

    row.appendChild(label);
    row.appendChild(body);
    parent.appendChild(row);
  });
}

function appendQuestionTextWithInlineImages(parent, question) {
  function protectQuestionWrapGroups(text) {
    return text.replace(/,\s+(where|for|with)\s+(?=\\\()/gi, function(match, connector) {
      return ", " + connector + "\u00a0";
    });
  }

  function enlargeInlineQuestionFractions(text) {
    return text.replace(/\\\(([\s\S]*?)\\\)/g, function(match, inlineMath) {
      return "\\("
        + inlineMath.replace(/\\frac/g, "\\dfrac")
        + "\\)";
    });
  }

  function formatQuestionText(text) {
    return enlargeInlineQuestionFractions(protectQuestionWrapGroups(text));
  }

  const formattedQuestionText = formatQuestionText(question.question);

  if (question.image === "" || /!\[[^\]]+\]\([^)]+\)/.test(formattedQuestionText)) {
    appendStructuredQuestionText(parent, formattedQuestionText);
    return;
  }

  const textBlocks = question.question.split(/\n\s*\n/);
  let imagesInserted = false;

  textBlocks.forEach(function(textBlock, index) {
    if (textBlock.trim() !== "") {
      appendStructuredQuestionText(parent, formatQuestionText(textBlock));
    }

    if (!imagesInserted && shouldPlaceImagesAfterTextBlock(textBlock)) {
      appendImages(parent, question);
      imagesInserted = true;
    }

    if (index < textBlocks.length - 1) {
      const spacer = document.createElement("div");
      spacer.className = "question-paragraph-gap";
      parent.appendChild(spacer);
    }
  });

  if (!imagesInserted) {
    appendImages(parent, question);
  }
}

function createToggleSection(labelText, bodyText, sectionClass, buttonClass, showText, hideText, contentHost) {
  const wrapper = document.createElement("div");
  wrapper.className = "toggle-section";

  const button = document.createElement("button");
  const iconSymbols = {
    "where-to-learn-button": "↗",
    "hint-button": "?"
  };
  const buttonIcon = createToolIcon(iconSymbols[buttonClass] || "•");
  const buttonLabel = document.createElement("span");

  button.className = "toggle-button " + buttonClass;
  button.type = "button";
  buttonLabel.className = "tool-label";
  buttonLabel.textContent = showText;
  button.appendChild(buttonIcon);
  button.appendChild(buttonLabel);
  button.setAttribute("aria-expanded", "false");

  const content = document.createElement("div");
  content.className = "hidden-content " + sectionClass;

  const label = document.createElement("p");
  label.className = "content-label";
  label.textContent = labelText;

  const body = document.createElement("div");
  appendFormattedMathText(body, bodyText);

  content.appendChild(label);
  content.appendChild(body);

  button.addEventListener("click", function() {
    const isHidden = content.style.display !== "block";
    content.style.display = isHidden ? "block" : "none";
    buttonLabel.textContent = isHidden ? hideText : showText;
    button.setAttribute("aria-expanded", isHidden ? "true" : "false");
    renderLocalMath(content);
  });

  wrapper.appendChild(button);
  if (contentHost) {
    contentHost.appendChild(content);
  } else {
    wrapper.appendChild(content);
  }
  return wrapper;
}

function closeAnswerModal() {
  if (answerModal.hidden) {
    return;
  }

  answerModal.hidden = true;
  document.body.classList.remove("answer-modal-open");

  if (answerModalTrigger) {
    answerModalTrigger.focus();
    answerModalTrigger = null;
  }
}

function openAnswerModal(question, triggerButton) {
  answerModalTitle.textContent = "Question " + getQuestionNumber(question);
  const sourceLabel = createSourceLabel(question);
  if (sourceLabel) answerModalTitle.appendChild(sourceLabel);
  answerModalQuestion.innerHTML = "";
  answerModalAnswer.innerHTML = "";

  appendQuestionTextWithInlineImages(answerModalQuestion, question);
  appendStructuredAnswerText(answerModalAnswer, question.answer);

  answerModalTrigger = triggerButton;
  answerModal.hidden = false;
  document.body.classList.add("answer-modal-open");
  renderLocalMath(answerModal);
  answerModalCloseButton.focus();
}

function createAnswerModalButton(question) {
  const button = document.createElement("button");
  const icon = createToolIcon("✓");
  const label = document.createElement("span");

  button.className = "toggle-button answer-button";
  button.type = "button";
  label.className = "tool-label";
  label.textContent = "Markscheme";
  button.appendChild(icon);
  button.appendChild(label);
  button.setAttribute("aria-haspopup", "dialog");

  button.addEventListener("click", function() {
    openAnswerModal(question, button);
  });

  return button;
}

function renderEmptyStudyView(message) {
  studyView.innerHTML = "";
  studyView.classList.add("is-empty");

  const emptyPanel = document.createElement("div");
  emptyPanel.className = "study-empty-state";

  const title = document.createElement("h2");
  title.textContent = "Select a question";

  const body = document.createElement("p");
  body.textContent = message;

  emptyPanel.appendChild(title);
  emptyPanel.appendChild(body);
  studyView.appendChild(emptyPanel);
}

function renderStudyQuestion() {
  const question = currentFilteredQuestions[selectedQuestionIndex];

  studyView.innerHTML = "";
  studyView.classList.remove("is-empty");

  if (!question) {
    currentQuestionIndicator.textContent = "0 of 0";
    goToQuestionSelect.value = "";
    renderEmptyStudyView("Choose a question from the Question Index above to open the focused study view.");
    updateResultSelection();
    return;
  }

  const title = document.createElement("h2");
  title.className = "study-title";
  title.textContent = "Question " + getQuestionNumber(question);

  const meta = document.createElement("div");
  meta.className = "study-meta metadata-line metadata-line-large";
  appendMetadataChips(meta, question, false);

  const titleActions = document.createElement("div");
  titleActions.className = "study-title-actions";
  titleActions.appendChild(createMarkButton(question));
  titleActions.appendChild(createMarkedPanelButton());

  const questionText = document.createElement("div");
  questionText.className = "question-text study-question-text";
  appendQuestionTextWithInlineImages(questionText, question);

  const expandedContent = document.createElement("div");
  expandedContent.className = "study-expanded-content";

  const questionHeader = document.createElement("div");
  questionHeader.className = "study-question-header";

  const questionHeadingMain = document.createElement("div");
  questionHeadingMain.className = "study-question-heading-main";
  questionHeadingMain.appendChild(title);
  questionHeadingMain.appendChild(meta);
  const sourceLabel = createSourceLabel(question);
  if (sourceLabel) questionHeadingMain.appendChild(sourceLabel);

  const questionCounter = document.createElement("span");
  questionCounter.className = "study-question-counter";
  questionCounter.textContent = "Question " + (selectedQuestionIndex + 1) + " of " + currentFilteredQuestions.length;

  questionHeader.appendChild(questionHeadingMain);
  questionHeader.appendChild(questionCounter);

  const questionContent = document.createElement("div");
  questionContent.className = "study-question-content";
  questionContent.appendChild(questionText);
  questionContent.appendChild(expandedContent);

  const questionColumn = document.createElement("div");
  questionColumn.className = "study-question-column";
  questionColumn.appendChild(questionHeader);
  questionColumn.appendChild(questionContent);

  const actions = document.createElement("div");
  actions.className = "card-actions study-actions";
  actions.setAttribute("aria-label", "Question study tools");
  actions.appendChild(titleActions);
  const whereToLearnText = typeof question.whereToLearn === "string" && question.whereToLearn.trim() !== ""
    ? question.whereToLearn
    : "Learning resources have not been added for this question yet.";
  actions.appendChild(createToggleSection("Where to Learn", whereToLearnText, "where-to-learn-content", "where-to-learn-button", "Where to Learn", "Where to Learn", expandedContent));
  actions.appendChild(createToggleSection("Hint", question.hint, "hint-content", "hint-button", "Hint", "Hint", expandedContent));
  actions.appendChild(createAnswerModalButton(question));

  const questionWorkspace = document.createElement("div");
  questionWorkspace.className = "study-question-workspace";
  questionWorkspace.appendChild(questionColumn);
  questionWorkspace.appendChild(actions);

  const nav = document.createElement("div");
  nav.className = "study-nav";

  const previousButton = document.createElement("button");
  previousButton.type = "button";
  previousButton.textContent = "Previous";
  previousButton.disabled = selectedQuestionIndex === 0;
  previousButton.addEventListener("click", function() {
    if (selectedQuestionIndex > 0) {
      selectedQuestionIndex -= 1;
      renderStudyQuestion();
    }
  });

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.textContent = "Next";
  nextButton.disabled = selectedQuestionIndex === currentFilteredQuestions.length - 1;
  nextButton.addEventListener("click", function() {
    if (selectedQuestionIndex < currentFilteredQuestions.length - 1) {
      selectedQuestionIndex += 1;
      renderStudyQuestion();
    }
  });

  nav.appendChild(previousButton);
  nav.appendChild(nextButton);
  questionHeader.appendChild(nav);

  const studyBody = document.createElement("div");
  studyBody.className = "study-body";

  studyBody.appendChild(questionWorkspace);

  studyView.appendChild(studyBody);

  currentQuestionIndicator.textContent = (selectedQuestionIndex + 1) + " of " + currentFilteredQuestions.length;
  goToQuestionSelect.value = question.id;
  updateResultSelection();
  updateVisibleMarkedState();
  updateExportButtons();
  renderLocalMath(studyView);
}

function openStudyQuestion(filteredIndex) {
  selectedQuestionIndex = filteredIndex;
  if (!selectionMode) {
    setQuestionIndexOpen(false);
  }
  renderStudyQuestion();
}

function renderQuestions() {
  currentFilteredQuestions = getFilteredQuestions();
  selectedQuestionIndex = currentFilteredQuestions.length > 0 ? 0 : -1;
  updateFilterClearButtons();
  renderResultsList();
  renderStudyQuestion();
  updateSelectionModeUi();
  updateMarkedCount();
}

addOptions(topicFilter, getUniqueValues("topic"));

visibleQuestions.forEach(function(question) {
  const option = document.createElement("option");
  option.value = question.id;
  option.textContent = String(getQuestionNumber(question));
  goToQuestionSelect.appendChild(option);
});

answerModalCloseButton.addEventListener("click", closeAnswerModal);
answerModal.addEventListener("click", function(event) {
  if (event.target === answerModal) {
    closeAnswerModal();
  }
});

markedModalCloseButton.addEventListener("click", closeMarkedModal);
markedModal.addEventListener("click", function(event) {
  if (event.target === markedModal) {
    closeMarkedModal();
  }
});

document.addEventListener("keydown", function(event) {
  if (event.key !== "Escape") {
    return;
  }

  if (!answerModal.hidden) {
    closeAnswerModal();
  } else if (!markedModal.hidden) {
    closeMarkedModal();
  } else if (!questionIndexPopover.hidden) {
    setQuestionIndexOpen(false);
  }
});

questionIndexToggleButton.addEventListener("click", function(event) {
  event.stopPropagation();
  toggleQuestionIndex();
});

indexPanel.addEventListener("click", function(event) {
  event.stopPropagation();
});

document.addEventListener("click", function() {
  if (!questionIndexPopover.hidden) {
    setQuestionIndexOpen(false);
  }
});

selectionToggleButton.addEventListener("click", function() {
  selectionMode = !selectionMode;

  if (!selectionMode) {
    selectedQuestionIds.clear();
    renderResultsList();
  }

  updateSelectionModeUi();
});

document.querySelectorAll(".export-button").forEach(function(button) {
  button.addEventListener("click", exportSelectedQuestionsToWord);
});

selectAllCurrentButton.addEventListener("click", function() {
  const allCurrentSelected = currentFilteredQuestions.length > 0 && currentFilteredQuestions.every(function(question) {
    return selectedQuestionIds.has(question.id);
  });

  currentFilteredQuestions.forEach(function(question) {
    if (allCurrentSelected) {
      selectedQuestionIds.delete(question.id);
    } else {
      selectedQuestionIds.add(question.id);
    }
  });

  renderResultsList();
  updateResultSelection();
  updateExportButtons();
});

exportCancelButton.addEventListener("click", closeExportReviewModal);

includeAnswersCheckbox.addEventListener("change", updateExportReviewSummary);

exportPdfButton.addEventListener("click", function() {
  const questionsToExport = getIncludedExportReviewQuestions();

  if (questionsToExport.length === 0) {
    window.alert("Please select at least one question to export.");
    return;
  }

  exportSelectedQuestionsToPdf(questionsToExport, shouldIncludeAnswersInExport(), getExportFileName());
});

exportWordButton.addEventListener("click", async function() {
  const questionsToExport = getIncludedExportReviewQuestions();

  if (questionsToExport.length === 0) {
    window.alert("Please select at least one question to export.");
    return;
  }

  exportWordButton.disabled = true;

  try {
    await downloadWordDocument(questionsToExport, shouldIncludeAnswersInExport(), getExportFileName());
    closeExportReviewModal();
  } finally {
    updateExportReviewSummary();
  }
});


exportModal.addEventListener("click", function(event) {
  if (event.target === exportModal) {
    closeExportReviewModal();
  }
});

topicFilter.addEventListener("change", renderQuestions);
paperFilterInputs.forEach(function(input) {
  input.addEventListener("change", renderQuestions);
});
difficultyFilterInputs.forEach(function(input) {
  input.addEventListener("change", renderQuestions);
});

goToQuestionSelect.addEventListener("change", function() {
  if (goToQuestionSelect.value !== "") {
    openQuestionById(goToQuestionSelect.value);
  }
});

filterClearButtons.forEach(function(button) {
  button.addEventListener("click", function() {
    const target = document.querySelector(button.dataset.target);

    if (target) {
      target.value = "All";
      renderQuestions();
    }
  });
});

renderQuestions();
