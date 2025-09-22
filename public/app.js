const state = {
  questions: [],
  currentIndex: 0,
  answers: {},
  removedOptions: {},
  hintsShown: new Set(),
  lifelinesUsed: new Set(),
  lifelines: [],
  sabotage: null,
  locked: false,
  baseTotalTime: 0,
  totalTimeBudget: 0,
  remainingSeconds: 0,
  timerInterval: null,
  hasFinished: false,
  hasSubmitted: false,
  leaderboardCache: [],
  deadline: null
};

const elements = {
  deadlineText: document.getElementById('deadlineText'),
  lockedMessage: document.getElementById('lockedMessage'),
  gameplay: document.getElementById('gameplay'),
  summary: document.getElementById('summary'),
  timerDisplay: document.getElementById('timerDisplay'),
  progressFill: document.getElementById('progressFill'),
  questionCounter: document.getElementById('questionCounter'),
  questionCategory: document.getElementById('questionCategory'),
  questionPrompt: document.getElementById('questionPrompt'),
  optionsList: document.getElementById('optionsList'),
  lifelineButtons: document.getElementById('lifelineButtons'),
  skipButton: document.getElementById('skipButton'),
  submitButton: document.getElementById('submitButton'),
  hintBanner: document.getElementById('hintBanner'),
  hintText: document.getElementById('hintText'),
  summaryScore: document.getElementById('summaryScore'),
  summaryCorrect: document.getElementById('summaryCorrect'),
  summaryTime: document.getElementById('summaryTime'),
  summaryLifelines: document.getElementById('summaryLifelines'),
  submissionForm: document.getElementById('submissionForm'),
  playerName: document.getElementById('playerName'),
  sabotageTarget: document.getElementById('sabotageTarget'),
  formMessage: document.getElementById('formMessage'),
  leaderboard: document.getElementById('leaderboard'),
  refreshLeaderboard: document.getElementById('refreshLeaderboard')
};

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (safeSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatDeadline(deadlineIso) {
  if (!deadlineIso) return '--:--';
  const deadline = new Date(deadlineIso);
  return deadline.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function shuffle(array) {
  const clone = [...array];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function updateTimerDisplay() {
  elements.timerDisplay.textContent = formatTime(state.remainingSeconds);
}

function updateProgress() {
  const total = state.questions.length;
  const answered = Object.keys(state.answers).filter((key) => state.answers[key] !== undefined).length;
  const percent = total > 0 ? Math.min(100, Math.round((answered / total) * 100)) : 0;
  elements.progressFill.style.width = `${percent}%`;
  if (total > 0) {
    elements.questionCounter.textContent = `${state.currentIndex + 1} / ${total}`;
  } else {
    elements.questionCounter.textContent = '0 / 0';
  }
  elements.submitButton.disabled = state.hasFinished || answered === 0;
}

function findNextQuestionIndex(currentIndex) {
  const total = state.questions.length;
  if (total === 0) return 0;
  for (let step = 1; step <= total; step += 1) {
    const candidate = (currentIndex + step) % total;
    const questionId = state.questions[candidate].id;
    if (state.answers[questionId] === undefined) {
      return candidate;
    }
  }
  return currentIndex;
}

function renderQuestion() {
  if (!state.questions.length) {
    elements.optionsList.innerHTML = '';
    return;
  }

  const question = state.questions[state.currentIndex];
  elements.questionCategory.textContent = question.category;
  elements.questionPrompt.textContent = question.prompt;

  const selected = state.answers[question.id];
  const removed = state.removedOptions[question.id] || new Set();

  elements.optionsList.innerHTML = '';
  question.options.forEach((option) => {
    const li = document.createElement('li');
    if (removed.has(option)) {
      li.classList.add('disabled');
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option;

    if (!removed.has(option) && !state.hasFinished) {
      button.addEventListener('click', () => handleOptionSelect(question, option));
    }

    if (selected === option) {
      li.classList.add('selected');
    }

    li.appendChild(button);
    elements.optionsList.appendChild(li);
  });

  if (state.hintsShown.has(question.id)) {
    elements.hintBanner.hidden = false;
    elements.hintText.textContent = question.hint;
  } else {
    elements.hintBanner.hidden = true;
    elements.hintText.textContent = '';
  }

  updateProgress();
}

function handleOptionSelect(question, option) {
  state.answers[question.id] = option;
  const nextIndex = findNextQuestionIndex(state.currentIndex);
  if (nextIndex !== state.currentIndex) {
    state.currentIndex = nextIndex;
  }
  renderQuestion();
}

function goToNextQuestion() {
  state.currentIndex = findNextQuestionIndex(state.currentIndex);
  renderQuestion();
}

function startTimer() {
  clearInterval(state.timerInterval);
  state.totalTimeBudget = state.baseTotalTime;
  state.remainingSeconds = state.baseTotalTime;
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    if (state.hasFinished) {
      clearInterval(state.timerInterval);
      return;
    }
    state.remainingSeconds -= 1;
    if (state.remainingSeconds <= 0) {
      state.remainingSeconds = 0;
      updateTimerDisplay();
      clearInterval(state.timerInterval);
      finishQuiz('timeout');
      return;
    }
    updateTimerDisplay();
  }, 1000);
}

function applyFiftyFifty(question) {
  const incorrect = question.options.filter((option) => option !== question.answer);
  const toRemove = shuffle(incorrect).slice(0, 2);
  state.removedOptions[question.id] = new Set(toRemove);
  renderQuestion();
}

function applyHint(question) {
  if (!question.hint) return;
  state.hintsShown.add(question.id);
  elements.hintBanner.hidden = false;
  elements.hintText.textContent = question.hint;
}

function applyTimeBoost() {
  state.remainingSeconds += 30;
  state.totalTimeBudget += 30;
  elements.timerDisplay.classList.add('boost');
  updateTimerDisplay();
  setTimeout(() => elements.timerDisplay.classList.remove('boost'), 1200);
}

function useLifeline(lifeline) {
  if (state.hasFinished || state.questions.length === 0) {
    return;
  }
  if (state.lifelinesUsed.has(lifeline.id)) {
    return;
  }
  const question = state.questions[state.currentIndex];
  state.lifelinesUsed.add(lifeline.id);

  if (lifeline.id === 'fifty-fifty') {
    applyFiftyFifty(question);
  } else if (lifeline.id === 'hint') {
    applyHint(question);
  } else if (lifeline.id === 'time-boost') {
    applyTimeBoost();
  }
  updateLifelineButtons();
  updateProgress();
}

function updateLifelineButtons() {
  const buttons = elements.lifelineButtons.querySelectorAll('button');
  buttons.forEach((button) => {
    const id = button.dataset.id;
    button.disabled = state.lifelinesUsed.has(id) || state.hasFinished;
  });
}

function renderLifelines(lifelines) {
  elements.lifelineButtons.innerHTML = '';
  lifelines.forEach((lifeline) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lifeline-button';
    button.dataset.id = lifeline.id;
    button.textContent = lifeline.name;
    button.title = lifeline.description;
    button.addEventListener('click', () => useLifeline(lifeline));
    elements.lifelineButtons.appendChild(button);
  });
  updateLifelineButtons();
}

function computeStats() {
  const total = state.questions.length;
  let correctCount = 0;
  state.questions.forEach((question) => {
    if (state.answers[question.id] && state.answers[question.id] === question.answer) {
      correctCount += 1;
    }
  });
  const lifelineCount = state.lifelinesUsed.size;
  const elapsed = Math.max(0, Math.round(state.totalTimeBudget - state.remainingSeconds));
  const baseScore = correctCount * 100;
  const timeBonus = Math.max(0, Math.round((state.baseTotalTime - elapsed) * 2));
  const penalty = lifelineCount * 30;
  const score = Math.max(0, baseScore + timeBonus - penalty);
  return { correctCount, lifelineCount, elapsed, score, total };
}

function finishQuiz(reason) {
  if (state.hasFinished) {
    return;
  }
  state.hasFinished = true;
  clearInterval(state.timerInterval);
  state.timerInterval = null;

  if (reason === 'timeout') {
    state.remainingSeconds = 0;
  }

  const stats = computeStats();

  elements.gameplay.hidden = true;
  elements.summary.hidden = false;
  elements.summaryScore.textContent = stats.score;
  elements.summaryCorrect.textContent = `${stats.correctCount} / ${stats.total}`;
  elements.summaryTime.textContent = formatTime(stats.elapsed);
  elements.summaryLifelines.textContent = `${stats.lifelineCount}`;
  elements.formMessage.hidden = true;
  elements.formMessage.textContent = '';
  updateLifelineButtons();
  updateSubmitButtonState();
}

function updateSubmitButtonState() {
  elements.submitButton.disabled = true;
}

async function submitResults(event) {
  event.preventDefault();
  if (!state.hasFinished || state.hasSubmitted) {
    return;
  }
  const formData = new FormData(elements.submissionForm);
  const playerName = formData.get('playerName');
  const sabotageTarget = formData.get('sabotageTarget');

  if (!playerName || !playerName.trim()) {
    showFormMessage('Please share a player name to lock your score.', 'error');
    return;
  }

  const stats = computeStats();
  const payload = {
    playerName: playerName.trim(),
    responses: state.questions.map((question) => ({
      questionId: question.id,
      selectedOption: state.answers[question.id] ?? null
    })),
    timeTakenSeconds: stats.elapsed,
    lifelinesUsed: Array.from(state.lifelinesUsed),
    sabotageTarget: sabotageTarget ? sabotageTarget : undefined
  };

  try {
    showFormMessage('Submitting your score...', 'info');
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      const errorMessage = data && data.message ? data.message : 'Unable to submit right now.';
      showFormMessage(errorMessage, 'error');
      return;
    }

    state.hasSubmitted = true;
    showFormMessage('Score locked! Check the leaderboard to see how you placed.', 'success');
    disableSubmissionForm();
    if (data.leaderboard) {
      renderLeaderboard(data.leaderboard);
    } else {
      await fetchLeaderboard();
    }
  } catch (error) {
    showFormMessage('Network error. Try again in a moment.', 'error');
  }
}

