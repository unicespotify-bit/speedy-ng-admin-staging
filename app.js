(() => {
  "use strict";

  // STAGING ONLY. Do not change this to the production Worker.
  const API_BASE =
    "https://speedy-ng-api-staging.unicespotify.workers.dev";

  const $ = id => document.getElementById(id);

  const state = {
    token: sessionStorage.getItem("speedy_admin_token") || "",
    user: null,
    page: "overview",
    busy: false,
    customers: [],
    orders: [],
    deposits: [],
    announcements: [],
    editingAnnouncementId: null,
    pricing: [],
    providers: null,
    settings: {},
    customer: null
  };

  const PAGE_INFO = {
    overview: [
      "Overview",
      "YOUR BUSINESS AT A GLANCE",
      "Admin overview",
      "Monitor your Speedy staging platform."
    ],
    customers: [
      "Customers & Wallets",
      "CUSTOMER OPERATIONS",
      "Customers & Wallets",
      "Search customers, inspect NGN and USD balances, and manage wallet adjustments."
    ],
    visual: [
      "Visual Numbers",
      "PRODUCT CONTROLS",
      "Visual Numbers",
      "YoungPG Visual Numbers provider status."
    ],
    "social-logs": [
      "Social Logs",
      "PRODUCT CONTROLS",
      "Social Logs",
      "YoungPG Social Logs provider status."
    ],
    boosting: [
      "Social Boosting",
      "PRODUCT CONTROLS",
      "Social Boosting",
      "Nexa Social Boosting provider status."
    ],
    orders: [
      "Orders & Refunds",
      "ORDER OPERATIONS",
      "Orders & Refunds",
      "Monitor orders and provider cancellation/refund status."
    ],
    payments: [
      "Flutterwave Payments",
      "PAYMENT OPERATIONS",
      "Flutterwave Payments",
      "Review deposit records returned by the Worker."
    ],
    api: [
      "API Management",
      "INTEGRATIONS",
      "API Management",
      "View the configured provider connection status."
    ],
    pricing: [
      "Pricing & Markup",
      "REVENUE CONTROLS",
      "Pricing & Markup",
      "Manage the pricing rules supported by the Worker."
    ],
    exchange: [
      "Exchange Rate",
      "CURRENCY CONTROLS",
      "Exchange Rate",
      "Manage the NGN-to-USD exchange rate."
    ],
    "email-verification": [
      "Email Verification",
      "ACCOUNT SECURITY",
      "Email Verification",
      "Email verification security settings."
    ],
    support: [
      "Announcements & Support",
      "CUSTOMER COMMUNICATION",
      "Announcements & Support",
      "Support and announcement controls."
    ],
    settings: [
      "Admin Settings",
      "PLATFORM CONFIGURATION",
      "Admin Settings",
      "Read and update supported platform settings."
    ],
    activity: [
      "Activity Logs",
      "SECURITY & AUDIT",
      "Admin Activity Logs",
      "Review administrator activity records."
    ]
  };

  const escapeHtml = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  const money = (minor, currency = "NGN") => {
    const amount = Number(minor || 0) / 100;

    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = value => {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString("en-NG");
  };

  const number = value =>
    Number(value || 0).toLocaleString("en-NG");

  function toast(message, error = false) {
    const element = $("toast");

    if (!element) return;

    element.textContent = message;
    element.style.borderColor = error ? "#a33c58" : "#326094";
    element.style.background = error ? "#3a1d31" : "#102b4d";
    element.classList.add("show");

    clearTimeout(toast.timer);

    toast.timer = setTimeout(() => {
      element.classList.remove("show");
    }, 4000);
  }

  function clearSession() {
    state.token = "";
    state.user = null;

    sessionStorage.removeItem("speedy_admin_token");
  }

  async function api(path, options = {}) {
    const settings = { ...options };
    const requiresAuth = settings.auth !== false;

    delete settings.auth;

    const headers = {
      Accept: "application/json",
      ...(settings.headers || {})
    };

    delete settings.headers;

    if (settings.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (requiresAuth) {
      if (!state.token) {
        const error = new Error("Please sign in again.");
        error.status = 401;
        throw error;
      }

      headers.Authorization = `Bearer ${state.token}`;
    }

    let response;

    try {
      response = await fetch(API_BASE + path, {
        ...settings,
        headers,
        credentials: "omit"
      });
    } catch {
      throw new Error(
        "Unable to connect to the staging API. Check your internet connection."
      );
    }

    const raw = await response.text();

    let data = {};

    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(
          "The server returned an invalid response."
        );
      }
    }

    if (!response.ok) {
      const message =
        data.error ||
        data.message ||
        `Request failed. HTTP ${response.status}.`;

      const error = new Error(message);
      error.status = response.status;

      if (response.status === 401 && requiresAuth) {
        clearSession();
        showLogin("Your admin session has expired. Please sign in again.");
      }

      throw error;
    }

    return data;
  }

  function showLogin(message = "") {
    $("loginView").classList.remove("hidden");
    $("appView").classList.add("hidden");
    $("loginError").textContent = message;
  }

  function showApp(user = {}) {
    state.user = user;

    $("loginView").classList.add("hidden");
    $("appView").classList.remove("hidden");

    $("sessionUser").textContent =
      user.email || user.name || "Administrator";

    $("todayDate").textContent =
      new Intl.DateTimeFormat("en-NG", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
      }).format(new Date());

    $("year").textContent = new Date().getFullYear();

    openPage("overview");
  }

  function setHealth(connected, message) {
    $("healthDot").style.background =
      connected ? "var(--green)" : "var(--red)";

    $("healthText").textContent = message;

    $("workerStatus").className =
      "status " + (connected ? "good" : "bad");

    $("workerStatus").textContent =
      connected ? "Connected" : "Unavailable";
  }

  async function checkHealth() {
    try {
      await api("/api/health", { auth: false });

      setHealth(true, "Staging API connected");
      return true;
    } catch {
      setHealth(false, "Staging API unavailable");
      return false;
    }
  }

  async function login(email, password) {
    return api("/api/admin/login", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email, password })
    });
  }

  async function verifySession() {
    if (!state.token) {
      showLogin();
      return;
    }

    try {
      const result = await api("/api/admin/me");

      if (
        result.ok === false ||
        result.authenticated === false
      ) {
        throw new Error("Invalid administrator session.");
      }

      showApp(
        result.admin ||
        result.user ||
        result
      );
    } catch (error) {
      if (error.status !== 401) {
        showLogin(error.message);
      }
    }
  }

  async function logout() {
    try {
      if (state.token) {
        await api("/api/admin/logout", {
          method: "POST",
          body: JSON.stringify({})
        });
      }
    } catch {
      // Local logout still proceeds.
    }

    clearSession();
    showLogin();
    toast("You have signed out.");
  }

  function openPage(page) {
    if (!PAGE_INFO[page]) page = "overview";

    state.page = page;

    document.querySelectorAll(".nav-item").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.page === page
      );
    });

    $("pageTitle").textContent = PAGE_INFO[page][0];
    $("pageCrumb").textContent = PAGE_INFO[page][0];

    $("overviewPage").classList.toggle(
      "hidden",
      page !== "overview"
    );

    $("genericPage").classList.toggle(
      "hidden",
      page === "overview"
    );

    $("sidebar").classList.remove("open");

    if (page !== "overview") {
      renderPage(page);
    }

