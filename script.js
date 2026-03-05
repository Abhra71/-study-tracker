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
const due = revisions.filter(
  (r) => r.dueDate === t && !r.done && !r.missedPermanently,
);
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

function checkSyllabusProfile() {
  // Old users who completed onboarding before stream/lang2/elective fields existed
  // will have profile but no stream — show a focused one-time prompt to collect missing fields
  if (!profile || profile.stream) return; // already has it, skip
  if (localStorage.getItem("st_syllabus_prompted")) return; // already prompted once

  const box = document.getElementById("onboardBox");
  box.innerHTML = `
    <span class="emoji">🎓</span>
    <h2>One Quick Update</h2>
    <p>We've added full syllabus support! Tell us your subjects so we can personalise your progress.</p>
    <div class="field">
      <label>Stream</label>
      <select id="ob-stream">
        <option value="science">Science (Physics, Chemistry, Biology)</option>
        <option value="commerce">Commerce</option>
      </select>
    </div>
    <div class="field">
      <label>Second Language</label>
      <select id="ob-lang2">
        <option value="hindi">Hindi</option>
        <option value="bengali">Bengali</option>
      </select>
    </div>
    <div class="field">
      <label>Group III Elective</label>
      <select id="ob-elective">
        <option value="computer">Computer Applications</option>
        <option value="eco_apps">Economic Applications</option>
        <option value="physical_ed">Physical Education</option>
      </select>
    </div>
    <button class="btn btn-primary full" onclick="finishSyllabusPrompt()">Save & Continue 🚀</button>
  `;
  document.getElementById("onboardOverlay").classList.remove("hidden");
}

function finishSyllabusPrompt() {
  profile.stream   = document.getElementById("ob-stream").value;
  profile.lang2    = document.getElementById("ob-lang2").value;
  profile.elective = document.getElementById("ob-elective").value;
  localStorage.setItem("st_profile", JSON.stringify(profile));
  localStorage.setItem("st_syllabus_prompted", "1");
  document.getElementById("onboardOverlay").classList.add("hidden");
  // Rebuild subjects with newly set preferences
  rebuildSubjectsFromSyllabus();
  populateSubjectDropdown();
  updateChapterSuggestions();
  renderAll();
  showToast("Syllabus personalised! 🎓", "", "Progress tab now reflects your exact subjects.");
}
function finishOnboard() {
  const name = document.getElementById("ob-name").value.trim();
  if (!name) {
    showToast("Bina naam ke to bhoot bhi nahi aate! 👻🚫", "error", "Pehle apna naam likho.");
    return;
  }
  const cls      = document.getElementById("ob-class").value;
  const exam     = document.getElementById("ob-exam").value;
  const stream   = document.getElementById("ob-stream").value;
  const lang2    = document.getElementById("ob-lang2").value;
  const elective = document.getElementById("ob-elective").value;
  const deadline = document.getElementById("ob-deadline").value;
  if (exam && deadline) {
    const err = _validateDeadline(deadline, exam);
    if (err) { showToast(err, "error", "Invalid deadline"); return; }
  }
  profile = { name, cls, examDate: exam, stream, lang2, elective, deadline: deadline || "" };
  localStorage.setItem("st_profile", JSON.stringify(profile));
  document.getElementById("onboardOverlay").classList.add("hidden");
  loadSyllabusAndInit();
}

