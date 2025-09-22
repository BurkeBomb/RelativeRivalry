const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');

const PORT = process.env.PORT || 3000;
const TOTAL_TIME_SECONDS = 300;
const DAILY_DEADLINE_HOUR = 20; // 8 PM local time
const SABOTAGE_PENALTY = 120;
const SUBMISSION_DIR = path.join(__dirname, 'data');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let questionPool = [];

async function loadQuestions() {
  if (questionPool.length) {
    return questionPool;
  }
  const questionPath = path.join(__dirname, 'data', 'questions.json');
  const raw = await fs.readFile(questionPath, 'utf-8');
  questionPool = JSON.parse(raw);
  return questionPool;
}

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDailyDeadlineInfo(now = new Date()) {
  const deadline = new Date(now);
  deadline.setHours(DAILY_DEADLINE_HOUR, 0, 0, 0);
  let isLocked = false;
  if (now > deadline) {
    isLocked = true;
  }
  return { deadline, isLocked };
}

function getSeedFromDateKey(dateKey) {
  return parseInt(dateKey.replace(/-/g, ''), 10);
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function pickDailyQuestions(pool, dateKey) {
  if (pool.length < 20) {
    throw new Error('Question pool must contain at least 20 questions.');
  }
  const rng = mulberry32(getSeedFromDateKey(dateKey));
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 20);
}

function getSubmissionPath(dateKey) {
  return path.join(SUBMISSION_DIR, `submissions-${dateKey}.json`);
}

