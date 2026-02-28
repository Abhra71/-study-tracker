// ── FIREBASE ──
const firebaseConfig = {
  apiKey: "AIzaSyAhSs91u9b-ETE8fs6k7i3ndOXzaZ4kx_E",
  authDomain: "study-tracker-5b83c.firebaseapp.com",
  projectId: "study-tracker-5b83c",
  storageBucket: "study-tracker-5b83c.firebasestorage.app",
  messagingSenderId: "240870660447",
  appId: "1:240870660447:web:375901105b3650a11a7eea",
};
try {
  firebase.initializeApp(firebaseConfig);
} catch (e) {
  console.log("Firebase:", e);
}
var db;
try {
  db = firebase.firestore();
} catch (e) {
  db = null;
}

// ── DATA ──
const DEFAULT_SUBJECTS = [
  "History & Civics",
  "Geography",
  "English Language",
  "English Literature",
  "Bengali",
  "Hindi",
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Applications",
  "Economic Applications",
];

let chapters = JSON.parse(localStorage.getItem("st_chapters")) || [];
let revisions = JSON.parse(localStorage.getItem("st_revisions")) || [];
let subjects = JSON.parse(localStorage.getItem("st_subjects")) || [
  ...DEFAULT_SUBJECTS,
];
let profile = JSON.parse(localStorage.getItem("st_profile")) || null;
let streak = JSON.parse(localStorage.getItem("st_streak")) || {
  count: 0,
  lastDate: "",
};
let weeklyLog = JSON.parse(localStorage.getItem("st_weekly")) || {};
let coins = parseInt(localStorage.getItem("st_coins") || "0", 10);
let currentFilter = "all";
let missedRevisions = JSON.parse(localStorage.getItem("st_missed")) || [];
let graceTimerInterval = null;
let groupCode = localStorage.getItem("st_group") || "";
let groupName = localStorage.getItem("st_grpname") || "";
let lbUnsubscribe = null;
let groupNameUnsubscribe = null;
let activityUnsubscribe = null;
let isCreator = localStorage.getItem("st_isCreator") === "true";
let groupDisplayName = localStorage.getItem("st_groupDisplayName") || "";

// Stable unique member ID per device/profile for group doc identity
let memberId = localStorage.getItem("st_memberId") || "";
if (!memberId) {
  memberId = Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  localStorage.setItem("st_memberId", memberId);
}

// ── HELPERS ──
const IST_TZ = "Asia/Kolkata";

function dateKeyToUTC(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function weekdayShortIST(dateStr) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TZ,
    weekday: "short",
  }).format(dateKeyToUTC(dateStr));
}

function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function sanitize(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(String(str || "")));
  return div.innerHTML;
}

function todayStr() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(dateStr, n) {
  // IST-safe date math using UTC midnight on the date key
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);

  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function fmtDate(str) {
  if (!str) return "";
  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-IN", {
    timeZone: IST_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysFromToday(dateStr) {
  const today = todayStr(); // IST YYYY-MM-DD
  const a = dateKeyToUTC(today);
  const b = dateKeyToUTC(dateStr);
  const diff = Math.round((b - a) / 86400000);

  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 0) return Math.abs(diff) + " days ago";
  return "In " + diff + " days";
}
function save() {
  localStorage.setItem("st_chapters", JSON.stringify(chapters));
  localStorage.setItem("st_revisions", JSON.stringify(revisions));
  localStorage.setItem("st_subjects", JSON.stringify(subjects));
  localStorage.setItem("st_streak", JSON.stringify(streak));
  localStorage.setItem("st_weekly", JSON.stringify(weeklyLog));
  localStorage.setItem("st_coins", String(coins || 0));
  localStorage.setItem("st_missed", JSON.stringify(missedRevisions));
}

// ── SOUND FX (mobile-friendly) ──
let audioCtx = null;
let soundUnlocked = false;

function getAudioCtx() {
  try {
    if (!audioCtx)
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  } catch (e) {
    return null;
  }
}

function unlockSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx
      .resume()
      .then(() => {
        soundUnlocked = true;
      })
      .catch(() => {});
  } else {
    soundUnlocked = true;
  }
}

function primeSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.00001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
  } catch (e) {}
}

function beep(freq = 660, dur = 0.1, type = "sine", vol = 0.08) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") return; // avoid silent fail on phones
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur + 0.03);
  } catch (e) {}
}

function playSaveSound() {
  beep(540, 0.07, "triangle", 0.07);
  setTimeout(() => beep(700, 0.09, "triangle", 0.06), 70);
}
function playDoneSound() {
  beep(720, 0.08, "sine", 0.08);
  setTimeout(() => beep(920, 0.11, "sine", 0.07), 90);
}
function playCoinSound() {
  beep(900, 0.06, "triangle", 0.07);
  setTimeout(() => beep(1200, 0.07, "triangle", 0.06), 65);
  setTimeout(() => beep(1500, 0.1, "triangle", 0.06), 130);
}
function playClickSound() {
  // soft UI tap
  beep(620, 0.025, "sine", 0.025);
  setTimeout(() => beep(780, 0.03, "sine", 0.018), 20);
}

function playDeleteSound() {
  // gentle downward remove sound
  beep(520, 0.05, "triangle", 0.045);
  setTimeout(() => beep(390, 0.06, "sawtooth", 0.04), 50);
  setTimeout(() => beep(280, 0.07, "sawtooth", 0.03), 110);
}

function playCopySound() {
  // tiny sparkle
  beep(900, 0.03, "triangle", 0.03);
  setTimeout(() => beep(1200, 0.035, "triangle", 0.025), 28);
}

function playGroupCreateSound() {
  // short celebration
  beep(660, 0.05, "triangle", 0.04);
  setTimeout(() => beep(880, 0.06, "triangle", 0.035), 45);
  setTimeout(() => beep(1100, 0.07, "sine", 0.03), 95);
}

function playGroupJoinSound() {
  // connected feel
  beep(540, 0.04, "sine", 0.03);
  setTimeout(() => beep(720, 0.05, "triangle", 0.03), 40);
  setTimeout(() => beep(960, 0.05, "triangle", 0.025), 85);
}

function playLeaveGroupSound() {
  // softer exit
  beep(500, 0.04, "triangle", 0.035);
  setTimeout(() => beep(420, 0.05, "triangle", 0.03), 45);
  setTimeout(() => beep(320, 0.06, "sine", 0.025), 95);
}

function playErrorSound() {
  // optional error tone
  beep(340, 0.05, "square", 0.03);
  setTimeout(() => beep(300, 0.07, "square", 0.025), 55);
}
// ── COINS ──
function coinForOffset(dayOffset) {
  if (dayOffset === 1) return 5;
  if (dayOffset === 3) return 10;
  if (dayOffset === 7) return 15;
  if (dayOffset === 30) return 20;
  return 0;
}
function updateCoinsUI() {
  const pill = document.getElementById("coinPill");
  if (pill) pill.textContent = "🪙 " + (coins || 0);
}
function flyCoinsFromRect(fromRect, amount) {
  const pill = document.getElementById("coinPill");
  if (!pill || !fromRect) return;
  const to = pill.getBoundingClientRect();
  const coin = document.createElement("div");
  coin.textContent = "🪙";
  coin.style.cssText = `
          position:fixed;
          left:${fromRect.left + fromRect.width / 2}px;
          top:${fromRect.top + fromRect.height / 2}px;
          font-size:1.4rem;
          z-index:9999;
          pointer-events:none;
          transition: none;
          transform: translate(-50%,-50%) scale(1);
          filter: drop-shadow(0 0 6px gold);
        `;
  document.body.appendChild(coin);
  const label = document.createElement("div");
  label.textContent = "+" + amount + "🪙";
  label.style.cssText = `
          position:fixed;
          left:${fromRect.left + fromRect.width / 2}px;
          top:${fromRect.top - 10}px;
          font-size:1rem;
          font-weight:800;
          color:#f59e0b;
          z-index:9999;
          pointer-events:none;
          transform:translate(-50%,-50%);
          text-shadow:0 0 8px rgba(245,158,11,0.8);
          transition:opacity 0.35s, transform 0.35s;
        `;
  document.body.appendChild(label);
  requestAnimationFrame(() => {
    label.style.transform = "translate(-50%, -200%)";
    label.style.opacity = "0";
  });
  setTimeout(() => {
    const dx = to.left + to.width / 2 - (fromRect.left + fromRect.width / 2);
    const dy = to.top + to.height / 2 - (fromRect.top + fromRect.height / 2);
    coin.style.transition =
      "left 0.55s cubic-bezier(.4,0,.2,1), top 0.55s cubic-bezier(.4,0,.2,1), transform 0.55s, opacity 0.15s 0.45s";
    coin.style.left = fromRect.left + fromRect.width / 2 + dx + "px";
    coin.style.top = fromRect.top + fromRect.height / 2 + dy + "px";
    coin.style.transform = "translate(-50%,-50%) scale(0.4)";
    coin.style.opacity = "0";
  }, 80);
  setTimeout(() => {
    coin.remove();
    label.remove();
  }, 750);
  setTimeout(() => {
    pill.style.transition = "transform 0.15s";
    pill.style.transform = "scale(1.25)";
    setTimeout(() => {
      pill.style.transform = "scale(1)";
    }, 150);
  }, 620);
}

