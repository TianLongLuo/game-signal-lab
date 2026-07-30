const STORAGE_KEY = "game-signal-lab:v1";

const defaultState = {
  version: 1,
  adultConfirmed: false,
  profile: {
    name: "",
    goal: "",
    voice: "natural",
    boundaries: "",
    anxiety: "",
  },
  contacts: [],
  events: [],
};

const viewTitles = {
  dashboard: "今日概览",
  "new-event": "记录事件",
  people: "关系档案",
  review: "行动复盘",
  profile: "我的表达",
  privacy: "隐私与数据",
  analysis: "信号分析",
};

const signalMeta = {
  weak: {
    label: "弱信号",
    short: "弱",
    className: "weak",
    color: "#aeb6c8",
  },
  medium: {
    label: "中等信号",
    short: "中",
    className: "medium",
    color: "#e0a63a",
  },
  strong: {
    label: "强信号",
    short: "强",
    className: "strong",
    color: "#aee8d0",
  },
  stop: {
    label: "停止推进",
    short: "停",
    className: "stop",
    color: "#f57464",
  },
};

let state = loadState();
let currentView = "dashboard";
let currentEventId = null;
let reviewEventId = null;
let toastTimer = null;

const appShell = document.querySelector("#app-shell");
const main = document.querySelector("#main-content");
const ageGate = document.querySelector("#age-gate");
const adultCheck = document.querySelector("#adult-check");
const enterApp = document.querySelector("#enter-app");
const toast = document.querySelector("#toast");
const sidebar = document.querySelector(".sidebar");
const mobileMenu = document.querySelector("#mobile-menu");

init();

function init() {
  appShell.classList.add("is-ready");
  syncProfileAvatar();
  bindGlobalEvents();
  renderCurrentView();

  if (!state.adultConfirmed) {
    appShell.setAttribute("aria-hidden", "true");
    ageGate.showModal();
  } else {
    appShell.setAttribute("aria-hidden", "false");
  }
}

function bindGlobalEvents() {
  adultCheck.addEventListener("change", () => {
    enterApp.disabled = !adultCheck.checked;
  });

  enterApp.addEventListener("click", () => {
    if (!adultCheck.checked) return;
    state.adultConfirmed = true;
    saveState();
    ageGate.close();
    appShell.setAttribute("aria-hidden", "false");
    main.focus();
  });

  mobileMenu.addEventListener("click", () => {
    const isOpen = sidebar.classList.toggle("is-open");
    mobileMenu.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("click", async (event) => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
      navigate(viewButton.dataset.view);
      return;
    }

    const action = event.target.closest("[data-action]");
    if (!action) return;

    const actionName = action.dataset.action;

    if (actionName === "load-sample") {
      loadSampleData();
    }

    if (actionName === "open-analysis") {
      currentEventId = action.dataset.eventId;
      navigate("analysis");
    }

    if (actionName === "open-review") {
      reviewEventId = action.dataset.eventId;
      currentView = "review";
      renderCurrentView();
      requestAnimationFrame(() => {
        document.querySelector("#review-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    if (actionName === "cancel-review") {
      reviewEventId = null;
      renderCurrentView();
    }

    if (actionName === "copy-response") {
      const text = action.dataset.text || "";
      try {
        await navigator.clipboard.writeText(text);
        showToast("回应选项已复制");
      } catch {
        showToast("浏览器未允许自动复制，请手动选择文字");
      }
    }

    if (actionName === "export-data") {
      exportData();
    }

    if (actionName === "clear-data") {
      clearData();
    }
  });

  document.addEventListener("submit", (event) => {
    if (event.target.matches("#profile-form")) {
      event.preventDefault();
      saveProfile(new FormData(event.target));
    }

    if (event.target.matches("#contact-form")) {
      event.preventDefault();
      createContact(new FormData(event.target));
    }

    if (event.target.matches("#event-form")) {
      event.preventDefault();
      createEvent(event.target, new FormData(event.target));
    }

    if (event.target.matches("#review-form")) {
      event.preventDefault();
      saveReview(new FormData(event.target));
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sidebar.classList.contains("is-open")) {
      sidebar.classList.remove("is-open");
      mobileMenu.setAttribute("aria-expanded", "false");
      mobileMenu.focus();
    }
  });
}

function navigate(view) {
  if (!viewTitles[view]) view = "dashboard";
  currentView = view;
  if (view !== "analysis") currentEventId = null;
  if (view !== "review") reviewEventId = null;
  sidebar.classList.remove("is-open");
  mobileMenu.setAttribute("aria-expanded", "false");
  renderCurrentView();
  window.scrollTo({ top: 0, behavior: "smooth" });
  requestAnimationFrame(() => main.focus({ preventScroll: true }));
}

function renderCurrentView() {
  updateNavigation();

  switch (currentView) {
    case "new-event":
      main.innerHTML = renderNewEvent();
      break;
    case "people":
      main.innerHTML = renderPeople();
      break;
    case "review":
      main.innerHTML = renderReview();
      break;
    case "profile":
      main.innerHTML = renderProfile();
      break;
    case "privacy":
      main.innerHTML = renderPrivacy();
      break;
    case "analysis":
      main.innerHTML = renderAnalysis(currentEventId);
      break;
    default:
      main.innerHTML = renderDashboard();
  }
}

function updateNavigation() {
  document.querySelector("#topbar-title").textContent = viewTitles[currentView] || "Signal Lab";
  document.querySelectorAll(".nav-item[data-view]").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.view === currentView);
  });
}