function _deadlineBounds(examDateStr) {
  const examMs  = dateKeyToUTC(examDateStr);
  const minMs   = examMs - 60 * 86400000; // earliest allowed = 60 days before exam
  const maxMs   = examMs - 10 * 86400000; // latest allowed  = 10 days before exam
  const toStr   = ms => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
  };
  const toLabel = ms => {
    const d = new Date(ms);
    return `${d.getUTCDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  };
  return { minDate: toStr(minMs), maxDate: toStr(maxMs), minLabel: toLabel(minMs), maxLabel: toLabel(maxMs) };
}

function _validateDeadline(deadlineStr, examStr) {
  const { minDate, maxDate, minLabel, maxLabel } = _deadlineBounds(examStr);
  if (deadlineStr < minDate) return `Too early — must be on or after ${minLabel} (2 months before exam).`;
  if (deadlineStr > maxDate) return `Too close — must be on or before ${maxLabel} (10 days before exam).`;
  return null;
}

function updateDeadlineLimits() {
  const exam  = document.getElementById("ob-exam").value;
  const field = document.getElementById("ob-deadline-field");
  const hint  = document.getElementById("ob-deadline-hint");
  const inp   = document.getElementById("ob-deadline");
  if (!exam) { field.style.display = "none"; return; }
  field.style.display = "block";
  const { minDate, maxDate, minLabel, maxLabel } = _deadlineBounds(exam);
  inp.min = minDate;
  inp.max = maxDate;
  hint.textContent = `Pick a date between ${minLabel} and ${maxLabel}.`;
}

function updateProfileDeadlineLimits() {
  const exam = document.getElementById("prof-exam").value;
  const hint = document.getElementById("prof-deadline-hint");
  const inp  = document.getElementById("prof-deadline");
  if (!exam || !hint || !inp) return;
  const { minDate, maxDate, minLabel, maxLabel } = _deadlineBounds(exam);
  inp.min = minDate;
  inp.max = maxDate;
  hint.textContent = `Between ${minLabel} and ${maxLabel}.`;
}

// ── GREETING ──
function updateGreeting() {
  if (!profile) {
    document.getElementById("greeting").textContent = "";
    return;
  }
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
 const due = revisions.filter(
   (r) => r.dueDate === t && !r.done && !r.missedPermanently,
 );
 const overdue = revisions.filter(
   (r) => r.dueDate < t && !r.done && !r.missedPermanently,
 );
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
const yesterdayDue = revisions.filter((r) => r.dueDate === yesterday && !r.missedPermanently).length;
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
      // Auto-flag chapter as weak if it already has 1+ permanently missed revisions (this will be the 2nd)
      const ch = chapters.find(c => c.id === r.chapterId);
      if (ch && !ch.isWeak) {
        const alreadyMissed = revisions.filter(rv => rv.chapterId === r.chapterId && rv.missedPermanently && rv.id !== r.id).length;
        if (alreadyMissed >= 1) {
          ch.isWeak = true;
          showToast("⚠ Auto-flagged Weak!", "warn", `"${ch.name}" missed 2+ revisions — auto-marked as weak.`);
        }
      }
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
  if (name !== "today" && graceTimerInterval) {
    clearInterval(graceTimerInterval);
    graceTimerInterval = null;
  }
  document
    .querySelectorAll(".tab-content")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  e.currentTarget.classList.add("active");
if (name === "group") {
  renderGroup();
}
if (name === "weak") renderWeak();
if (name === "chapters") renderSubjectGrid();
if (name === "progress") renderProgress();
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
  const sel = document.getElementById("chapterNameSelect");
  const inp = document.getElementById("chapterName");
  const name = (sel && sel.style.display !== "none" && sel.value !== "__custom__")
    ? sel.value.trim()
    : (inp ? inp.value.trim() : "");
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
  // Block duplicate: same subject + same name (case-insensitive)
  const alreadyExists = chapters.some(
    c => c.subject === subject && c.name.trim().toLowerCase() === name.trim().toLowerCase()
  );
  if (alreadyExists) {
    showToast(
      "Ye chapter toh pehle se hai! 🔁😅",
      "error",
      `"${name}" is already added under ${subject}.`
    );
    return;
  }
  // Check if this chapter exists in the preloaded syllabus
  let isCustom = true;
  if (window._syllabus) {
   const aliases = { "History & Civics": ["Civics", "History"] };
    const lookFor = aliases[subject] || [subject];
    outer: for (const group of Object.values(window._syllabus.groups)) {
      for (const subj of Object.values(group.subjects)) {
        if (lookFor.includes(subj.name)) {
          for (const ch of subj.chapters) {
            if (ch.name.trim().toLowerCase() === name.trim().toLowerCase()) {
              isCustom = false;
              break outer;
            }
          }
        }
      }
    }
  }

  const chapter = {
    id: uid(),
    subject,
    name,
    status,
    isWeak,
    isCustom,
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
  updateChapterSuggestions(); // refresh dropdown to exclude newly-added chapter
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



let _confirmCallback = null;

function showConfirmModal(question, onYes) {
  _confirmCallback = onYes;
  document.getElementById("confirmQuestion").textContent = question;
  document.getElementById("confirmModal").classList.remove("hidden");
}

function closeConfirmModal() {
  _confirmCallback = null;
  document.getElementById("confirmModal").classList.add("hidden");
}

function confirmYes() {
  if (_confirmCallback) _confirmCallback();
  closeConfirmModal();
}

function deleteChapter(id) {
  showConfirmModal("Do you really want to delete this chapter?", () => {
    chapters = chapters.filter((c) => c.id !== id);
    revisions = revisions.filter((r) => r.chapterId !== id);
    save();
    renderAll();
    playDeleteSound();
    showToast(
      "Gaya kaam se! 🚮💨",
      "",
      "Jaise exam ke baad sab bhool jate ho.",
    );
  });
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
    (r) => (r.dueDate === t && r.done) || (r.completedInGrace === true && r.completedOn === t),
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
      if (!el) {
        clearInterval(graceTimerInterval);
        return;
      }
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
  } else {
    if (graceTimerInterval) {
      clearInterval(graceTimerInterval);
      graceTimerInterval = null;
    }
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

  if (grace.length > 0) {
    const el2 = document.getElementById("graceCountdown");
    if (el2) {
      const graceExpiry = graceExpireTime(yesterday);
      const diff = graceExpiry.getTime() - Date.now();
      if (diff > 0) {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        el2.textContent = `${h}h ${String(m).padStart(2, "0")}m`;
      }
    }
  }
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
  .filter((r) => !r.done && !r.missedPermanently && r.dueDate >= t)
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
  const customBadge = ch.isCustom ? `<span class="custom-badge">✦ Custom</span>` : "";

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

const chRevs_lock = revisions.filter((r) => r.chapterId === ch.id);
const r1 = chRevs_lock.find((r) => r.dayOffset === 1);
const isLocked = r1 && (r1.done || r1.missedPermanently || r1.completedInGrace);

return `<div class="chapter-card">
    <div class="chapter-card-top">
      <div style="flex:1;min-width:0">
        <span class="chapter-name">${sanitize(ch.name)}</span>${weakBadge}${customBadge}
        <div><span class="badge ${badgeClass}">${ch.status}</span></div>
        ${nextRev}${dotsHtml}
        <p class="added-date">Added: ${fmtDate(ch.dateAdded)}</p>
      </div>
${
  isLocked
    ? `<div onclick="showToast('Revision attempted! 🔒', 'error', 'One revision is already attempted! Can\\'t change status or delete this chapter now.')" style="cursor:pointer">
            <select class="status-select" disabled style="opacity:0.4;pointer-events:none">
              <option value="Not Started"${ch.status === "Not Started" ? " selected" : ""}>Not Started</option>
              <option value="In Progress"${ch.status === "In Progress" ? " selected" : ""}>In Progress</option>
              <option value="Completed"${ch.status === "Completed" ? " selected" : ""}>Completed</option>
            </select>
           </div>`
    : `<select class="status-select" onchange="updateStatus('${ch.id}',this.value)">
            <option value="Not Started"${ch.status === "Not Started" ? " selected" : ""}>Not Started</option>
            <option value="In Progress"${ch.status === "In Progress" ? " selected" : ""}>In Progress</option>
            <option value="Completed"${ch.status === "Completed" ? " selected" : ""}>Completed</option>
           </select>`
}
    </div>
    <div style="display:flex;gap:6px;margin-top:8px">
      <button class="btn btn-secondary btn-xs" style="flex:1" id="rev-btn-${ch.id}" onclick="toggleRevisions('${ch.id}')">📋 See Revisions</button>
      ${
        !isLocked
          ? `<button class="btn btn-danger btn-xs" style="flex:1" onclick="deleteChapter('${ch.id}')">🗑 Delete Chapter</button>`
          : `<button class="btn btn-danger btn-xs" style="flex:1;opacity:0.4" onclick="showToast('Revision attempted! 🔒', 'error', 'One revision is already attempted! Can\\'t change status or delete this chapter now.')">🗑 Delete Chapter</button>`
      }
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
const due = revisions.filter(
  (r) => r.dueDate === t && !r.done && !r.missedPermanently,
);
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
  const snap = await db.collection("groups").doc(code).get();
  if (!snap.exists) {
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
  showConfirmModal("Do you really want to leave this group?", async () => {
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
    document.getElementById("grp-groupname-field").style.display = "flex";
    playLeaveGroupSound();
    showToast(
      "Akela rahi... 🚶‍♂️💔",
      "",
      "Group chhod diya par padhai mat chhodna!",
    );
  });
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

let _pushDebounceTimer = null;

async function _doPushGroupUpdate(isJoin) {
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

function pushGroupUpdate(isJoin) {
  if (!groupCode || !db || !memberId) return;
  if (isJoin) {
    // Join and create calls fire immediately — they need instant confirmation
    return _doPushGroupUpdate(true);
  }
  // Non-join calls: debounce so rapid bursts (marking 6 revisions done) only hit Firestore once
  clearTimeout(_pushDebounceTimer);
  _pushDebounceTimer = setTimeout(() => _doPushGroupUpdate(false), 2000);
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

// ── REBUILD SUBJECTS FROM SYLLABUS ──
function rebuildSubjectsFromSyllabus() {
  if (!window._syllabus || !profile) return;
  // No guard — always rebuild subject list from profile preferences

  const stream   = profile.stream   || "science";
  const lang2    = profile.lang2    || "hindi";
  const elective = profile.elective || "computer";

  const toLoad = ["english_lang","english_lit","history","civics","geography","maths"];
  if (stream === "science") toLoad.push("physics","chemistry","biology");
  else toLoad.push("commerce","economics_g2");
  toLoad.push(lang2);
  toLoad.push(elective);

  const subjDefs = {};
  Object.values(window._syllabus.groups).forEach(group => {
    Object.entries(group.subjects).forEach(([key, subj]) => {
      subjDefs[key] = subj;
    });
  });

  subjects = [...new Set(
    toLoad
      .filter(key => subjDefs[key] && subjDefs[key].chapters.length > 0)
      .map(key => subjDefs[key].name)
  )].map(s => (s === "History" || s === "Civics") ? "History & Civics" : s)
    .filter((s, i, arr) => arr.indexOf(s) === i);
  save();
}

// ── CHAPTER AUTOFILL ──
function updateChapterSuggestions() {
  const sel = document.getElementById("chapterNameSelect");
  const inp = document.getElementById("chapterName");
  if (!sel) return;
  const selectedSubject = document.getElementById("subjectSelect").value;
 const aliases = { "History & Civics": ["Civics", "History"] };
  const lookFor = aliases[selectedSubject] || [selectedSubject];
  const addedNames = new Set(
    chapters.filter(c => c.subject === selectedSubject).map(c => c.name.trim().toLowerCase())
  );
  const allChapters = [];
  if (window._syllabus) {
    Object.values(window._syllabus.groups).forEach((group) => {
      Object.values(group.subjects).forEach((subj) => {
        if (lookFor.includes(subj.name)) {
          subj.chapters.forEach((ch) => {
            if (!addedNames.has(ch.name.trim().toLowerCase())) {
              allChapters.push(ch.name);
            }
          });
        }
      });
    });
  }
  if (allChapters.length > 0) {
    sel.style.display = "block";
    if (inp) inp.style.display = "none";
    sel.innerHTML = `<option value="" disabled selected>— Select a chapter —</option>` +
      allChapters
      .map((n) => `<option value="${sanitize(n)}">${sanitize(n)}</option>`)
      .join("") +
      `<option value="__custom__">✦ Type custom name...</option>`;
  } else {
    sel.style.display = "none";
    if (inp) { inp.style.display = "block"; inp.value = ""; }
  }
}

function onChapterSelectChange() {
  const sel = document.getElementById("chapterNameSelect");
  const inp = document.getElementById("chapterName");
  if (!sel || !inp) return;
  if (sel.value === "__custom__") {
    inp.style.display = "block";
    inp.value = "";
    inp.focus();
  } else {
    inp.style.display = "none";
  }
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
  if (document.getElementById("tab-progress").classList.contains("active")) {
    renderProgress();
  }
}

// ── PROGRESS TAB ──
function renderProgress() {
  _renderDeadlineBanner();
  renderReadiness();
  renderPace();
  renderSyllabusMap();
  renderSubjectHealth();
  renderRevisionCoverage();
  renderIntelligenceReport();
}

function _renderDeadlineBanner() {
  // Find or create the banner element before prog-readiness-block
  const ref = document.getElementById("prog-readiness-block");
  if (!ref || !profile) return;
  let banner = document.getElementById("prog-deadline-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "prog-deadline-banner";
    ref.parentNode.insertBefore(banner, ref);
  }

  const today = todayStr();

  if (profile.deadline) {
    // Show countdown banner
    const dLeft = Math.max(0, Math.round((dateKeyToUTC(profile.deadline) - dateKeyToUTC(today)) / 86400000));
    const examLeft = profile.examDate ? Math.max(0, Math.round((dateKeyToUTC(profile.examDate) - dateKeyToUTC(today)) / 86400000)) : null;
    const color = dLeft <= 7 ? _PC.red : dLeft <= 20 ? _PC.yellow : _PC.green;
    banner.innerHTML = `<div class="prog-section" style="background:${_PC.bg};border:1px solid ${_PC.border};border-top:3px solid ${color};border-radius:16px;padding:16px 18px;margin-bottom:14px;box-shadow:0 4px 24px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-size:0.63rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${color};font-family:${_PC.font};margin-bottom:4px">🎯 Study Deadline</div>
        <div style="font-size:1.6rem;font-weight:900;color:${color};font-family:${_PC.font};line-height:1;text-shadow:0 0 16px ${color}66">${dLeft} <span style="font-size:0.9rem">days left</span></div>
        <div style="font-size:0.68rem;color:${_PC.text2};font-family:${_PC.font};margin-top:4px">Finish by ${fmtDate(profile.deadline)}${examLeft !== null ? ` &nbsp;·&nbsp; Exam in ${examLeft}d` : ""}</div>
      </div>
      <button onclick="_clearDeadline()" style="background:transparent;border:1px solid ${_PC.border};border-radius:8px;padding:6px 12px;font-size:0.63rem;font-weight:700;color:${_PC.text3};cursor:pointer;font-family:${_PC.font}">Change</button>
    </div>`;
    return;
  }

  // No deadline set — show prompt
  if (!profile.examDate) {
    banner.innerHTML = `<div class="prog-section" style="background:${_PC.bg};border:1px solid ${_PC.border};border-radius:16px;padding:16px 18px;margin-bottom:14px;box-shadow:0 4px 24px rgba(0,0,0,0.5)">
      <div style="font-size:0.75rem;color:${_PC.text2};font-family:${_PC.font}">Set your exam date in Profile first, then come back to set a study deadline.</div>
    </div>`;
    return;
  }

  const { minDate, maxDate, minLabel, maxLabel } = _deadlineBounds(profile.examDate);
  banner.innerHTML = `<div class="prog-section" style="background:${_PC.bg};border:2px solid ${_PC.indigo}55;border-radius:16px;padding:18px;margin-bottom:14px;box-shadow:0 4px 24px rgba(0,0,0,0.5)">
    <div style="font-size:0.65rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${_PC.indigo};font-family:${_PC.font};margin-bottom:6px">🎯 Set Your Study Deadline</div>
    <div style="font-size:0.78rem;color:${_PC.text2};font-family:${_PC.font};margin-bottom:4px;line-height:1.5">When do you want to finish your full syllabus? All pace calculations use this date.</div>
    <div style="font-size:0.68rem;color:${_PC.text3};font-family:${_PC.font};margin-bottom:14px">Valid range: <span style="color:${_PC.text2}">${minLabel}</span> → <span style="color:${_PC.text2}">${maxLabel}</span></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">
      <input type="date" id="prog-deadline-input" min="${minDate}" max="${maxDate}" style="background:${_PC.bg4};border:1px solid ${_PC.border};border-radius:8px;padding:9px 12px;color:${_PC.text};font-family:${_PC.font};font-size:0.82rem;flex:1;min-width:140px;outline:none" />
      <button onclick="_saveDeadlineFromProgress()" style="background:${_PC.indigo};border:none;border-radius:8px;padding:9px 18px;font-size:0.78rem;font-weight:800;color:#fff;cursor:pointer;font-family:${_PC.font};white-space:nowrap">Set Deadline</button>
    </div>
    <div id="prog-deadline-err" style="font-size:0.68rem;color:${_PC.red};margin-top:6px;font-family:${_PC.font};min-height:16px"></div>
  </div>`;
}

function _saveDeadlineFromProgress() {
  const inp = document.getElementById("prog-deadline-input");
  if (!inp || !inp.value) {
    document.getElementById("prog-deadline-err").textContent = "Please pick a date.";
    return;
  }
  const err = _validateDeadline(inp.value, profile.examDate);
  if (err) {
    document.getElementById("prog-deadline-err").textContent = err;
    return;
  }
  profile.deadline = inp.value;
  localStorage.setItem("st_profile", JSON.stringify(profile));
  renderProgress();
}

function _clearDeadline() {
  profile.deadline = "";
  localStorage.setItem("st_profile", JSON.stringify(profile));
  const banner = document.getElementById("prog-deadline-banner");
  if (banner) banner.remove();
  renderProgress();
}

// ── SHARED UTIL ──
function _syllabusTotal(subjectName) {
  if (!window._syllabus) return null;
const aliases = { "History & Civics": ["Civics", "History"] };
  const lookFor = aliases[subjectName] || [subjectName];
  let count = 0;
  Object.values(window._syllabus.groups).forEach(group => {
    Object.values(group.subjects).forEach(subj => {
      if (lookFor.includes(subj.name) && subj.chapters.length > 0)
        count += subj.chapters.length;
    });
  });
  return count || null;
}

function _syllabusGrandTotal() {
  if (!window._syllabus || !profile) return null;
  const stream   = profile.stream   || "science";
  const lang2    = profile.lang2    || "hindi";
  const elective = profile.elective || "computer";
  const toLoad = ["english_lang","english_lit","history","civics","geography","maths"];
  if (stream === "science") toLoad.push("physics","chemistry","biology");
  else toLoad.push("commerce","economics_g2");
  toLoad.push(lang2);
  toLoad.push(elective);
  let total = 0;
  Object.values(window._syllabus.groups).forEach(group => {
    Object.entries(group.subjects).forEach(([key, subj]) => {
      if (toLoad.includes(key)) total += subj.chapters.length;
    });
  });
  return total || null;
}

// ── PROGRESS THEME PALETTE ──
const _PC = {
  bg:     "linear-gradient(160deg,#0f0c16 0%,#0d0a12 100%)",
  bg4:    "#1c1826",
  bg5:    "#252133",
  border: "#2e2840",
  text:   "#f5ede0",
  text2:  "#a89880",
  text3:  "#5c5048",
  indigo: "#c2762a",
  yellow: "#e8a020",
  green:  "#2d9e6b",
  red:    "#e05c5c",
  purple: "#b07fd4",
  orange: "#f97316",
  font:   "'Baloo 2',sans-serif",
};

// ── CSS KEYFRAMES injected once ──
function _injectProgressCSS() {
  if (document.getElementById("prog-css")) return;
  const s = document.createElement("style");
  s.id = "prog-css";
  s.textContent = `
    @keyframes progFadeUp {
      from { opacity:0; transform:translateY(18px); }
      to   { opacity:1; transform:translateY(0); }
    }
    @keyframes progPulseRing {
      0%,100% { filter:drop-shadow(0 0 6px currentColor); }
      50%      { filter:drop-shadow(0 0 18px currentColor); }
    }
    @keyframes progShimmer {
      0%   { background-position:-200% center; }
      100% { background-position: 200% center; }
    }
    @keyframes progGlow {
      0%,100% { box-shadow:0 0 0 0 rgba(194,118,42,0); }
      50%      { box-shadow:0 0 18px 4px rgba(194,118,42,0.18); }
    }
    @keyframes progDotPop {
      0%   { transform:scale(0); opacity:0; }
      70%  { transform:scale(1.2); }
      100% { transform:scale(1); opacity:1; }
    }
    @keyframes progBarFill {
      from { width:0 !important; }
    }
    .prog-section {
      animation: progFadeUp 0.45s cubic-bezier(.4,0,.2,1) both;
    }
    .prog-section:nth-child(1) { animation-delay:0.05s; }
    .prog-section:nth-child(2) { animation-delay:0.12s; }
    .prog-section:nth-child(3) { animation-delay:0.19s; }
    .prog-section:nth-child(4) { animation-delay:0.26s; }
    .prog-section:nth-child(5) { animation-delay:0.33s; }
    .prog-section:nth-child(6) { animation-delay:0.40s; }
    .prog-bar-fill {
      animation: progBarFill 1s cubic-bezier(.4,0,.2,1) both;
    }
    .prog-dot-pop {
      animation: progDotPop 0.35s cubic-bezier(.34,1.56,.64,1) both;
    }
    .prog-ring-pulse circle:last-child {
      animation: progPulseRing 2.5s ease-in-out infinite;
    }
    .prog-shimmer-bar {
      background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%);
      background-size: 200% 100%;
      animation: progShimmer 2s linear infinite;
      position:absolute;inset:0;border-radius:99px;pointer-events:none;
    }
  `;
  document.head.appendChild(s);
}

function _progSection(content, extraStyle = "") {
  return `<div class="prog-section" style="
    background:${_PC.bg};
    border:1px solid ${_PC.border};
    border-radius:16px;
    padding:18px 16px;
    position:relative;overflow:hidden;
    box-shadow:0 4px 24px rgba(0,0,0,0.5),inset 0 1px 0 rgba(194,118,42,0.07);
    ${extraStyle}
  ">${content}</div>`;
}

function _progHeader(icon, title, accentColor, rightHtml = "") {
  return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:9px">
      <div style="width:28px;height:28px;border-radius:8px;background:${accentColor}1a;border:1px solid ${accentColor}33;display:flex;align-items:center;justify-content:center;font-size:0.9rem;flex-shrink:0">${icon}</div>
      <span style="font-size:0.68rem;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:${accentColor};font-family:${_PC.font}">${title}</span>
    </div>
    ${rightHtml}
  </div>
  <div style="position:absolute;top:0;left:0;right:0;height:40px;background:linear-gradient(180deg,${accentColor}10 0%,transparent 100%);pointer-events:none"></div>`;
}

function _bar(pct, color, height = 7) {
  return `<div style="background:${_PC.bg4};border-radius:99px;height:${height}px;overflow:hidden;border:1px solid ${_PC.border};position:relative">
    <div class="prog-bar-fill" style="width:${pct}%;height:100%;background:${color};border-radius:99px;box-shadow:0 0 8px ${color}55;position:relative">
      <div class="prog-shimmer-bar"></div>
    </div>
  </div>`;
}

function _ringChart(pct, color, size = 110, stroke = 13) {
  const r = (size / 2) - stroke;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const cx = size / 2, cy = size / 2;
  return `<svg class="prog-ring-pulse" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)" overflow="visible">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${_PC.bg4}" stroke-width="${stroke}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-dasharray="${dash} ${circ}" stroke-linecap="round"
      style="transition:stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1);color:${color}"/>
  </svg>`;
}

function _statPill(label, value, color) {
  return `<div style="background:${_PC.bg4};border:1px solid ${_PC.border};border-top:2px solid ${color}66;border-radius:10px;padding:10px 8px;text-align:center;flex:1;min-width:60px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0;background:${color}07;pointer-events:none"></div>
    <div style="font-size:1.15rem;font-weight:900;color:${color};font-family:${_PC.font};letter-spacing:-0.5px;text-shadow:0 0 12px ${color}77">${value}</div>
    <div style="font-size:0.57rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${_PC.text3};margin-top:2px;font-family:${_PC.font}">${label}</div>
  </div>`;
}

function _emptyState(msg) {
  return `<div style="text-align:center;padding:28px 16px;color:${_PC.text3};font-size:0.83rem;font-family:${_PC.font}">
    <div style="font-size:1.8rem;margin-bottom:8px;opacity:0.3">📭</div>${msg}
  </div>`;
}

// ── 1. EXAM READINESS HERO ──
function renderReadiness() {
  const block = document.getElementById("prog-readiness-block");
  if (!block) return;
  _injectProgressCSS();

  const syllabusChapters = chapters.filter(c => !c.isCustom);
  const syllabusTotal = _syllabusGrandTotal() || syllabusChapters.length;
  if (syllabusTotal === 0) {
    block.innerHTML = _progSection(_progHeader("🎯","Exam Readiness",_PC.indigo) + _emptyState("Syllabus data unavailable."));
    return;
  }

  const completed = syllabusChapters.filter(c => c.status === "Completed").length;
  const completionScore = (completed / syllabusTotal) * 60;

  const chaptersWith4 = syllabusChapters.filter(c =>
    [1,3,7,30].every(n => revisions.find(r => r.chapterId === c.id && r.dayOffset === n && r.done))
  ).length;
  const consistencyScore = completed > 0 ? (chaptersWith4 / completed) * 25 : 0;

  // Balance across ALL syllabus subjects, not just user-added ones
  const syllabusSubjectTotals = {};
  if (window._syllabus) {
    const stream = profile ? (profile.stream || "science") : "science";
    const lang2 = profile ? (profile.lang2 || "hindi") : "hindi";
    const elective = profile ? (profile.elective || "computer") : "computer";
    const toLoad = ["english_lang","english_lit","history","civics","geography","maths"];
    if (stream === "science") toLoad.push("physics","chemistry","biology");
    else toLoad.push("commerce","economics_g2");
    toLoad.push(lang2, elective);
    const MERGE = { "History": "History & Civics", "Civics": "History & Civics" };
    Object.values(window._syllabus.groups).forEach(group => {
      Object.entries(group.subjects).forEach(([key, subj]) => {
        if (toLoad.includes(key) && subj.chapters.length > 0) {
          const displayName = MERGE[subj.name] || subj.name;
          syllabusSubjectTotals[displayName] = (syllabusSubjectTotals[displayName] || 0) + subj.chapters.length;
        }
      });
    });
  }
  const subjectDone = {};
  syllabusChapters.filter(c => c.status === "Completed").forEach(c => {
    subjectDone[c.subject] = (subjectDone[c.subject] || 0) + 1;
  });
  const allSubjects = Object.keys(syllabusSubjectTotals);
  let imbalance = 0;
  allSubjects.forEach(s => {
    const p = (subjectDone[s] || 0) / syllabusSubjectTotals[s];
    imbalance += Math.pow(1 - p, 2);
  });
  const balanceScore = allSubjects.length === 0
    ? 0
    : (1 - Math.min(1, imbalance / allSubjects.length)) * 15;
  const readiness = Math.round(completionScore + consistencyScore + balanceScore);

  const ringColor = readiness >= 70 ? _PC.green : readiness >= 40 ? _PC.yellow : _PC.red;
  const grade = readiness >= 85 ? "ELITE" : readiness >= 70 ? "STRONG" : readiness >= 50 ? "BUILDING" : readiness >= 30 ? "EARLY" : "START";
  const gradeColor = readiness >= 70 ? _PC.green : readiness >= 50 ? _PC.yellow : readiness >= 30 ? _PC.orange : _PC.red;
  const donePct = syllabusTotal > 0 ? Math.round((completed / syllabusTotal) * 100) : 0;
  const revPct = completed > 0 ? Math.round((chaptersWith4 / completed) * 100) : 0;

  // Exam countdown badge
  let countdownHtml = "";
  if (profile && profile.examDate) {
    const dLeft = Math.max(0, Math.round((dateKeyToUTC(profile.examDate) - dateKeyToUTC(todayStr())) / 86400000));
    const urgency = dLeft <= 30 ? _PC.red : dLeft <= 60 ? _PC.yellow : _PC.green;
    countdownHtml = `<div style="background:${urgency}18;border:1px solid ${urgency}44;border-radius:8px;padding:5px 11px;font-size:0.68rem;font-weight:800;color:${urgency};font-family:${_PC.font};white-space:nowrap">⏳ ${dLeft}d left</div>`;
  }

  block.innerHTML = _progSection(`
    ${_progHeader("🎯","Exam Readiness",_PC.indigo, countdownHtml)}
    <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
      <div style="position:relative;width:112px;height:112px;flex-shrink:0">
        ${_ringChart(donePct, ringColor, 112, 13)}
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div style="font-size:1.8rem;font-weight:900;color:${ringColor};font-family:${_PC.font};line-height:1;text-shadow:0 0 20px ${ringColor}88">${readiness}</div>
          <div style="font-size:0.48rem;font-weight:800;letter-spacing:0.1em;color:${_PC.text3};text-transform:uppercase;font-family:${_PC.font}">/ 100</div>
        </div>
      </div>
      <div style="flex:1;min-width:130px">
        <div style="font-size:1.4rem;font-weight:900;letter-spacing:0.06em;color:${gradeColor};font-family:${_PC.font};text-shadow:0 0 16px ${gradeColor}55;margin-bottom:2px">${grade}</div>
        <div style="font-size:0.7rem;color:${_PC.text2};margin-bottom:12px;font-family:${_PC.font}">${completed} of ${syllabusTotal} syllabus chapters done</div>
        <div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-size:0.63rem;color:${_PC.text3};margin-bottom:4px;font-family:${_PC.font}"><span>Chapters done (60 pts)</span><span style="color:${_PC.text2}">${donePct}%</span></div>
          ${_bar(donePct, ringColor)}
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:0.63rem;color:${_PC.text3};margin-bottom:4px;font-family:${_PC.font}"><span>All 4 revisions done (25 pts)</span><span style="color:${_PC.text2}">${revPct}%</span></div>
          ${_bar(revPct, _PC.purple)}
        </div>
      </div>
    </div>
    <div style="margin-top:12px;background:${_PC.bg4};border:1px solid ${_PC.border};border-radius:8px;padding:9px 12px;font-size:0.65rem;color:${_PC.text3};font-family:${_PC.font};line-height:1.6">
      Score = chapters done (max 60) + all-4-revisions rate (max 25) + subject balance (max 15)
    </div>
  `, `border-top:3px solid ${_PC.indigo};animation:progGlow 3s ease-in-out infinite;`);
}

// ── 2. PACE TRACKER ──
function renderPace() {
  const block = document.getElementById("prog-pace-block");
  if (!block) return;
  if (!profile || !profile.examDate) { block.innerHTML = ""; return; }

  const syllabusChapters = chapters.filter(c => !c.isCustom);
  const syllabusTotal = _syllabusGrandTotal() || syllabusChapters.length;
  if (syllabusTotal === 0) { block.innerHTML = ""; return; }

  const today = todayStr();
  const completed = syllabusChapters.filter(c => c.status === "Completed").length;
  const _dl = profile.deadline || profile.examDate;
  const daysLeft = Math.max(1, Math.round((dateKeyToUTC(_dl) - dateKeyToUTC(today)) / 86400000));
  const remaining = syllabusTotal - completed;
  const paceNeeded = (remaining / daysLeft).toFixed(1);
  // Use dates when revisions were actually marked done (R1 = day after completion)
  // as proxy for "days the user actively studied"
  const activeDays = new Set(
    revisions
      .filter(r => r.done && r.completedOn && r.dayOffset === 1)
      .map(r => r.completedOn)
  );
  const studyDays = activeDays.size > 0 ? activeDays.size : null;
  const dailyPace = studyDays ? (completed / studyDays).toFixed(1) : "0.0";
  const onTrack = parseFloat(dailyPace) >= parseFloat(paceNeeded);
  const projDays = parseFloat(dailyPace) > 0 ? Math.ceil(remaining / parseFloat(dailyPace)) : null;
  const projDate = projDays ? fmtDate(addDays(today, projDays)) : "—";
  const statusColor = onTrack ? _PC.green : _PC.red;
  const statusLabel = onTrack ? "On Track 🟢" : "Behind Pace 🔴";

  block.innerHTML = _progSection(`
    ${_progHeader("📈","Pace Tracker", _PC.yellow,
      `<span style="font-size:0.65rem;font-weight:800;color:${statusColor};background:${statusColor}18;border:1px solid ${statusColor}33;padding:3px 9px;border-radius:99px;font-family:${_PC.font}">${statusLabel}</span>`
    )}
    <div style="background:${_PC.bg4};border:1px solid ${_PC.border};border-radius:10px;padding:9px 12px;margin-bottom:12px;font-size:0.65rem;color:${_PC.text2};line-height:1.6;font-family:${_PC.font}">
      <b style="color:${_PC.text}">Need/Day</b> = chapters still left ÷ days until your deadline. &nbsp;
      <b style="color:${_PC.text}">Avg/Day</b> = your actual rate based on days you completed revisions.
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
      ${_statPill("Days Left", daysLeft, _PC.purple)}
      ${_statPill("Remaining", remaining, _PC.yellow)}
      ${_statPill("Need/Day", paceNeeded, onTrack ? _PC.green : _PC.red)}
      ${_statPill("Avg/Day", dailyPace, onTrack ? _PC.green : _PC.orange)}
    </div>
    <div style="background:${_PC.bg4};border:1px solid ${statusColor}33;border-radius:10px;padding:11px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px">
      <div style="font-size:0.72rem;color:${_PC.text2};font-family:${_PC.font}">Projected finish</div>
      <div style="font-size:0.82rem;font-weight:800;color:${onTrack ? _PC.green : _PC.red};font-family:${_PC.font}">${projDate}</div>
    </div>
  `, `border-top:3px solid ${_PC.yellow};`);
}

// ── 3. SYLLABUS MAP ──
function renderSyllabusMap() {
  const block = document.getElementById("prog-syllabus-block");
  if (!block) return;
  if (!window._syllabus || !profile) { block.innerHTML = ""; return; }

  const stream   = profile.stream   || "science";
  const lang2    = profile.lang2    || "hindi";
  const elective = profile.elective || "computer";
  const toLoad = ["english_lang","english_lit","history","civics","geography","maths"];
  if (stream === "science") toLoad.push("physics","chemistry","biology");
  else toLoad.push("commerce","economics_g2");
  toLoad.push(lang2);
  toLoad.push(elective);

  const MERGE = { "History": "History & Civics", "Civics": "History & Civics" };
  const subjDefs = {};
  Object.values(window._syllabus.groups).forEach(group => {
    Object.entries(group.subjects).forEach(([key, subj]) => { subjDefs[key] = subj; });
  });

  // Build per-subject chapter status map from actual chapters array
  const chapterStatusMap = {};
  chapters.forEach(c => {
    const key = c.subject + "|" + c.name.trim().toLowerCase();
    chapterStatusMap[key] = c.status;
  });
  const revisionMap = {};
  chapters.forEach(c => {
    const revsDone = [1,3,7,30].filter(n => revisions.find(r => r.chapterId === c.id && r.dayOffset === n && r.done)).length;
    revisionMap[c.subject + "|" + c.name.trim().toLowerCase()] = revsDone;
  });

  // Group by merged subject name, deduplicate
  const seen = new Set();
  const subjectSections = [];
  toLoad.forEach(key => {
    const subj = subjDefs[key];
    if (!subj || subj.chapters.length === 0) return;
    const displayName = MERGE[subj.name] || subj.name;
    if (seen.has(displayName)) return;
    seen.add(displayName);
    subjectSections.push({ name: displayName, chapters: subj.chapters });
  });

  const subjectBlocks = subjectSections.map(({ name, chapters: chaps }) => {
    const dots = chaps.map((ch, idx) => {
      const mapKey = name + "|" + ch.name.trim().toLowerCase();
      const status = chapterStatusMap[mapKey] || "Not Started";
      const revsDone = revisionMap[mapKey] || 0;

      let dotColor, dotBg, dotBorder, dotGlow, dotTitle;
      if (status === "Not Started") {
        dotColor = _PC.text3;
        dotBg = _PC.bg5;
        dotBorder = _PC.border;
        dotGlow = "none";
        dotTitle = "Not Started";
      } else if (status === "In Progress") {
        dotColor = _PC.yellow;
        dotBg = "#2a1f08";
        dotBorder = _PC.yellow + "66";
        dotGlow = `0 0 8px ${_PC.yellow}66`;
        dotTitle = "In Progress";
      } else {
        // Completed — brightness based on revisions done
        if (revsDone === 4) {
          dotColor = _PC.green;
          dotBg = "#0a2a1e";
          dotBorder = _PC.green + "88";
          dotGlow = `0 0 10px ${_PC.green}88`;
          dotTitle = "Fully Revised ✓";
        } else if (revsDone >= 2) {
          dotColor = _PC.indigo;
          dotBg = "#2a1a08";
          dotBorder = _PC.indigo + "88";
          dotGlow = `0 0 8px ${_PC.indigo}66`;
          dotTitle = `${revsDone}/4 revisions done`;
        } else if (revsDone === 1) {
          dotColor = "#d4a060";
          dotBg = "#221608";
          dotBorder = "#d4a06088";
          dotGlow = `0 0 6px #d4a06066`;
          dotTitle = "1/4 revisions done";
        } else {
          dotColor = "#7c6040";
          dotBg = "#1a1208";
          dotBorder = "#7c604066";
          dotGlow = "none";
          dotTitle = "Completed, no revisions yet";
        }
      }

      const animDelay = (idx * 0.03).toFixed(2);
      return `<div class="prog-dot-pop" title="${sanitize(ch.name)} — ${dotTitle}" style="
        width:10px;height:10px;border-radius:50%;
        background:${dotBg};
        border:1.5px solid ${dotBorder};
        box-shadow:${dotGlow};
        cursor:default;
        transition:transform 0.15s,box-shadow 0.15s;
        animation-delay:${animDelay}s;
      " onmouseenter="this.style.transform='scale(1.6)';this.style.zIndex='10'" onmouseleave="this.style.transform='';this.style.zIndex=''"></div>`;
    }).join("");

    const done = chaps.filter(ch => (chapterStatusMap[name + "|" + ch.name.trim().toLowerCase()] || "Not Started") === "Completed").length;
    const pct = chaps.length > 0 ? Math.round((done / chaps.length) * 100) : 0;
    const subColor = pct >= 80 ? _PC.green : pct >= 40 ? _PC.yellow : pct > 0 ? _PC.orange : _PC.text3;

    return `
      <div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:0.72rem;font-weight:700;color:${_PC.text};font-family:${_PC.font}">${sanitize(name)}</span>
          <span style="font-size:0.6rem;font-weight:800;color:${subColor};font-family:${_PC.font}">${done}/${chaps.length}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">${dots}</div>
        ${_bar(pct, subColor, 4)}
      </div>`;
  }).join("");

  // Legend
  const legend = `
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid ${_PC.border}">
      ${[
        { color: _PC.bg5, border: _PC.border,    label: "Not Started" },
        { color: "#2a1f08", border: _PC.yellow+"66", label: "In Progress" },
        { color: "#1a1208", border: "#7c604066",  label: "Done" },
        { color: "#0a2a1e", border: _PC.green+"88", label: "Fully Revised" },
      ].map(l => `<div style="display:flex;align-items:center;gap:5px">
        <div style="width:9px;height:9px;border-radius:50%;background:${l.color};border:1.5px solid ${l.border}"></div>
        <span style="font-size:0.6rem;color:${_PC.text3};font-family:${_PC.font}">${l.label}</span>
      </div>`).join("")}
    </div>`;

  block.innerHTML = _progSection(
    _progHeader("🗺️", "Syllabus Map", _PC.purple) + legend + subjectBlocks,
    `border-top:3px solid ${_PC.purple};`
  );
}