function flyCoinsTo(originEl, amount) {
  const pill = document.getElementById("coinPill");
  if (!pill || !originEl) return;
  const from = originEl.getBoundingClientRect();
  const to = pill.getBoundingClientRect();
  const coin = document.createElement("div");
  coin.textContent = "🪙";
  coin.style.cssText = `
          position:fixed;
          left:${from.left + from.width / 2}px;
          top:${from.top + from.height / 2}px;
          font-size:1.4rem;
          z-index:9999;
          pointer-events:none;
          transition: none;
          transform: translate(-50%,-50%) scale(1);
          filter: drop-shadow(0 0 6px gold);
        `;
  document.body.appendChild(coin);
  // label
  const label = document.createElement("div");
  label.textContent = "+" + amount + "🪙";
  label.style.cssText = `
          position:fixed;
          left:${from.left + from.width / 2}px;
          top:${from.top - 10}px;
          font-size:1rem;
          font-weight:800;
          color:#f59e0b;
          z-index:9999;
          pointer-events:none;
          transform:translate(-50%,-50%);
          text-shadow:0 0 8px rgba(245,158,11,0.8);
          transition:opacity 0.35s, transform 0.35s;
        `;
  document.body.appendChild(label);
  // float label up then fade
  requestAnimationFrame(() => {
    label.style.transform = "translate(-50%, -200%)";
    label.style.opacity = "0";
  });
  // fly coin to pill after short delay
  setTimeout(() => {
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    coin.style.transition =
      "left 0.55s cubic-bezier(.4,0,.2,1), top 0.55s cubic-bezier(.4,0,.2,1), transform 0.55s, opacity 0.15s 0.45s";
    coin.style.left = from.left + from.width / 2 + dx + "px";
    coin.style.top = from.top + from.height / 2 + dy + "px";
    coin.style.transform = "translate(-50%,-50%) scale(0.4)";
    coin.style.opacity = "0";
  }, 80);
  setTimeout(() => {
    coin.remove();
    label.remove();
  }, 750);
  // pulse the pill when coin arrives
  setTimeout(() => {
    pill.style.transition = "transform 0.15s";
    pill.style.transform = "scale(1.25)";
    setTimeout(() => {
      pill.style.transform = "scale(1)";
    }, 150);
  }, 620);
}
// ── TOAST ──
function showToast(main, type, sub) {
  const t = document.getElementById("toast");
  t.className = "toast" + (type ? " " + type : "");
  t.innerHTML = `<div class="toast-main">${main}</div>${sub ? `<div class="toast-sub">${sub}</div>` : ""}`;
  t.classList.remove("hidden");
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => t.classList.add("hidden"), 3200);
}

// ── SERVICE WORKER ──
function registerSW() {
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("sw.js").catch(() => {});
}

// ── NOTIFICATIONS ── (kept as-is, per your request)
function checkNotifBanner() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    document.getElementById("notifBanner").style.display = "none";
    return;
  }
  if (Notification.permission === "denied") {
    const b = document.getElementById("notifBanner");
    b.style.display = "flex";
    b.querySelector(".btn-allow").textContent = "How to Enable";
    b.querySelector(".btn-allow").onclick = () =>
      alert(
        "To enable:\n1. Tap 🔒 lock icon in address bar\n2. Tap Permissions\n3. Set Notifications → Allow\n4. Refresh",
      );
    return;
  }
  const dismissedAt = localStorage.getItem("notifDismissedAt");
  if (!dismissedAt) {
    document.getElementById("notifBanner").style.display = "flex";
    return;
  }
  const daysSince =
    (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
  if (daysSince >= 3) {
    localStorage.removeItem("notifDismissedAt");
    document.getElementById("notifBanner").style.display = "flex";
  }
}
function askNotifPermission() {
  if (!("Notification" in window)) return;
  Notification.requestPermission().then((p) => {
    document.getElementById("notifBanner").style.display = "none";
    if (p === "granted") {
      localStorage.removeItem("notifDismissedAt");
      localStorage.setItem("notifEnabled", "true");
      showToast(
        "Utho Parth! 🏹🚩",
        "",
        "Aaj revision ka yuddh ladna hai. Notifications on!",
      );
      fireNotification();
    } else {
      showToast(
        "Notifications block ho gayi! 🚫🔔",
        "error",
        "Browser settings se enable karo.",
      );
    }
  });
}
function dismissBanner() {
  document.getElementById("notifBanner").style.display = "none";
  localStorage.setItem("notifDismissedAt", Date.now().toString());
}
function fireNotification() {
  if (!("Notification" in window) || Notification.permission !== "granted")
    return;
  const t = todayStr();
  const due = revisions.filter((r) => r.dueDate === t && !r.done);
  if (due.length === 0) return;
  const name = profile ? profile.name : "";
  const names =
    due
      .slice(0, 3)
      .map((r) => r.chapterName + " (" + r.subject + ")")
      .join(", ") + (due.length > 3 ? " +" + (due.length - 3) + " more" : "");
  new Notification(
    "📚 " + (name ? name + ", you have" : "You have") + " revisions due!",
    {
      body: due.length + " revision(s) today: " + names,
      tag: "st-daily",
      icon: "icon.png",
    },
  );
}
function scheduleDailyReminder() {
  if (!("Notification" in window) || Notification.permission !== "granted")
    return;
  const last = localStorage.getItem("st_last_notified");
  const t = todayStr();
  if (last !== t) {
    localStorage.setItem("st_last_notified", t);
    fireNotification();
  }
}

// ── ONBOARDING ──
function checkOnboard() {
  if (!profile) {
    document.getElementById("onboardOverlay").classList.remove("hidden");
    return false;
  }
  document.getElementById("onboardOverlay").classList.add("hidden");
  return true;
}
function finishOnboard() {
  const name = document.getElementById("ob-name").value.trim();
  if (!name) {
    showToast(
      "Bina naam ke to bhoot bhi nahi aate! 👻🚫",
      "error",
      "Pehle apna naam likho.",
    );
    return;
  }
  const cls = document.getElementById("ob-class").value;
  const exam = document.getElementById("ob-exam").value;
  profile = { name, cls, examDate: exam };
  localStorage.setItem("st_profile", JSON.stringify(profile));
  document.getElementById("onboardOverlay").classList.add("hidden");
  initApp();
}

// ── GREETING ──
function updateGreeting() {
  if (!profile) return;
  const h = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: IST_TZ,
    }).format(new Date()),
  );
  const greet =
    h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const t = todayStr();
  const due = revisions.filter((r) => r.dueDate === t && !r.done);
  const overdue = revisions.filter((r) => r.dueDate < t && !r.done);
  const totalPending = due.length + overdue.length;
  let msg = `${greet}, ${profile.name}!`;
const yesterday = addDays(t, -1);
const grace = revisions.filter(
  (r) =>
    r.dueDate === yesterday &&
    !r.done &&
    !r.missedPermanently &&
    isInGrace(yesterday),
);
if (grace.length > 0)
  msg += ` ${grace.length} in grace + ${due.length} due today ⚠️`;
else if (due.length > 0)
  msg += ` ${due.length} revision${due.length > 1 ? "s" : ""} due today 💪`;