function renderDashboard() {
  const completedReviews = state.events.filter((item) => item.review?.result).length;
  const strongSignals = state.events.filter((item) => item.analysis.strength === "strong").length;
  const latestEvents = [...state.events]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 4);
  const greeting = state.profile.name ? `${escapeHTML(state.profile.name)}，` : "";

  return `
    <div class="page">
      <section class="hero-grid">
        <article class="hero-card">
          <p class="eyebrow">从混乱走向清晰</p>
          <h2>${greeting}先写下发生了什么。</h2>
          <p>把事实与猜测分开，再决定要不要行动。明确表达和真实反馈，始终比任何信号推断更可靠。</p>
          <button class="button" data-view="new-event">
            记录一件互动
            <span aria-hidden="true">→</span>
          </button>
        </article>
        <article class="lens-card">
          <div class="signal-lens" aria-label="信号透镜图形">
            <span class="lens-core">WHY?</span>
          </div>
          <p class="lens-caption">信号不是答案，<br />而是需要放回情境的证据。</p>
        </article>
      </section>

      <section class="metric-grid" aria-label="使用数据概览">
        <article class="metric-card">
          <span>已记录事件</span>
          <strong>${state.events.length.toString().padStart(2, "0")}</strong>
          <small>每条记录都可以继续补充结果</small>
        </article>
        <article class="metric-card">
          <span>已完成复盘</span>
          <strong>${completedReviews.toString().padStart(2, "0")}</strong>
          <small>真实反馈会修正原来的判断</small>
        </article>
        <article class="metric-card">
          <span>强信号记录</span>
          <strong>${strongSignals.toString().padStart(2, "0")}</strong>
          <small>仍需以对方明确表达为准</small>
        </article>
      </section>

      <section class="section">
        <div class="section-title">
          <h2>最近事件</h2>
          ${state.events.length ? '<button class="text-button" data-view="review">查看全部复盘 →</button>' : ""}
        </div>
        ${
          latestEvents.length
            ? `<div class="card-list">${latestEvents.map(renderEventCard).join("")}</div>`
            : renderDashboardEmpty()
        }
      </section>
    </div>
  `;
}

function renderDashboardEmpty() {
  return `
    <div class="empty-state">
      <div>
        <div class="empty-symbol" aria-hidden="true">＋</div>
        <h3>从一个真实事件开始</h3>
        <p>如果暂时没有可记录的事件，可以先加载一组匿名示例，看看分析和复盘如何工作。</p>
        <div class="button-row" style="justify-content:center">
          <button class="button button--primary" data-view="new-event">创建第一条记录</button>
          <button class="button button--quiet" data-action="load-sample">载入匿名示例</button>
        </div>
      </div>
    </div>
  `;
}

function renderEventCard(item) {
  const contact = getContact(item.contactId);
  const signal = signalMeta[item.analysis.strength] || signalMeta.weak;
  return `
    <button class="event-card" data-action="open-analysis" data-event-id="${item.id}">
      <span class="signal-pill signal-pill--${signal.className}">${signal.short}</span>
      <span class="event-copy">
        <strong>${escapeHTML(contact?.alias || "已删除档案")} · ${escapeHTML(item.scene || item.stage)}</strong>
        <p>${escapeHTML(item.fact)}</p>
      </span>
      <span class="event-meta">
        <b>${signal.label}</b>
        <span>${formatDate(item.date)}</span>
      </span>
    </button>
  `;
}