// ── 4. SUBJECT HEALTH ──
function renderSubjectHealth() {
  const block = document.getElementById("prog-subjects-block");
  if (!block) return;
  if (!window._syllabus || !profile) { block.innerHTML = ""; return; }
  const today = todayStr();

  // Build subjectMap from user-added chapters (for stats)
  const subjectMap = {};
  chapters.filter(c => !c.isCustom).forEach(c => {
    if (!subjectMap[c.subject]) subjectMap[c.subject] = [];
    subjectMap[c.subject].push(c);
  });

  // Build full subject list from syllabus — so all subjects show from day one
  const stream = profile.stream || "science";
  const lang2 = profile.lang2 || "hindi";
  const elective = profile.elective || "computer";
  const toLoad = ["english_lang","english_lit","history","civics","geography","maths"];
  if (stream === "science") toLoad.push("physics","chemistry","biology");
  else toLoad.push("commerce","economics_g2");
  toLoad.push(lang2, elective);
  const MERGE = { "History": "History & Civics", "Civics": "History & Civics" };
  const seen = new Set();
  const allSubjects = [];
  Object.values(window._syllabus.groups).forEach(group => {
    Object.entries(group.subjects).forEach(([key, subj]) => {
      if (!toLoad.includes(key) || subj.chapters.length === 0) return;
      const displayName = MERGE[subj.name] || subj.name;
      if (!seen.has(displayName)) { seen.add(displayName); allSubjects.push(displayName); }
    });
  });

  const subjList = allSubjects.map(subj => {
    const chs = subjectMap[subj] || [];
    const total = chs.length;
    const done = chs.filter(c => c.status === "Completed").length;
    let brightness = 0;
    chs.forEach(c => {
      if (c.status !== "Completed") return;
      const revsDone = [1,3,7,30].filter(n => revisions.find(r => r.chapterId === c.id && r.dayOffset === n && r.done)).length;
      brightness += 60 + (revsDone / 4) * 40;
    });
    const avg = done > 0 ? brightness / done : 0;
    const syllabusTotal = _syllabusTotal(subj);
    const realPct = syllabusTotal ? Math.round((done / syllabusTotal) * 100) : Math.round((done / total) * 100);
    // Status based on % of syllabus completed
    // 0% with chapters added = DANGER (started but nothing done)
    // 0% with NO chapters added = NOT STARTED (genuinely untouched)
    const notStarted = total === 0;
    const color = realPct >= 75 ? _PC.green : realPct >= 40 ? _PC.yellow : realPct > 0 ? _PC.orange : notStarted ? _PC.text3 : _PC.red;
    const status = realPct >= 75 ? "STRONG" : realPct >= 40 ? "OK" : realPct > 0 ? "WEAK" : notStarted ? "NOT STARTED" : "DANGER";
    const dueSoon = revisions.filter(r =>
      chs.find(c => c.id === r.chapterId) && !r.done && !r.missedPermanently && r.dueDate <= addDays(today, 3)
    ).length;
    const revActivityDates = revisions
      .filter(r => r.done && r.completedOn && chs.find(c => c.id === r.chapterId))
      .map(r => r.completedOn).sort().reverse();
    const fallbackDates = chs.map(c => c.dateAdded).filter(Boolean).sort().reverse();
    const lastDate = revActivityDates[0] || fallbackDates[0];
    const daysSince = lastDate ? Math.round((dateKeyToUTC(today) - dateKeyToUTC(lastDate)) / 86400000) : null;
    return { subj, total, done, pct: realPct, syllabusTotal, color, status, dueSoon, daysSince };
  }).sort((a, b) => a.pct - b.pct);

  const danger = subjList.filter(s => s.status === "DANGER").length;
  const strong = subjList.filter(s => s.status === "STRONG").length;

  const cards = subjList.map(s => {
    // Revision quality: % of completed chapters with all 4 revisions done
    const completedChs = (subjectMap[s.subj] || []).filter(c => c.status === "Completed");
    const fullyRevised = completedChs.filter(c =>
      [1,3,7,30].every(n => revisions.find(r => r.chapterId === c.id && r.dayOffset === n && r.done))
    ).length;
    const revQualityPct = completedChs.length > 0 ? Math.round((fullyRevised / completedChs.length) * 100) : 0;
    const lastSeenLabel = s.daysSince === null ? "" : s.daysSince === 0 ? "Active today" : `Last active ${s.daysSince}d ago`;
    return `
    <div style="background:${_PC.bg4};border:1px solid ${_PC.border};border-left:3px solid ${s.color};border-radius:10px;padding:12px;transition:transform 0.15s,box-shadow 0.15s;cursor:default"
      onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.5)'"
      onmouseleave="this.style.transform='';this.style.boxShadow=''">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;gap:5px">
        <div style="font-size:0.73rem;font-weight:700;color:${_PC.text};font-family:${_PC.font};line-height:1.3">${sanitize(s.subj)}</div>
        <span style="font-size:0.54rem;font-weight:800;letter-spacing:0.1em;color:${s.color};background:${s.color}20;padding:2px 6px;border-radius:99px;border:1px solid ${s.color}33;white-space:nowrap;font-family:${_PC.font}">${s.status}</span>
      </div>
      <div style="margin-bottom:4px">
        <div style="display:flex;justify-content:space-between;font-size:0.58rem;color:${_PC.text3};margin-bottom:3px;font-family:${_PC.font}"><span>Done</span><span>${s.done}/${s.syllabusTotal || s.total}</span></div>
        ${_bar(s.pct, s.color, 5)}
      </div>
      ${completedChs.length > 0 ? `<div style="margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;font-size:0.58rem;color:${_PC.text3};margin-bottom:3px;font-family:${_PC.font}"><span>Fully revised</span><span>${revQualityPct}%</span></div>
        ${_bar(revQualityPct, _PC.purple, 4)}
      </div>` : ""}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
        <span style="font-size:0.58rem;color:${_PC.text3};font-family:${_PC.font}">${lastSeenLabel}</span>
        <div style="display:flex;gap:5px;align-items:center">
          ${s.dueSoon > 0 ? `<span style="font-size:0.58rem;color:${_PC.yellow};font-family:${_PC.font}">⏰ ${s.dueSoon} due soon</span>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");

  block.innerHTML = _progSection(`
    ${_progHeader("📊","Subject Health",_PC.yellow)}
    <div style="display:flex;gap:6px;margin-bottom:14px">
      ${_statPill("Subjects", subjList.length, _PC.indigo)}
      ${_statPill("Strong", strong, _PC.green)}
      ${_statPill("Danger", danger, danger > 0 ? _PC.red : _PC.text3)}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px">${cards}</div>
  `, `border-top:3px solid ${_PC.yellow};`);
}

// ── 5. REVISION COVERAGE ──
function renderRevisionCoverage() {
  const block = document.getElementById("prog-revisions-block");
  if (!block) return;

  const completedChapters = chapters.filter(c => c.status === "Completed" && !c.isCustom);
  const total = completedChapters.length;

  if (total === 0) {
    block.innerHTML = _progSection(_progHeader("🔁","Revision Coverage",_PC.green) + _emptyState("Complete chapters to see revision coverage."), `border-top:3px solid ${_PC.green};`);
    return;
  }

  const levels = [
    { n: 1,  label: "R1", full: "1-Day Review",   desc: "Next day",    color: _PC.indigo },
    { n: 3,  label: "R2", full: "3-Day Review",   desc: "3 days later", color: _PC.purple },
    { n: 7,  label: "R3", full: "Week Review",    desc: "1 week later", color: _PC.yellow },
    { n: 30, label: "R4", full: "Month Review",   desc: "1 month later",color: _PC.green  },
  ];

  const data = levels.map(l => {
    const done = completedChapters.filter(c =>
      revisions.find(r => r.chapterId === c.id && r.dayOffset === l.n && r.done)
    ).length;
    return { ...l, done, pct: Math.round((done / total) * 100) };
  });

  const weights = [0.10, 0.20, 0.30, 0.40];
  const memScore = Math.round(data.reduce((acc, d, i) => acc + d.pct * weights[i], 0));
  const memColor = memScore >= 70 ? _PC.green : memScore >= 40 ? _PC.yellow : _PC.red;

  const rows = data.map(d => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid ${_PC.border}">
      <div style="width:32px;height:32px;border-radius:9px;background:${d.color}18;border:1px solid ${d.color}33;display:flex;align-items:center;justify-content:center;flex-shrink:0;flex-direction:column">
        <span style="font-size:0.6rem;font-weight:900;color:${d.color};font-family:${_PC.font};line-height:1">${d.label}</span>
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px;align-items:baseline">
          <div>
            <span style="font-size:0.7rem;font-weight:700;color:${_PC.text};font-family:${_PC.font}">${d.full}</span>
            <span style="font-size:0.6rem;color:${_PC.text3};font-family:${_PC.font};margin-left:5px">${d.desc}</span>
          </div>
          <span style="font-size:0.7rem;font-weight:800;color:${d.color};font-family:${_PC.font}">${d.done}/${total}</span>
        </div>
        ${_bar(d.pct, d.color, 6)}
      </div>
    </div>`).join("");

  block.innerHTML = _progSection(`
    ${_progHeader("🔁","Revision Coverage",_PC.green)}
    <div style="background:${_PC.bg4};border:1px solid ${_PC.border};border-radius:10px;padding:10px 13px;margin-bottom:14px;font-size:0.68rem;color:${_PC.text2};line-height:1.6;font-family:${_PC.font}">
      When you complete a chapter, the app schedules 4 revision sessions: next day (R1), after 3 days (R2), after 1 week (R3), and after 1 month (R4). Each bar shows how many of your completed chapters have had that revision done. The later the revision, the more it locks in memory.
    </div>
    <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
      ${_statPill("Chapters Done", total, _PC.indigo)}
      ${_statPill("Fully Revised", data[3].done, _PC.green)}
      ${_statPill("Memory Score", memScore + "%", memColor)}
    </div>
    <div style="font-size:0.63rem;color:${_PC.text3};font-family:${_PC.font};margin-bottom:10px">Memory Score = weighted average of all 4 revision levels (R4 counts most)</div>
    <div>${rows}</div>
  `, `border-top:3px solid ${_PC.green};`);
}

// ── 6. COACH INSIGHTS ──
function renderIntelligenceReport() {
  const block = document.getElementById("prog-report-block");
  if (!block) return;
  const today = todayStr();
  const syllabusChaps = chapters.filter(c => !c.isCustom);
  const total = _syllabusGrandTotal() || syllabusChaps.length;
  if (total === 0) {
    block.innerHTML = _progSection(_progHeader("🧠","Coach Insights",_PC.purple) + _emptyState("Syllabus data unavailable."), `border-top:3px solid ${_PC.purple};`);
    return;
  }
  const completed = syllabusChaps.filter(c => c.status === "Completed").length;
  const insights = [];

  const _deadlineRef = profile ? (profile.deadline || profile.examDate) : null;
  if (profile && _deadlineRef) {
    const daysLeft = Math.max(1, Math.round((dateKeyToUTC(_deadlineRef) - dateKeyToUTC(today)) / 86400000));
    const remaining = total - completed;
    const paceNeeded = remaining / daysLeft;
    // Match pace tracker: use R1 completedOn dates as actual study days
    const coachActiveDays = new Set(
      revisions.filter(r => r.done && r.completedOn && r.dayOffset === 1).map(r => r.completedOn)
    );
    let dailyPace = 0;
    if (coachActiveDays.size > 0) {
      dailyPace = completed / coachActiveDays.size;
    }
    if (paceNeeded > (dailyPace * 1.2 + 0.1)) {
      insights.push({ icon: "⚡", color: _PC.red, tag: "URGENT", priority: 1,
        text: `Need <strong style="color:${_PC.text}">${paceNeeded.toFixed(1)}</strong> chapters/day but averaging <strong style="color:${_PC.text}">${dailyPace.toFixed(1)}</strong>. Gap: <strong style="color:${_PC.red}">${(paceNeeded - dailyPace).toFixed(1)}</strong>/day.` });
    } else {
      insights.push({ icon: "✅", color: _PC.green, tag: "ON TRACK", priority: 4,
        text: `Averaging <strong style="color:${_PC.text}">${dailyPace.toFixed(1)}</strong> chapters/day — pace is solid.` });
    }
    const projDays = dailyPace > 0 ? Math.ceil(remaining / dailyPace) : null;
    if (projDays !== null) {
      const projDate = addDays(today, projDays);
      const targetLabel = profile.deadline ? "your deadline" : "your exam";
      const buffer = Math.round((dateKeyToUTC(_deadlineRef) - dateKeyToUTC(projDate)) / 86400000);
      if (buffer < 0) {
        insights.push({ icon: "🔴", color: _PC.red, tag: "WILL OVERFLOW", priority: 1,
          text: `Projected finish <strong style="color:${_PC.text}">${fmtDate(projDate)}</strong> — <strong style="color:${_PC.red}">${Math.abs(buffer)} days AFTER</strong> ${targetLabel}. Increase your daily pace.` });
      } else if (buffer <= 3) {
        insights.push({ icon: "🟡", color: _PC.yellow, tag: "TIGHT FINISH", priority: 2,
          text: `Projected finish <strong style="color:${_PC.text}">${fmtDate(projDate)}</strong> — only <strong style="color:${_PC.yellow}">${buffer} day${buffer !== 1 ? "s" : ""} before</strong> ${targetLabel}. No room for error.` });
      } else {
        insights.push({ icon: "🟢", color: _PC.green, tag: "WILL FINISH EARLY", priority: 4,
          text: `On track to finish <strong style="color:${_PC.text}">${fmtDate(projDate)}</strong> — <strong style="color:${_PC.green}">${buffer} days ahead</strong> of ${targetLabel}.` });
      }
    }
  }

  // Build subjectMap from user-added syllabus chapters
  const subjectMap = {};
  syllabusChaps.forEach(c => { if (!subjectMap[c.subject]) subjectMap[c.subject] = []; subjectMap[c.subject].push(c); });

  // Build FULL subject list from syllabus — coach knows every subject from day 1
  const _coachStream = profile ? (profile.stream || "science") : "science";
  const _coachLang2 = profile ? (profile.lang2 || "hindi") : "hindi";
  const _coachElective = profile ? (profile.elective || "computer") : "computer";
  const _coachToLoad = ["english_lang","english_lit","history","civics","geography","maths"];
  if (_coachStream === "science") _coachToLoad.push("physics","chemistry","biology");
  else _coachToLoad.push("commerce","economics_g2");
  _coachToLoad.push(_coachLang2, _coachElective);
  const _MERGE = { "History": "History & Civics", "Civics": "History & Civics" };
  const _coachSeen = new Set();
  const _allSyllabusSubjects = [];
  if (window._syllabus) {
    Object.values(window._syllabus.groups).forEach(group => {
      Object.entries(group.subjects).forEach(([key, subj]) => {
        if (!_coachToLoad.includes(key) || subj.chapters.length === 0) return;
        const dn = _MERGE[subj.name] || subj.name;
        if (!_coachSeen.has(dn)) { _coachSeen.add(dn); _allSyllabusSubjects.push(dn); }
      });
    });
  }

  // How many subjects has the user actively started? — drives the behaviour threshold
  const startedSubjectCount = Object.keys(subjectMap).length;

  // Loop ALL syllabus subjects — not just user-added ones
  _allSyllabusSubjects.forEach(subj => {
    const chs = subjectMap[subj] || [];

    if (chs.length === 0) {
      // Completely untouched subject — no user-added chapters at all
      const syllTotal = _syllabusTotal(subj) || "?";
      if (startedSubjectCount >= 4) {
        // User is actively studying other subjects — this silence is now meaningful
        insights.push({ icon: "🚨", color: _PC.red, tag: "NEGLECTED", priority: 1,
          text: `<strong style="color:${_PC.text}">${sanitize(subj)}</strong> — not a single chapter added yet. ${syllTotal} chapters waiting.` });
      } else if (startedSubjectCount >= 1) {
        // User just started — gentle nudge, not an alarm
        insights.push({ icon: "📚", color: _PC.text3, tag: "NOT STARTED", priority: 5,
          text: `<strong style="color:${_PC.text}">${sanitize(subj)}</strong> — ${syllTotal} chapters, none started yet.` });
      }
      return;
    }

    // Subject has user-added chapters — use last activity date as before
    const revDates = revisions
      .filter(r => r.done && r.completedOn && chs.find(c => c.id === r.chapterId))
      .map(r => r.completedOn).sort().reverse();
    const addedDates = chs.map(c => c.dateAdded).filter(Boolean).sort().reverse();
    const lastDate = revDates[0] || addedDates[0];
    if (!lastDate) return;
    const daysSince = Math.round((dateKeyToUTC(today) - dateKeyToUTC(lastDate)) / 86400000);
    const done = chs.filter(c => c.status === "Completed").length;
    if (daysSince > 10) {
      insights.push({ icon: "🚨", color: _PC.red, tag: "NEGLECTED", priority: 1,
        text: `<strong style="color:${_PC.text}">${sanitize(subj)}</strong> — ${daysSince} days untouched. ${chs.length - done} chapters remaining.` });
    } else if (daysSince > 5) {
      insights.push({ icon: "😬", color: _PC.orange, tag: "SLIPPING", priority: 2,
        text: `<strong style="color:${_PC.text}">${sanitize(subj)}</strong> hasn't been touched in ${daysSince} days. ${chs.length - done} left.` });
    }
  });

  const completedChapters = syllabusChaps.filter(c => c.status === "Completed");
  const fullyRevised = completedChapters.filter(c =>
    [1,3,7,30].every(n => revisions.find(r => r.chapterId === c.id && r.dayOffset === n && r.done))
  ).length;
  if (completedChapters.length >= 3 && fullyRevised / completedChapters.length < 0.3) {
    insights.push({ icon: "📉", color: _PC.yellow, tag: "LOW RETENTION", priority: 2,
      text: `${completedChapters.length} chapters done but only <strong style="color:${_PC.text}">${fullyRevised}</strong> fully revised. Memory fades without revision.` });
  }

  for (let d = 1; d <= 3; d++) {
    const futureDate = addDays(today, d);
    const dueCount = revisions.filter(r => !r.done && !r.missedPermanently && r.dueDate === futureDate).length;
    if (dueCount >= 4) {
      insights.push({ icon: "📅", color: _PC.orange, tag: "PILE-UP WARNING", priority: 2,
        text: `<strong style="color:${_PC.text}">${dueCount} revisions</strong> due on ${fmtDate(futureDate)}. Consider completing some early.` });
      break;
    }
  }

  let bestSubj = null, bestPct = -1;
  Object.keys(subjectMap).forEach(subj => {
    const pct = subjectMap[subj].filter(c => c.status === "Completed").length / subjectMap[subj].length;
    if (pct > bestPct) { bestPct = pct; bestSubj = subj; }
  });
  if (bestSubj && bestPct >= 0.6) {
    const chs = subjectMap[bestSubj];
    insights.push({ icon: "🔥", color: _PC.green, tag: "BEST SUBJECT", priority: 4,
      text: `<strong style="color:${_PC.text}">${sanitize(bestSubj)}</strong> — ${chs.filter(c=>c.status==="Completed").length}/${chs.length} done. Keep this energy.` });
  }

  const weakCount = chapters.filter(c => c.isWeak).length;
  if (weakCount > 0) {
    insights.push({ icon: "⚠️", color: _PC.yellow, tag: "WEAK SPOTS", priority: 2,
      text: `<strong style="color:${_PC.text}">${weakCount}</strong> chapter${weakCount > 1 ? "s" : ""} flagged as weak. These need extra revision cycles.` });
  }

  // NOT ADDED YET — only for subjects partially tracked (>0 added but gaps remain)
  // Fully untouched subjects (0 added) are already handled above by NEGLECTED/NOT STARTED
  if (window._syllabus) {
    _allSyllabusSubjects.forEach(subj => {
      const syllTotal = _syllabusTotal(subj);
      const added = (subjectMap[subj] || []).length;
      if (syllTotal && added > 0 && added < syllTotal && (syllTotal - added) >= 3) {
        insights.push({ icon: "📚", color: _PC.indigo, tag: "NOT ADDED YET", priority: 3,
          text: `<strong style="color:${_PC.text}">${sanitize(subj)}</strong> — ${added} of ${syllTotal} chapters tracked. <strong style="color:${_PC.indigo}">${syllTotal - added} missing</strong>.` });
      }
    });
  }

  insights.sort((a, b) => (a.priority || 3) - (b.priority || 3));

  const shown = insights.slice(0, 10);
  const cards = shown.map((i, idx) => `
    <div style="display:flex;gap:12px;padding:12px;background:${_PC.bg4};border:1px solid ${_PC.border};border-left:3px solid ${i.color};border-radius:10px;animation:progFadeUp 0.4s cubic-bezier(.4,0,.2,1) ${(idx*0.06).toFixed(2)}s both">
      <span style="font-size:1.05rem;flex-shrink:0;margin-top:1px">${i.icon}</span>
      <div style="flex:1;min-width:0">
        <span style="font-size:0.54rem;font-weight:800;letter-spacing:0.1em;color:${i.color};background:${i.color}18;padding:2px 7px;border-radius:99px;display:inline-block;margin-bottom:5px;border:1px solid ${i.color}33;font-family:${_PC.font}">${i.tag}</span>
        <div style="font-size:0.75rem;color:${_PC.text2};line-height:1.6;font-family:${_PC.font}">${i.text}</div>
      </div>
    </div>`).join("");

  block.innerHTML = _progSection(`
    ${_progHeader("🧠","Coach Insights",_PC.purple,
      `<span style="font-size:0.6rem;color:${_PC.text3};font-family:${_PC.font}">${shown.length} insight${shown.length !== 1 ? "s" : ""}</span>`
    )}
    ${insights.length > 0
      ? `<div style="display:flex;flex-direction:column;gap:8px">${cards}</div>`
      : _emptyState("Not enough data yet.")}
  `, `border-top:3px solid ${_PC.purple};`);
}

