(function () {

  // ── Elements ───────────────────────────────────────────────────
  const gate          = document.getElementById('access-gate');
  const admittedContent = document.getElementById('admitted-content');
  const entryCodeInput  = document.getElementById('entry-code');
  const gateSubmit      = document.getElementById('gate-submit');
  const gateError       = document.getElementById('gate-error');

  const accountEmail      = document.getElementById('account-email');
  const accountDetailsBtn = document.getElementById('account-details-btn');
  const accountDetails    = document.getElementById('account-details');
  const accountFields     = document.getElementById('account-fields');

  const responseArea  = document.getElementById('support-response');
  const textarea      = document.getElementById('support-message');
  const askButton     = document.getElementById('ask-button');
  const quickButtons  = Array.from(document.querySelectorAll('.quick-actions button'));

  // ── Session ────────────────────────────────────────────────────
  let sessionCode  = null;
  let accountData  = null;
  let detailsOpen  = false;

  // ── Gate logic ─────────────────────────────────────────────────
  function admit(code) {
    sessionCode = code;
    gate.hidden = true;
    admittedContent.hidden = false;
    loadAccount(code);
    showResponse('Welcome to Star Support. I can help with Reader Entry Code access, Reader guidance, credit queries, and account support.');
  }

  function showGateError() {
    gateError.hidden = false;
    entryCodeInput.focus();
  }

  gateSubmit.addEventListener('click', function () {
    const code = (entryCodeInput.value || '').trim();
    gateError.hidden = true;

    if (!code) {
      showGateError();
      return;
    }

    gateSubmit.disabled = true;
    gateSubmit.textContent = 'Checking…';

    // Calls the verify endpoint — returns mock pass for now
    fetch('/api/support-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        gateSubmit.disabled = false;
        gateSubmit.textContent = 'Continue';

        if (data && data.valid) {
          admit(code);
        } else {
          showGateError();
        }
      })
      .catch(function () {
        // Fallback: accept any non-empty code in prototype
        gateSubmit.disabled = false;
        gateSubmit.textContent = 'Continue';
        admit(code);
      });
  });

  entryCodeInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') gateSubmit.click();
  });

  // ── Account panel ──────────────────────────────────────────────
  function loadAccount(code) {
    fetch('/api/support-account', {
      headers: { 'x-entry-code': code }
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        accountData = data;
        accountEmail.textContent = data.email || 'Paid Access Member';
      })
      .catch(function () {
        accountEmail.textContent = 'Paid Access Member';
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
    const safe = [
      { label: 'Email',                   value: data.email                   },
      { label: 'Access Status',           value: data.access_status,  status: true },
      { label: 'Pass Type',               value: data.pass_type               },
      { label: 'Entry Code Status',       value: data.entry_code_status       },
      { label: 'Oracle Credits',          value: data.oracle_credits          },
      { label: 'Support Chat Credits',    value: data.support_credits         },
      { label: 'Trial Expiry',            value: data.trial_expiry            },
      { label: 'Last Support Access',     value: data.last_support_access     },
    ];

    accountFields.innerHTML = '';

    safe.forEach(function (field) {
      if (!field.value && field.value !== 0) return;

      const wrap = document.createElement('div');
      wrap.className = 'account-field';

      const lbl = document.createElement('span');
      lbl.className = 'account-field-label';
      lbl.textContent = field.label;

      const val = document.createElement('span');
      val.className = 'account-field-value' + (field.status ? ' status-active' : '');
      val.textContent = field.value;

      wrap.appendChild(lbl);
      wrap.appendChild(val);
      accountFields.appendChild(wrap);
    });
  }

  // ── Chat ───────────────────────────────────────────────────────
  const answers = {
    'reader entry code help':
      'I can help with Reader Entry Code access. Please check that your code has been entered exactly as supplied. If you have Paid Access and the code still fails, Star Support can raise a support request for review.',

    'guide me through the reader':
      'Begin with MY CHART DATA AND SUMMARY. Once you move through that stage, you enter the main Reader area where the wider experience becomes available.',

    'credit query':
      'I can help with Star Support chat-credit queries. If something looks wrong, I can raise a support request for review.',

    'account support':
      'For Paid Access members, Star Support can help with account support, access checks, service issues, and support requests. If the issue needs human review, it will be escalated to Stoic Qabalah admin support.'
  };

  const fallback =
    'Thank you. Star Support can help Paid Access members with Reader Entry Code help, Reader guidance, credit queries, and account support. Please add a little more detail so the correct support route can be identified.';

  function normalise(v) {
    return String(v || '').trim().toLowerCase();
  }

  function getAnswer(message) {
    const m = normalise(message);

    if (m.includes('entry code') || m.includes('reader code') || m.includes('code'))
      return answers['reader entry code help'];

    if (m.includes('chart') || m.includes('summary') || m.includes('guide') || m.includes('reader'))
      return answers['guide me through the reader'];

    if (m.includes('credit') || m.includes('top up') || m.includes('top-up') || m.includes('balance'))
      return answers['credit query'];

    if (m.includes('account') || m.includes('paid') || m.includes('access') || m.includes('service'))
      return answers['account support'];

    return fallback;
  }

  function showResponse(text) {
    responseArea.textContent = text;
  }

  function ask(message) {
    const clean = String(message || '').trim();
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
    button.addEventListener('click', function () {
      ask(button.textContent);
    });
  });

  askButton.addEventListener('click', function () {
    ask(textarea.value);
  });

  textarea.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      ask(textarea.value);
    }
  });

})();