function renderNewEvent() {
  if (!state.contacts.length) {
    return `
      <div class="page">
        ${pageHeading("记录事件", "先建立一个匿名关系档案", "只用代号记录必要信息，避免保存真实姓名或可识别的隐私。")}
        <div class="empty-state">
          <div>
            <div class="empty-symbol" aria-hidden="true">◎</div>
            <h3>还没有关系档案</h3>
            <p>建立匿名代号后，就可以把互动事件放回具体关系和阶段中分析。</p>
            <button class="button button--primary" data-view="people">新建关系档案</button>
          </div>
        </div>
      </div>
    `;
  }

  const contactOptions = state.contacts
    .map((item) => `<option value="${item.id}">${escapeHTML(item.alias)} · ${escapeHTML(item.stage)}</option>`)
    .join("");

  return `
    <div class="page">
      ${pageHeading(
        "记录事件",
        "把观察与解释分开。",
        "分析越依赖具体事实，越不容易被期待、焦虑或单次行为带偏。"
      )}

      <div class="form-layout">
        <form class="panel" id="event-form">
          <div class="form-section">
            <h3>事件背景</h3>
            <p>选择关系档案，并说明这次互动发生在什么阶段与场景。</p>
            <div class="form-grid">
              <div class="field">
                <label for="event-contact">关系代号</label>
                <select id="event-contact" name="contactId" required>${contactOptions}</select>
              </div>
              <div class="field">
                <label for="event-date">发生日期</label>
                <input id="event-date" name="date" type="date" value="${todayISO()}" required />
              </div>
              <div class="field">
                <label for="event-stage">互动阶段</label>
                <select id="event-stage" name="stage" required>
                  <option>刚认识</option>
                  <option>持续了解</option>
                  <option>第一次见面</option>
                  <option>约会中</option>
                  <option>稳定交往</option>
                  <option>关系降温</option>
                  <option>关系结束</option>
                </select>
              </div>
              <div class="field">
                <label for="event-scene">场景</label>
                <input id="event-scene" name="scene" placeholder="例如：咖啡店见面后 / 微信聊天" required />
              </div>
            </div>
          </div>

          <div class="form-section">
            <h3>事实与解释</h3>
            <p>“对方说今天很忙”是事实；“对方不想见我”是解释。</p>
            <div class="form-grid">
              <div class="field field--full">
                <label for="event-fact">观察到的事实</label>
                <textarea id="event-fact" name="fact" placeholder="尽量记录原话、行为、时间与上下文，不写结论。" required></textarea>
              </div>
              <div class="field field--full">
                <label for="event-interpretation">你当时的解释</label>
                <textarea id="event-interpretation" name="interpretation" placeholder="你认为这件事可能意味着什么？" required></textarea>
              </div>
              <div class="field">
                <label for="event-feeling">当时的感受</label>
                <input id="event-feeling" name="feeling" placeholder="例如：期待、紧张、失落" />
              </div>
              <div class="field">
                <label for="event-reply">你如何回应</label>
                <input id="event-reply" name="reply" placeholder="尚未回应也可以写“还没有”" />
              </div>
            </div>
          </div>

          <div class="form-section">
            <h3>证据线索</h3>
            <p>只勾选你能从实际互动中确认的项目。单次行为通常不足以下结论。</p>
            <div class="choice-grid">
              ${signalCheckbox("directInterest", "对方明确表达兴趣", "清楚说出想继续了解、喜欢或期待见面")}
              ${signalCheckbox("futurePlan", "主动安排下一次互动", "提出具体时间、地点或共同计划")}
              ${signalCheckbox("repeatedInitiative", "多次主动联系或投入", "不是单次礼貌，而是持续出现的模式")}
              ${signalCheckbox("detailedFollowup", "记得细节并继续追问", "对你的生活和表达有持续关注")}
              ${signalCheckbox("politeOnly", "目前只有普通礼貌", "没有超出常规社交的投入或明确表达")}
              ${signalCheckbox("delayAvoidance", "持续回避或多次失约", "长期模糊、推迟，且没有替代安排", true)}
              ${signalCheckbox("explicitDecline", "已明确拒绝", "对方清楚表示不愿意继续或不感兴趣", true)}
              ${signalCheckbox("discomfort", "出现不舒服或边界提醒", "对方表现紧张、抗拒，或要求停止", true)}
            </div>
          </div>

          <div class="form-section">
            <label class="check-row">
              <input type="checkbox" name="consent" required />
              <span>我确认只记录合法、必要的信息；如涉及第三方原话或聊天内容，我有权保存和处理这些内容。</span>
            </label>
            <div class="button-row" style="margin-top:20px">
              <button class="button button--primary" type="submit">生成结构化分析 →</button>
              <button class="button button--quiet" type="button" data-view="dashboard">暂不记录</button>
            </div>
          </div>
        </form>

        <aside class="panel panel--dark helper-card">
          <div>
            <p class="eyebrow" style="color:rgba(255,255,255,.5)">记录提示</p>
            <h3>像摄像机一样写事实</h3>
          </div>
          <ol>
            <li>写能被录音或录像看到的内容。</li>
            <li>把“我觉得”放进解释，而不是事实。</li>
            <li>记录频率和变化，不放大一次行为。</li>
            <li>如果对方已经拒绝，停止寻找反向证据。</li>
          </ol>
          <p class="helper-quote">“对方看了三次手机”是事实；“对方觉得我无聊”仍然只是一个可能解释。</p>
        </aside>
      </div>
    </div>
  `;
}

function signalCheckbox(name, title, description, risk = false) {
  return `
    <label class="check-card">
      <input type="checkbox" name="${name}" ${risk ? "data-risk" : ""} />
      <span><b>${title}</b>${description}</span>
    </label>
  `;
}

function renderPeople() {
  return `
    <div class="page">
      ${pageHeading(
        "关系档案",
        "用代号，而不是真名。",
        "只记录理解互动所需的信息。不要记录身份证、住址、定位或与关系判断无关的隐私。"
      )}

      <div class="form-layout">
        <form class="panel" id="contact-form">
          <h2 class="panel-title">新建匿名档案</h2>
          <div class="form-grid">
            <div class="field">
              <label for="contact-alias">匿名代号</label>
              <input id="contact-alias" name="alias" placeholder="例如：A-17 / 山茶" maxlength="20" required />
              <small>请不要使用真实姓名、手机号或账号。</small>
            </div>
            <div class="field">
              <label for="contact-stage">当前阶段</label>
              <select id="contact-stage" name="stage" required>
                <option>刚认识</option>
                <option>持续了解</option>
                <option>约会中</option>
                <option>稳定交往</option>
                <option>关系降温</option>
                <option>关系结束</option>
              </select>
            </div>
            <div class="field field--full">
              <label for="contact-context">认识背景</label>
              <textarea id="contact-context" name="context" placeholder="例如：读书会认识，目前见过两次。"></textarea>
            </div>
            <div class="field">
              <label for="contact-goal">已公开表达的关系目标</label>
              <input id="contact-goal" name="goal" placeholder="未知也可以直接写未知" />
            </div>
            <div class="field">
              <label for="contact-boundary">已明确的边界</label>
              <input id="contact-boundary" name="boundary" placeholder="例如：不喜欢临时见面" />
            </div>
          </div>
          <div class="button-row" style="margin-top:20px">
            <button class="button button--primary" type="submit">保存匿名档案</button>
          </div>
        </form>

        <aside class="panel panel--flat">
          <p class="eyebrow">隐私最小化</p>
          <h2 class="panel-title" style="margin-top:10px">少记一点，更安全。</h2>
          <ul class="principle-list">
            <li><span>01</span><div>使用代号，避免保存可识别信息。</div></li>
            <li><span>02</span><div>只记录对理解事件有必要的内容。</div></li>
            <li><span>03</span><div>对方要求停止或删除时，尊重其边界。</div></li>
          </ul>
        </aside>
      </div>

      <section class="section">
        <div class="section-title">
          <h2>已保存档案</h2>
          <span class="tag"><i></i>${state.contacts.length} 个匿名对象</span>
        </div>
        ${
          state.contacts.length
            ? `<div class="person-grid">${state.contacts.map(renderPersonCard).join("")}</div>`
            : `
              <div class="empty-state" style="min-height:180px">
                <div>
                  <div class="empty-symbol" aria-hidden="true">◎</div>
                  <h3>还没有档案</h3>
                  <p>完成上方表单后，匿名档案会显示在这里。</p>
                </div>
              </div>
            `
        }
      </section>
    </div>
  `;
}