else msg += " No revisions today 🎉";
  document.getElementById("greeting").textContent = msg;
}
// ── STREAK ──
function updateStreak() {
  const t = todayStr();
  const yesterday = addDays(t, -1);

  // Grace expiry check — only reset if grace has fully expired (not just missed yesterday)
  const graceExpired = isGraceExpired(yesterday);
const yesterdayDue = revisions.filter((r) => r.dueDate === yesterday).length;
  const yesterdayDone = revisions.filter((r) => r.dueDate === yesterday && r.done).length;
  const yesterdayAllDone = yesterdayDue === 0 || yesterdayDone >= yesterdayDue;

  if (graceExpired && !yesterdayAllDone && streak.lastDate !== t) {
    streak.count = 0;
    save();
  }

  // Increment streak — from today's due OR grace completions (once per day)
  const todayDone = revisions.filter((r) => r.dueDate === t && r.done).length;
  const graceCompletedToday = revisions.filter(
    (r) => r.dueDate === yesterday && r.done && r.completedInGrace
  ).length;

  if ((todayDone > 0 || graceCompletedToday > 0) && streak.lastDate !== t) {
    if (streak.lastDate === yesterday) streak.count++;
    else streak.count = 1;
    streak.lastDate = t;
    save();
  }

  document.getElementById("streakPill").innerHTML =
    '<span class="streak-fire">🔥</span> ' + streak.count;
  document.getElementById("stat-streak").textContent = streak.count;
}

// Grace period helpers
function graceExpireTime(dueDateStr) {
  // Grace expires at midnight IST of TWO days after dueDate
  // i.e. user has the full next calendar day (IST) to complete in grace
  const twoDaysLater = addDays(dueDateStr, 2);
  const [y, m, d] = twoDaysLater.split("-").map(Number);
  const midnightUTC = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  return new Date(midnightUTC.getTime() - 5.5 * 60 * 60 * 1000);
}

function isGraceExpired(dueDateStr) {
  return Date.now() >= graceExpireTime(dueDateStr).getTime();
}

function isInGrace(dueDateStr) {
  const t = todayStr();
  // Only yesterday's revisions can be in grace
  const yesterday = addDays(t, -1);
  return dueDateStr === yesterday && !isGraceExpired(dueDateStr);
}

// ── EXAM COUNTDOWN ──
function updateExamCountdown() {
  const block = document.getElementById("examCountdownBlock");
  const daysEl = document.getElementById("prof-exam-days");
  if (!block || !daysEl) return;

  if (!profile || !profile.examDate) {
    block.style.display = "none";
    return;
  }

  // IST-only day difference (exact Kolkata date rollover behavior)
  const today = todayStr(); // YYYY-MM-DD in Asia/Kolkata
  const diff = Math.round(
    (dateKeyToUTC(profile.examDate) - dateKeyToUTC(today)) / 86400000,
  );
  if (diff > 0) {
    block.style.display = "flex";
    daysEl.textContent = diff + " days";
  } else {
    block.style.display = "none";
  }
}

// ── PROCESS MISSED REVISIONS ON APP OPEN ──
function processMissedRevisions() {
  const t = todayStr();
  const yesterday = addDays(t, -1);
  const penaltyFiredKey = "st_penalty_" + yesterday;
  const alreadyPenalized = localStorage.getItem(penaltyFiredKey);

  // Find all undone revisions older than yesterday — permanently missed, with penalty per missed day
  const veryOld = revisions.filter(
    (r) =>
      !r.done &&
      !r.missedPermanently &&
      r.dueDate < yesterday &&
      isGraceExpired(r.dueDate),
  );
  if (veryOld.length > 0) {
    const missedDays = [...new Set(veryOld.map((r) => r.dueDate))];
    missedDays.forEach((day) => {
      const penaltyKey = "st_penalty_" + day;
      if (!localStorage.getItem(penaltyKey)) {
        coins = Math.max(0, (coins || 0) - 3);
        streak.count = 0;
        localStorage.setItem(penaltyKey, "1");
      }
    });
    veryOld.forEach((r) => {
      r.missedPermanently = true;
      missedRevisions.push({
        id: r.id,
        chapterName: r.chapterName,
        subject: r.subject,
        dueDate: r.dueDate,
        dayOffset: r.dayOffset,
        missedAt: t,
      });
    });
    save();
    showToast(
      "Kuch din ki chutti li? 😤📅",
      "error",
      `${missedDays.length} missed day(s) — streak reset, coins deducted.`,
    );
  }

  // Find yesterday's undone revisions where grace has expired
  const graceExpiredYesterday = revisions.filter(
    (r) =>
      !r.done &&
      !r.missedPermanently &&
      r.dueDate === yesterday &&
      isGraceExpired(yesterday),
  );

  if (graceExpiredYesterday.length > 0 && !alreadyPenalized) {
    coins = Math.max(0, (coins || 0) - 3);
    streak.count = 0;
    localStorage.setItem(penaltyFiredKey, "1");

    graceExpiredYesterday.forEach((r) => {
      r.missedPermanently = true;
      missedRevisions.push({
        id: r.id,
        chapterName: r.chapterName,
        subject: r.subject,
        dueDate: r.dueDate,
        dayOffset: r.dayOffset,
        missedAt: t,
      });
    });

    save();
    showToast(
      "Grace period khatam! 😔⏰",
      "error",
      "-3🪙 aur streak reset. Aaj se fresh start karo!",
    );
  } else if (veryOld.length > 0) {
    save();
  }
}

// ── WEEKLY LOG ──
function logTodayActivity() {
  const t = todayStr();
  const done = revisions.filter((r) => r.dueDate === t && r.done).length;
  weeklyLog[t] = done;
  save();
}
function renderWeekly() {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let html = "";

  const today7 = todayStr();
  const last7vals = Array.from(
    { length: 7 },
    (_, i) => weeklyLog[addDays(today7, -i)] || 0,
  );
  const max = Math.max(...last7vals, 1);
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today7, -i);
    const count = weeklyLog[d] || 0;
    const pct = Math.round((count / max) * 100);
    const dayName = weekdayShortIST(d);

    html += `<div class="week-day">
      <span class="week-day-name">${dayName}</span>
      <div class="week-bar-wrap"><div class="week-bar" style="width:${pct}%"></div></div>
      <span class="week-count">${count}</span>
    </div>`;
  }

  document.getElementById("weeklyChart").innerHTML = html;
}

// ── TABS ──
function switchTab(e, name) {
  document
    .querySelectorAll(".tab-content")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  e.target.classList.add("active");
if (name === "group") {
  renderGroup();
}
  if (name === "weak") renderWeak();
  if (name === "chapters") renderSubjectGrid();
}

// ── SUBJECTS ──
function populateSubjectDropdown() {
  const sel = document.getElementById("subjectSelect");
  sel.innerHTML = "";
  subjects.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    sel.appendChild(opt);
  });

  // Also populate the subject filter in Chapters tab
  const filter = document.getElementById("subjectFilter");
  if (filter) {
    const current = filter.value;
    filter.innerHTML = '<option value="all">All Subjects</option>';
    subjects.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      filter.appendChild(opt);
    });
    filter.value = current && subjects.includes(current) ? current : "all";
  }
}
function addCustomSubject() {
  const input = document.getElementById("customSubject");
  const val = input.value.trim();
  if (!val) {
    showToast(
      "Bina naam ke to bhoot bhi nahi aate! 👻🚫",
      "error",
      "Pehle subject ka naam likho.",
    );
    return;
  }
  if (subjects.includes(val)) {
    showToast(
      "Bhai, ek hi cheez kitni baar padhoge? 😵‍💫🔁",
      "error",
      "Ye subject pehle se hai!",
    );
    return;
  }
  subjects.push(val);
  save();
  populateSubjectDropdown();
  document.getElementById("subjectSelect").value = val;
  input.value = "";
  playSaveSound();
  showToast(
    "Ek aur dukh pal liya? 📚🤯",
    "",
    "Chalo, naya subject add ho gaya!",
  );
}

// ── ADD CHAPTER ──
function addChapter() {
  const subject = document.getElementById("subjectSelect").value;
  const name = document.getElementById("chapterName").value.trim();
  const status = document.getElementById("chapterStatus").value;
  const isWeak = document.getElementById("weakToggle").checked;
  if (!name) {
    showToast(
      "Bina naam ke to bhoot bhi nahi aate! 👻🚫",
      "error",
      "Chapter ka naam toh likho bhai.",
    );
    return;
  }
  const chapter = {
    id: uid(),
    subject,
    name,
    status,
    isWeak,
    dateAdded: todayStr(),
  };
  chapters.push(chapter);
  if (status === "Completed") generateRevisions(chapter);
  save();
  renderAll();
  document.getElementById("chapterName").value = "";
  document.getElementById("chapterStatus").value = "Not Started";
  document.getElementById("weakToggle").checked = false;
  document.getElementById("weakLabel").textContent = "No";
  playSaveSound();
  showToast(
    "Chapter save ho gaya! ✍️😏",
    "",
    "Ab bas padhai shuru karne ki der hai.",
  );
  switchTabByName("today");
  pushGroupUpdate();
}

function switchTabByName(name) {
  document
    .querySelectorAll(".tab-content")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  // Fix for your original selector bug:
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    if (btn.dataset.tab === name) btn.classList.add("active");
  });
}