function showFormMessage(message, type) {
  elements.formMessage.hidden = false;
  elements.formMessage.textContent = message;
  elements.formMessage.className = 'form-message';
  if (type === 'success') {
    elements.formMessage.classList.add('success');
  } else if (type === 'error') {
    elements.formMessage.classList.add('error');
  }
}

function disableSubmissionForm() {
  elements.submissionForm.querySelector('button[type="submit"]').disabled = true;
  elements.playerName.disabled = true;
  elements.sabotageTarget.disabled = true;
}

function renderLeaderboard(entries) {
  state.leaderboardCache = entries || [];
  elements.leaderboard.innerHTML = '';

  if (!state.leaderboardCache.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No scores yet. Be the first to claim the crown!';
    elements.leaderboard.appendChild(empty);
  } else {
    state.leaderboardCache.forEach((entry, index) => {
      const li = document.createElement('li');
      if (index === 0) {
        li.classList.add('top-entry');
      }
      const primary = document.createElement('div');
      primary.className = 'row-primary';
      primary.innerHTML = `<span>${entry.playerName}</span><span>${entry.adjustedScore}</span>`;

      const secondary = document.createElement('div');
      secondary.className = 'row-secondary';
      secondary.innerHTML = `Score: ${entry.score} · Correct: ${entry.correctCount} · Time: ${formatTime(entry.timeTakenSeconds)}`;

      const penaltyRow = document.createElement('div');
      penaltyRow.className = 'row-secondary';
      const penaltyValue = entry.sabotagePenalty > 0 ? `-${entry.sabotagePenalty}` : '0';
      penaltyRow.innerHTML = `<span>Sabotage Penalty</span><span class="penalty">${penaltyValue}</span>`;

      li.appendChild(primary);
      li.appendChild(secondary);
      li.appendChild(penaltyRow);
      elements.leaderboard.appendChild(li);
    });
  }

  updateSabotageOptions();
}