function renderPersonCard(item) {
  const count = state.events.filter((event) => event.contactId === item.id).length;
  return `
    <article class="person-card">
      <div class="person-avatar">${escapeHTML(item.alias.slice(0, 2).toUpperCase())}</div>
      <h3>${escapeHTML(item.alias)}</h3>
      <span class="person-stage">${escapeHTML(item.stage)}</span>
      <p>${escapeHTML(item.context || "尚未添加认识背景。")}</p>
      <div class="person-footer">
        <span>${count} 条事件</span>
        <button class="text-button" data-view="new-event">记录互动 →</button>
      </div>
    </article>
  `;
}

function renderProfile() {
  const profile = state.profile;
  return `
    <div class="page">
      ${pageHeading(
        "我的表达",
        "建议应该像你，而不是像某个导师。",
        "这些信息用于调整回应选项的语气。系统不会强迫你使用陌生的话术。"
      )}

      <div class="form-layout">
        <form class="panel" id="profile-form">
          <h2 class="panel-title">个人目标与表达偏好</h2>
          <div class="form-grid">
            <div class="field">
              <label for="profile-name">希望如何称呼你</label>
              <input id="profile-name" name="name" value="${escapeAttribute(profile.name)}" placeholder="昵称即可" maxlength="20" />
            </div>
            <div class="field">
              <label for="profile-voice">表达风格</label>
              <select id="profile-voice" name="voice">
                ${voiceOption("natural", "自然平实", profile.voice)}
                ${voiceOption("gentle", "温和细腻", profile.voice)}
                ${voiceOption("direct", "直接清楚", profile.voice)}
                ${voiceOption("humor", "轻松幽默", profile.voice)}
              </select>
            </div>
            <div class="field field--full">
              <label for="profile-goal">当前关系目标</label>
              <textarea id="profile-goal" name="goal" placeholder="例如：希望在不过度控制结果的前提下，更自然地认识合适的人。">${escapeHTML(profile.goal)}</textarea>
            </div>
            <div class="field">
              <label for="profile-anxiety">常见焦虑触发点</label>
              <textarea id="profile-anxiety" name="anxiety" placeholder="例如：对方回复慢时容易反复猜测。">${escapeHTML(profile.anxiety)}</textarea>
            </div>
            <div class="field">
              <label for="profile-boundaries">希望坚持的边界</label>
              <textarea id="profile-boundaries" name="boundaries" placeholder="例如：不连续追问；不在情绪很强时发送长消息。">${escapeHTML(profile.boundaries)}</textarea>
            </div>
          </div>
          <div class="button-row" style="margin-top:22px">
            <button class="button button--primary" type="submit">保存我的表达</button>
          </div>
        </form>

        <aside class="panel panel--dark helper-card">
          <div>
            <p class="eyebrow" style="color:rgba(255,255,255,.5)">主体性原则</p>
            <h3>你不需要成为别人。</h3>
          </div>
          <p>系统会提供多个选项、风险说明和判断依据。最终是否回应、如何表达、是否退出，都由你决定。</p>
          <p class="helper-quote">自然不是“说得完美”，而是表达与你的价值观、语气和关系阶段一致。</p>
        </aside>
      </div>
    </div>
  `;
}