// ── REVISIONS ──
function generateRevisions(chapter) {
  [1, 3, 7, 30].forEach((n) => {
    revisions.push({
      id: uid(),
      chapterId: chapter.id,
      chapterName: chapter.name,
      subject: chapter.subject,
      dueDate: addDays(chapter.dateAdded, n),
      done: false,
      dayOffset: n,
    });
  });
}
function markRevDone(id) {
  const rev = revisions.find((r) => r.id === id);
  if (!rev) return;
  if (rev.done) return; // prevent double-tap double rewards

  // Capture button rect BEFORE renderAll() destroys the DOM
  const originEl =
    document.activeElement && document.activeElement.classList.contains("btn")
      ? document.activeElement
      : document.querySelector(`button[onclick*="${id}"]`);
  const originRect = originEl ? originEl.getBoundingClientRect() : null;

rev.done = true;
rev.completedOn = todayStr();

const earned = coinForOffset(rev.dayOffset);
if (earned > 0) {
  coins = (coins || 0) + earned;
}
rev.earnedCoins = earned;

save();
renderAll();

playDoneSound();
if (earned > 0) {
  setTimeout(playCoinSound, 90);
  if (originRect) {
    setTimeout(() => flyCoinsFromRect(originRect, earned), 120);
  }
}

showToast(
  `Shabash sher! 🦁💰`,
  "",
  earned > 0
    ? `Teri mehnat ke +${earned}🪙 mil gaye. Party kab hai?`
    : "Revision done! Agli baar coins bhi milenge.",
);
  pushGroupUpdate();
  checkGroupMilestone();
}
function markGraceDone(id) {
  const rev = revisions.find((r) => r.id === id);
  if (!rev) return;
  if (rev.done) return;

  const originEl =
    document.activeElement && document.activeElement.classList.contains("btn")
      ? document.activeElement
      : document.querySelector(`button[onclick*="${id}"]`);
  const originRect = originEl ? originEl.getBoundingClientRect() : null;

rev.done = true;
rev.completedOn = todayStr();
rev.completedInGrace = true;

const base = coinForOffset(rev.dayOffset);
const earned = Math.max(1, base - 2);
rev.earnedCoins = earned;
coins = (coins || 0) + earned;

  save();
  renderAll();

  playDoneSound();
  if (earned > 0) {
    setTimeout(playCoinSound, 90);
    if (originRect) {
      setTimeout(() => flyCoinsFromRect(originRect, earned), 120);
    }
  }

  showToast(
    "Grace mein complete! ⚡📚",
    "",
    `Thoda late, par kiya toh! +${earned}🪙 (reduced reward)`,
  );
  pushGroupUpdate();
  checkGroupMilestone();
}

function deleteRevision(id) {
  revisions = revisions.filter((r) => r.id !== id);
  save();
  renderAll();
  playDeleteSound();
  pushGroupUpdate();
}

function deleteRevisionFromDone(id) {
  // Only removes from display — does not affect coins, streak, or group stats
  revisions = revisions.filter((r) => r.id !== id);
  save();
  renderDoneRevisions();
  playDeleteSound();
}
function deleteMissedPermanent(id) {
  missedRevisions = missedRevisions.filter((r) => r.id !== id);
  save();
  renderDoneRevisions();
  playDeleteSound();
}

function deleteChapter(id) {
  if (!confirm("Delete this chapter and all its revisions?")) return;
  chapters = chapters.filter((c) => c.id !== id);
  revisions = revisions.filter((r) => r.chapterId !== id);
  save();
  renderAll();
  playDeleteSound();
  showToast("Gaya kaam se! 🚮💨", "", "Jaise exam ke baad sab bhool jate ho.");
}
function updateStatus(id, newStatus) {
  const ch = chapters.find((c) => c.id === id);
  if (!ch) return;
  const wasCompleted = ch.status === "Completed";
  const nowCompleted = newStatus === "Completed";
  ch.status = newStatus;
  if (nowCompleted && !wasCompleted) {
    const tempDate = ch.dateAdded;
    ch.dateAdded = todayStr();
    revisions = revisions.filter((r) => r.chapterId !== id);
    generateRevisions(ch);
    ch.dateAdded = tempDate;
    playSaveSound();
    showToast(
      "Oho! Aag laga di. 🔥📅",
      "",
      "Revision ka schedule set kar diya hai.",
    );
    pushGroupUpdate();
    checkGroupMilestone();
  }
  if (!nowCompleted && wasCompleted) {
    revisions = revisions.filter((r) => r.chapterId !== id);
    showToast(
      "Aalas ki bhi seema hoti hai! 🧹😴",
      "",
      "Revision schedule saaf kar diya.",
    );
    pushGroupUpdate();
  }
  save();
  renderAll();
}

// ── FILTER ──
function setFilter(f) {
  currentFilter = f;
  ["all", "completed", "pending"].forEach((k) => {
    document.getElementById("f-" + k).classList.remove("btn-primary");
    document.getElementById("f-" + k).classList.add("btn-secondary");
  });
  document.getElementById("f-" + f).classList.remove("btn-secondary");
  document.getElementById("f-" + f).classList.add("btn-primary");
  renderSubjectGrid();
}

