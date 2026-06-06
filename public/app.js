(function () {

  // ── Gate elements ──────────────────────────────────────────────
  const gate           = document.getElementById('access-gate');
  const stepEmail      = document.getElementById('gate-step-email');
  const stepCode       = document.getElementById('gate-step-code');

  const emailInput     = document.getElementById('entry-email');
  const emailSubmit    = document.getElementById('gate-email-submit');
  const emailError     = document.getElementById('gate-email-error');
  const checkingBox    = document.getElementById('gate-checking-box');
  const notFoundBox    = document.getElementById('gate-not-found');

  const codeInput      = document.getElementById('entry-code');
  const codeSubmit     = document.getElementById('gate-code-submit');
  const codeError      = document.getElementById('gate-code-error');

  // ── Admitted elements ──────────────────────────────────────────
  const admittedContent   = document.getElementById('admitted-content');
  const accountEmail      = document.getElementById('account-email');
  const accountDetailsBtn = document.getElementById('account-details-btn');
  const accountDetails    = document.getElementById('account-details');
  const accountFields     = document.getElementById('account-fields');
  const responseArea      = document.getElementById('support-response');
  const textarea          = document.getElementById('support-message');
  const askButton         = document.getElementById('ask-button');
  const quickButtons      = Array.from(document.querySelectorAll('.quick-actions button'));

  // ── Session ────────────────────────────────────────────────────
  let sessionEmail  = null;
  let sessionToken  = null;   // raw token — stored in memory only, never persisted
  let accountData   = null;
  let detailsOpen   = false;

  // ── Gate state machine ─────────────────────────────────────────
  function showStep(stepEl) {
    [stepEmail, stepCode].forEach(function (el) {
      el.hidden = (el !== stepEl);
    });
  }

  function setChecking(active) {
    checkingBox.classList.toggle('active', active);
    emailSubmit.disabled = active;
    if (active) {
      emailError.hidden = true;
      notFoundBox.hidden = true;
    }
  }

  function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
  }

  // Step 1 — Email submit
  emailSubmit.addEventListener('click', function () {
    emailError.hidden = true;
    notFoundBox.hidden = true;
    const email = (emailInput.value || '').trim();

    if (!isValidEmail(email)) {
      emailError.textContent = 'Please enter a valid email address.';
      emailError.hidden = false;
      emailInput.focus();
      return;
    }

    setChecking(true);

    fetch('/api/support-request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        setChecking(false);
        if (data && data.ok) {
          sessionEmail = email;
          showStep(stepCode);
          codeInput.focus();
        } else if (data && data.reason === 'account_not_found') {
          notFoundBox.hidden = false;
        } else {
          emailError.textContent = 'Something went wrong. Please try again.';
          emailError.hidden = false;
        }
      })
      .catch(function () {
        // Prototype fallback — accept any valid email
        setChecking(false);
        sessionEmail = email;
        showStep(stepCode);
        codeInput.focus();
      });
  });

  emailInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') emailSubmit.click();
  });

  // Step 2 — Code submit
  codeSubmit.addEventListener('click', function () {
    codeError.hidden = true;
    const code = (codeInput.value || '').trim();

    if (!/^\d{6}$/.test(code)) {
      codeError.textContent = 'Please enter the 6-digit code sent to your email.';
      codeError.hidden = false;
      codeInput.focus();
      return;
    }

    fetch('/api/support-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: sessionEmail, code })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) {
          sessionToken = data.token || null;
          admit(sessionEmail);
        } else {
          codeError.textContent = reasonMessage(data.reason);
          codeError.hidden = false;
        }
      })
      .catch(function () {
        // Prototype fallback — admit without token when API unreachable
        admit(sessionEmail);
      });
  });

  codeInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') codeSubmit.click();
  });

  function reasonMessage(reason) {
    if (reason === 'code_expired') return 'Code has expired. Please start again.';
    if (reason === 'too_many_attempts') return 'Too many attempts. Please request a new code.';
    return 'Code not recognised. Please check and try again.';
  }

  // ── Admit ──────────────────────────────────────────────────────
  function admit(email) {
    gate.hidden = true;
    admittedContent.hidden = false;
    loadAccount(email);
    showResponse('Welcome to Star Support. I can help with Reader Entry Code access, Reader guidance, credit queries, and account support.');
  }

  // ── Account panel ──────────────────────────────────────────────
  function loadAccount(email) {
    var headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['Authorization'] = 'Bearer ' + sessionToken;

    fetch('/api/support-account', { headers: headers })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var account = (data && data.account) ? data.account : data;
        accountData = account;
        accountEmail.textContent = account.email || email;
      })
      .catch(function () {
        accountEmail.textContent = email;
      });
  }

  accountDetailsBtn.addEventListener('click', function () {
    if (!accountData) return;
    detailsOpen = !detailsOpen;
    accountDetails.hidden = !detailsOpen;
    accountDetailsBtn.textContent = detailsOpen ? 'Hide Details' : 'View Account Details';
    if (detailsOpen && accountFields.childElementCount === 0) {
      renderAccountFields(accountData);
    }
  });

  function renderAccountFields(data) {
    var productNames = (data.active_products || []).map(function (p) {
      var label = p.name;
      if (p.billing_type) label += ' (' + p.billing_type + ')';
      return label;
    }).join(', ');

    var lastAccess = data.last_support_access_at
      ? new Date(data.last_support_access_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : null;

    var stateLabel = {
      active:      'Active',
      trial:       'Trial',
      low_credits: 'Low Credits',
      no_credits:  'No Credits Remaining',
      expired:     'Expired',
      cancelled:   'Cancelled',
      no_product:  'No Active Product',
    }[data.account_state] || data.account_state;

    var safe = [
      { label: 'Email',                value: data.email                              },
      { label: 'Account State',        value: stateLabel,             status: true    },
      { label: 'Active Products',      value: productNames || null                    },
      { label: 'Oracle Credits',       value: data.oracle_credits_remaining           },
      { label: 'Support Chat Credits', value: data.support_chat_credits_remaining     },
      { label: 'Top-up Recommended',   value: data.top_up_recommended ? 'Yes' : null  },
      { label: 'Last Support Access',  value: lastAccess                              },
    ];

    accountFields.innerHTML = '';
    safe.forEach(function (field) {
      if (!field.value && field.value !== 0) return;
      var wrap = document.createElement('div');
      wrap.className = 'account-field';
      var lbl = document.createElement('span');
      lbl.className = 'account-field-label';
      lbl.textContent = field.label;
      var val = document.createElement('span');
      val.className = 'account-field-value' + (field.status ? ' status-active' : '');
      val.textContent = field.value;
      wrap.appendChild(lbl);
      wrap.appendChild(val);
      accountFields.appendChild(wrap);
    });
  }

  // ── Screenshot carousel ────────────────────────────────────────

  var CAROUSEL_IMAGES = {
    gate: [
      { src: '/screenshots/app_gate.png', caption: 'Member Access', desc: 'Enter with the email connected to your Reader, trial, or product purchase.' },
    ],
    transits: [
      { src: '/screenshots/app_transits.png', caption: 'Transits', desc: 'Find guidance for weekly and current transit readings within the Tree.' },
    ],
    oracle: [
      { src: '/screenshots/app_oracle.png', caption: 'Oracle', desc: 'Get help with Oracle-layer credits, question flow, and usage guidance.' },
    ],
    save_reading: [
      { src: '/screenshots/save_reading.png', caption: 'Save Reading', desc: 'Return when you need help with saved readings, products, or continuing your journey.' },
    ],
    all: [
      { src: '/screenshots/app_gate.png',         caption: '1 — Member Access',  desc: 'Enter with the email connected to your Reader, trial, or product purchase.' },
      { src: '/screenshots/app_tree_reading.png', caption: '2 — Tree Reading',   desc: 'Work through the Tree journey, sphere meanings, and your personal reading.' },
      { src: '/screenshots/app_transits.png',     caption: '3 — Transits',       desc: 'Find guidance for weekly and current transit readings within the Tree.' },
      { src: '/screenshots/app_oracle.png',       caption: '4 — Oracle',         desc: 'Consult the Oracle layer — credits, question flow, and usage guidance.' },
      { src: '/screenshots/save_reading.png',     caption: '5 — Save & Return',  desc: 'Save your reading and return to continue your journey at any time.' },
    ],
  };

  function detectCarouselTopic(message) {
    var m = message.toLowerCase();
    // Specific single-topic queries
    if (/transit/.test(m) && !/reader|guide|all|overview/.test(m)) return 'transits';
    if (/oracle/.test(m) && !/reader|guide|all|overview/.test(m)) return 'oracle';
    if (/save|saved reading|return later/.test(m) && !/reader|guide|all|overview/.test(m)) return 'save_reading';
    if (/entry code|access code/.test(m) && !/reader|guide|all|overview/.test(m)) return 'gate';
    // General reader / walkthrough queries → all 5
    if (/reader|guide|walk.?through|overview|get started|how (do|to|can) i|sphere|sephir|tree|journey|everything|all/.test(m)) return 'all';
    return null;
  }

  function renderSupportCarousel(images) {
    var wrap = document.createElement('div');
    wrap.className = 'support-carousel';
    images.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'carousel-card';
      var img = document.createElement('img');
      img.src = item.src;
      img.alt = item.caption;
      img.className = 'carousel-img';
      img.loading = 'lazy';
      var cap = document.createElement('p');
      cap.className = 'carousel-caption';
      cap.textContent = item.caption;
      card.appendChild(img);
      card.appendChild(cap);
      if (item.desc) {
        var desc = document.createElement('p');
        desc.className = 'carousel-desc';
        desc.textContent = item.desc;
        card.appendChild(desc);
      }
      wrap.appendChild(card);
    });
    responseArea.appendChild(wrap);
    scrollTranscriptToLatest();
  }

  // ── Chat ───────────────────────────────────────────────────────

  function renderMarkdown(text) {
    // Escape HTML
    var escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Bold: **text** or __text__
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Split into lines and process
    var lines = escaped.split('\n');
    var html = '';
    var inList = false;

    lines.forEach(function (line) {
      var trimmed = line.trim();

      // Bullet: lines starting with - or *
      if (/^[-*] /.test(trimmed)) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += '<li>' + trimmed.slice(2) + '</li>';
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        if (trimmed === '') {
          html += '<br>';
        } else {
          html += '<p>' + trimmed + '</p>';
        }
      }
    });

    if (inList) html += '</ul>';
    return html;
  }

  function scrollTranscriptToLatest() {
    responseArea.scrollTop = responseArea.scrollHeight;
  }

  function appendTranscriptMessage(role, text, options) {
    options = options || {};

    var entry = document.createElement('div');
    entry.className = 'chat-entry chat-entry-' + role + (options.pending ? ' is-pending' : '');

    var label = document.createElement('div');
    label.className = 'chat-label';
    label.textContent = role === 'user' ? 'You asked' : 'Star Support';

    var body = document.createElement('div');
    body.className = 'chat-body';

    if (role === 'support') {
      body.innerHTML = renderMarkdown(text);
    } else {
      body.textContent = text;
    }

    entry.appendChild(label);
    entry.appendChild(body);
    responseArea.appendChild(entry);
    scrollTranscriptToLatest();

    return entry;
  }

  function updateTranscriptMessage(entry, text, isError) {
    if (!entry) return;

    entry.classList.remove('is-pending');
    if (isError) entry.classList.add('is-error');

    var body = entry.querySelector('.chat-body');
    if (body) body.innerHTML = renderMarkdown(text);

    scrollTranscriptToLatest();
  }

  function showResponse(text) {
    appendTranscriptMessage('support', text);
  }

  function ask(message, forcedTopic) {
    var clean = String(message || '').trim();
    if (!clean) return;

    appendTranscriptMessage('user', clean);
    var pendingEntry = appendTranscriptMessage('support', 'Star Support is thinking…', { pending: true });

    textarea.value = '';
    askButton.disabled = true;
    askButton.textContent = 'Thinking…';

    var headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['Authorization'] = 'Bearer ' + sessionToken;

    fetch('/api/stoicqabalahsupportbot', {
      method:  'POST',
      headers: headers,
      body:    JSON.stringify({ message: clean }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        updateTranscriptMessage(
          pendingEntry,
          data.ok ? data.answer : 'Something went wrong. Please try again.',
          !(data && data.ok)
        );
        if (data && data.ok) {
          var topic = forcedTopic !== undefined ? forcedTopic : detectCarouselTopic(clean);
          if (topic) renderSupportCarousel(CAROUSEL_IMAGES[topic]);
        }
      })
      .catch(function () {
        updateTranscriptMessage(
          pendingEntry,
          'Unable to reach Star Support. Please check your connection and try again.',
          true
        );
      })
      .finally(function () {
        askButton.disabled = false;
        askButton.textContent = 'Ask Star Support';
      });
  }

  var QUICK_BUTTON_TOPICS = {
    'Reader Entry Code help':      'gate',
    'Guide me through the Reader': 'all',
    'Credit query':                'oracle',
    'Account support':             null,
  };

  quickButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      var label = button.textContent.trim();
      var forcedTopic = Object.prototype.hasOwnProperty.call(QUICK_BUTTON_TOPICS, label)
        ? QUICK_BUTTON_TOPICS[label]
        : undefined;
      ask(label, forcedTopic);
    });
  });

  askButton.addEventListener('click', function () { ask(textarea.value); });

  textarea.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      ask(textarea.value);
    }
  });

})();