// ── TOGGLE WEAK ──
document.getElementById("weakToggle").addEventListener("change", function () {
  document.getElementById("weakLabel").textContent = this.checked
    ? "Yes ⚠"
    : "No";
});

// ── INIT ──
function initApp() {
  rebuildSubjectsFromSyllabus();
  populateSubjectDropdown();
  updateChapterSuggestions();
  processMissedRevisions();
  renderAll();
  checkSyllabusProfile();
  // Only render progress on boot if the tab is already active (e.g. after a refresh on that tab)
  if (document.getElementById("tab-progress").classList.contains("active")) renderProgress();
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
  if (!profile) {
    showToast("Pehle onboarding complete karo!", "error", "Profile tab access karne ke liye apna naam set karo.");
    return;
  }
  document.getElementById("prof-name").value = profile.name || "";
  document.getElementById("prof-class").value = profile.cls || "10";
  document.getElementById("prof-exam").value = profile.examDate || "";
  if (document.getElementById("prof-stream")) document.getElementById("prof-stream").value = profile.stream || "science";
  if (document.getElementById("prof-lang2")) document.getElementById("prof-lang2").value = profile.lang2 || "hindi";
  if (document.getElementById("prof-elective")) document.getElementById("prof-elective").value = profile.elective || "computer";
  if (document.getElementById("prof-deadline")) {
    document.getElementById("prof-deadline").value = profile.deadline || "";
    if (profile.examDate) updateProfileDeadlineLimits();
  }
  document.getElementById("prof-display-name").textContent =
    profile.name || "—";
  const clsMap = { 10: "Class 10 (ICSE)", other: "Other" };
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
    showToast("Bina naam ke to bhoot bhi nahi aate! 👻🚫", "error", "Pehle naam toh likho.");
    return;
  }
  const newDeadline = document.getElementById("prof-deadline") ? document.getElementById("prof-deadline").value : "";
  const newExam     = document.getElementById("prof-exam").value;
  if (newExam && newDeadline) {
    const err = _validateDeadline(newDeadline, newExam);
    if (err) { showToast(err, "error", "Invalid deadline"); return; }
  }
  const oldStream   = profile.stream;
  const oldLang2    = profile.lang2;
  const oldElective = profile.elective;
  profile.name     = name;
  profile.cls      = document.getElementById("prof-class").value;
  profile.examDate = newExam;
  profile.deadline = newDeadline || profile.deadline || "";
  if (document.getElementById("prof-stream")) profile.stream = document.getElementById("prof-stream").value;
  if (document.getElementById("prof-lang2")) profile.lang2 = document.getElementById("prof-lang2").value;
  if (document.getElementById("prof-elective")) profile.elective = document.getElementById("prof-elective").value;
  localStorage.setItem("st_profile", JSON.stringify(profile));
  const streamChanged = oldStream !== profile.stream || oldLang2 !== profile.lang2 || oldElective !== profile.elective;
  rebuildSubjectsFromSyllabus();
  if (streamChanged) {
    // subjects array is now rebuilt to reflect new stream/lang2/elective
    const validSubjectNames = new Set(subjects);
    // Wipe non-custom chapters that belong to subjects no longer in the new selection
    // (covers elective swap, lang2 swap, and stream swap — all identical logic)
    const removedIds = new Set(
      chapters
        .filter(c => !c.isCustom && !validSubjectNames.has(c.subject))
        .map(c => c.id)
    );
    chapters = chapters.filter(c => !removedIds.has(c.id));
    revisions = revisions.filter(r => !removedIds.has(r.chapterId));
  
      // Clean up missedRevisions — legacy entries may lack chapterId so also filter by subject name
      missedRevisions = missedRevisions.filter(r =>
        !removedIds.has(r.chapterId) && validSubjectNames.has(r.subject)
      );
      // weeklyLog and streak intentionally kept:
      // bars show real study activity regardless of which subject — history belongs to the user
      // streak tracks daily consistency — swapping a subject doesn't undo legitimate study days
      save();
      showToast("Subject swap! 🔄", "", "Old subject chapters cleared. Add new ones to get started.");
  }
  // Rebuild Add tab dropdown and chapter suggestions with the new subject list
  populateSubjectDropdown();
  updateChapterSuggestions();
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
  const deadlineInput = document.getElementById("prof-deadline");
  if (deadlineInput) deadlineInput.disabled = !isEditing;
  const streamInput = document.getElementById("prof-stream");
  if (streamInput) streamInput.disabled = !isEditing;
  const lang2Input = document.getElementById("prof-lang2");
  if (lang2Input) lang2Input.disabled = !isEditing;
  const electiveInput = document.getElementById("prof-elective");
  if (electiveInput) electiveInput.disabled = !isEditing;

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
  document.getElementById("prof-class").value = profile.cls || "10";
  document.getElementById("prof-exam").value = profile.examDate || "";
  if (document.getElementById("prof-deadline")) {
    document.getElementById("prof-deadline").value = profile.deadline || "";
  }
  if (document.getElementById("prof-stream")) document.getElementById("prof-stream").value = profile.stream || "science";
  if (document.getElementById("prof-lang2")) document.getElementById("prof-lang2").value = profile.lang2 || "hindi";
  if (document.getElementById("prof-elective")) document.getElementById("prof-elective").value = profile.elective || "computer";
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
  const EDGE = 20;
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

