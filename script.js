
(() => {
  "use strict";

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        console.warn("StudyMate: could not read", key, e);
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        console.warn("StudyMate: could not save", key, e);
      }
    }
  };

  const uid = () => Math.random().toString(36).slice(2, 10);
  const todayKey = () => new Date().toISOString().slice(0, 10);


  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".panel");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.section;
      tabs.forEach(t => t.removeAttribute("aria-current"));
      tab.setAttribute("aria-current", "true");
      panels.forEach(p => {
        if (p.id === `panel-${target}`) p.setAttribute("data-active", "true");
        else p.removeAttribute("data-active");
      });
    });
  });

  const RING_CIRCUMFERENCE = 615.75;

  const timerState = store.get("studymate_timer_settings", {
    focusMins: 25,
    breakMins: 5,
    sessionsToday: 0,
    lastSessionDate: todayKey()
  });

 
  if (timerState.lastSessionDate !== todayKey()) {
    timerState.sessionsToday = 0;
    timerState.lastSessionDate = todayKey();
    store.set("studymate_timer_settings", timerState);
  }

  let mode = "focus";              
  let secondsLeft = timerState.focusMins * 60;
  let totalSeconds = secondsLeft;
  let running = false;
  let intervalId = null;

  const timerFace = document.getElementById("timerFace");
  const ringProgress = document.getElementById("ringProgress");
  const timerTimeEl = document.getElementById("timerTime");
  const timerModeLabel = document.getElementById("timerModeLabel");
  const timerRoundEl = document.getElementById("timerRound");
  const btnStartPause = document.getElementById("btnStartPause");
  const btnReset = document.getElementById("btnReset");
  const sessionCountEl = document.getElementById("sessionCount");
  const focusOptions = document.getElementById("focusLengthOptions");
  const breakOptions = document.getElementById("breakLengthOptions");

  function formatTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  function renderTimer() {
    timerTimeEl.textContent = formatTime(secondsLeft);
    timerModeLabel.textContent = mode === "focus" ? "Focus" : "Break";
    timerFace.dataset.mode = mode;
    timerRoundEl.textContent = `Round ${timerState.sessionsToday + 1}`;
    sessionCountEl.textContent = timerState.sessionsToday;

    const fraction = totalSeconds > 0 ? secondsLeft / totalSeconds : 0;
    ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - fraction));

    btnStartPause.textContent = running ? "Pause" : (secondsLeft === totalSeconds ? "Start" : "Resume");

    [...focusOptions.children].forEach(chip => {
      chip.toggleAttribute("aria-current", Number(chip.dataset.mins) === timerState.focusMins);
    });
    [...breakOptions.children].forEach(chip => {
      chip.toggleAttribute("aria-current", Number(chip.dataset.mins) === timerState.breakMins);
    });
  }

  function switchMode(nextMode) {
    mode = nextMode;
    totalSeconds = (mode === "focus" ? timerState.focusMins : timerState.breakMins) * 60;
    secondsLeft = totalSeconds;
    renderTimer();
  }

  function tick() {
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      if (mode === "focus") {
        timerState.sessionsToday += 1;
        timerState.lastSessionDate = todayKey();
        store.set("studymate_timer_settings", timerState);
        switchMode("break");
      } else {
        switchMode("focus");
      }
      running = false;
      clearInterval(intervalId);
    }
    renderTimer();
  }

  btnStartPause.addEventListener("click", () => {
    running = !running;
    if (running) {
      intervalId = setInterval(tick, 1000);
    } else {
      clearInterval(intervalId);
    }
    renderTimer();
  });

  btnReset.addEventListener("click", () => {
    running = false;
    clearInterval(intervalId);
    switchMode("focus");
  });

  focusOptions.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    timerState.focusMins = Number(chip.dataset.mins);
    store.set("studymate_timer_settings", timerState);
    if (mode === "focus" && !running) switchMode("focus");
    else renderTimer();
  });

  breakOptions.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    timerState.breakMins = Number(chip.dataset.mins);
    store.set("studymate_timer_settings", timerState);
    if (mode === "break" && !running) switchMode("break");
    else renderTimer();
  });

  switchMode("focus");


  let tasks = store.get("studymate_tasks", []);
  let taskFilter = "open";

  const taskForm = document.getElementById("taskForm");
  const taskTitleInput = document.getElementById("taskTitle");
  const taskSubjectInput = document.getElementById("taskSubject");
  const taskDueInput = document.getElementById("taskDue");
  const taskListEl = document.getElementById("taskList");
  const taskEmptyNote = document.getElementById("taskEmptyNote");
  const taskFilterBtns = document.querySelectorAll(".filter-btn");
  const glanceTasksEl = document.getElementById("glanceTasks");

  function saveTasks() { store.set("studymate_tasks", tasks); }

  function formatDue(dateStr) {
    if (!dateStr) return "No date";
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function renderTasks() {
    let visible = tasks;
    if (taskFilter === "open") visible = tasks.filter(t => !t.done);
    if (taskFilter === "done") visible = tasks.filter(t => t.done);

    visible = [...visible].sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));

    taskListEl.innerHTML = "";
    visible.forEach(task => {
      const li = document.createElement("li");
      li.className = "task-item" + (task.done ? " is-done" : "");
      li.innerHTML = `
        <button class="task-check" aria-label="Toggle done" data-id="${task.id}"></button>
        <div class="task-body">
          <div class="task-title">${escapeHtml(task.title)}</div>
          <div class="task-meta">
            ${task.subject ? `<span class="task-subject-tag">${escapeHtml(task.subject)}</span>` : ""}
            <span>${formatDue(task.due)}</span>
          </div>
        </div>
        <button class="task-delete" aria-label="Delete task" data-id="${task.id}">Remove</button>
      `;
      taskListEl.appendChild(li);
    });

    taskEmptyNote.classList.toggle("is-visible", visible.length === 0);

    const soon = tasks
      .filter(t => !t.done && t.due)
      .filter(t => {
        const days = (new Date(t.due) - new Date(todayKey())) / 86400000;
        return days <= 7;
      })
      .sort((a, b) => a.due.localeCompare(b.due))
      .slice(0, 5);

    glanceTasksEl.innerHTML = "";
    if (soon.length === 0) {
      glanceTasksEl.innerHTML = `<li style="color: var(--ink-faint); border: none;">Nothing due soon — add tasks in the Tasks tab.</li>`;
    } else {
      soon.forEach(t => {
        const li = document.createElement("li");
        li.innerHTML = `<span>${escapeHtml(t.title)}</span><span class="glance-due">${formatDue(t.due)}</span>`;
        glanceTasksEl.appendChild(li);
      });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  taskForm.addEventListener("submit", e => {
    e.preventDefault();
    const title = taskTitleInput.value.trim();
    if (!title) return;
    tasks.push({
      id: uid(),
      title,
      subject: taskSubjectInput.value.trim(),
      due: taskDueInput.value,
      done: false
    });
    saveTasks();
    taskForm.reset();
    renderTasks();
  });

  taskListEl.addEventListener("click", e => {
    const checkBtn = e.target.closest(".task-check");
    const delBtn = e.target.closest(".task-delete");
    if (checkBtn) {
      const task = tasks.find(t => t.id === checkBtn.dataset.id);
      if (task) task.done = !task.done;
      saveTasks();
      renderTasks();
    }
    if (delBtn) {
      tasks = tasks.filter(t => t.id !== delBtn.dataset.id);
      saveTasks();
      renderTasks();
    }
  });

  taskFilterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      taskFilterBtns.forEach(b => b.removeAttribute("aria-current"));
      btn.setAttribute("aria-current", "true");
      taskFilter = btn.dataset.filter;
      renderTasks();
    });
  });

  renderTasks();

  let decks = store.get("studymate_decks", []);
  let activeDeckId = decks[0]?.id || null;
  let studyIndex = 0;
  let flipped = false;

  const deckShelf = document.getElementById("deckShelf");
  const deckForm = document.getElementById("deckForm");
  const deckNameInput = document.getElementById("deckName");
  const deckWorkspace = document.getElementById("deckWorkspace");
  const activeDeckNameEl = document.getElementById("activeDeckName");
  const btnDeleteDeck = document.getElementById("btnDeleteDeck");
  const cardStudy = document.getElementById("cardStudy");
  const cardsEmptyNote = document.getElementById("cardsEmptyNote");
  const flashcard = document.getElementById("flashcard");
  const cardFront = document.getElementById("cardFront");
  const cardBack = document.getElementById("cardBack");
  const studyPosition = document.getElementById("studyPosition");
  const btnPrevCard = document.getElementById("btnPrevCard");
  const btnNextCard = document.getElementById("btnNextCard");
  const cardForm = document.getElementById("cardForm");
  const cardFrontInput = document.getElementById("cardFrontInput");
  const cardBackInput = document.getElementById("cardBackInput");

  function saveDecks() { store.set("studymate_decks", decks); }
  function activeDeck() { return decks.find(d => d.id === activeDeckId) || null; }

  function renderDeckShelf() {
    deckShelf.innerHTML = "";
    decks.forEach(deck => {
      const btn = document.createElement("button");
      btn.className = "deck-chip";
      btn.textContent = `${deck.name} (${deck.cards.length})`;
      btn.dataset.id = deck.id;
      if (deck.id === activeDeckId) btn.setAttribute("aria-current", "true");
      deckShelf.appendChild(btn);
    });
  }

  function renderDeckWorkspace() {
    const deck = activeDeck();
    if (!deck) {
      deckWorkspace.hidden = true;
      return;
    }
    deckWorkspace.hidden = false;
    activeDeckNameEl.textContent = deck.name;

    if (deck.cards.length === 0) {
      cardStudy.hidden = true;
      cardsEmptyNote.classList.add("is-visible");
      return;
    }
    cardsEmptyNote.classList.remove("is-visible");
    cardStudy.hidden = false;

    if (studyIndex >= deck.cards.length) studyIndex = 0;
    const card = deck.cards[studyIndex];
    flipped = false;
    flashcard.dataset.flipped = "false";
    cardFront.textContent = card.front;
    cardBack.textContent = card.back;
    studyPosition.textContent = `${studyIndex + 1} / ${deck.cards.length}`;
  }

  deckForm.addEventListener("submit", e => {
    e.preventDefault();
    const name = deckNameInput.value.trim();
    if (!name) return;
    const deck = { id: uid(), name, cards: [] };
    decks.push(deck);
    activeDeckId = deck.id;
    studyIndex = 0;
    saveDecks();
    deckForm.reset();
    renderDeckShelf();
    renderDeckWorkspace();
  });

  deckShelf.addEventListener("click", e => {
    const chip = e.target.closest(".deck-chip");
    if (!chip) return;
    activeDeckId = chip.dataset.id;
    studyIndex = 0;
    renderDeckShelf();
    renderDeckWorkspace();
  });

  btnDeleteDeck.addEventListener("click", () => {
    if (!activeDeckId) return;
    decks = decks.filter(d => d.id !== activeDeckId);
    activeDeckId = decks[0]?.id || null;
    studyIndex = 0;
    saveDecks();
    renderDeckShelf();
    renderDeckWorkspace();
  });

  flashcard.addEventListener("click", () => {
    flipped = !flipped;
    flashcard.dataset.flipped = String(flipped);
  });

  btnPrevCard.addEventListener("click", () => {
    const deck = activeDeck();
    if (!deck || deck.cards.length === 0) return;
    studyIndex = (studyIndex - 1 + deck.cards.length) % deck.cards.length;
    renderDeckWorkspace();
  });

  btnNextCard.addEventListener("click", () => {
    const deck = activeDeck();
    if (!deck || deck.cards.length === 0) return;
    studyIndex = (studyIndex + 1) % deck.cards.length;
    renderDeckWorkspace();
  });

  cardForm.addEventListener("submit", e => {
    e.preventDefault();
    const deck = activeDeck();
    if (!deck) return;
    const front = cardFrontInput.value.trim();
    const back = cardBackInput.value.trim();
    if (!front || !back) return;
    deck.cards.push({ id: uid(), front, back });
    studyIndex = deck.cards.length - 1;
    saveDecks();
    cardForm.reset();
    renderDeckWorkspace();
  });

  renderDeckShelf();
  renderDeckWorkspace();

  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  let blocks = store.get("studymate_blocks", []);

  const blockForm = document.getElementById("blockForm");
  const blockDay = document.getElementById("blockDay");
  const blockTime = document.getElementById("blockTime");
  const blockLabel = document.getElementById("blockLabel");
  const weekGrid = document.getElementById("weekGrid");

  function saveBlocks() { store.set("studymate_blocks", blocks); }

  function formatTime12(t) {
    const [h, m] = t.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
  }

  function renderWeek() {
    weekGrid.innerHTML = "";
    DAYS.forEach(day => {
      const col = document.createElement("div");
      col.className = "day-column";
      const dayBlocks = blocks
        .filter(b => b.day === day)
        .sort((a, b) => a.time.localeCompare(b.time));

      col.innerHTML = `<h3>${day.slice(0, 3)}</h3>` + dayBlocks.map(b => `
        <div class="block-item">
          <button class="block-remove" data-id="${b.id}" aria-label="Remove">×</button>
          <span class="block-time">${formatTime12(b.time)}</span>
          ${escapeHtml(b.label)}
        </div>
      `).join("");

      weekGrid.appendChild(col);
    });
  }

  blockForm.addEventListener("submit", e => {
    e.preventDefault();
    if (!blockDay.value || !blockTime.value || !blockLabel.value.trim()) return;
    blocks.push({
      id: uid(),
      day: blockDay.value,
      time: blockTime.value,
      label: blockLabel.value.trim()
    });
    saveBlocks();
    blockForm.reset();
    renderWeek();
  });

  weekGrid.addEventListener("click", e => {
    const btn = e.target.closest(".block-remove");
    if (!btn) return;
    blocks = blocks.filter(b => b.id !== btn.dataset.id);
    saveBlocks();
    renderWeek();
  });

  renderWeek();

})();