function voiceOption(value, label, selected) {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`;
}

function renderAnalysis(eventId) {
  const item = state.events.find((event) => event.id === eventId);
  if (!item) {
    return `
      <div class="page">
        ${pageHeading("信号分析", "没有找到这条事件", "它可能已经被清除。")}
        <button class="button button--primary" data-view="dashboard">返回今日概览</button>
      </div>
    `;
  }

  const contact = getContact(item.contactId);
  const analysis = item.analysis;
  const signal = signalMeta[analysis.strength];

  return `
    <div class="page">
      <section class="analysis-hero">
        <div class="analysis-lens" style="--lens-color:${signal.color}">
          <span>${signal.short}</span>
        </div>
        <div class="analysis-copy">
          <p class="eyebrow">${escapeHTML(contact?.alias || "匿名档案")} · ${escapeHTML(item.scene)}</p>
          <h1>${signal.label}</h1>
          <p>${escapeHTML(analysis.summary)}</p>
          <div class="confidence-row">
            <span>证据分 ${analysis.score}</span>
            <span>参考置信度 ${analysis.confidence}%</span>
            <span>${formatDate(item.date)}</span>
          </div>
        </div>
      </section>

      ${
        analysis.strength === "stop"
          ? `
            <div class="boundary-banner">
              <span aria-hidden="true">!</span>
              <div>
                <strong>边界优先</strong>
                <p>记录中包含明确拒绝、不舒服或持续回避信号。不要继续测试、说服或寻找“其实对方愿意”的证据。</p>
              </div>
            </div>
          `
          : ""
      }

      <div class="analysis-grid">
        <article class="analysis-panel">
          <h2><span>01</span>观察事实</h2>
          <p>${escapeHTML(item.fact)}</p>
        </article>

        <article class="analysis-panel">
          <h2><span>02</span>你的解释</h2>
          <p>${escapeHTML(item.interpretation)}</p>
        </article>

        <article class="analysis-panel">
          <h2><span>03</span>其他可能解释</h2>
          <ul>${analysis.alternatives.map((text) => `<li>${escapeHTML(text)}</li>`).join("")}</ul>
        </article>

        <article class="analysis-panel">
          <h2><span>04</span>当前不确定性</h2>
          <ul>${analysis.uncertainties.map((text) => `<li>${escapeHTML(text)}</li>`).join("")}</ul>
        </article>

        <article class="analysis-panel analysis-panel--wide">
          <h2><span>05</span>${analysis.strength === "stop" ? "尊重边界的回应" : "自然、低压力的回应选项"}</h2>
          <div class="response-list">
            ${analysis.responses
              .map(
                (text, index) => `
                  <div class="response-option">
                    <span>0${index + 1}</span>
                    <p>${escapeHTML(text)}</p>
                    <button class="copy-button" data-action="copy-response" data-text="${escapeAttribute(text)}">复制</button>
                  </div>
                `
              )
              .join("")}
          </div>
        </article>

        <article class="analysis-panel">
          <h2><span>06</span>停止或降级条件</h2>
          <p>${escapeHTML(analysis.stopCondition)}</p>
        </article>

        <article class="analysis-panel">
          <h2><span>07</span>后续复盘点</h2>
          <p>记录你选择了什么行动、对方真实回应了什么，以及结果是否支持原来的判断。不要只记录符合期待的部分。</p>
        </article>
      </div>

      <div class="button-row" style="margin-top:20px">
        <button class="button button--primary" data-action="open-review" data-event-id="${item.id}">
          记录后续结果
        </button>
        <button class="button button--quiet" data-view="dashboard">返回概览</button>
      </div>
      <p class="microcopy" style="text-align:left">这是透明规则引擎生成的 MVP 分析，不是事实判决，也不具备读心能力。</p>
    </div>
  `;
}

function renderReview() {
  const events = [...state.events].sort((a, b) => new Date(b.date) - new Date(a.date));
  const selected = events.find((item) => item.id === reviewEventId);

  return `
    <div class="page">
      ${pageHeading(
        "行动复盘",
        "让真实反馈修正判断。",
        "复盘不是判断自己做得好不好，而是检查事实、预测与结果之间发生了什么。"
      )}

      ${
        events.length
          ? `<div class="review-grid">${events.map(renderReviewCard).join("")}</div>`
          : `
            <div class="empty-state">
              <div>
                <div class="empty-symbol" aria-hidden="true">↺</div>
                <h3>还没有可复盘的事件</h3>
                <p>记录一件互动并查看分析后，就可以在这里补充真实结果。</p>
                <button class="button button--primary" data-view="new-event">记录事件</button>
              </div>
            </div>
          `
      }

      ${selected ? renderReviewForm(selected) : ""}
    </div>
  `;
}

function renderReviewCard(item) {
  const contact = getContact(item.contactId);
  const done = Boolean(item.review?.result);
  return `
    <article class="review-card">
      <header>
        <h3>${escapeHTML(contact?.alias || "已删除档案")} · ${escapeHTML(item.scene)}</h3>
        <span class="signal-pill signal-pill--${signalMeta[item.analysis.strength].className}" style="min-width:38px;height:38px;border-radius:12px">
          ${signalMeta[item.analysis.strength].short}
        </span>
      </header>
      <p>${escapeHTML(item.fact)}</p>
      <div class="review-status ${done ? "is-done" : ""}">
        <i></i>
        ${done ? `已复盘：${escapeHTML(item.review.result)}` : "等待真实反馈"}
      </div>
      <button class="button button--small ${done ? "button--quiet" : "button--primary"}" data-action="open-review" data-event-id="${item.id}">
        ${done ? "更新复盘" : "补充结果"}
      </button>
    </article>
  `;
}

function renderReviewForm(item) {
  const review = item.review || {};
  return `
    <section class="section panel">
      <p class="eyebrow">结果反馈</p>
      <h2 class="panel-title" style="margin-top:9px">复盘：${escapeHTML(getContact(item.contactId)?.alias || "匿名档案")} · ${escapeHTML(item.scene)}</h2>
      <form id="review-form" class="review-form">
        <input type="hidden" name="eventId" value="${item.id}" />
        <div class="form-grid">
          <div class="field field--full">
            <label for="review-action">你最终选择了什么行动？</label>
            <textarea id="review-action" name="actionTaken" placeholder="例如：我选择了一个低压力邀请，并明确说不方便也没关系。">${escapeHTML(review.actionTaken || "")}</textarea>
          </div>
          <div class="field">
            <label for="review-result">对方的真实回应</label>
            <textarea id="review-result" name="result" placeholder="尽量记录原话或可观察行为。" required>${escapeHTML(review.result || "")}</textarea>
          </div>
          <div class="field">
            <label for="review-learning">这次判断需要如何调整？</label>
            <textarea id="review-learning" name="learning" placeholder="哪些判断得到支持？哪些只是期待？">${escapeHTML(review.learning || "")}</textarea>
          </div>
          <div class="field">
            <label for="review-naturalness">行动是否符合你自己？</label>
            <select id="review-naturalness" name="naturalness">
              ${reviewOption("很自然", review.naturalness)}
              ${reviewOption("基本自然", review.naturalness)}
              ${reviewOption("有些勉强", review.naturalness)}
              ${reviewOption("明显不像自己", review.naturalness)}
            </select>
          </div>
          <div class="field">
            <label for="review-next">下一步</label>
            <select id="review-next" name="nextStep">
              ${reviewOption("继续自然了解", review.nextStep)}
              ${reviewOption("直接沟通确认", review.nextStep)}
              ${reviewOption("降低互动强度", review.nextStep)}
              ${reviewOption("尊重边界并停止", review.nextStep)}
              ${reviewOption("不需要下一步", review.nextStep)}
            </select>
          </div>
        </div>
        <div class="button-row">
          <button class="button button--primary" type="submit">保存复盘</button>
          <button class="button button--quiet" type="button" data-action="cancel-review">取消</button>
        </div>
      </form>
    </section>
  `;
}

function reviewOption(value, selected) {
  return `<option ${value === selected ? "selected" : ""}>${value}</option>`;
}

function renderPrivacy() {
  const serializedSize = new Blob([JSON.stringify(state)]).size;
  return `
    <div class="page">
      ${pageHeading(
        "隐私与数据",
        "你的关系记录，默认只属于你。",
        "当前版本不包含账号、统计追踪或云端同步。所有数据都保存在这个浏览器的本地存储中。"
      )}

      <div class="data-grid">
        <article class="data-card">
          <p class="eyebrow">本地数据</p>
          <h2>导出一份可迁移备份</h2>
          <p>导出包含个人设置、匿名档案、事件与复盘的 JSON 文件。请把它存放在安全位置。</p>
          <button class="button button--dark" data-action="export-data">导出 JSON</button>
        </article>

        <article class="data-card">
          <p class="eyebrow">危险操作</p>
          <h2>清空当前浏览器数据</h2>
          <p>会删除所有匿名档案、事件、分析和复盘。操作完成后无法在本站恢复。</p>
          <button class="button button--danger" data-action="clear-data">清空全部数据</button>
        </article>
      </div>

      <section class="section panel panel--flat">
        <div class="section-title">
          <h2>当前存储概览</h2>
          <span class="tag"><i></i>约 ${formatBytes(serializedSize)}</span>
        </div>
        <div class="metric-grid" style="margin-top:0">
          <article class="metric-card">
            <span>匿名关系档案</span>
            <strong>${state.contacts.length}</strong>
            <small>没有要求保存真实姓名</small>
          </article>
          <article class="metric-card">
            <span>事件记录</span>
            <strong>${state.events.length}</strong>
            <small>包含事实、解释与分析</small>
          </article>
          <article class="metric-card">
            <span>外部请求</span>
            <strong>0</strong>
            <small>当前版本不会把记录发送到服务器</small>
          </article>
        </div>
      </section>

      <section class="section panel panel--flat">
        <h2 class="panel-title">安全边界</h2>
        <ul class="principle-list">
          <li><span>01</span><div>不根据单次行为宣称知道对方真实想法。</div></li>
          <li><span>02</span><div>不鼓励突破拒绝、跟踪、施压、欺骗或制造依赖。</div></li>
          <li><span>03</span><div>不按“可攻略程度”、价值或服从性给人评分。</div></li>
          <li><span>04</span><div>高风险、暴力、胁迫或严重心理问题应转向现实中的专业支持。</div></li>
        </ul>
      </section>
    </div>
  `;
}

function pageHeading(eyebrow, title, description) {
  return `
    <header class="page-heading">
      <div>
        <p class="eyebrow">${eyebrow}</p>
        <h1>${title}</h1>
        <p>${description}</p>
      </div>
    </header>
  `;
}

function createContact(formData) {
  const contact = {
    id: uid(),
    alias: clean(formData.get("alias")),
    stage: clean(formData.get("stage")),
    context: clean(formData.get("context")),
    goal: clean(formData.get("goal")),
    boundary: clean(formData.get("boundary")),
    createdAt: new Date().toISOString(),
  };

  state.contacts.push(contact);
  saveState();
  showToast(`已保存匿名档案：${contact.alias}`);
  renderCurrentView();
}

function createEvent(form, formData) {
  const signalNames = [
    "directInterest",
    "futurePlan",
    "repeatedInitiative",
    "detailedFollowup",
    "politeOnly",
    "delayAvoidance",
    "explicitDecline",
    "discomfort",
  ];
  const signals = signalNames.filter((name) => form.elements[name]?.checked);

  const item = {
    id: uid(),
    contactId: clean(formData.get("contactId")),
    date: clean(formData.get("date")),
    stage: clean(formData.get("stage")),
    scene: clean(formData.get("scene")),
    fact: clean(formData.get("fact")),
    interpretation: clean(formData.get("interpretation")),
    feeling: clean(formData.get("feeling")),
    reply: clean(formData.get("reply")),
    signals,
    createdAt: new Date().toISOString(),
  };

  item.analysis = analyzeEvent(item);
  state.events.push(item);
  saveState();
  currentEventId = item.id;
  currentView = "analysis";
  showToast("事件已保存，结构化分析已生成");
  renderCurrentView();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function analyzeEvent(item) {
  const weights = {
    directInterest: 5,
    futurePlan: 3,
    repeatedInitiative: 2,
    detailedFollowup: 1,
    politeOnly: -1,
    delayAvoidance: -3,
    explicitDecline: -8,
    discomfort: -8,
  };
  const score = item.signals.reduce((total, signal) => total + (weights[signal] || 0), 0);
  const hasBoundaryRisk = item.signals.some((signal) => ["explicitDecline", "discomfort"].includes(signal));
  const hasPersistentAvoidance = item.signals.includes("delayAvoidance");

  let strength = "weak";
  if (hasBoundaryRisk) {
    strength = "stop";
  } else if (score >= 6) {
    strength = "strong";
  } else if (score >= 3) {
    strength = "medium";
  }

  const summaries = {
    weak:
      "目前证据更接近普通礼貌、单次行为或信息不足。不要把希望或担忧当成结论；更适合继续观察，或在合适时直接、低压力地确认。",
    medium:
      "记录中出现了持续投入、主动联系或未来安排等证据，但仍不能替代明确表达。可以选择自然回应，并给对方充分的选择空间。",
    strong:
      "记录中出现了明确兴趣或多个一致、持续的投入信号。即便如此，关系意愿仍应通过双方清楚沟通确认。",
    stop:
      "记录包含明确拒绝或不舒服信号。此时不应继续推进、说服或测试边界；最安全的行动是尊重表达并停止。",
  };

  const alternatives = buildAlternatives(item.signals, strength);
  const uncertainties = buildUncertainties(item.signals, strength);
  const confidence = Math.min(
    92,
    Math.round(38 + Math.abs(score) * 5 + item.signals.length * 4 + (hasBoundaryRisk ? 16 : 0))
  );

  return {
    score,
    strength,
    confidence,
    summary: summaries[strength],
    alternatives,
    uncertainties,
    responses: buildResponses(strength, state.profile.voice),
    stopCondition:
      strength === "stop"
        ? "对方已经明确拒绝或表达不舒服时，不需要再等待更多证据。停止推进，避免继续联系、试探或借他人施压。"
        : hasPersistentAvoidance
          ? "如果持续回避、重复失约且没有替代安排，或对方表达不舒服，应降低互动强度或停止推进。"
          : "一旦对方明确拒绝、持续回避、表现不舒服或要求停止，应立即降低互动强度或停止推进。",
  };
}

function buildAlternatives(signals, strength) {
  if (strength === "stop") {
    return [
      "对方的表达本身已经足够，不需要寻找隐藏的相反含义。",
      "拒绝可能来自匹配度、时机、精力或个人选择；不等同于对你整体价值的评价。",
      "继续说服并不会让信号更清楚，只会增加对方压力。",
    ];
  }

  const options = [];
  if (signals.includes("futurePlan")) {
    options.push("主动安排未来互动可能代表兴趣，也可能是友好、合作或群体活动中的自然安排。");
  }
  if (signals.includes("repeatedInitiative")) {
    options.push("持续主动是值得观察的模式，但仍需结合内容、场景以及对方平时对其他人的方式。");
  }
  if (signals.includes("detailedFollowup")) {
    options.push("记得细节可能说明关注，也可能来自对方本身细心或善于社交。");
  }
  if (signals.includes("politeOnly") || !signals.length) {
    options.push("当前行为可能只是普通礼貌，暂时没有足够证据区分友好与特别兴趣。");
  }
  if (signals.includes("delayAvoidance")) {
    options.push("推迟可能与忙碌或现实安排有关；如果多次发生且没有替代安排，也可能表示投入意愿有限。");
  }

  const defaults = [
    "单次互动容易受到当天状态、场景和沟通习惯影响。",
    "你的期待或焦虑可能会放大某些细节，同时忽略其他证据。",
    "最准确的信息通常来自对方后续持续行为与明确表达。",
  ];

  return [...options, ...defaults].slice(0, 3);
}

function buildUncertainties(signals, strength) {
  const items = [];
  if (signals.length < 2) items.push("目前证据点较少，无法判断是否形成持续模式。");
  if (!signals.includes("directInterest") && strength !== "stop") {
    items.push("对方尚未明确表达关系兴趣，现阶段仍是推断。");
  }
  if (!signals.includes("futurePlan") && strength !== "stop") {
    items.push("尚未看到具体的下一次互动安排或现实投入。");
  }
  if (signals.includes("delayAvoidance")) {
    items.push("需要区分一次客观冲突与持续回避；是否提供替代安排很重要。");
  }
  if (strength === "stop") {
    items.push("对方的边界不需要通过更多分析才能生效。");
  }
  items.push("你记录的是自己的视角，无法覆盖对方未表达的想法和处境。");
  return items.slice(0, 3);
}

function buildResponses(strength, voice) {
  if (strength === "stop") {
    return [
      "收到，谢谢你直接告诉我。我会尊重你的决定，之后不再推进。",
      "我明白了，也谢谢你说清楚。祝你之后一切顺利。",
      "了解，我会尊重这个边界。保重。",
    ];
  }

  const sets = {
    natural: [
      "刚才和你聊天挺舒服的。如果你也愿意，我们下周可以再找个时间喝杯咖啡；不方便也没关系。",
      "我想继续了解你。你有兴趣的话，我们可以挑个轻松的活动再见一次。",
      "我不太想靠猜，所以直接问一下：你愿意继续认识看看吗？任何答案都可以。",
    ],
    gentle: [
      "谢谢你今天愿意分享这些，我觉得相处很舒服。如果你也愿意，我们可以慢慢继续了解。",
      "我有一点想再见你的期待，不过你按自己的节奏来就好；愿意的话，我们再约一个轻松的时间。",
      "我不确定自己有没有理解对，所以想轻轻确认一下：你会愿意继续认识看看吗？",
    ],
    direct: [
      "我对你有兴趣，想继续了解。你愿意的话，我们约下周再见；如果不想也可以直接告诉我。",
      "我想邀请你周末喝咖啡。你愿意就一起，不方便或没兴趣也没关系。",
      "我不想继续猜：你有继续了解的意愿吗？我会尊重你的答案。",
    ],
    humor: [
      "这次聊天我给了高分，但不打算替你评分。你愿意的话，我们下周再喝杯咖啡？",
      "我想申请一次续集：找个轻松的地方再见面。你没空或不想都可以直接说。",
      "我的读心术显然没上线，所以直接问：你愿意继续认识看看吗？",
    ],
  };

  return sets[voice] || sets.natural;
}

function saveProfile(formData) {
  state.profile = {
    name: clean(formData.get("name")),
    goal: clean(formData.get("goal")),
    voice: clean(formData.get("voice")) || "natural",
    boundaries: clean(formData.get("boundaries")),
    anxiety: clean(formData.get("anxiety")),
  };
  saveState();
  syncProfileAvatar();
  showToast("个人表达偏好已保存");
  navigate("dashboard");
}

function saveReview(formData) {
  const item = state.events.find((event) => event.id === formData.get("eventId"));
  if (!item) return;

  item.review = {
    actionTaken: clean(formData.get("actionTaken")),
    result: clean(formData.get("result")),
    learning: clean(formData.get("learning")),
    naturalness: clean(formData.get("naturalness")),
    nextStep: clean(formData.get("nextStep")),
    updatedAt: new Date().toISOString(),
  };
  saveState();
  reviewEventId = null;
  showToast("复盘已保存，真实结果已加入记录");
  renderCurrentView();
}

function loadSampleData() {
  const contactId = uid();
  const eventId = uid();
  const sampleContact = {
    id: contactId,
    alias: "A-17",
    stage: "持续了解",
    context: "读书会认识，线下见过两次，平时偶尔聊天。",
    goal: "尚未明确",
    boundary: "工作日比较忙，不喜欢临时邀约。",
    createdAt: new Date().toISOString(),
  };
  const sampleEvent = {
    id: eventId,
    contactId,
    date: todayISO(),
    stage: "持续了解",
    scene: "读书会结束后的微信聊天",
    fact: "对方主动问我到家没有，并提到下周同一场活动可能还会参加。回复间隔大约二十分钟。",
    interpretation: "我觉得对方可能对我有兴趣，但也担心这只是礼貌。",
    feeling: "期待，也有一点不确定",
    reply: "还没有回复",
    signals: ["repeatedInitiative", "futurePlan"],
    createdAt: new Date().toISOString(),
  };
  sampleEvent.analysis = analyzeEvent(sampleEvent);
  state.contacts.push(sampleContact);
  state.events.push(sampleEvent);
  saveState();
  showToast("匿名示例已载入");
  renderCurrentView();
}

function exportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    application: "GAME Signal Lab",
    data: state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `game-signal-lab-${todayISO()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast("本地数据已导出");
}

function clearData() {
  const confirmed = window.confirm("确定清空所有匿名档案、事件和复盘吗？此操作无法撤销。");
  if (!confirmed) return;

  const adultConfirmed = state.adultConfirmed;
  state = structuredClone(defaultState);
  state.adultConfirmed = adultConfirmed;
  saveState();
  syncProfileAvatar();
  currentView = "dashboard";
  currentEventId = null;
  reviewEventId = null;
  showToast("本地数据已全部清空");
  renderCurrentView();
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(defaultState);
    const parsed = JSON.parse(saved);
    return {
      ...structuredClone(defaultState),
      ...parsed,
      profile: { ...defaultState.profile, ...(parsed.profile || {}) },
      contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getContact(id) {
  return state.contacts.find((item) => item.id === id);
}

function syncProfileAvatar() {
  const initial = state.profile.name ? state.profile.name.trim().slice(0, 1) : "我";
  document.querySelector("#avatar-initial").textContent = initial;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2300);
}

function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "日期未知";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function clean(value) {
  return String(value || "").trim();
}

function uid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHTML(value).replaceAll("\n", "&#10;");
}