async function loadSyllabusAndInit() {
  try {
    const resp = await fetch("syllabus.json");
    window._syllabus = await resp.json();
  } catch (e) {
    window._syllabus = null;
    console.log("Syllabus load failed:", e);
  }
  const profileBeforeReset = profile;
  _hardResetIfNeeded();
  if (!profile && profileBeforeReset) {
    profile = profileBeforeReset;
    localStorage.setItem("st_profile", JSON.stringify(profile));
  }
  migrateOldData();
 initApp();
}

function _hardResetIfNeeded() {
  if (localStorage.getItem("st_v2_reset")) return;
  localStorage.setItem("st_v2_reset", "1");
  localStorage.clear();
  localStorage.setItem("st_v2_reset", "1");
  chapters = [];
  revisions = [];
  profile = null;
  subjects = [...DEFAULT_SUBJECTS];
  streak = { count: 0, lastDate: "" };
  weeklyLog = {};
  coins = 0;
}

function migrateOldData() {
  if (!window._syllabus) return;
  let dirty = false;

  // Migration 0 — class 9 no longer supported, bump to 10
  if (profile && profile.cls === "9") {
    profile.cls = "10";
    dirty = true;
  }

  // Migration 1 — backfill isCustom on all existing chapters that don't have it
  const needsCustomCheck = chapters.filter(c => c.isCustom === undefined);
  if (needsCustomCheck.length > 0) {
    const aliases = { "History & Civics": ["History", "Civics"] };
    needsCustomCheck.forEach(ch => {
      const lookFor = aliases[ch.subject] || [ch.subject];
      let found = false;
      outer: for (const group of Object.values(window._syllabus.groups)) {
        for (const subj of Object.values(group.subjects)) {
          if (lookFor.includes(subj.name)) {
            for (const s of subj.chapters) {
              if (s.name.trim().toLowerCase() === ch.name.trim().toLowerCase()) {
                found = true;
                break outer;
              }
            }
          }
        }
      }
      ch.isCustom = !found;
      dirty = true;
    });
  }

  // Migration 2 — fix old History/Civics chapters stored with raw subject names
  chapters.forEach(ch => {
    if (ch.subject === "History" || ch.subject === "Civics") {
      ch.subject = "History & Civics";
      dirty = true;
    }
  });
  // Fix revisions too
  revisions.forEach(r => {
    if (r.subject === "History" || r.subject === "Civics") {
      r.subject = "History & Civics";
      dirty = true;
    }
  });

  // Migration 3 — rebuild subjects list if profile exists but subjects still has raw defaults
  if (profile && profile.stream) {
    // If subjects still contains raw "History" or "Civics" separately, rebuild
    if (subjects.includes("History") || subjects.includes("Civics")) {
      // Will be fixed by rebuildSubjectsFromSyllabus() in initApp
      dirty = true;
    }
  }

  // Migration 4 — wipe auto-preloaded syllabus ghost chapters
  // (Not Started, isCustom false, zero revisions = user never touched them)
  const ghostChapters = chapters.filter(c =>
    c.isCustom === false &&
    c.status === "Not Started" &&
    !revisions.some(r => r.chapterId === c.id)
  );
  if (ghostChapters.length > 0) {
    const ghostIds = new Set(ghostChapters.map(c => c.id));
    chapters = chapters.filter(c => !ghostIds.has(c.id));
    dirty = true;
  }

  if (dirty) save();
}

