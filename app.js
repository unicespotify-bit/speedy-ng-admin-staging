(() => {
  "use strict";

  // STAGING API ONLY — production API remains untouched.
  const API_BASE = "https://speedy-ng-api-staging.unicespotify.workers.dev";

  const $ = (id) => document.getElementById(id);

  let authToken = sessionStorage.getItem("speedy_admin_token") || null;
  let currentUser = null;
  let loginInProgress = false;
  let sessionCheckInProgress = false;
  let settingsCache = null;
  let auditCache = null;
  let toastTimer = null;

  const pages = {
    overview: [
      "Overview",
      "YOUR BUSINESS AT A GLANCE",
      "Admin overview",
      "Monitor your staging platform from one secure place."
    ],

    customers: [
      "Customers & Wallet Management",
      "CUSTOMER OPERATIONS",
      "Customers & Wallets",
      "Search customers, inspect balances and manage wallet transactions after secure wallet endpoints are added."
    ],

    visual: [
      "Visual Numbers",
      "PRODUCT CONTROLS",
      "Visual Numbers",
      "Manage YoungPG Visual Numbers services, availability and pricing."
    ],

    "social-logs": [
      "Social Logs",
      "PRODUCT CONTROLS",
      "Social Logs",
      "Manage YoungPG Social Logs services, availability and pricing."
    ],

    boosting: [
      "Social Boosting",
      "PRODUCT CONTROLS",
      "Social Boosting",
      "Manage Nexa Social Boosting services, provider connections and service pricing."
    ],

    orders: [
      "Orders & Refunds",
      "ORDER OPERATIONS",
      "Orders & Refunds",
      "Monitor order lifecycle, cancellation requests and confirmed customer refunds."
    ],

    payments: [
      "Flutterwave Payments",
      "PAYMENT OPERATIONS",
      "Flutterwave Payments",
      "Review deposits and payment status through secure server-side endpoints."
    ],

    api: [
      "API Management",
      "INTEGRATIONS",
      "API Management",
      "Manage YoungPG, Nexa and Flutterwave connections securely through the Worker."
    ],

    pricing: [
      "Pricing & Markup",
      "REVENUE CONTROLS",
      "Pricing & Markup",
      "Set USD selling rules once pricing endpoints are available."
    ],

    exchange: [
      "Exchange Rate Settings",
      "CURRENCY CONTROLS",
      "Exchange Rate Settings",
      "Default exchange rate is ₦1,500 per $1. Changes should apply to future conversions only."
    ],

    "email-verification": [
      "Email Verification",
      "ACCOUNT SECURITY",
      "Email Verification",
      "Verification expiry, cooldowns and purchase blocking must be enforced by the Worker."
    ],

    support: [
      "Announcements & Support",
      "CUSTOMER COMMUNICATION",
      "Announcements & Support",
      "Manage announcements and support settings after backend routes are added."
    ],

    settings: [
      "Admin Settings",
      "PLATFORM CONFIGURATION",
      "Admin Settings",
      "Read and update the settings exposed by the staging Worker."
    ],

    activity: [
      "Admin Activity Logs",
      "SECURITY & AUDIT",
      "Admin Activity Logs",
      "Review the audit events returned by the staging Worker."
    ]
  };

  const route = (path) => API_BASE + path;

  // API transport: bearer-token authentication for protected routes.
  async function api(path, options = {}) {
    const {
      auth = true,
      headers: suppliedHeaders = {},
      ...fetchOptions
    } = options;

    const headers = {
      "Accept": "application/json",
      ...suppliedHeaders
    };

    if (
      fetchOptions.body !== undefined &&
      !headers["Content-Type"]
    ) {
      headers["Content-Type"] = "application/json";
    }

    const tokenUsed = auth ? authToken : null;

    if (auth && !tokenUsed) {
      const err = new Error(
        "Your admin session has ended. Please sign in again."
      );
      err.status = 401;
      throw err;
    }

    if (auth) {
      headers["Authorization"] = `Bearer ${tokenUsed}`;
    } else {
      delete headers["Authorization"];
    }

    let response;

    try {
      response = await fetch(route(path), {
        ...fetchOptions,
        headers,
        credentials: "omit"
      });
    } catch (_) {
      throw new Error(
        "Could not connect to Speedy staging API. Check your internet connection and try again."
      );
    }

    const raw = await response.text();

    let data = {};

    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch (_) {
        data = {
          message: "The server returned an unexpected response."
        };
      }
    }

    if (!response.ok) {
      const message =
        typeof data?.error === "string"
          ? data.error
          : typeof data?.message === "string"
            ? data.message
            : `Request failed (HTTP ${response.status}).`;

      const err = new Error(message);
      err.status = response.status;

      if (
        response.status === 401 &&
        auth &&
        tokenUsed &&
        tokenUsed === authToken
      ) {
        clearLocalSession();
        showLogin(
          "Your admin session has expired. Please sign in again."
        );
      }

      throw err;
    }

    return data;
  }

  function clearLocalSession() {
    authToken = null;
    sessionStorage.removeItem("speedy_admin_token");
    currentUser = null;
  }

  function showToast(message, error = false) {
    const el = $("toast");

    el.textContent = message;
    el.style.borderColor = error ? "#8a3c56" : "#326094";
    el.style.background = error ? "#3a1d31" : "#102b4d";

    el.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(
      () => el.classList.remove("show"),
      3600
    );
  }

  function escapeHtml(v) {
    return String(v ?? "").replace(
      /[&<>"']/g,
      c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[c])
    );
  }

  function pretty(value) {
    return Number(value).toLocaleString("en-US");
  }

  function setHealth(ok, text) {
    $("healthDot").style.background =
      ok ? "var(--green)" : "var(--red)";

    $("healthText").textContent = text;

    $("workerStatus").className =
      "status " + (ok ? "good" : "bad");

    $("workerStatus").textContent =
      ok ? "Connected" : "Unavailable";
  }

  async function checkHealth() {
    try {
      const d = await api("/api/health", {
        auth: false
      });

      setHealth(true, "Staging API connected");

      return d;
    } catch (e) {
      setHealth(false, "Staging API unavailable");

      return null;
    }
  }

  function showLogin(message = "") {
    $("loginView").classList.remove("hidden");
    $("appView").classList.add("hidden");
    $("loginError").textContent = message;
  }

  function showApp(user) {
    currentUser = user || {};

    $("loginView").classList.add("hidden");
    $("appView").classList.remove("hidden");

    $("sessionUser").textContent =
      currentUser.email ||
      currentUser.name ||
      "Administrator";

    $("todayDate").textContent =
      new Intl.DateTimeFormat("en-NG", {
        weekday: "short",
        month: "short",
        day: "numeric"
      }).format(new Date());

    $("year").textContent = new Date().getFullYear();

    openPage("overview");

    refreshOverview();
  }

  async function login(email, password) {
    // Login does not send an existing Authorization token.
    return api("/api/admin/login", {
      method: "POST",
      auth: false,
      body: JSON.stringify({
        email,
        password
      })
    });
  }

  async function checkSession() {
    if (sessionCheckInProgress) return;

    if (!authToken) {
      showLogin();
      return;
    }

    sessionCheckInProgress = true;

    try {
      const me = await api("/api/admin/me");

      if (
        me?.ok === false ||
        me?.success === false ||
        me?.authenticated === false
      ) {
        clearLocalSession();

        showLogin(
          "Your admin session is invalid. Please sign in again."
        );

        return;
      }

      showApp(me?.admin || me?.user || me);

    } catch (e) {
      if (e.status !== 401) {
        showLogin(
          e.message ||
          "Could not verify your admin session."
        );
      }

    } finally {
      sessionCheckInProgress = false;
    }
  }

  async function logout() {
    const hadToken = Boolean(authToken);

    try {
      if (hadToken) {
        await api("/api/admin/logout", {
          method: "POST",
          body: JSON.stringify({})
        });
      }

    } catch (_) {
      // Local sign-out still completes if the API is unavailable.

    } finally {
      clearLocalSession();
      showLogin();
      showToast("You have signed out.");
    }
  }

  function openPage(key) {
    if (!pages[key]) key = "overview";

    document.querySelectorAll(".nav-item").forEach(b => {
      b.classList.toggle(
        "active",
        b.dataset.page === key
      );
    });

    $("pageTitle").textContent = pages[key][0];
    $("pageCrumb").textContent = pages[key][0];

    $("overviewPage").classList.toggle(
      "hidden",
      key !== "overview"
    );

    $("genericPage").classList.toggle(
      "hidden",
      key === "overview"
    );

    $("sidebar").classList.remove("open");

    if (key !== "overview") {
      renderSection(key);
    }

    if (key === "settings") {
      loadSettings();
    }

    if (key === "activity") {
      loadAudit();
    }
  }

  function featureCard(
    symbol,
    title,
    description,
    state,
    actionLabel = "View requirements"
  ) {
    return `
      <article class="feature-card">
        <div class="feature-top">
          <div class="feature-symbol">${symbol}</div>
          <div>
            <h3>${title}</h3>
            <span class="status neutral">${state}</span>
          </div>
        </div>
        <p>${description}</p>
        <button
          class="secondary"
          data-action="requirements"
        >${actionLabel}</button>
      </article>
    `;
  }

  function renderSection(key) {
    const p = pages[key];

    $("sectionEyebrow").textContent = p[1];
    $("sectionHeading").textContent = p[2];
    $("sectionDescription").textContent = p[3];

    $("sectionBadge").className =
      "status " +
      (["settings", "activity"].includes(key)
        ? "good"
        : "neutral");

    $("sectionBadge").textContent =
      ["settings", "activity"].includes(key)
        ? "Existing API route"
        : "Backend route needed";

    const body = $("sectionBody");

    if (key === "settings") {

      body.innerHTML = `
        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>Application settings</h3>
              <p class="muted">
                Loaded from GET /api/admin/settings.
                Save sends JSON to POST /api/admin/settings.
              </p>
            </div>
            <span class="status neutral" id="settingsStatus">
              Not loaded
            </span>
          </div>

          <div class="field">
            <label for="settingsJson">Settings JSON</label>
            <textarea
              id="settingsJson"
              class="settings-json"
              spellcheck="false"
              placeholder="Load settings to display the server response"
            ></textarea>
          </div>

          <div class="form-actions">
            <button id="loadSettingsBtn" class="secondary">
              Reload settings
            </button>

            <button id="saveSettingsBtn" class="primary">
              Save settings
            </button>
          </div>

          <p class="muted">
            Only save keys you understand. The exact accepted
            payload depends on your Worker implementation.
          </p>
        </div>

        <div class="callout">
          Security: never paste Flutterwave secret keys or
          provider API secrets into this browser editor.
          Credentials must remain securely stored on the Worker.
        </div>
      `;

      $("loadSettingsBtn").onclick = loadSettings;
      $("saveSettingsBtn").onclick = saveSettings;

    } else if (key === "activity") {

      body.innerHTML = `
        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>Recent admin activity</h3>
              <p class="muted">GET /api/admin/audit</p>
            </div>

            <button id="reloadAuditBtn" class="secondary">
              Refresh logs
            </button>
          </div>

          <div id="auditTable" class="table-wrap">
            <div class="empty-state">
              Loading audit events…
            </div>
          </div>
        </div>
      `;

      $("reloadAuditBtn").onclick = loadAudit;

    } else if (key === "exchange") {

      body.innerHTML = `
        <div class="callout">
          The requested default is ₦1,500 = $1.
          This screen does not change the live rate because
          no dedicated exchange-rate endpoint has been confirmed.
          Changes must apply to future conversions only.
        </div>

        ${featureCard(
          "⇄",
          "Exchange rate",
          "A backend endpoint is required to validate and save the rate, preserve historical transaction amounts and apply new rates only to future conversions.",
          "Not connected"
        )}
      `;

    } else if (
      key === "visual" ||
      key === "social-logs"
    ) {

      const label =
        key === "visual"
          ? "Visual Numbers"
          : "Social Logs";

      body.innerHTML = `
        <div class="callout">
          ${label} uses YoungPG.
          Nexa is not a provider for ${label}.
          Provider credentials must remain securely stored
          on the staging Worker.
        </div>

        <div class="feature-grid">

          ${featureCard(
            "◈",
            "YoungPG",
            "Primary API for this product. Connection status, services, availability and pricing require secure Worker endpoints.",
            "Backend needed"
          )}

          ${featureCard(
            "↻",
            "Automatic refresh",
            "Refresh service availability and pricing every five minutes through the Worker.",
            "Backend needed"
          )}

          ${featureCard(
            "⌘",
            "API credentials",
            "Credentials must remain on the Worker, with masked display and audited updates.",
            "Backend needed"
          )}

        </div>
      `;

    } else if (key === "customers") {

      body.innerHTML = `
        <div class="callout">
          Wallet credits and debits are financial operations.
          No customer-search or wallet-adjustment route has
          been confirmed, so this dashboard will not make
          local-only balance changes or simulate transactions.
        </div>

        <div class="panel">
          <h3>Customer search & wallet operations</h3>

          <p class="muted">
            Required backend routes: customer search,
            customer detail, wallet transactions and
            atomic wallet adjustment.
          </p>

          <div class="empty-state">
            <strong>Waiting for secure wallet endpoints</strong>

            Once implemented, this section can search by
            email, name or ID, show NGN and USD balances,
            and submit adjustments with idempotency protection
            and an audit record.
          </div>
        </div>
      `;

    } else if (key === "orders") {

      body.innerHTML = `
        <div class="callout">
          Automatic refunds must be orchestrated by the Worker,
          not by this static page. A browser timer is not
          reliable when the admin or customer is offline.
        </div>

        <div class="feature-grid">

          ${featureCard(
            "◷",
            "Pending cancellations",
            "View orders whose verification deadline passed and cancellation has been requested.",
            "Endpoint needed"
          )}

          ${featureCard(
            "↩",
            "Provider refund confirmation",
            "Track confirmed provider refunds separately from customer wallet credits.",
            "Endpoint needed"
          )}

          ${featureCard(
            "✓",
            "Completed customer refunds",
            "Show idempotent refund records and the final credited amount.",
            "Endpoint needed"
          )}

          ${featureCard(
            "!",
            "Failed refund requests",
            "Retry safely with audit history and duplicate-refund protection.",
            "Endpoint needed"
          )}

        </div>
      `;

    } else if (key === "payments") {

      body.innerHTML = `
        <div class="callout">
          Flutterwave is the intended payment provider.
          This static page does not verify payments and
          cannot safely mark deposits as paid.
        </div>

        <div class="feature-grid">

          ${featureCard(
            "₦",
            "Payment records",
            "List deposit status, reference, amount and timestamps from verified server records.",
            "Endpoint needed"
          )}

          ${featureCard(
            "✓",
            "Production connection",
            "Use server-side secret keys and Flutterwave webhook signature verification.",
            "Endpoint needed"
          )}

        </div>

        <div class="panel">
          <h3>Requested deposit limits</h3>

          <div class="field-grid">
            <div class="field">
              <label>Minimum deposit</label>
              <input value="₦100" readonly>
            </div>

            <div class="field">
              <label>Maximum deposit</label>
              <input value="₦5,000,000" readonly>
            </div>
          </div>

          <p class="muted">
            These are display-only targets, not enforced
            until the Worker validates them.
          </p>
        </div>
      `;

    } else if (key === "api") {

      body.innerHTML = `
        <div class="callout">
          API secrets must never be embedded in index.html,
          app.js or browser storage. A secure Worker endpoint
          should accept credential updates and never return
          the full secret afterward.
        </div>

        <div class="feature-grid">

          ${featureCard(
            "◈",
            "YoungPG",
            "Used for Visual Numbers and Social Logs. Connection status, service availability and credentials require secure Worker endpoints.",
            "Endpoint needed"
          )}

          ${featureCard(
            "◈",
            "Nexa",
            "Used for Official Numbers and Social Boosting. Connection status, service availability and credentials require secure Worker endpoints.",
            "Endpoint needed"
          )}

          ${featureCard(
            "₣",
            "Flutterwave",
            "Payment connection status and webhook configuration must be verified server-side.",
            "Endpoint needed"
          )}

          ${featureCard(
            "⌘",
            "Staging Worker health",
            "Checks the staging API health endpoint.",
            "Connected"
          )}

        </div>
      `;

    } else if (key === "pricing") {

      body.innerHTML = `
        <div class="callout">
          Markup must be calculated and enforced server-side
          at checkout. Client-side price fields alone cannot
          protect your margin or customer charges.
        </div>

        <div class="feature-grid">

          ${featureCard(
            "◎",
            "Global markup",
            "Separate global markup for Visual Numbers, Social Logs and Social Boosting.",
            "Endpoint needed"
          )}

          ${featureCard(
            "⌖",
            "Country and service rules",
            "Country-specific and service-specific markup, including WhatsApp, Telegram, TikTok and Facebook.",
            "Endpoint needed"
          )}

          ${featureCard(
            "$",
            "USD customer pricing",
            "Show and charge customer purchases in USD while retaining historical transaction values.",
            "Endpoint needed"
          )}

        </div>
      `;

    } else if (key === "email-verification") {

      body.innerHTML = `
        <div class="callout">
          The exact 10-minute expiry, resend cooldown,
          attempt limits, duplicate-email prevention and
          purchase blocking must be validated in backend code.
          A static dashboard cannot enforce account security.
        </div>

        <div class="feature-grid">

          ${featureCard(
            "✉",
            "Verification delivery",
            "Email provider connection and delivery logs.",
            "Endpoint needed"
          )}

          ${featureCard(
            "◷",
            "Expiry and rate limits",
            "10-minute expiry, resend cooldown and attempt limits enforced server-side.",
            "Endpoint needed"
          )}

        </div>
      `;

    } else if (key === "boosting") {

      body.innerHTML = `
        <div class="callout">
          Social Boosting uses Nexa.
          Its service configuration, pricing rules, service list
          and order routes must remain separate from YoungPG
          Visual Numbers and Social Logs.
        </div>

        <div class="feature-grid">

          ${featureCard(
            "↗",
            "Nexa service catalog",
            "Read available Social Boosting categories, services, prices and status.",
            "Endpoint needed"
          )}

          ${featureCard(
            "⌘",
            "Nexa API connection",
            "Secure credentials, connection test and server-side order placement.",
            "Endpoint needed"
          )}

        </div>
      `;

    } else if (key === "support") {

      body.innerHTML = `
        <div class="callout">
          Announcements and support messages are not among
          the confirmed existing routes.
        </div>

        <div class="feature-grid">

          ${featureCard(
            "▤",
            "Announcements",
            "Create, publish, schedule and disable customer-facing announcements.",
            "Endpoint needed"
          )}

          ${featureCard(
            "☏",
            "Support inbox",
            "Read and respond to customer support requests with audit logging.",
            "Endpoint needed"
          )}

        </div>
      `;

    } else {

      body.innerHTML = `
        <div class="panel">
          <h3>Admin configuration</h3>

          <p class="muted">
            Use this section only after the Worker exposes
            the corresponding secure endpoints.
          </p>

          <div class="empty-state">
            <strong>Backend route required</strong>

            The static dashboard intentionally shows
            the feature without pretending that it is connected.
          </div>
        </div>
      `;
    }

    body
      .querySelectorAll('[data-action="requirements"]')
      .forEach(btn => {
        btn.addEventListener("click", () => {
          showToast(
            "This feature needs a secure Worker endpoint before it can operate.",
            true
          );
        });
      });
  }

  async function refreshOverview() {
    await checkHealth();

    try {
      const d = await api("/api/admin/summary");

      renderSummary(d);

    } catch (e) {
      if (e.status === 401) return;

      showToast(
        "Summary could not be loaded: " + e.message,
        true
      );
    }
  }

  function renderSummary(d) {
    const root = $("summaryCards");

    // Adapt to common response shapes without fabricating figures.
    const src = d?.summary || d?.data || d || {};

    const candidates = [
      [
        "Total customers",
        src.totalCustomers ??
        src.total_customers ??
        src.customers_count ??
        src.customers,
        "Registered customer count"
      ],

      [
        "Total orders",
        src.totalOrders ??
        src.total_orders ??
        src.orders_count ??
        src.orders,
        "All recorded orders"
      ],

      [
        "Transactions",
        src.totalTransactions ??
        src.total_transactions ??
        src.transactions_count ??
        src.transactions,
        "Recorded transactions"
      ]
    ];

    root.innerHTML = candidates.map(
      ([label, value, sub]) => {

        let display = "—";

        if (
          typeof value === "number" ||
          (
            typeof value === "string" &&
            value.trim() !== "" &&
            Number.isFinite(Number(value))
          )
        ) {
          display = pretty(Number(value));

        } else if (Array.isArray(value)) {
          display = pretty(value.length);

        } else if (
          value &&
          typeof value === "object" &&
          Number.isFinite(Number(value.count))
        ) {
          display = pretty(Number(value.count));
        }

        return `
          <div class="stat-card">
            <div class="stat-head">
              <span>${label}</span>
              <span class="stat-icon">
                ${
                  label === "Total customers"
                    ? "♙"
                    : label === "Total orders"
                      ? "▤"
                      : "↗"
                }
              </span>
            </div>

            <strong>${display}</strong>
            <small>${sub}</small>
          </div>
        `;
      }
    ).join("") + `
      <div class="stat-card">
        <div class="stat-head">
          <span>Platform status</span>
          <span class="stat-icon">✦</span>
        </div>

        <strong>Online</strong>
        <small>Staging Worker health endpoint connected</small>
      </div>
    `;
  }

  async function loadSettings() {
    const status = $("settingsStatus");

    if (status) {
      status.textContent = "Loading…";
    }

    try {
      const d = await api("/api/admin/settings");

      settingsCache = d;

      const area = $("settingsJson");

      if (area) {
        area.value = JSON.stringify(
          d?.settings ?? d?.data ?? d,
          null,
          2
        );
      }

      if (status) {
        status.textContent = "Loaded";
      }

      showToast("Settings loaded from the staging Worker.");

    } catch (e) {

      if (status) {
        status.textContent = "Failed";
      }

      showToast(
        "Could not load settings: " + e.message,
        true
      );
    }
  }

  async function saveSettings() {
    const area = $("settingsJson");

    if (!area) return;

    let payload;

    try {
      payload = JSON.parse(area.value);

    } catch {
      showToast(
        "The settings editor contains invalid JSON.",
        true
      );

      return;
    }

    const btn = $("saveSettingsBtn");

    btn.disabled = true;
    btn.textContent = "Saving…";

    try {
      const d = await api(
        "/api/admin/settings",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );

      settingsCache = d;

      $("settingsStatus").textContent = "Saved";

      showToast("Settings save request succeeded.");

    } catch (e) {

      showToast(
        "Settings were not saved: " + e.message,
        true
      );

    } finally {

      btn.disabled = false;
      btn.textContent = "Save settings";
    }
  }

  async function loadAudit() {
    const holder = $("auditTable");

    if (!holder) return;

    holder.innerHTML = `
      <div class="empty-state">
        Loading audit events…
      </div>
    `;

    try {
      const d = await api("/api/admin/audit");

      auditCache = d;

      const rows = Array.isArray(d)
        ? d
        : (
            d?.logs ||
            d?.audit ||
            d?.data ||
            []
          );

      if (!Array.isArray(rows) || !rows.length) {

        holder.innerHTML = `
          <div class="empty-state">
            <strong>No audit events returned</strong>

            The endpoint responded, but no log rows
            were found in the expected response shape.
          </div>
        `;

        return;
      }

      holder.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Administrator</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>

          <tbody>
            ${
              rows.map(r => `
                <tr>
                  <td>
                    ${escapeHtml(
                      r.created_at ||
                      r.createdAt ||
                      "—"
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      r.admin_email ||
                      r.admin_id ||
                      "—"
                    )}
                  </td>

                  <td>
                    ${escapeHtml(r.action || "—")}
                  </td>

                  <td>
                    ${escapeHtml(r.detail || "—")}
                  </td>
                </tr>
              `).join("")
            }
          </tbody>
        </table>
      `;

    } catch (e) {

      holder.innerHTML = `
        <div class="empty-state">
          <strong>Could not load audit events</strong>

          ${escapeHtml(e.message)}

          <br>

          Check that the staging Worker route supports
          the current session and response format.
        </div>
      `;
    }
  }

  // Navigation
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      openPage(btn.dataset.page);
    });
  });

  document.querySelectorAll("[data-goto]").forEach(btn => {
    btn.addEventListener("click", () => {
      openPage(btn.dataset.goto);
    });
  });

  // Admin login
  $("loginForm").addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();

      if (loginInProgress) return;

      loginInProgress = true;

      const form = event.currentTarget;

      const button = form.querySelector(
        "button[type=submit]"
      );

      const email = $("email").value.trim();
      const password = $("password").value;

      button.disabled = true;
      button.textContent = "Signing in…";

      $("loginError").textContent = "";

      try {
        clearLocalSession();

        const result = await login(email, password);

        if (
          result?.ok !== true ||
          typeof result?.token !== "string" ||
          !result.token.trim()
        ) {
          throw new Error(
            result?.error ||
            result?.message ||
            "Login failed: the server did not return a valid session token."
          );
        }

        authToken = result.token;

        sessionStorage.setItem(
          "speedy_admin_token",
          authToken
        );

        // Verify the newly saved token before showing the dashboard.
        const me = await api("/api/admin/me");

        if (
          me?.ok === false ||
          me?.success === false ||
          me?.authenticated === false
        ) {
          throw new Error(
            "The server could not verify this admin session. Please sign in again."
          );
        }

        showApp(
          me?.admin ||
          me?.user ||
          result.admin ||
          me
        );

        showToast("Signed in successfully.");

      } catch (e) {

        clearLocalSession();

        showLogin(
          e.message ||
          "Could not sign in. Check your details and try again."
        );

      } finally {

        $("password").value = "";

        button.disabled = false;

        button.innerHTML =
          'Sign in securely <span>→</span>';

        loginInProgress = false;
      }
    }
  );

  // Logout
  $("logoutBtn").addEventListener("click", logout);

  // Refresh button
  $("refreshBtn").addEventListener("click", () => {

    const active =
      document.querySelector(".nav-item.active")
        ?.dataset.page || "overview";

    if (active === "overview") {
      refreshOverview();

    } else if (active === "settings") {
      loadSettings();

    } else if (active === "activity") {
      loadAudit();

    } else {
      renderSection(active);
    }
  });

  // Mobile sidebar
  $("menuBtn").addEventListener("click", () => {
    $("sidebar").classList.toggle("open");
  });

  // Identify the staging API in the dashboard.
  $("apiShort").textContent = "speedy-ng-api-staging";

  // Initial checks.
  checkHealth();
  checkSession();

})();