const loaders = {
      overview: loadOverview,
      customers: loadCustomers,
      orders: loadOrders,
      payments: loadPaymentsPage,
      api: loadApiPage,
      visual: loadProviders,
      "social-logs": loadProviders,
      boosting: loadProviders,
      pricing: loadPricing,
      exchange: loadSettings,
      settings: loadSettings,
      "email-verification": loadEmailVerification,
      activity: loadAudit,
      support: loadAnnouncements
    };

    if (loaders[page]) {
      loaders[page]();
    }
  }

  function pageHeader(page, badge = "Connected") {
    const info = PAGE_INFO[page];

    $("sectionEyebrow").textContent = info[1];
    $("sectionHeading").textContent = info[2];
    $("sectionDescription").textContent = info[3];

    $("sectionBadge").className = "status neutral";
    $("sectionBadge").textContent = badge;
  }

  function panel(title, description, content) {
    return `
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>${escapeHtml(title)}</h3>
            <p class="muted">${escapeHtml(description)}</p>
          </div>
        </div>
        ${content}
      </div>
    `;
  }

  function statusBadge(value) {
    const text = String(value || "unknown");
    const lower = text.toLowerCase();

    let type = "neutral";

    if (
      lower.includes("active") ||
      lower.includes("success") ||
      lower.includes("connected") ||
      lower.includes("completed") ||
      lower.includes("online") ||
      lower === "true"
    ) {
      type = "good";
    } else if (
      lower.includes("fail") ||
      lower.includes("error") ||
      lower.includes("offline") ||
      lower.includes("disconnected")
    ) {
      type = "bad";
    } else if (
      lower.includes("pending") ||
      lower.includes("processing") ||
      lower.includes("review")
    ) {
      type = "pending";
    }

    return `<span class="status ${type}">${escapeHtml(text)}</span>`;
  }

  function renderPage(page) {
    pageHeader(page);

    const body = $("sectionBody");

    const renderers = {
      customers: renderCustomers,
      orders: renderOrders,
      payments: renderPayments,
      api: renderApi,
      visual: renderProviderProduct,
      "social-logs": renderProviderProduct,
      boosting: renderProviderProduct,
      pricing: renderPricing,
      exchange: renderExchange,
      settings: renderSettings,
      activity: renderActivity,
      "email-verification": renderEmailVerification,
      support: renderSupport
    };

    body.innerHTML = renderers[page]
      ? renderers[page]()
      : `<div class="panel">Section unavailable.</div>`;

    attachPageEvents(page);
  }

  function renderEmailVerification() {
    return `
      <div id="emailVerificationPanel">
        <div class="panel">
          Loading email verification settings…
        </div>
      </div>
    `;
  }

  async function loadAnnouncements() {
    try {
      const result = await api("/api/admin/announcements");
      state.announcements = result.announcements || [];
      renderPage("support");
    } catch (error) {
      toast(error.message, true);
    }
  }

  function renderSupport() {
    const announcements = state.announcements || [];

    return `
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Announcements & Support</h3>
            <p class="muted">
              Create and manage announcements for customers.
            </p>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label for="announcementTitle">Announcement title</label>
            <input
              id="announcementTitle"
              maxlength="120"
              placeholder="Enter announcement title"
            >
          </div>

          <div class="form-group">
            <label for="announcementType">Announcement type</label>
            <select id="announcementType">
              <option value="info">Information</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="important">Important</option>
            </select>
          </div>

          <div class="form-group">
            <label for="announcementMessage">Message</label>
            <textarea
              id="announcementMessage"
              maxlength="5000"
              rows="5"
              placeholder="Write your announcement"
            ></textarea>
          </div>
        </div>

        <button class="btn btn-primary" id="createAnnouncementBtn">
          Publish announcement
        </button>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Existing announcements</h3>
            <p class="muted">
              ${announcements.length} announcement(s)
            </p>
          </div>
          <button class="btn" id="reloadAnnouncementsBtn">
            Refresh
          </button>
        </div>

        ${
          announcements.length
            ? announcements.map(item => `
              <div class="activity-item">
                <div>
                  <strong>${escapeHtml(item.title)}</strong>
                  <p>${escapeHtml(item.message)}</p>
                  <small>${escapeHtml(item.type)} · ${formatDate(item.created_at)}</small>
                </div>
                ${statusBadge(
                  Number(item.is_active) === 1 ? "Active" : "Inactive"
                )}
              </div>
            `).join("")
            : `<div class="empty-state">No announcements have been created yet.</div>`
        }
      </div>
    `;
  }

  // OVERVIEW

  async function loadOverview() {
    await checkHealth();

    try {
      const result = await api("/api/admin/summary");
      const source = result.summary || result.data || result;

      const cards = [
        [
          "Total customers",
          source.totalCustomers ??
          source.total_customers ??
          source.customers_count ??
          "—"
        ],
        [
          "Total orders",
          source.totalOrders ??
          source.total_orders ??
          source.orders_count ??
          "—"
        ],
        [
          "Transactions",
          source.totalTransactions ??
          source.total_transactions ??
          source.transactions_count ??
          "—"
        ]
      ];

      $("summaryCards").innerHTML =
        cards.map(([label, value]) => `
          <div class="stat-card">
            <div class="stat-head">
              <span>${escapeHtml(label)}</span>
            </div>
            <strong>${escapeHtml(
              typeof value === "number" ? number(value) : value
            )}</strong>
            <small>Staging Worker report</small>
          </div>
        `).join("") + `
          <div class="stat-card">
            <div class="stat-head">
              <span>Platform status</span>
            </div>
            <strong>Online</strong>
            <small>Staging API health check succeeded</small>
          </div>
        `;
    } catch (error) {
      if (error.status !== 401) {
        toast("Could not load overview: " + error.message, true);
      }
    }
  }

  // CUSTOMERS AND WALLETS

  function renderCustomers() {
    return `
      ${panel(
        "Customer search",
        "Search using the customer email or ID.",
        `
          <div class="field">
            <label for="customerSearch">Email or customer ID</label>
            <input id="customerSearch"
              placeholder="Enter email or customer ID">
          </div>

          <div class="form-actions">
            <button class="primary" id="searchCustomersBtn">
              Search customers
            </button>
          </div>

          <div id="customerResults" class="table-wrap">
            <div class="empty-state">Search for a customer to begin.</div>
          </div>
        `
      )}

      <div id="customerWalletPanel"></div>
    `;
  }

  async function loadCustomers() {
    const holder = $("customerResults");
    if (!holder) return;

    holder.innerHTML =
      `<div class="empty-state">Loading customers…</div>`;

    try {
      const query = $("customerSearch")?.value.trim() || "";

      const result = await api(
        "/api/admin/customers?q=" + encodeURIComponent(query)
      );

      state.customers = result.customers || [];

      if (!state.customers.length) {
        holder.innerHTML =
          `<div class="empty-state">No customers found.</div>`;
        return;
      }

      holder.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Verification</th>
              <th>Status</th>
              <th>NGN wallet</th>
              <th>USD wallet</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${state.customers.map(customer => {
              const wallets = customer.wallets || [];

              const ngn = wallets.find(
                wallet => wallet.currency === "NGN"
              );

              const usd = wallets.find(
                wallet => wallet.currency === "USD"
              );

              return `
                <tr>
                  <td>${escapeHtml(customer.email)}</td>
                  <td>${Number(customer.email_verified) === 1
                    ? statusBadge("Verified")
                    : statusBadge("Unverified")}</td>
                  <td>${statusBadge(customer.status || "active")}</td>
                  <td>${money(ngn?.balance_minor, "NGN")}</td>
                  <td>${money(usd?.balance_minor, "USD")}</td>
                  <td>
                    <button class="secondary"
                      data-customer-id="${escapeHtml(customer.id)}">
                      Manage
                    </button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;

      holder.querySelectorAll("[data-customer-id]").forEach(button => {
        button.addEventListener("click", () => {
          openCustomer(button.dataset.customerId);
        });
      });

    } catch (error) {
      holder.innerHTML =
        `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  async function openCustomer(id) {
    const holder = $("customerWalletPanel");

    holder.innerHTML =
      `<div class="panel">Loading wallet details…</div>`;

    try {
      const result = await api(
        "/api/admin/customers/" + encodeURIComponent(id) + "/wallets"
      );

      state.customer = result.customer || { id };
      const wallets = result.wallets || [];

      holder.innerHTML = panel(
        "Customer wallet management",
        state.customer.email || id,
        `
          <div class="field-grid">
            ${wallets.map(wallet => `
              <div class="stat-card">
                <div class="stat-head">
                  <span>${escapeHtml(wallet.currency)} wallet</span>
                </div>
                <strong>${money(
                  wallet.balance_minor,
                  wallet.currency
                )}</strong>
              </div>
            `).join("")}
          </div>

          <h3>Wallet adjustment</h3>

          <div class="field-grid">
            <div class="field">
              <label for="walletCurrency">Currency</label>
              <select id="walletCurrency">
                <option value="NGN">NGN</option>
                <option value="USD">USD</option>
              </select>
            </div>

            <div class="field">
              <label for="walletAction">Action</label>
              <select id="walletAction">
                <option value="add">Credit wallet</option>
                <option value="redeem">Debit wallet</option>
              </select>
            </div>

            <div class="field">
              <label for="walletAmount">Amount</label>
              <input id="walletAmount" type="number"
                min="0.01" step="0.01" placeholder="0.00">
            </div>
          </div>

          <div class="field">
            <label for="walletNote">Reason for adjustment</label>
            <input id="walletNote"
              maxlength="250"
              placeholder="Explain why this adjustment is required">
          </div>

          <button class="primary" id="adjustWalletBtn">
            Submit wallet adjustment
          </button>

          <p class="muted">
            All adjustments are sent to the Worker and must be
            recorded in the transaction and audit history.
            NGN uses kobo; USD uses cents.
          </p>
        `
      );

      $("adjustWalletBtn").onclick = () => adjustWallet(id);

    } catch (error) {
      holder.innerHTML =
        `<div class="panel">${escapeHtml(error.message)}</div>`;
    }
  }

  async function adjustWallet(customerId) {
    const currency = $("walletCurrency").value;
    const action = $("walletAction").value;
    const amount = Number($("walletAmount").value);
    const note = $("walletNote").value.trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      toast("Enter a valid amount.", true);
      return;
    }

    if (!note) {
      toast("Enter a reason for this wallet adjustment.", true);
      return;
    }

    if (!confirm(
      `${action === "add" ? "Credit" : "Debit"} ${currency} ${amount.toFixed(2)}?`
    )) return;

    const button = $("adjustWalletBtn");
    button.disabled = true;
    button.textContent = "Processing…";

    try {
      await api("/api/admin/wallet/adjust", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          currency,
          action,
          amount_minor: Math.round(amount * 100),
          note
        })
      });

      toast("Wallet adjustment submitted successfully.");

      await openCustomer(customerId);
      await loadCustomers();

    } catch (error) {
      toast("Wallet adjustment failed: " + error.message, true);
    } finally {
      if ($("adjustWalletBtn")) {
        $("adjustWalletBtn").disabled = false;
        $("adjustWalletBtn").textContent =
          "Submit wallet adjustment";
      }
    }
  }

  // ORDERS

  function renderOrders() {
    return panel(
      "Order management",
      "Search and filter orders from the staging Worker.",
      `
        <div class="field-grid">
          <div class="field">
            <label for="orderCategory">Product</label>
            <select id="orderCategory">
              <option value="">All products</option>
              <option value="visual_numbers">Visual Numbers</option>
              <option value="social_logs">Social Logs</option>
              <option value="social_boosting">Social Boosting</option>
            </select>
          </div>

          <div class="field">
            <label for="orderStatus">Status</label>
            <select id="orderStatus">
              <option value="">All statuses</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="review">Review</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          <div class="field">
            <label for="orderSearch">Search</label>
            <input id="orderSearch"
              placeholder="Order ID, email or service">
          </div>
        </div>

        <button class="primary" id="searchOrdersBtn">
          Load orders
        </button>

        <div id="ordersTable" class="table-wrap">
          <div class="empty-state">Loading orders…</div>
        </div>
      `
    );
  }

  async function loadOrders() {
    const holder = $("ordersTable");
    if (!holder) return;

    holder.innerHTML =
      `<div class="empty-state">Loading orders…</div>`;

    try {
      const params = new URLSearchParams();

      const category = $("orderCategory")?.value || "";
      const status = $("orderStatus")?.value || "";
      const query = $("orderSearch")?.value.trim() || "";

      if (category) params.set("category", category);
      if (status) params.set("status", status);
      if (query) params.set("q", query);

      params.set("limit", "100");

      const result = await api(
        "/api/admin/orders?" + params.toString()
      );

      state.orders = result.orders || [];

      if (!state.orders.length) {
        holder.innerHTML =
          `<div class="empty-state">No orders found.</div>`;
        return;
      }

      holder.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Created</th>
              <th>Customer</th>
              <th>Product</th>
              <th>Service</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Provider status</th>
              <th>Refund confirmed</th>
            </tr>
          </thead>
          <tbody>
            ${state.orders.map(order => `
              <tr>
                <td>${escapeHtml(formatDate(order.created_at))}</td>
                <td>${escapeHtml(order.customer_email || order.customer_id)}</td>
                <td>${escapeHtml(order.category)}</td>
                <td>${escapeHtml(order.service || "—")}</td>
                <td>${money(order.amount_minor, order.currency || "USD")}</td>
                <td>${statusBadge(order.status)}</td>
                <td>${statusBadge(order.provider_status || "unknown")}</td>
                <td>${order.provider_refund_confirmed
                  ? statusBadge("Confirmed")
                  : statusBadge("Not confirmed")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;

    } catch (error) {
      holder.innerHTML =
        `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  // DEPOSITS

  function renderPayments() {
    return `
      <div id="integrationStatusPanel">
        <div class="panel">Checking payment gateway connection…</div>
      </div>

      ${panel(
        "Customer deposits",
        "Deposit records returned by the staging Worker.",
        `
          <button class="secondary" id="reloadDepositsBtn">
            Refresh deposits
          </button>

          <div id="depositsTable" class="table-wrap">
            <div class="empty-state">Loading deposits…</div>
          </div>

          <div class="callout">
            Payment verification and wallet credit must be
            confirmed by the backend.
          </div>
        `
      )}
    `;
  }

  async function loadDeposits() {
    const holder = $("depositsTable");
    if (!holder) return;

    holder.innerHTML =
      `<div class="empty-state">Loading deposits…</div>`;

    try {
      const result = await api("/api/admin/wallet/deposits");
      state.deposits = result.deposits || [];

      if (!state.deposits.length) {
        holder.innerHTML =
          `<div class="empty-state">No deposit records returned.</div>`;
        return;
      }

      holder.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Reference</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${state.deposits.map(item => `
              <tr>
                <td>${escapeHtml(formatDate(item.created_at))}</td>
                <td>${escapeHtml(item.customer_email || item.customer_id || "—")}</td>
                <td>${escapeHtml(item.reference || item.tx_ref || "—")}</td>
                <td>${money(item.amount_minor, item.currency || "NGN")}</td>
                <td>${statusBadge(item.status || "unknown")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    } catch (error) {
      holder.innerHTML =
        `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  }
// INTEGRATION STATUS AND TESTS

  async function loadIntegrationStatus() {
    const holder = $("integrationStatusPanel");
    if (!holder) return;

    holder.innerHTML =
      `<div class="panel">Checking integrations…</div>`;

    try {
      const result = await api("/api/admin/integrations/status");
      const items = result.integrations || {};
      const fw = items.flutterwave || {};
      const email = items.email || {};

      holder.innerHTML = `
        ${panel(
          "Flutterwave V4",
          "Payment gateway connection status.",
          `
            <p>
              Status:
              ${statusBadge(
                fw.configured ? "Configured" : "Missing configuration"
              )}
            </p>

            <p>
              Environment:
              ${escapeHtml(fw.environment || "unknown")}
            </p>

            <button class="primary" id="testFlutterwaveBtn">
              Test Flutterwave connection
            </button>

            <div id="flutterwaveTestResult"></div>
          `
        )}

        ${panel(
          "Email delivery — Resend",
          "Email delivery configuration status.",
          `
            <p>
              Status:
              ${statusBadge(
                email.configured ? "Configured" : "Missing configuration"
              )}
            </p>

            <p>
              Sender:
              ${escapeHtml(email.sender || "Not configured")}
            </p>

            <button class="secondary" id="testEmailConnectionBtn">
              Test email connection
            </button>

            <div id="emailTestResult"></div>
          `
        )}
      `;

      $("testFlutterwaveBtn").onclick = () =>
        testIntegration("flutterwave", "flutterwaveTestResult");

      $("testEmailConnectionBtn").onclick = () =>
        testIntegration("email", "emailTestResult");

    } catch (error) {
      holder.innerHTML =
        `<div class="callout">${escapeHtml(error.message)}</div>`;
    }
  }

  async function testIntegration(service, resultId) {
    const holder = $(resultId);
    if (!holder) return;

    holder.textContent = "Testing connection…";

    try {
      const result = await api(
        "/api/admin/integrations/test",
        {
          method: "POST",
          body: JSON.stringify({ service })
        }
      );

      holder.innerHTML = `
        <div class="callout">
          ${statusBadge(result.status || "unknown")}
          ${escapeHtml(result.message || "Connection test completed.")}
        </div>
      `;

    } catch (error) {
      holder.innerHTML =
        `<div class="callout">${escapeHtml(error.message)}</div>`;
    }
  }

  async function loadPaymentsPage() {
    await Promise.all([
      loadIntegrationStatus(),
      loadDeposits()
    ]);
  }

  async function loadApiPage() {
    await Promise.all([
      loadIntegrationStatus(),
      loadProviders()
    ]);
  }

  async function loadEmailVerification() {
    const holder = $("emailVerificationPanel");
    if (!holder) return;

    holder.innerHTML =
      `<div class="panel">Checking email configuration…</div>`;

    try {
      const result = await api("/api/admin/integrations/status");
      const email = result.integrations?.email || {};

      holder.innerHTML = panel(
        "Customer email verification",
        "Automated email verification configuration.",
        `
          <p>
            Email delivery:
            ${statusBadge(
              email.configured ? "Configured" : "Not configured"
            )}
          </p>

          <p>
            Sender address:
            ${escapeHtml(email.sender || "Not configured")}
          </p>

          <p>Verification code validity: <strong>10 minutes</strong></p>
          <p>Resend cooldown: <strong>60 seconds</strong></p>
          <p>Maximum resend requests: <strong>5 per hour</strong></p>

          <button class="secondary" id="testVerificationEmailBtn">
            Test email connection
          </button>

          <div id="verificationEmailTestResult"></div>
        `
      );

      $("testVerificationEmailBtn").onclick = () =>
        testIntegration("email", "verificationEmailTestResult");

    } catch (error) {
      holder.innerHTML =
        `<div class="callout">${escapeHtml(error.message)}</div>`;
    }
  }
  // PROVIDERS

  function renderApi() {
    return `
      <div id="integrationStatusPanel">
        <div class="panel">Checking integrations…</div>
      </div>

      <div class="callout">
        YoungPG handles Visual Numbers and Social Logs.
        Nexa handles Official Numbers and Social Boosting.
        Nexa is not used for Social Logs.
      </div>

      <div id="providerStatusPanel">
        <div class="panel">Loading provider status…</div>
      </div>
    `;
  }

  function renderProviderProduct() {
    const page = state.page;

    const description = {
      visual: "YoungPG — Visual Numbers",
      "social-logs": "YoungPG — Social Logs",
      boosting: "Nexa — Social Boosting"
    }[page];

    return `
      <div class="callout">
        ${escapeHtml(description)}.
        This page displays provider status only. It does not
        invent a service catalogue or modify provider credentials.
      </div>

      <div id="providerStatusPanel">
        <div class="panel">Loading provider status…</div>
      </div>
    `;
  }

  async function loadProviders() {
    const holder = $("providerStatusPanel");
    if (!holder) return;

    holder.innerHTML =
      `<div class="panel">Loading provider status...</div>`;

    try {
      const result = await api("/api/admin/providers/status");
      state.providers = result.providers || {};

      const young = state.providers.youngpg || {};
      const nexa = state.providers.nexar || {};

      const rows = [
        ["YoungPG — Visual Numbers", young.visualNumbers],
        ["YoungPG — Social Logs", young.socialLogs],
        ["Nexa — Official Numbers", nexa.officialNumbers],
        ["Nexa — Social Boosting", nexa.socialBoosting]
      ];

      holder.innerHTML = panel(
        "Provider connection status",
        "Connection information reported by the staging API.",
        `
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Provider / Product</th>
                  <th>Status</th>
                  <th>Last Test Result</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(([label, item]) => {
                  const status =
                    item?.verification_status ||
                    item?.status ||
                    "not_configured";

                  const details =
                    item?.last_test_message ||
                    item?.message ||
                    item?.note ||
                    "No connection test recorded.";

                  return `
                    <tr>
                      <td>${escapeHtml(label)}</td>
                      <td>${statusBadge(status)}</td>
                      <td>${escapeHtml(details)}</td>
                      <td>
  ${label.includes("YoungPG — Visual Numbers") ||
    label.includes("YoungPG — Social Logs")
      ? `<button class="secondary provider-test-btn"
          data-product="${label.includes("Visual Numbers")
            ? "visual_numbers"
            : "social_logs"}">
          Test Connection
        </button>`
      : "—"}
</td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>

          <button class="secondary" id="refreshProviderStatusBtn">
            Refresh Provider Status
          </button>
        `
      );

      const refresh = $("refreshProviderStatusBtn");
      if (refresh) refresh.onclick = loadProviders;
holder.querySelectorAll(".provider-test-btn").forEach(button => {
  button.onclick = () => {
    testProviderConnection(button.dataset.product, button);
  };
});
    } catch (error) {
      holder.innerHTML =
        `<div class="panel">${escapeHtml(error.message)}</div>`;
    }
  }
async function testProviderConnection(product, button) {
    if (!["visual_numbers", "social_logs"].includes(product)) {
      toast("Unsupported provider test.", true);
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "Testing...";
    }

    try {
      const result = await api("/api/admin/providers/test", {
        method: "POST",
        body: JSON.stringify({ product })
      });

      toast(result.message || "Connection successful.");
      await loadProviders();

    } catch (error) {
      toast(error.message || "Connection test failed.", true);
      await loadProviders();

    } finally {
      if (button) button.disabled = false;
    }
}
  // PRICING

  function renderPricing() {
  return `
    ${panel(
      "Global Markup Prices",
      "Set a separate default markup for each product.",
      `
        <div class="field-grid">

          <div class="panel">
            <h3>Visual Numbers — YoungPG</h3>
            <div class="field">
              <label for="globalVisualType">Markup type</label>
              <select id="globalVisualType">
                <option value="percent">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </div>
            <div class="field">
              <label for="globalVisualValue">Markup value</label>
              <input id="globalVisualValue" type="number"
                min="0" step="0.01" placeholder="0">
            </div>
            <button class="primary" id="saveGlobalVisual">
              Save Visual Numbers Markup
            </button>
          </div>

          <div class="panel">
            <h3>Social Logs — YoungPG</h3>
            <div class="field">
              <label for="globalLogsType">Markup type</label>
              <select id="globalLogsType">
                <option value="percent">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </div>
            <div class="field">
              <label for="globalLogsValue">Markup value</label>
              <input id="globalLogsValue" type="number"
                min="0" step="0.01" placeholder="0">
            </div>
            <button class="primary" id="saveGlobalLogs">
              Save Social Logs Markup
            </button>
          </div>

          <div class="panel">
            <h3>Social Boosting — Nexar</h3>
            <div class="field">
              <label for="globalBoostType">Markup type</label>
              <select id="globalBoostType">
                <option value="percent">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </div>
            <div class="field">
              <label for="globalBoostValue">Markup value</label>
              <input id="globalBoostValue" type="number"
                min="0" step="0.01" placeholder="0">
            </div>
            <button class="primary" id="saveGlobalBoost">
              Save Social Boosting Markup
            </button>
            <p class="muted">
              This setting is prepared for when Nexar API access is configured.
            </p>
          </div>

        </div>
      `
    )}

    ${panel(
      
      "Live Provider Catalogues",
      "Load the latest available products directly from connected APIs.",
      `
        <div class="field-grid">
          <div class="field">
            <label for="liveCatalogueProduct">Product</label>
            <select id="liveCatalogueProduct">
              <option value="visual_numbers">Visual Numbers — YoungPG</option>
              <option value="social_logs">Social Logs — YoungPG</option>
              <option value="social_boosting">Social Boosting — Nexar</option>
            </select>
          </div>
        </div>

        <div id="liveCatalogueControls"></div>

        <button class="primary" id="loadLiveCatalogueBtn">
          Load Live Catalogue
        </button>

        <div id="liveCatalogueResults" class="table-wrap">
          <div class="empty-state">
            Select a product and load its latest catalogue.
          </div>
        </div>
      `
    )}
    ${panel(
      "Pricing rules",
      "Search existing rules and add supported markup rules.",
      `
        <div class="field-grid">
          <div class="field">
            <label for="pricingSearch">Search country or service</label>
            <input id="pricingSearch"
              placeholder="Country, service or provider">
          </div>

          <div class="field">
            <label for="pricingProductFilter">Product</label>
            <select id="pricingProductFilter">
              <option value="">All products</option>
              <option value="visual_numbers">Visual Numbers</option>
              <option value="social_logs">Social Logs</option>
              <option value="social_boosting">Social Boosting</option>
            </select>
          </div>
        </div>

        <button class="secondary" id="reloadPricingBtn">
          Refresh pricing rules
        </button>

        <div id="pricingTable" class="table-wrap">
          <div class="empty-state">Loading pricing rules…</div>
        </div>

        <hr>

        <h3>Add or update a pricing rule</h3>

        <div class="field-grid">
          <div class="field">
            <label for="ruleProvider">Provider</label>
            <select id="ruleProvider">
              <option value="youngpg_virtual">YoungPG Visual Numbers</option>
              <option value="youngpg_media">YoungPG Social Logs</option>
              <option value="nexar">Nexar</option>
              <option value="*">All providers</option>
            </select>
          </div>

          <div class="field">
            <label for="ruleProduct">Product</label>
            <select id="ruleProduct">
              <option value="visual_numbers">Visual Numbers</option>
              <option value="social_logs">Social Logs</option>
              <option value="social_boosting">Social Boosting</option>
              <option value="*">All products</option>
            </select>
          </div>

          <div class="field">
  <label for="ruleCountry">Search and select country</label>
  <input id="ruleCountrySearch" type="search"
    placeholder="Type a country name, e.g. CAN">
  <select id="ruleCountry">
    <option value="*">All countries (*)</option>
  </select>
  <small class="muted" id="ruleCountryStatus">
    Country options will load from the provider catalogue.
  </small>
</div>

          <div class="field">
            <label for="ruleService">Service</label>
            <input id="ruleService" value="*"
              placeholder="* or service">
          </div>

          <div class="field">
            <label for="ruleType">Markup type</label>
            <select id="ruleType">
              <option value="percent">Percentage</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </div>

          <div class="field">
            <label for="ruleValue">Markup value</label>
            <input id="ruleValue" type="number"
              min="0" step="0.01" placeholder="0">
          </div>
        </div>

        <button class="primary" id="savePricingRuleBtn">
          Save pricing rule
        </button>

        <p class="muted">
          Saving an existing provider/product/country/service
          combination updates that rule. The Worker controls
          the actual customer checkout price.
        </p>
      `
    )}
  `;
  }
  // LIVE PROVIDER CATALOGUES

function catalogueArray(value) {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (Array.isArray(value)) return value;

  if (value && typeof value === "object") {
    for (const key of [
      "data",
      "items",
      "results",
      "countries",
      "services",
      "categories",
      "listings"
    ]) {
      if (value[key] !== undefined) {
        const result = catalogueArray(value[key]);
        if (result.length) return result;
      }
    }

    return Object.entries(value).map(([id, item]) => {
      if (item && typeof item === "object") {
        return { id, ...item };
      }

      return { id, name: String(item) };
    });
  }

  return [];
}

function catalogueLabel(item) {
  if (typeof item === "string") return item;

  return String(
    item.name ||
    item.eng ||
    item.country_name ||
    item.countryName ||
    item.country ||
    item.title ||
    item.service ||
    item.category_name ||
    item.id ||
    "Unnamed item"
  ).trim();
}

async function loadLiveCatalogue() {
  const product = $("liveCatalogueProduct")?.value;
  const holder = $("liveCatalogueResults");
  const controls = $("liveCatalogueControls");

  if (!holder) return;

  if (product === "social_boosting") {
    holder.innerHTML =
      `<div class="empty-state">Nexar API is not configured yet. Live Social Boosting catalogue is unavailable.</div>`;
    return;
  }

  holder.innerHTML =
    `<div class="empty-state">Loading the latest catalogue…</div>`;

  try {
    if (product === "visual_numbers") {
      const countrySelect = $("liveCatalogueCountry");
      const country = countrySelect?.value || "";
      const countryName =
        countrySelect?.selectedOptions?.[0]?.textContent?.trim() || "";
      const service = $("liveCatalogueService")?.value || "";

      if (!country || !service || !countryName) {
        holder.innerHTML =
          `<div class="empty-state">Select a country and service first.</div>`;
        return;
      }

      const result = await api(
        `/api/admin/catalogue/visual-numbers/prices?country=${encodeURIComponent(country)}&country_name=${encodeURIComponent(countryName)}&service=${encodeURIComponent(service)}`
      );

      const inventory = result.inventory;

      if (!inventory) {
        holder.innerHTML =
          `<div class="empty-state">No verified inventory information was returned. Please try again.</div>`;
        return;
      }

      const stock = inventory.available === null
        ? "Not provided by provider"
        : Number(inventory.available).toLocaleString();

      holder.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card">
            <span>Available Numbers</span>
            <strong>${escapeHtml(stock)}</strong>
          </div>

          <div class="stat-card">
            <span>Provider Price (NGN)</span>
            <strong>₦${escapeHtml(Number(inventory.provider_price_ngn).toLocaleString())}</strong>
          </div>

          <div class="stat-card">
            <span>Provider Price (USD)</span>
            <strong>$${escapeHtml(Number(inventory.provider_price_usd).toFixed(4))}</strong>
          </div>

          <div class="stat-card">
            <span>Customer Price (USD)</span>
            <strong>$${escapeHtml(Number(inventory.customer_price_usd).toFixed(2))}</strong>
          </div>
        </div>

        <div class="empty-state">
          Exchange rate: ₦${escapeHtml(Number(inventory.exchange_rate_ngn_per_usd).toLocaleString())} = $1
          <br>
          Country: ${escapeHtml(country)}
          <br>
          Service: ${escapeHtml(service)}
        </div>
      `;

      return;
    }

    if (product === "social_logs") {
      const search = $("liveCatalogueSearch")?.value || "";
      const category = $("liveCatalogueCategory")?.value || "";

      const params = new URLSearchParams({
        search,
        category_id: category,
        page: "1",
        per_page: "50"
      });

      const result = await api(
        `/api/admin/catalogue/social-logs/listings?${params.toString()}`
      );

      const listings = catalogueArray(result.listings);

      if (!listings.length) {
        holder.innerHTML =
          `<div class="empty-state">No Social Logs listings were returned.</div>`;
        return;
      }

      holder.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Listing</th>
              <th>Category</th>
              <th>Price</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            ${listings.map(item => `
              <tr>
                <td>${escapeHtml(catalogueLabel(item))}</td>
                <td>${escapeHtml(String(
  item.category_name ||
  (item.category && typeof item.category === "object"
    ? catalogueLabel(item.category)
    : item.category) ||
  "—"
))}</td>
                <td>${escapeHtml(String(item.price_ngn ?? item.price ?? item.amount ?? "—"))}</td>
                <td>${escapeHtml(String(item.available_stock ?? item.stock ?? item.quantity ?? item.available ?? "—"))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    }
  } catch (error) {
    holder.innerHTML =
      `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}
async function prepareLiveCatalogue() {
  const product = $("liveCatalogueProduct")?.value;
  const controls = $("liveCatalogueControls");
  const holder = $("liveCatalogueResults");

  if (!controls || !holder) return;

  holder.innerHTML =
    `<div class="empty-state">Choose your catalogue options and load the catalogue.</div>`;

  if (product === "social_boosting") {
    controls.innerHTML =
      `<p class="muted">Nexar API is not configured. Social Boosting will be available after API credentials are added.</p>`;
    return;
  }

  if (product === "visual_numbers") {
    controls.innerHTML = `
      <div class="field-grid">
        <div class="field">
          <label for="liveCatalogueCountrySearch">Search country</label>
          <input id="liveCatalogueCountrySearch" type="search"
            placeholder="Type a country name...">

          <label for="liveCatalogueCountry">Country</label>
          <select id="liveCatalogueCountry">
            <option value="">Loading countries...</option>
          </select>
        </div>

        <div class="field">
          <label for="liveCatalogueServiceSearch">Search service</label>
          <input id="liveCatalogueServiceSearch" type="search"
            placeholder="Type a service name...">

          <label for="liveCatalogueService">Service</label>
          <select id="liveCatalogueService">
            <option value="">Loading services...</option>
          </select>
        </div>
      </div>

      <p id="liveCatalogueOptionsStatus" class="muted">
        Loading YoungPG options...
      </p>

      <details style="margin-top:16px;">
        <summary style="cursor:pointer;color:#8ebcff;">
          YoungPG response diagnostics
        </summary>
        <pre id="liveCatalogueDiagnostic"
          style="white-space:pre-wrap;overflow-wrap:anywhere;
          max-height:350px;overflow:auto;padding:12px;
          background:#081a30;border-radius:8px;
          font-size:12px;">Waiting for YoungPG response...</pre>
      </details>
    `;

    const filterCatalogueSelect = (searchId, selectId) => {
      $(searchId).addEventListener("input", event => {
        const query = event.target.value.toLowerCase().trim();

        Array.from($(selectId).options).forEach((option, index) => {
          if (index === 0) return;

          option.hidden = !option.textContent
            .toLowerCase()
            .includes(query);
        });
      });
    };

    filterCatalogueSelect(
      "liveCatalogueCountrySearch",
      "liveCatalogueCountry"
    );

    filterCatalogueSelect(
      "liveCatalogueServiceSearch",
      "liveCatalogueService"
    );
try {
      const catalogueRequest = Promise.all([
        api("/api/admin/catalogue/visual-numbers/countries"),
        api("/api/admin/catalogue/visual-numbers/services")
      ]);

      let catalogueTimer;

      const [countryResult, serviceResult] = await Promise.race([
        catalogueRequest,
        new Promise((_, reject) => {
          catalogueTimer = setTimeout(
            () => reject(new Error(
              "The staging API did not finish loading YoungPG options within 20 seconds. Check the staging Worker deployment and logs."
            )),
            20000
          );
        })
      ]).finally(() => clearTimeout(catalogueTimer));

      const diagnosticSample = value => {
        if (Array.isArray(value)) return value.slice(0, 5);
        if (value && typeof value === "object") {
          return Object.fromEntries(
            Object.entries(value).slice(0, 5)
          );
        }
        return value;
      };

      $("liveCatalogueDiagnostic").textContent =
        JSON.stringify({
          countryResponseSample: diagnosticSample(countryResult.countries),
          serviceResponseSample: diagnosticSample(serviceResult.services),
          countryResponseType: Array.isArray(countryResult.countries)
            ? "array"
            : typeof countryResult.countries,
          serviceResponseType: Array.isArray(serviceResult.services)
            ? "array"
            : typeof serviceResult.services
        }, null, 2);
  const countries = catalogueArray(countryResult.countries);
      const services = catalogueArray(serviceResult.services);

      $("liveCatalogueCountry").innerHTML =
        `<option value="">Select country</option>` +
        countries.map(item => {
          const name = typeof item === "string"
            ? item
            : item.country_name ||
              item.countryName ||
              item.country ||
              item.name ||
              item.eng ||
              item.code ||
              item.id;

          const value = typeof item === "string"
  ? item
  : String(item.id || item.code || "").trim();

          return `<option value="${escapeHtml(value)}">${escapeHtml(catalogueLabel(item))}</option>`;
        }).join("");

      $("liveCatalogueService").innerHTML =
        `<option value="">Select service</option>` +
        services.map(item => {
          const value = typeof item === "string"
            ? item
            : item.code || item.id || item.service;

          return `<option value="${escapeHtml(String(value || ""))}">${escapeHtml(catalogueLabel(item))}</option>`;
        }).join("");

      $("liveCatalogueOptionsStatus").textContent =
        countries.length && services.length
          ? `Loaded ${countries.length} countries and ${services.length} services.`
          : "YoungPG returned an empty country or service list.";

    } catch (error) {
      $("liveCatalogueCountry").innerHTML =
        `<option value="">Countries unavailable</option>`;

      $("liveCatalogueService").innerHTML =
        `<option value="">Services unavailable</option>`;

  $("liveCatalogueOptionsStatus").textContent =
        `YoungPG options failed to load: ${error.message}`;

      const diagnostic = $("liveCatalogueDiagnostic");
      if (diagnostic) {
        diagnostic.textContent = JSON.stringify({
          stage: "Loading countries and services",
          error: error.message,
          nextCheck: "Check the staging API Worker request and its logs."
        }, null, 2);
      }
    }

    return;
  }

  if (product === "social_logs") {
    controls.innerHTML =
      `<div class="empty-state">Loading Social Logs categories...</div>`;

    try {
      const result = await api(
        "/api/admin/catalogue/social-logs/categories"
      );

      const categories = catalogueArray(result.categories);

      controls.innerHTML = `
        <div class="field-grid">
          <div class="field">
            <label for="liveCatalogueCategory">Category</label>
            <select id="liveCatalogueCategory">
              <option value="">All categories</option>
              ${categories.map(item => `
                <option value="${escapeHtml(String(item.id || item.category_id || ""))}">
                  ${escapeHtml(catalogueLabel(item))}
                </option>
              `).join("")}
            </select>
          </div>

          <div class="field">
            <label for="liveCatalogueSearch">Search listings</label>
            <input
              id="liveCatalogueSearch"
              type="search"
              placeholder="Search Social Logs"
            >
          </div>
        </div>
      `;
    } catch (error) {
      controls.innerHTML =
        `<div class="empty-state">Social Logs categories could not load: ${escapeHtml(error.message)}</div>`;
    }
  }
}
async function loadPricing() {
  const holder = $("pricingTable");
  if (!holder) return;

  holder.innerHTML =
    `<div class="empty-state">Loading pricing rules…</div>`;

  try {
    const result = await api("/api/admin/pricing/rules");
    state.pricing = result.rules || [];

    renderPricingTable();

  } catch (error) {
    holder.innerHTML =
      `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderPricingTable() {
  const holder = $("pricingTable");
  if (!holder) return;

  const query = ($("pricingSearch")?.value || "").toLowerCase();
  const product = $("pricingProductFilter")?.value || "";

  const rows = state.pricing.filter(rule => {
    const text = [
      rule.provider,
      rule.product,
      rule.country,
      rule.service
    ].join(" ").toLowerCase();

    return text.includes(query) &&
      (!product || rule.product === product);
  });

  if (!rows.length) {
    holder.innerHTML =
      `<div class="empty-state">No matching pricing rules.</div>`;
    return;
  }

  holder.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Provider</th>
          <th>Product</th>
          <th>Country</th>
          <th>Service</th>
          <th>Markup type</th>
          <th>Markup value</th>
          <th>Active</th>
<th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(rule => `
          <tr>
            <td>${escapeHtml(rule.provider)}</td>
            <td>${escapeHtml(rule.product)}</td>
            <td>${escapeHtml(rule.country)}</td>
            <td>${escapeHtml(rule.service)}</td>
            <td>${escapeHtml(rule.markup_type)}</td>
            <td>${escapeHtml(rule.markup_value)}</td>
            <td>${rule.active ? statusBadge("Active") : statusBadge("Inactive")}</td>
<td><button type="button" data-delete-pricing-rule="${escapeHtml(rule.id)}">Remove</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function savePricingRule() {
  const value = Number($("ruleValue").value);

  if (!Number.isFinite(value) || value < 0) {
    toast("Enter a valid markup value.", true);
    return;
  }

  const payload = {
    provider: $("ruleProvider").value,
    product: $("ruleProduct").value,
    country: $("ruleCountry").value.trim() || "*",
    service: $("ruleService").value.trim() || "*",
    markup_type: $("ruleType").value,
    markup_value: value,
    active: true
  };

  const button = $("savePricingRuleBtn");
  button.disabled = true;
  button.textContent = "Saving…";

  try {
    await api("/api/admin/pricing/rules", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    toast("Pricing rule saved.");
    await loadPricing();

  } catch (error) {
    toast("Could not save pricing rule: " + error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Save pricing rule";
  }
                   }
  async function saveGlobalMarkup(provider, product, typeId, valueId, buttonId, label) {
  const value = Number($(valueId).value);

  if (!Number.isFinite(value) || value < 0) {
    toast("Enter a valid markup value.", true);
    return;
  }

  const button = $(buttonId);
  button.disabled = true;
  button.textContent = "Saving…";

  try {
    await api("/api/admin/pricing/rules", {
      method: "POST",
      body: JSON.stringify({
        provider,
        product,
        country: "*",
        service: "*",
        markup_type: $(typeId).value,
        markup_value: value,
        active: true
      })
    });

    toast(label + " markup saved successfully.");
    await loadPricing();

  } catch (error) {
    toast("Could not save " + label + " markup: " + error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
  }
  function renderExchange() {
    return panel(
      "USD exchange rate",
      "The rate applies to future conversions.",
      `
        <div class="field">
          <label for="exchangeRate">NGN per 1 USD</label>
          <input id="exchangeRate" type="number"
            min="1" step="0.01" placeholder="1500">
        </div>

        <button class="primary" id="saveExchangeBtn">
          Save exchange rate
        </button>

        <p class="muted">
          The requested default is ₦1,500 = $1.
          The existing saved rate is loaded first and will not
          be overwritten unless you submit a new value.
        </p>
      `
    );
  }
function renderSettings() {
  return panel(
    "Platform settings",
    "Review and update the settings stored by the staging Worker.",
    `
      <div class="form-actions">
        <button class="secondary" id="reloadSettingsBtn">
          Reload settings
        </button>
      </div>

      <div class="field">
        <label for="settingsJson">Settings (JSON)</label>
        <textarea id="settingsJson" rows="16"
          spellcheck="false"
          placeholder="Loading platform settings…"></textarea>
      </div>

      <button class="primary" id="saveSettingsBtn">
        Save settings
      </button>

      <p class="muted">
        Edit carefully. The settings are saved to the staging Worker.
      </p>
    `
  );
}
  async function loadSettings() {
    try {
      const result = await api("/api/admin/settings");

      state.settings = result.settings || {};

      const area = $("settingsJson");

      if (area) {
        area.value = JSON.stringify(state.settings, null, 2);
      }

      const rate = $("exchangeRate");

      if (rate) {
        rate.value = state.settings.usd_ngn_rate || "";
      }

    } catch (error) {
      toast("Could not load settings: " + error.message, true);
    }
  }

  async function saveSettings() {
    const area = $("settingsJson");
    if (!area) return;

    let parsed;

    try {
      parsed = JSON.parse(area.value);
    } catch {
      toast("The settings JSON is invalid.", true);
      return;
    }

    const button = $("saveSettingsBtn");
    button.disabled = true;

    try {
      await api("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ settings: parsed })
      });

      toast("Settings saved.");
      await loadSettings();

    } catch (error) {
      toast("Settings were not saved: " + error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function saveExchangeRate() {
    const rate = Number($("exchangeRate").value);

    if (!Number.isFinite(rate) || rate <= 0) {
      toast("Enter a valid exchange rate.", true);
      return;
    }

    try {
      await api("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({
          settings: {
            usd_ngn_rate: String(rate)
          }
        })
      });

      toast("Exchange rate saved.");
      await loadSettings();

    } catch (error) {
      toast("Could not save exchange rate: " + error.message, true);
    }
  }

  // AUDIT LOGS

  function renderActivity() {
    return panel(
      "Administrator activity",
      "Audit events returned by the staging Worker.",
      `
        <button class="secondary" id="reloadAuditBtn">
          Refresh activity
        </button>

        <div id="auditTable" class="table-wrap">
          <div class="empty-state">Loading audit records…</div>
        </div>
      `
    );
  }

  async function loadAudit() {
    const holder = $("auditTable");
    if (!holder) return;

    holder.innerHTML =
      `<div class="empty-state">Loading audit records…</div>`;

    try {
      const result = await api("/api/admin/audit");
      const rows = result.logs || [];

      if (!rows.length) {
        holder.innerHTML =
          `<div class="empty-state">No audit records found.</div>`;
        return;
      }

      holder.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Administrator</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td>${escapeHtml(formatDate(row.created_at))}</td>
                <td>${escapeHtml(row.admin_email || row.admin_id || "—")}</td>
                <td>${escapeHtml(row.action || "—")}</td>
                <td>${escapeHtml(row.detail || row.details || "—")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    } catch (error) {
      holder.innerHTML =
        `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  // PAGE EVENT HANDLERS

  function attachPageEvents(page) {
    if (page === "customers") {
      $("searchCustomersBtn").onclick = loadCustomers;

      $("customerSearch").addEventListener("keydown", event => {
        if (event.key === "Enter") loadCustomers();
      });
    }

    if (page === "orders") {
      $("searchOrdersBtn").onclick = loadOrders;
    }

    if (page === "payments") {
      $("reloadDepositsBtn").onclick = loadPaymentsPage;
    }

    if (page === "pricing") {
      $("liveCatalogueProduct").onchange = prepareLiveCatalogue;
      $("loadLiveCatalogueBtn").onclick = loadLiveCatalogue;

      prepareLiveCatalogue();
      
      $("reloadPricingBtn").onclick = loadPricing;
      $("savePricingRuleBtn").onclick = savePricingRule;
$("saveGlobalVisual").onclick = () =>
  saveGlobalMarkup(
    "youngpg_virtual",
    "visual_numbers",
    "globalVisualType",
    "globalVisualValue",
    "saveGlobalVisual",
    "Save Visual Numbers Markup"
  );

$("saveGlobalLogs").onclick = () =>
  saveGlobalMarkup(
    "youngpg_media",
    "social_logs",
    "globalLogsType",
    "globalLogsValue",
    "saveGlobalLogs",
    "Save Social Logs Markup"
  );

$("saveGlobalBoost").onclick = () =>
  saveGlobalMarkup(
    "nexar",
    "social_boosting",
    "globalBoostType",
    "globalBoostValue",
    "saveGlobalBoost",
    "Save Social Boosting Markup"
  );
      $("pricingSearch").addEventListener(
        "input",
        renderPricingTable
      );
$("pricingTable").onclick = async event => {
        const button = event.target.closest("[data-delete-pricing-rule]");
        if (!button) return;

        const ruleId = button.dataset.deletePricingRule;

        if (!confirm("Are you sure you want to remove this pricing rule?")) {
          return;
        }

        button.disabled = true;
        button.textContent = "Removing...";

        try {
          await api(`/api/admin/pricing/rules/${encodeURIComponent(ruleId)}`, {
            method: "DELETE"
          });

          toast("Pricing rule removed successfully.");
          await loadPricing();
        } catch (error) {
          toast("Could not remove pricing rule: " + error.message, true);
          await loadPricing();
        }
      };
      $("pricingProductFilter").addEventListener(
        "change",
        renderPricingTable
      );
    }

    if (page === "settings") {
      $("reloadSettingsBtn").onclick = loadSettings;
      $("saveSettingsBtn").onclick = saveSettings;
    }

    if (page === "exchange") {
      $("saveExchangeBtn").onclick = saveExchangeRate;
    }

    if (page === "activity") {
      $("reloadAuditBtn").onclick = loadAudit;
    }
    if (page === "support") {
      $("createAnnouncementBtn").onclick = async () => {
        const title = $("announcementTitle").value.trim();
        const message = $("announcementMessage").value.trim();
        const type = $("announcementType").value;

        if (!title || !message) {
          toast("Enter an announcement title and message.", true);
          return;
        }

        const button = $("createAnnouncementBtn");
        button.disabled = true;

        try {
          await api("/api/admin/announcements", {
            method: "POST",
            body: JSON.stringify({ title, message, type })
          });

          toast("Announcement published successfully.");
          await loadAnnouncements();
        } catch (error) {
          toast(error.message, true);
        } finally {
          button.disabled = false;
        }
      };

      $("reloadAnnouncementsBtn").onclick = loadAnnouncements;
    }
  }

  // NAVIGATION

  document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
      openPage(button.dataset.page);
    });
  });

  document.querySelectorAll("[data-goto]").forEach(button => {
    button.addEventListener("click", () => {
      openPage(button.dataset.goto);
    });
  });

  // LOGIN

  $("loginForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (state.busy) return;

    state.busy = true;

    const button = event.currentTarget.querySelector(
      'button[type="submit"]'
    );

    const email = $("email").value.trim();
    const password = $("password").value;

    button.disabled = true;
    button.textContent = "Signing in…";
    $("loginError").textContent = "";

    try {
      clearSession();

      const result = await login(email, password);

      if (
        result.ok !== true ||
        typeof result.token !== "string" ||
        !result.token.trim()
      ) {
        throw new Error(
          result.error ||
          result.message ||
          "The server did not return a valid administrator session."
        );
      }

      state.token = result.token;

      sessionStorage.setItem(
        "speedy_admin_token",
        state.token
      );

      const me = await api("/api/admin/me");

      if (
        me.ok === false ||
        me.authenticated === false
      ) {
        throw new Error(
          "The server did not verify the new administrator session."
        );
      }

      showApp(
        me.admin ||
        me.user ||
        result.admin ||
        me
      );

      toast("Administrator login successful.");

    } catch (error) {
      clearSession();
      showLogin(error.message);
    } finally {
      $("password").value = "";

      button.disabled = false;
      button.innerHTML =
        'Sign in securely <span>→</span>';

      state.busy = false;
    }
  });

  // OTHER CONTROLS

  $("logoutBtn").addEventListener("click", logout);

  $("refreshBtn").addEventListener("click", () => {
    const page = state.page;

    if (page === "overview") loadOverview();
    else if (page === "customers") loadCustomers();
    else if (page === "orders") loadOrders();
    else if (page === "payments") loadDeposits();
    else if (page === "pricing") loadPricing();
    else if (page === "settings" || page === "exchange") loadSettings();
    else if (page === "activity") loadAudit();
    else if (
      page === "api" ||
      page === "visual" ||
      page === "social-logs" ||
      page === "boosting"
    ) loadProviders();
    else renderPage(page);
  });

  $("menuBtn").addEventListener("click", () => {
    $("sidebar").classList.toggle("open");
  });

  $("apiShort").textContent = "speedy-ng-api-staging";

  // Start the staging dashboard.
  checkHealth();
  verifySession();

})();