function autoLoadSyllabusChapters_DISABLED() {
  if (!window._syllabus || !profile) return;

  const stream = profile.stream || "science";
  const lang2 = profile.lang2 || "hindi";
  const elective = profile.elective || "computer";

  // Build the list of subject keys to load
  const toLoad = [
    "english_lang",
    "english_lit",
    "history",
    "civics",
    "geography",
    "maths",
  ];
  if (stream === "science") {
    toLoad.push("physics", "chemistry", "biology");
  } else {
    toLoad.push("commerce", "economics_g2");
  }
  toLoad.push(lang2); // "hindi" or "bengali"
  toLoad.push(elective); // "computer", "eco_apps", or "physical_ed"

  // Collect all subject definitions from syllabus
  const subjDefs = {};
  const groups = window._syllabus.groups;
  Object.values(groups).forEach((group) => {
    Object.entries(group.subjects).forEach(([key, subj]) => {
      subjDefs[key] = subj;
    });
  });

  // Preserve custom chapters and their revisions — only wipe syllabus chapters
  const customChapters = chapters.filter(c => c.isCustom);
  const customIds = new Set(customChapters.map(c => c.id));
  chapters = customChapters;
  revisions = revisions.filter(r => customIds.has(r.chapterId));

  // History and Civics are separate in syllabus but merged as one subject in app
  const SUBJECT_MERGE = { "History": "History & Civics", "Civics": "History & Civics" };

  // Add chapters for each selected subject (skip empty ones)
  const today = todayStr();
  toLoad.forEach((key) => {
    const subj = subjDefs[key];
    if (!subj || subj.chapters.length === 0) return;
    const displayName = SUBJECT_MERGE[subj.name] || subj.name;
    subj.chapters.forEach((ch) => {
      chapters.push({
        id: uid(),
        subject: displayName,
        name: ch.name,
        status: "Not Started",
        isWeak: false,
        isCustom: false,
        dateAdded: today,
      });
    });
  });

  // Also rebuild subjects list to match (deduplicated, merged)
  subjects = [
    ...new Set(
      toLoad
        .filter((key) => subjDefs[key] && subjDefs[key].chapters.length > 0)
        .map((key) => SUBJECT_MERGE[subjDefs[key].name] || subjDefs[key].name),
    ),
  ];

  save();
  localStorage.setItem("st_syllabus_loaded", "1");
}

function init() {
  if (!checkOnboard()) return;
  loadSyllabusAndInit();
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