async function readSubmissions(dateKey) {
  const filePath = getSubmissionPath(dateKey);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeSubmissions(dateKey, submissions) {
  const filePath = getSubmissionPath(dateKey);
  await fs.writeFile(filePath, JSON.stringify(submissions, null, 2), 'utf-8');
}

function computeScore({ correctCount, timeTakenSeconds, lifelineCount }) {
  const baseScore = correctCount * 100;
  const timeBonus = Math.max(0, Math.round((TOTAL_TIME_SECONDS - timeTakenSeconds) * 2));
  const lifelinePenalty = lifelineCount * 30;
  return Math.max(0, baseScore + timeBonus - lifelinePenalty);
}

function buildLeaderboard(submissions) {
  const sabotageTotals = submissions.reduce((acc, submission) => {
    if (submission.sabotageTarget && submission.sabotageTarget !== submission.playerName) {
      acc[submission.sabotageTarget] = (acc[submission.sabotageTarget] || 0) + SABOTAGE_PENALTY;
    }
    return acc;
  }, {});

  return submissions
    .map((submission) => {
      const sabotagePenalty = sabotageTotals[submission.playerName] || 0;
      const adjustedScore = Math.max(0, submission.finalScore - sabotagePenalty);
      return {
        playerName: submission.playerName,
        score: submission.finalScore,
        adjustedScore,
        sabotagePenalty,
        correctCount: submission.correctCount,
        timeTakenSeconds: submission.timeTakenSeconds,
        lifelinesUsed: submission.lifelinesUsed,
        sabotageTarget: submission.sabotageTarget,
        submittedAt: submission.submittedAt
      };
    })
    .sort((a, b) => {
      if (b.adjustedScore !== a.adjustedScore) {
        return b.adjustedScore - a.adjustedScore;
      }
      return a.timeTakenSeconds - b.timeTakenSeconds;
    });
}

const lifelinesCatalog = [
  {
    id: 'fifty-fifty',
    name: '50/50',
    description: 'Removes two incorrect answers from the current question.'
  },
  {
    id: 'hint',
    name: 'Reveal Hint',
    description: 'Shows the hint associated with the current question.'
  },
  {
    id: 'time-boost',
    name: 'Time Boost',
    description: 'Adds 30 bonus seconds to the overall timer (single use).'
  }
];

const sabotageConfig = {
  penalty: SABOTAGE_PENALTY,
  description: 'Pick an opponent to apply a -120 point penalty to their final score. Use it wisely!',
  usageLimit: 1
};

app.get('/api/quiz', async (req, res) => {
  try {
    const pool = await loadQuestions();
    const dateKey = getDateKey();
    const dailyQuestions = pickDailyQuestions(pool, dateKey).map((question) => ({
      id: question.id,
      category: question.category,
      prompt: question.prompt,
      options: question.options,
      hint: question.hint,
      answer: question.answer
    }));
    const { deadline, isLocked } = getDailyDeadlineInfo();

    res.json({
      dateKey,
      totalQuestions: dailyQuestions.length,
      totalTimeSeconds: TOTAL_TIME_SECONDS,
      deadline: deadline.toISOString(),
      isLocked,
      lifelines: lifelinesCatalog,
      sabotage: sabotageConfig,
      questions: dailyQuestions
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load quiz.', error: error.message });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const dateKey = getDateKey();
    const submissions = await readSubmissions(dateKey);
    const { deadline, isLocked } = getDailyDeadlineInfo();
    res.json({
      dateKey,
      deadline: deadline.toISOString(),
      isLocked,
      sabotage: sabotageConfig,
      leaderboard: buildLeaderboard(submissions)
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load leaderboard.', error: error.message });
  }
});

app.post('/api/submit', async (req, res) => {
  try {
    const pool = await loadQuestions();
    const now = new Date();
    const dateKey = getDateKey(now);
    const { deadline, isLocked } = getDailyDeadlineInfo(now);
    if (isLocked) {
      return res.status(403).json({ message: 'Daily deadline has passed. Come back tomorrow!' });
    }

    const {
      playerName,
      responses,
      timeTakenSeconds,
      lifelinesUsed = [],
      sabotageTarget
    } = req.body;

    if (!playerName || typeof playerName !== 'string' || !playerName.trim()) {
      return res.status(400).json({ message: 'Player name is required.' });
    }

    if (!Array.isArray(responses)) {
      return res.status(400).json({ message: 'Responses must be provided as an array.' });
    }

    const sanitizedName = playerName.trim().slice(0, 32);
    const lifelineSet = Array.isArray(lifelinesUsed) ? [...new Set(lifelinesUsed)] : [];

    const dailyQuestions = pickDailyQuestions(pool, dateKey);
    const questionMap = dailyQuestions.reduce((acc, question) => {
      acc[question.id] = question;
      return acc;
    }, {});

    let correctCount = 0;
    responses.forEach((response) => {
      if (!response || !response.questionId) {
        return;
      }
      const question = questionMap[response.questionId];
      if (!question) {
        return;
      }
      if (response.selectedOption === question.answer) {
        correctCount += 1;
      }
    });

    const recordedTime = Number.isFinite(timeTakenSeconds) ? Math.max(0, Math.min(timeTakenSeconds, TOTAL_TIME_SECONDS + 120)) : TOTAL_TIME_SECONDS;

    const submissionRecord = {
      playerName: sanitizedName,
      correctCount,
      totalQuestions: dailyQuestions.length,
      timeTakenSeconds: Math.round(recordedTime),
      lifelinesUsed: lifelineSet.slice(0, lifelinesCatalog.length),
      sabotageTarget: typeof sabotageTarget === 'string' ? sabotageTarget.trim().slice(0, 32) : null,
      finalScore: 0,
      submittedAt: now.toISOString()
    };

    submissionRecord.finalScore = computeScore({
      correctCount: submissionRecord.correctCount,
      timeTakenSeconds: submissionRecord.timeTakenSeconds,
      lifelineCount: submissionRecord.lifelinesUsed.length
    });

    const submissions = await readSubmissions(dateKey);
    if (submissions.some((entry) => entry.playerName.toLowerCase() === sanitizedName.toLowerCase())) {
      return res.status(409).json({ message: 'You have already submitted today. Come back tomorrow!' });
    }

    submissions.push(submissionRecord);
    await writeSubmissions(dateKey, submissions);

    const leaderboard = buildLeaderboard(submissions);
    res.json({
      message: 'Submission received! See you on the leaderboard.',
      finalScore: submissionRecord.finalScore,
      correctCount: submissionRecord.correctCount,
      leaderboard
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to submit results.', error: error.message });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Relative Rivalry server running on port ${PORT}`);
});