function updateSabotageOptions() {
  if (!elements.sabotageTarget) {
    return;
  }
  const current = elements.sabotageTarget.value;
  while (elements.sabotageTarget.options.length > 1) {
    elements.sabotageTarget.remove(1);
  }
  state.leaderboardCache.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.playerName;
    option.textContent = entry.playerName;
    elements.sabotageTarget.appendChild(option);
  });
  if (current) {
    elements.sabotageTarget.value = current;
  }
}

async function fetchLeaderboard() {
  try {
    const response = await fetch('/api/leaderboard');
    if (!response.ok) {
      throw new Error('Unable to load leaderboard');
    }
    const data = await response.json();
    renderLeaderboard(data.leaderboard || []);
  } catch (error) {
    const message = document.createElement('li');
    message.textContent = 'Leaderboard is taking a break. Try refreshing soon.';
    elements.leaderboard.innerHTML = '';
    elements.leaderboard.appendChild(message);
  }
}

async function loadQuiz() {
  try {
    const response = await fetch('/api/quiz');
    if (!response.ok) {
      throw new Error('Failed to load quiz data.');
    }
    const data = await response.json();
    state.questions = data.questions || [];
    state.baseTotalTime = data.totalTimeSeconds || 300;
    state.deadline = data.deadline;
    state.locked = Boolean(data.isLocked);
    state.lifelines = data.lifelines || [];
    state.sabotage = data.sabotage || null;

    elements.deadlineText.textContent = formatDeadline(data.deadline);

    const sabotageHelper = elements.submissionForm.querySelector('small');
    if (sabotageHelper && state.sabotage && typeof state.sabotage.penalty === 'number') {
      sabotageHelper.innerHTML = `Spend your sabotage to dock an opponent <strong>${state.sabotage.penalty} points</strong>.`;
    }

    state.answers = {};
    state.removedOptions = {};
    state.hintsShown = new Set();
    state.lifelinesUsed = new Set();
    state.hasFinished = false;
    state.hasSubmitted = false;
    elements.playerName.disabled = false;
    elements.sabotageTarget.disabled = false;
    if (elements.submissionForm) {
      elements.submissionForm.querySelector('button[type="submit"]').disabled = false;
      elements.submissionForm.reset();
    }
    elements.formMessage.hidden = true;
    elements.formMessage.textContent = '';

    renderLifelines(state.lifelines);

    if (state.locked) {
      elements.lockedMessage.hidden = false;
      elements.gameplay.hidden = true;
      elements.summary.hidden = true;
      updateProgress();
      return;
    }

    elements.lockedMessage.hidden = true;
    elements.summary.hidden = true;
    elements.gameplay.hidden = false;

    state.currentIndex = 0;
    renderQuestion();
    updateProgress();
    startTimer();
  } catch (error) {
    elements.lockedMessage.hidden = false;
    elements.lockedMessage.innerHTML = `<h2>We hit a snag loading the quiz.</h2><p>${error.message}</p>`;
    elements.gameplay.hidden = true;
    elements.summary.hidden = true;
  }
}

function setupEventListeners() {
  elements.skipButton.addEventListener('click', goToNextQuestion);
  elements.submitButton.addEventListener('click', () => finishQuiz('manual'));
  elements.submissionForm.addEventListener('submit', submitResults);
  elements.refreshLeaderboard.addEventListener('click', fetchLeaderboard);
}

async function init() {
  setupEventListeners();
  await loadQuiz();
  await fetchLeaderboard();
}

init();
