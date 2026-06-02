(function () {

  // ── Gate elements ──────────────────────────────────────────────
  const gate           = document.getElementById('access-gate');
  const stepEmail      = document.getElementById('gate-step-email');
  const stepChecking   = document.getElementById('gate-checking');
  const stepCode       = document.getElementById('gate-step-code');

  const emailInput     = document.getElementById('entry-email');
  const emailSubmit    = document.getElementById('gate-email-submit');
  const emailError     = document.getElementById('gate-email-error');

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
  let accountData   = null;
  let detailsOpen   = false;

  // ── Gate state machine ─────────────────────────────────────────
  function showOnly(stepEl) {
    [stepEmail, stepChecking, stepCode].forEach(function (el) {
      el.hidden = (el !== stepEl);
    });
  }

  function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
  }

  // Step 1 — Email submit
  emailSubmit.addEventListener('click', function () {
    emailError.hidden = true;
    const email = (emailInput.value || '').trim();

    if (!isValidEmail(email)) {
      emailError.textContent = 'Please enter a valid email address.';
      emailError.hidden = false;
      emailInput.focus();
      return;
    }

    showOnly(stepChecking);

    fetch('/api/support-request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) {
          sessionEmail = email;
          showOnly(stepCode);
          codeInput.focus();
        } else {
          showOnly(stepEmail);
          emailError.textContent = 'Email not recognised. Please check and try again.';
          emailError.hidden = false;
        }
      })
      .catch(function () {
        // Prototype fallback — accept any valid email
        sessionEmail = email;
        showOnly(stepCode);
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

    showOnly(stepChecking);

    fetch('/api/support-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: sessionEmail, code })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) {
          admit(sessionEmail);
        } else {
          showOnly(stepCode);
          codeError.textContent = reasonMessage(data.reason);
          codeError.hidden = false;
        }
      })
      .catch(function () {
        // Prototype fallback — accept any 6-digit code
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
    fetch('/api/support-account', {
      headers: { 'x-support-email': email }
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        accountData = data;
        accountEmail.textContent = data.email || email;
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
    var safe = [
      { label: 'Email',                value: data.email                 },
      { label: 'Access Status',        value: data.access_status,  status: true },
      { label: 'Pass Type',            value: data.pass_type             },
      { label: 'Entry Code Status',    value: data.entry_code_status     },
      { label: 'Oracle Credits',       value: data.oracle_credits        },
      { label: 'Support Chat Credits', value: data.support_credits       },
      { label: 'Trial Expiry',         value: data.trial_expiry          },
      { label: 'Last Support Access',  value: data.last_support_access   },
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

  // ── Chat ───────────────────────────────────────────────────────
  var answers = {
    'reader entry code help':
      'I can help with Reader Entry Code access. Please check that your code has been entered exactly as supplied. If you have Paid Access and the code still fails, Star Support can raise a support request for review.',
    'guide me through the reader':
      'Begin with MY CHART DATA AND SUMMARY. Once you move through that stage, you enter the main Reader area where the wider experience becomes available.',
    'credit query':
      'I can help with Star Support chat-credit queries. If something looks wrong, I can raise a support request for review.',
    'account support':
      'For Paid Access members, Star Support can help with account support, access checks, service issues, and support requests. If the issue needs human review, it will be escalated to Stoic Qabalah admin support.'
  };

  var fallback = 'Thank you. Star Support can help Paid Access members with Reader Entry Code help, Reader guidance, credit queries, and account support. Please add a little more detail so the correct support route can be identified.';

  function normalise(v) { return String(v || '').trim().toLowerCase(); }

  function getAnswer(message) {
    var m = normalise(message);
    if (m.includes('entry code') || m.includes('reader code') || m.includes('code')) return answers['reader entry code help'];
    if (m.includes('chart') || m.includes('summary') || m.includes('guide') || m.includes('reader')) return answers['guide me through the reader'];
    if (m.includes('credit') || m.includes('top up') || m.includes('top-up') || m.includes('balance')) return answers['credit query'];
    if (m.includes('account') || m.includes('paid') || m.includes('access') || m.includes('service')) return answers['account support'];
    return fallback;
  }

  function showResponse(text) { responseArea.textContent = text; }

  function ask(message) {
    var clean = String(message || '').trim();
    if (!clean) return;
    textarea.value = '';
    askButton.disabled = true;
    askButton.textContent = 'Thinking…';
    window.setTimeout(function () {
      showResponse(getAnswer(clean));
      askButton.disabled = false;
      askButton.textContent = 'Ask Star Support';
    }, 380);
  }

  quickButtons.forEach(function (button) {
    button.addEventListener('click', function () { ask(button.textContent); });
  });

  askButton.addEventListener('click', function () { ask(textarea.value); });

  textarea.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      ask(textarea.value);
    }
  });

})();