// ── RENDER TODAY ──
function renderTodayRevisions() {
  const grid = document.getElementById("todayGrid");
  const t = todayStr();
  const yesterday = addDays(t, -1);

  const due = revisions.filter((r) => r.dueDate === t && !r.done && !r.missedPermanently);
  const grace = revisions.filter(
    (r) => r.dueDate === yesterday && !r.done && !r.missedPermanently && isInGrace(yesterday)
  );

  document.getElementById("stat-due").textContent = due.length + grace.length;
  document.getElementById("stat-done").textContent = revisions.filter(
    (r) => r.dueDate === t && r.done,
  ).length;
  document.getElementById("stat-chapters").textContent = chapters.length;

  if (due.length === 0 && grace.length === 0) {
    grid.innerHTML =
      '<div class="empty"><div class="emoji">🎉</div><p>No revisions due today!</p></div>';
    if (graceTimerInterval) { clearInterval(graceTimerInterval); graceTimerInterval = null; }
    return;
  }

  let html = "";

  if (grace.length > 0) {
    const graceExpiry = graceExpireTime(yesterday);
    const timerHtml = `<div class="grace-timer-block">
      <span class="grace-timer-label">⏳ Grace ends in</span>
      <span class="grace-timer-value" id="graceCountdown">--:--</span>
    </div>`;

    const graceGroups = {};
    grace.forEach((r) => {
      if (!graceGroups[r.subject]) graceGroups[r.subject] = [];
      graceGroups[r.subject].push(r);
    });

    let graceRows = "";
    Object.keys(graceGroups).forEach((subject) => {
      const revs = graceGroups[subject];
      revs.forEach((r) => {
        const reduced = Math.max(1, coinForOffset(r.dayOffset) - 2);
      graceRows += `<div class="rev-row" style="border-left:3px solid #f87171">
          <div style="flex:1;min-width:0">
            <p>${sanitize(r.chapterName)}</p>
            <span style="color:#f87171">⚠ Grace · ${sanitize(r.subject)} · +${r.dayOffset}d · Will earn: ${reduced}🪙 (reduced)</span>
          </div>
          <div class="rev-actions">
            <button class="btn btn-success btn-sm" onclick="markGraceDone('${r.id}')">✓ Done</button>
          </div>
        </div>`;
      });
    });

    html += `<div class="grace-card">
      <h3>⚠️ Missed Yesterday — Grace Period</h3>
      ${timerHtml}
      ${graceRows}
    </div>`;

    if (graceTimerInterval) clearInterval(graceTimerInterval);
    graceTimerInterval = setInterval(() => {
      const el = document.getElementById("graceCountdown");
      if (!el) { clearInterval(graceTimerInterval); return; }
      const diff = graceExpiry.getTime() - Date.now();
      if (diff <= 0) {
        el.textContent = "Expired!";
        clearInterval(graceTimerInterval);
        renderAll();
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      el.textContent = `${h}h ${String(m).padStart(2, "0")}m`;
    }, 10000);

const el2 = document.getElementById("graceCountdown");
if (el2) {
  const diff = graceExpiry.getTime() - Date.now();
  if (diff > 0) {
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    el2.textContent = `${h}h ${String(m).padStart(2, "0")}m`;
  }
}
  } else {
    if (graceTimerInterval) { clearInterval(graceTimerInterval); graceTimerInterval = null; }
  }

  const groups = {};
  due.forEach((r) => {
    if (!groups[r.subject]) groups[r.subject] = [];
    groups[r.subject].push(r);
  });
  Object.keys(groups).forEach((subject) => {
    const revs = groups[subject];
    let rows = "";
    revs.forEach((r) => {
     rows += `<div class="rev-row">
        <div style="flex:1;min-width:0"><p>${sanitize(r.chapterName)}</p><span>+${r.dayOffset}d · Will earn: ${coinForOffset(r.dayOffset)}🪙</span></div>
        <div class="rev-actions">
          <button class="btn btn-success btn-sm" onclick="markRevDone('${r.id}')">✓ Done</button>
        </div></div>`;
    });
    html += `<div class="today-card"><h3>📖 ${sanitize(subject)}</h3>${rows}</div>`;
  });

  grid.innerHTML = html;
}
// ── RENDER DONE ──
function renderDoneRevisions() {
  const container = document.getElementById("doneRevList");
  const done = revisions.filter((r) => r.done);
  if (done.length === 0) {
    container.innerHTML =
      '<div class="empty"><div class="emoji">📋</div><p>No completed revisions yet.</p></div>';
  } else {
    const groups = {};
    done.forEach((r) => {
      if (!groups[r.subject]) groups[r.subject] = [];
      groups[r.subject].push(r);
    });
    let html = "";
    Object.keys(groups).forEach((subject) => {
      const revs = groups[subject];
      let items = "";
      revs.forEach((r) => {
      const doneLabel = r.completedOn
        ? r.completedInGrace
          ? `Completed on grace: ${fmtDate(r.completedOn)}`
          : `Completed on: ${fmtDate(r.completedOn)}`
        : fmtDate(r.dueDate);
      const doneCoins =
        r.earnedCoins !== undefined
          ? r.earnedCoins
          : coinForOffset(r.dayOffset);
      items += `<div class="done-item">
  <div class="info"><div class="name">${sanitize(r.chapterName)}</div><div class="meta">+${r.dayOffset}d · ${doneLabel} · +${doneCoins}🪙</div></div>
  <button class="btn btn-danger btn-xs" onclick="deleteRevisionFromDone('${r.id}')">🗑</button>
</div>`;
      });
      html += `<div style="margin-bottom:12px"><p style="color:var(--green);font-size:0.72rem;font-weight:600;text-transform:uppercase;margin-bottom:5px">${sanitize(subject)}</p>${items}</div>`;
    });
    container.innerHTML = html;
  }

  const permCard = document.getElementById("missedPermCard");
  const permList = document.getElementById("missedPermList");
  if (!permCard || !permList) return;

  if (missedRevisions.length === 0) {
    permCard.style.display = "none";
    return;
  }

  permCard.style.display = "block";
  const mGroups = {};
  missedRevisions.forEach((r) => {
    if (!mGroups[r.subject]) mGroups[r.subject] = [];
    mGroups[r.subject].push(r);
  });
  let mHtml = "";
  Object.keys(mGroups).forEach((subject) => {
    const revs = mGroups[subject];
    let items = "";
    revs.forEach((r) => {
      items += `<div class="missed-perm-item">
        <div class="info">
          <div class="name">${sanitize(r.chapterName)}</div>
          <div class="meta">+${r.dayOffset}d · Due ${fmtDate(r.dueDate)} · Missed ${fmtDate(r.missedAt)}</div>
        </div>
        <button class="btn btn-danger btn-xs" onclick="deleteMissedPermanent('${r.id}')">🗑</button>
      </div>`;
    });
    mHtml += `<div style="margin-bottom:12px"><p style="color:#f87171;font-size:0.72rem;font-weight:600;text-transform:uppercase;margin-bottom:5px">${sanitize(subject)}</p>${items}</div>`;
  });
  permList.innerHTML = mHtml;
}

// ── RENDER CALENDAR ──
function renderCalendar() {
  const container = document.getElementById("calendarList");
  const t = todayStr();
  const upcoming = revisions
    .filter((r) => !r.done && r.dueDate >= t)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (upcoming.length === 0) {
    container.innerHTML =
      '<div class="empty"><div class="emoji">📭</div><p>No upcoming revisions.</p></div>';
    return;
  }
  const byDate = {};
  upcoming.forEach((r) => {
    if (!byDate[r.dueDate]) byDate[r.dueDate] = [];
    byDate[r.dueDate].push(r);
  });
  let html = "";
  Object.keys(byDate).forEach((date) => {
    const revs = byDate[date];
    let chips = "";
    revs.forEach((r) => {
    chips += `<div class="cal-chip"><p class="chip-name">${sanitize(r.chapterName)}</p><p class="chip-meta">${sanitize(r.subject)} · +${r.dayOffset}d · Will earn: ${coinForOffset(r.dayOffset)}🪙</p></div>`;
    });
    html += `<div class="cal-day">
      <div class="cal-day-header">
        <div><p class="cal-date">${fmtDate(date)}</p><p class="cal-relative">${daysFromToday(date)}</p></div>
        <span class="cal-badge">${revs.length} revision${revs.length > 1 ? "s" : ""}</span>
      </div>
      <div class="cal-chips">${chips}</div>
    </div>`;
  });
  container.innerHTML = html;
}

// ── RENDER SUBJECT GRID ──
function renderSubjectGrid() {
  const grid = document.getElementById("subjectGrid");
  const subjectFilterEl = document.getElementById("subjectFilter");
  const selectedSubject = subjectFilterEl ? subjectFilterEl.value : "all";
  let filtered = chapters.slice();
  if (currentFilter === "completed")
    filtered = filtered.filter((c) => c.status === "Completed");
  if (currentFilter === "pending")
    filtered = filtered.filter((c) => c.status !== "Completed");
  if (selectedSubject !== "all")
    filtered = filtered.filter((c) => c.subject === selectedSubject);
  const groups = {};
  filtered.forEach((c) => {
    if (!groups[c.subject]) groups[c.subject] = [];
    groups[c.subject].push(c);
  });
  if (Object.keys(groups).length === 0) {
    grid.innerHTML =
      '<div class="empty"><div class="emoji">📚</div><p>No chapters found.</p></div>';
    return;
  }
  let html = "";
  Object.keys(groups).forEach((subject) => {
    const chs = groups[subject];
    let cards = "";
    chs.forEach((ch) => {
      cards += chapterCard(ch);
    });
    html += `<div class="subj-card">
      <div class="subj-card-header"><h3>📖 ${sanitize(subject)}</h3><span>${chs.length} chapter${chs.length > 1 ? "s" : ""}</span></div>
      <div style="display:flex;flex-direction:column;gap:8px">${cards}</div>
    </div>`;
  });
  grid.innerHTML = html;
}

// ── RENDER WEAK ──
function renderWeak() {
  const grid = document.getElementById("weakGrid");
  const weak = chapters.filter((c) => c.isWeak);
  if (weak.length === 0) {
    grid.innerHTML =
      '<div class="empty"><div class="emoji">💪</div><p>No weak chapters! Great job!</p></div>';
    return;
  }
  const groups = {};
  weak.forEach((c) => {
    if (!groups[c.subject]) groups[c.subject] = [];
    groups[c.subject].push(c);
  });
  let html = "";
  Object.keys(groups).forEach((subject) => {
    const chs = groups[subject];
    let cards = "";
    chs.forEach((ch) => {
      cards += chapterCard(ch);
    });
    html += `<div class="subj-card">
      <div class="subj-card-header"><h3>📖 ${sanitize(subject)}</h3><span>${chs.length} weak</span></div>
      <div style="display:flex;flex-direction:column;gap:8px">${cards}</div>
    </div>`;
  });
  grid.innerHTML = html;
}

// ── TOGGLE REVISIONS INSIDE CHAPTER CARD ──
function toggleRevisions(chId) {
  const el = document.getElementById("rev-expand-" + chId);
  const btn = document.getElementById("rev-btn-" + chId);
  if (!el || !btn) return;
  const isOpen = el.style.display !== "none";
  el.style.display = isOpen ? "none" : "block";
  btn.textContent = isOpen ? "📋 See Revisions" : "🔼 Hide Revisions";
}

// ── CHAPTER CARD ──
function chapterCard(ch) {
  const badgeClass =
    ch.status === "Completed"
      ? "badge-cp"
      : ch.status === "In Progress"
        ? "badge-ip"
        : "badge-ns";
 const upcoming = revisions
   .filter((r) => r.chapterId === ch.id && !r.done && !r.missedPermanently)
   .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const t = todayStr();
  let nextRev = "";
  if (upcoming[0]) {
    nextRev = `<p class="next-rev">⏰ Next: ${fmtDate(upcoming[0].dueDate)} (${daysFromToday(upcoming[0].dueDate)})</p>`;
  } else if (ch.status === "Completed") {
    nextRev = `<p class="all-done">✅ All revisions done!</p>`;
  }
  const weakBadge = ch.isWeak ? `<span class="weak-badge">⚠ Weak</span>` : "";

  let dots = "";
  [1, 3, 7, 30].forEach((n) => {
    const rev = revisions.find(
      (r) => r.chapterId === ch.id && r.dayOffset === n,
    );
    if (!rev) return;
   const cls = rev.done
     ? "done"
     : rev.missedPermanently
       ? "missed"
       : rev.dueDate === t
         ? "today"
         : "pending";
    dots += `<div class="rev-dot ${cls}" title="+${n}d">${n}</div>`;
  });
  const dotsHtml = dots ? `<div class="rev-dots">${dots}</div>` : "";

  // Build See Revisions sections
  const chRevs = revisions.filter((r) => r.chapterId === ch.id);
  const missedChRevs = missedRevisions.filter((r) => {
    // match by chapterId if stored, else by chapterName+subject
    return (
      r.chapterId === ch.id ||
      (r.chapterName === ch.name && r.subject === ch.subject)
    );
  });

  const completedRevs = chRevs.filter((r) => r.done);
  const upcomingRevs = chRevs.filter((r) => !r.done && !r.missedPermanently);
  const missedRevs = chRevs.filter((r) => r.missedPermanently);

  let completedHtml = "";
  completedRevs.forEach((r) => {
    if (!r.completedOn) return; // skip old revisions with no date
    const graceLabel = r.completedInGrace ? " (grace)" : "";
    const dateLabel = r.completedInGrace
      ? `Completed on grace: ${fmtDate(r.completedOn)}`
      : `Completed on: ${fmtDate(r.completedOn)}`;
    const earned =
      r.earnedCoins !== undefined ? r.earnedCoins : coinForOffset(r.dayOffset);
    completedHtml += `<div class="see-rev-item see-rev-done">
      <span class="see-rev-interval">+${r.dayOffset}d${graceLabel}</span>
      <span class="see-rev-date">${dateLabel}</span>
      <span class="see-rev-coins">+${earned}🪙</span>
    </div>`;
  });
  if (!completedHtml)
    completedHtml = `<div class="see-rev-empty">No completed revisions yet.</div>`;

  let upcomingHtml = "";
  upcomingRevs.forEach((r) => {
    upcomingHtml += `<div class="see-rev-item see-rev-upcoming">
      <span class="see-rev-interval">+${r.dayOffset}d</span>
      <span class="see-rev-date">Upcoming on: ${fmtDate(r.dueDate)}</span>
      <span class="see-rev-coins">Will earn: ${coinForOffset(r.dayOffset)}🪙</span>
    </div>`;
  });
  if (!upcomingHtml)
    upcomingHtml = `<div class="see-rev-empty">No upcoming revisions.</div>`;

  let missedHtml = "";
  missedRevs.forEach((r) => {
    const missedDate = r.missedAt ? fmtDate(r.missedAt) : fmtDate(r.dueDate);
    missedHtml += `<div class="see-rev-item see-rev-missed">
      <span class="see-rev-interval">+${r.dayOffset}d</span>
      <span class="see-rev-date">Missed on: ${missedDate}</span>
      <span class="see-rev-coins">0🪙 earned</span>
    </div>`;
  });
  if (!missedHtml)
    missedHtml = `<div class="see-rev-empty">No missed revisions.</div>`;

  return `<div class="chapter-card">
    <div class="chapter-card-top">
      <div style="flex:1;min-width:0">
        <span class="chapter-name">${sanitize(ch.name)}</span>${weakBadge}
        <div><span class="badge ${badgeClass}">${ch.status}</span></div>
        ${nextRev}${dotsHtml}
        <p class="added-date">Added: ${fmtDate(ch.dateAdded)}</p>
      </div>
      <select class="status-select" onchange="updateStatus('${ch.id}',this.value)">
        <option value="Not Started"${ch.status === "Not Started" ? " selected" : ""}>Not Started</option>
        <option value="In Progress"${ch.status === "In Progress" ? " selected" : ""}>In Progress</option>
        <option value="Completed"${ch.status === "Completed" ? " selected" : ""}>Completed</option>
      </select>
    </div>
    <div style="display:flex;gap:6px;margin-top:8px">
      <button class="btn btn-secondary btn-xs" style="flex:1" id="rev-btn-${ch.id}" onclick="toggleRevisions('${ch.id}')">📋 See Revisions</button>
      <button class="btn btn-danger btn-xs" style="flex:1" onclick="deleteChapter('${ch.id}')">🗑 Delete Chapter</button>
    </div>
    <div id="rev-expand-${ch.id}" style="display:none;margin-top:10px">
      <div class="see-rev-section">
        <div class="see-rev-label see-rev-label-done">✅ Completed</div>
        ${completedHtml}
      </div>
      <div class="see-rev-section">
        <div class="see-rev-label see-rev-label-upcoming">⏰ Upcoming</div>
        ${upcomingHtml}
      </div>
      <div class="see-rev-section">
        <div class="see-rev-label see-rev-label-missed">❌ Missed</div>
        ${missedHtml}
      </div>
    </div>
  </div>`;
}

// ── MODAL ──
function showNotifModal() {
  const t = todayStr();
  const due = revisions.filter((r) => r.dueDate === t && !r.done);
  if (due.length === 0) return;
  let html = "";
  due.forEach((r) => {
    html += `<li class="notif-item">
      <div><p class="nname">${sanitize(r.chapterName)}</p><p class="nsub">${sanitize(r.subject)} · +${r.dayOffset} day · ${coinForOffset(r.dayOffset)}🪙</p></div>
      <span class="ntag">Due Today</span>
    </li>`;
  });
  document.getElementById("notifList").innerHTML = html;
  document.getElementById("notifModal").classList.remove("hidden");
}
function closeModal() {
  document.getElementById("notifModal").classList.add("hidden");
}

// ── GROUP SYSTEM ──
function generateGroupCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++)
    code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
async function createGroup() {
  if (groupCode) {
    showToast(
      "Ek group kaafi nahi tha kya? 😏",
      "error",
      "Pehle current group chhodo.",
    );
    return;
  }
 const name = profile && profile.name ? profile.name.trim() : "";
 if (!name) {
   showToast(
     "Pehle profile mein naam set karo! 👤",
     "error",
     "Profile drawer kholo aur naam likho.",
   );
   return;
 }
const grpNameVal =
  document.getElementById("grp-groupname").value.trim() || name + "'s Group";
  const code = generateGroupCode();
  groupCode = code;
  groupName = name;
  groupDisplayName = grpNameVal;
  isCreator = true;
  localStorage.setItem("st_group", code);
  localStorage.setItem("st_grpname", name);
  localStorage.setItem("st_isCreator", "true");
  localStorage.setItem("st_groupDisplayName", grpNameVal);
  if (db) {
    try {
      await db.collection("groups").doc(code).set({
        groupName: grpNameVal,
        creatorId: memberId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.log("Root doc error:", e);
    }
  }
  await pushGroupUpdate(true);
  renderGroup();
  playGroupCreateSound();
  showToast(
    "Apna ilaaka ban gaya! 🏰😎",
    "",
    "Code: " + code + " — doston ko fansao.",
  );
}
function showJoinGroup() {
  document.getElementById("joinGroupPanel").style.display = "block";
  document.getElementById("grp-groupname-field").style.display = "none";
}

async function joinGroup() {
  if (groupCode) {
    showToast(
      "Ek group kaafi nahi tha kya? 😏",
      "error",
      "Pehle current group chhodo.",
    );
    return;
  }
 const name = profile && profile.name ? profile.name.trim() : "";
 const code = document
   .getElementById("grp-code-input")
   .value.trim()
   .toUpperCase();
  if (!name) {
    showToast(
      "Bina naam ke to bhoot bhi nahi aate! 👻🚫",
      "error",
      "Group mein dikhne ke liye naam chahiye.",
    );
    return;
  }
  if (code.length !== 6) {
    showToast(
      "Galat code! Kya jasusi karne ka irada hai? 🕵️‍♂️❌",
      "error",
      "6 character ka sahi code daalo.",
    );
    return;
  }
  if (!db) {
    showToast(
      "Internet ne saath chhod diya! 📶😭",
      "error",
      "Jaise exam mein dimaag chhodta hai. Try karo.",
    );
    return;
  }
  showToast("Checking code…", "info");
  try {
    const snap = await db
      .collection("groups")
      .doc(code)
      .collection("members")
      .limit(1)
      .get();
    if (snap.empty) {
      showToast(
        "Galat code! Kya jasusi karne ka irada hai? 🕵️‍♂️❌",
        "error",
        "Koi group nahi mila. Code check karo.",
      );
      return;
    }
  } catch (e) {
    showToast(
      "Internet ne saath chhod diya! 📶😭",
      "error",
      "Group check nahi ho paya. Dobara try karo.",
    );
    return;
  }
  groupCode = code;
  groupName = name;
  isCreator = false;
  localStorage.setItem("st_group", code);
  localStorage.setItem("st_grpname", name);
  localStorage.setItem("st_isCreator", "false");
  if (db) {
    try {
      const rootDoc = await db.collection("groups").doc(code).get();
      if (rootDoc.exists) {
        groupDisplayName = rootDoc.data().groupName || "";
        localStorage.setItem("st_groupDisplayName", groupDisplayName);
      }
    } catch (e) {
      console.log("Root doc read error:", e);
    }
  }
  await pushGroupUpdate(true);
  renderGroup();
  playGroupJoinSound();
  showToast(
    "Swagat hai! 🤝🥳",
    "",
    "Ab akele fail nahi hoge, group mein maza aayega.",
  );
}

async function leaveGroup() {
  if (!confirm("Leave this group? Your local data stays safe.")) return;
  if (lbUnsubscribe) {
    lbUnsubscribe();
    lbUnsubscribe = null;
  }
  if (activityUnsubscribe) {
    activityUnsubscribe();
    activityUnsubscribe = null;
  }
  if (groupNameUnsubscribe) {
    groupNameUnsubscribe();
    groupNameUnsubscribe = null;
  }

  // Remove this device/user from Firestore so others see real-time removal
  try {
    if (groupCode && db && memberId) {
      await db
        .collection("groups")
        .doc(groupCode)
        .collection("members")
        .doc(memberId)
        .delete();
    }
  } catch (e) {
    console.log("Leave group delete error:", e);
  }
  groupCode = "";
  groupName = "";
  groupDisplayName = "";
  isCreator = false;
  localStorage.removeItem("st_group");
  localStorage.removeItem("st_grpname");
  localStorage.removeItem("st_isCreator");
  localStorage.removeItem("st_groupDisplayName");
  document.getElementById("groupMain").style.display = "none";
  document.getElementById("groupSetup").style.display = "block";
  document.getElementById("joinGroupPanel").style.display = "none";
  document.getElementById("grp-groupname-field").style.display = "";
  playLeaveGroupSound();
  showToast(
    "Akela rahi... 🚶‍♂️💔",
    "",
    "Group chhod diya par padhai mat chhodna!",
  );
}
function copyGroupCode() {
  navigator.clipboard
    .writeText(groupCode)
    .then(() => {
      playCopySound();
      showToast(
        "Code copy ho gaya! 📋✨",
        "",
        "Ab bas gyaan baantna baaki hai.",
      );
    })
    .catch(() => showToast("Couldn't copy code", "error"));
}

async function pushGroupUpdate(isJoin) {
  if (!groupCode || !db || !memberId) return;
  const t = todayStr();

  // keeping your original metric behavior (completedChapters is total completed, not "today")


  try {
    await db
      .collection("groups")
      .doc(groupCode)
      .collection("members")
      .doc(memberId)
      .set(
        {
          memberId,
          displayName: groupName,
          name: groupName,
          streak: streak.count,
          coins: coins || 0,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    // Log activity (skip on join)
    if (!isJoin) {
    const activity = {
      memberId,
      member: groupName,
      coins: coins || 0,
      date: t,
      ts: firebase.firestore.FieldValue.serverTimestamp(),
    };
      await db
        .collection("groups")
        .doc(groupCode)
        .collection("activity")
        .add(activity);
    }
  } catch (e) {
    console.log("Firebase error:", e);
  }
}

async function checkGroupMilestone() {
  if (!groupCode || !db) return;
  const completed = chapters.filter((c) => c.status === "Completed").length;
  if (completed > 0 && completed % 5 === 0) {
    try {
      await db
        .collection("groups")
        .doc(groupCode)
        .collection("milestones")
        .add({
          memberId,
          member: groupName,
          milestone: completed + " chapters completed!",
          date: todayStr(),
          ts: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (e) {}
  }
}

function toggleRenameGroup() {
  const section = document.getElementById("renameGroupSection");
  if (!section) return;
  const isVisible = section.style.display !== "none";
  section.style.display = isVisible ? "none" : "block";
  if (!isVisible) {
    const inp = document.getElementById("rename-grp-input");
    if (inp) inp.value = groupDisplayName;
  }
}

async function renameGroup() {
  if (!isCreator || !groupCode || !db) return;
  const inp = document.getElementById("rename-grp-input");
  const newName = inp ? inp.value.trim() : "";
  if (!newName) {
    showToast("Naam toh do bhai! 😤🚫", "error", "Group ka naya naam likho.");
    return;
  }
  try {
    await db.collection("groups").doc(groupCode).update({ groupName: newName });
    groupDisplayName = newName;
    localStorage.setItem("st_groupDisplayName", newName);
    const nameEl = document.getElementById("groupNameDisplay");
    if (nameEl) nameEl.textContent = newName;
    document.getElementById("renameGroupSection").style.display = "none";
    playSaveSound();
    showToast(
      "Naya naam, wahi purane kaand! 🏷️🎭",
      "",
      "Group update ho gaya.",
    );
  } catch (e) {
    showToast(
      "Naam badalna itna mushkil kyun hai? 😤",
      "error",
      "Rename fail hua. Dobara try karo.",
    );
  }
}

function loadGroupName() {
  if (!db || !groupCode) return;
  if (groupNameUnsubscribe) groupNameUnsubscribe();
  groupNameUnsubscribe = db
    .collection("groups")
    .doc(groupCode)
    .onSnapshot(
      (doc) => {
        if (doc.exists) {
          const data = doc.data();
          groupDisplayName = data.groupName || "";
          localStorage.setItem("st_groupDisplayName", groupDisplayName);
          const nameEl = document.getElementById("groupNameDisplay");
          if (nameEl) nameEl.textContent = groupDisplayName;
        }
      },
      (e) => console.log("Group name listener error:", e),
    );
}

function renderGroup() {
  if (!groupCode) {
    document.getElementById("groupSetup").style.display = "block";
    document.getElementById("groupMain").style.display = "none";
       return;
  }
 document.getElementById("groupSetup").style.display = "none";
 document.getElementById("groupMain").style.display = "block";
 document.getElementById("groupCodeDisplay").textContent = groupCode;
  const nameEl = document.getElementById("groupNameDisplay");
  if (nameEl) nameEl.textContent = groupDisplayName || "";
  const renameBtn = document.getElementById("renameGroupBtn");
  if (renameBtn) renameBtn.style.display = isCreator ? "flex" : "none";
  loadLeaderboard();
  loadActivity();
  loadGroupName();
}

function loadLeaderboard() {
  if (!db) {
    document.getElementById("leaderboard").innerHTML =
      '<div class="empty"><p>Group feature requires internet.</p></div>';
    return;
  }
  if (lbUnsubscribe) lbUnsubscribe();

  lbUnsubscribe = db
    .collection("groups")
    .doc(groupCode)
    .collection("members")
    .onSnapshot(
      (snap) => {
        const members = [];
        snap.forEach((doc) => {
          const d = doc.data() || {};
          members.push({ id: doc.id, ...d });
        });
        members.sort((a, b) => {
          const coinDiff = (b.coins || 0) - (a.coins || 0);
          if (coinDiff !== 0) return coinDiff;
          const streakDiff = (b.streak || 0) - (a.streak || 0);
          if (streakDiff !== 0) return streakDiff;
          return (a.displayName || a.name || "").localeCompare(
            b.displayName || b.name || "",
          );
        });
        const medals = ["🥇", "🥈", "🥉"];
        let html = "";
        members.forEach((m, i) => {
          const isYou = m.id === memberId;
          const display = m.displayName || m.name || "Member";
          html += `<div class="lb-card${isYou ? " lb-you" : ""}">
          <div class="lb-rank">${medals[i] || "#" + (i + 1)}</div>
          <div class="lb-info">
            <div class="lb-name">${sanitize(display)}${isYou ? " (You)" : ""}</div>
            <div class="lb-stats">
              <span class="lb-stat">🪙 <span>${m.coins || 0}</span> coins</span>
              <span class="lb-stat">🔥 <span>${m.streak || 0}</span> streak</span>
            </div>
          </div>
        </div>`;
        });
        if (!html)
          html =
            '<div class="empty"><div class="emoji">👥</div><p>No members yet. Share your group code!</p></div>';
        document.getElementById("leaderboard").innerHTML = html;
      },
      (err) => {
        console.log("Leaderboard listener error:", err);
        document.getElementById("leaderboard").innerHTML =
          '<div class="empty"><p>Could not load leaderboard.</p></div>';
      },
    );
}
// real-time activity listener
function loadActivity() {
  if (!db) {
    document.getElementById("activityFeed").innerHTML =
      '<div class="empty"><p>Activity requires internet.</p></div>';
    return;
  }
  const t = todayStr();

  if (activityUnsubscribe) activityUnsubscribe();

  activityUnsubscribe = db
    .collection("groups")
    .doc(groupCode)
    .collection("activity")
    .where("date", "==", t)
    .orderBy("ts", "desc")
    .limit(20)
    .onSnapshot(
      (snap) => {
        let html = "";
        snap.forEach((doc) => {
          const d = doc.data() || {};
          const name = d.member || "Member";
          html += `<div class="activity-item">
          <div class="activity-dot"></div>
          <div>
        <div class="activity-text"><strong>${sanitize(name)}</strong> · 🪙 ${d.coins || 0} coins</div>
            <div class="activity-time">Today</div>
          </div>
        </div>`;
        });
        if (!html)
          html =
            '<div class="empty"><div class="emoji">⚡</div><p>No activity today yet. Be the first!</p></div>';
        document.getElementById("activityFeed").innerHTML = html;
      },
      (err) => {
        console.error("Activity listener error:", err);
        document.getElementById("activityFeed").innerHTML =
          '<div class="empty"><p>⚠️ Activity unavailable. Create a composite index for <em>date + ts</em> in Firebase Console.</p></div>';
      },
    );
}

// ── RENDER ALL ──
function renderAll() {
  renderTodayRevisions();
  renderDoneRevisions();
  renderCalendar();
  renderSubjectGrid();
logTodayActivity();
renderWeekly();
updateGreeting();
updateStreak();
  updateCoinsUI();
}

// ── TOGGLE WEAK ──
document.getElementById("weakToggle").addEventListener("change", function () {
  document.getElementById("weakLabel").textContent = this.checked
    ? "Yes ⚠"
    : "No";
});

// ── INIT ──
function initApp() {
  populateSubjectDropdown();
  processMissedRevisions();
  renderAll();
  showNotifModal();
  registerSW();
  checkNotifBanner();
  scheduleDailyReminder();
  if (groupCode) {
    renderGroup();
    pushGroupUpdate(true);
  }
}
// ── PROFILE SIDEBAR FUNCTIONS ──
function toggleGroupCode() {
  const panel = document.getElementById("groupCodePanel");
  const btn = document.getElementById("showCodeBtn");
  const isOpen = panel.classList.contains("open");
  panel.classList.toggle("open");
  btn.textContent = isOpen ? "🔑 Show Group Code" : "🔒 Hide Code";
}

function openProfile() {
  if (!profile) return;
  document.getElementById("prof-name").value = profile.name || "";
  document.getElementById("prof-class").value = profile.cls || "9";
  document.getElementById("prof-exam").value = profile.examDate || "";
  document.getElementById("prof-display-name").textContent =
    profile.name || "—";
  const clsMap = { 9: "Class 9 (ICSE)", 10: "Class 10 (ICSE)", other: "Other" };
  document.getElementById("prof-display-sub").textContent =
    clsMap[profile.cls] || profile.cls || "—";
  document.getElementById("prof-stat-chapters").textContent = chapters.length;
  document.getElementById("prof-stat-streak").textContent = streak.count;
  document.getElementById("prof-stat-coins").textContent = coins || 0;
  document.getElementById("prof-stat-revs").textContent = revisions.filter(
    (r) => r.done,
  ).length;
  // exam countdown (IST / Kolkata only)
  if (profile.examDate) {
    const today = todayStr(); // IST YYYY-MM-DD
    const diff = Math.round(
      (dateKeyToUTC(profile.examDate) - dateKeyToUTC(today)) / 86400000,
    );

    if (diff > 0) {
      document.getElementById("examCountdownBlock").style.display = "flex";
      document.getElementById("prof-exam-days").textContent = diff + " days";
    } else {
      document.getElementById("examCountdownBlock").style.display = "none";
    }
  } else {
    document.getElementById("examCountdownBlock").style.display = "none";
  }
  // group info
  const gi = document.getElementById("prof-group-info");
  gi.innerHTML = groupCode
    ? `<strong>Status</strong>In group <span style="color:var(--indigo);font-weight:700">${groupCode}</span> as "${sanitize(groupName)}"`
    : `<strong>Status</strong>Not in any group.`;
  // open
  setProfileEditMode(false);
  document.getElementById("profileOverlay").style.display = "block";
  requestAnimationFrame(() => document.body.classList.add("prof-open"));
}

function closeProfile() {
  document.body.classList.remove("prof-open");
  setTimeout(() => {
    document.getElementById("profileOverlay").style.display = "none";
  }, 280);
}

function saveProfile() {
  const name = document.getElementById("prof-name").value.trim();
  if (!name) {
    showToast(
      "Bina naam ke to bhoot bhi nahi aate! 👻🚫",
      "error",
      "Pehle naam toh likho.",
    );
    return;
  }
  profile.name = name;
  profile.cls = document.getElementById("prof-class").value;
  profile.examDate = document.getElementById("prof-exam").value;
  localStorage.setItem("st_profile", JSON.stringify(profile));
  if (groupCode && name !== groupName) {
    groupName = name;
    localStorage.setItem("st_grpname", name);
    pushGroupUpdate(false);
  }
  playSaveSound();
  showToast("Pehchaan surakshit! 🏆👤", "", "Ab isi naam se top karna hai.");
  closeProfile();
  renderAll();
}

function setProfileEditMode(isEditing) {
  const block = document.getElementById("profileEditBlock");
  const nameInput = document.getElementById("prof-name");
  const classSelect = document.getElementById("prof-class");
  const examInput = document.getElementById("prof-exam");
  const actions = document.getElementById("profileEditActions");
  const editBtn = document.getElementById("editProfileBtn");

  if (
    !block ||
    !nameInput ||
    !classSelect ||
    !examInput ||
    !actions ||
    !editBtn
  )
    return;

  nameInput.disabled = !isEditing;
  classSelect.disabled = !isEditing;
  examInput.disabled = !isEditing;

  block.classList.toggle("profile-readonly", !isEditing);
  actions.style.display = isEditing ? "flex" : "none";
  editBtn.textContent = isEditing ? "✏️ Editing" : "✏️ Edit";
}

function toggleProfileEdit() {
  const nameInput = document.getElementById("prof-name");
  if (!nameInput) return;
  setProfileEditMode(nameInput.disabled); // if disabled, switch to editing
}

function cancelProfileEdit() {
  if (!profile) return;

  document.getElementById("prof-name").value = profile.name || "";
  document.getElementById("prof-class").value = profile.cls || "9";
  document.getElementById("prof-exam").value = profile.examDate || "";

  setProfileEditMode(false);
  showToast(
    "Purani yaadein hi achhi thin... 🔙🚫",
    "info",
    "Badlav cancel kar diya.",
  );
}

// Unified swipe handler — open from left edge, close by swiping left
(function () {
  let tx = 0,
    ty = 0,
    trackOpen = false;
  const EDGE = 28;
  document.addEventListener(
    "touchstart",
    (e) => {
      tx = e.touches[0].clientX;
      ty = e.touches[0].clientY;
      trackOpen = tx < EDGE;
    },
    { passive: true },
  );
  document.addEventListener(
    "touchend",
    (e) => {
      const dx = e.changedTouches[0].clientX - tx;
      const dy = Math.abs(e.changedTouches[0].clientY - ty);
      if (document.body.classList.contains("prof-open")) {
        if (dx < -60) closeProfile();
      } else if (trackOpen && dx > 48 && dy < 80) {
        openProfile();
      }
      trackOpen = false;
    },
    { passive: true },
  );
})();

function init() {
  if (!checkOnboard()) return;
  initApp();
}
document.addEventListener(
  "click",
  function onceUnlock() {
    unlockSound();
    primeSound();
  },
  { once: true },
);

document.addEventListener(
  "touchstart",
  function onceUnlockTouch() {
    unlockSound();
    primeSound();
  },
  { once: true },
);
init();
