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
      payments: loadDeposits,
      api: loadProviders,
      visual: loadProviders,
      "social-logs": loadProviders,
      boosting: loadProviders,
      pricing: loadPricing,
      exchange: loadSettings,
      settings: loadSettings,
      activity: loadAudit
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
      "email-verification": renderNotConnected,
      support: renderNotConnected
    };

    body.innerHTML = renderers[page]
      ? renderers[page]()
      : `<div class="panel">Section unavailable.</div>`;

    attachPageEvents(page);
  }

  function renderNotConnected() {
    return `
      <div class="callout">
        This section does not yet have a confirmed, usable
        backend route in the staging Worker. The dashboard
        will not pretend that settings have been saved or
        that these features are working.
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
    return panel(
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
          This screen is read-only. It does not manually approve
          payments or credit wallets. Flutterwave payment verification
          and wallet credit must happen on the Worker after a valid
          payment confirmation.
        </div>
      `
    );
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

  // PROVIDERS

  function renderApi() {
    return `
      <div class="callout">
        Provider assignments: YoungPG handles Visual Numbers and
        Social Logs. Nexa handles Official Numbers and Social Boosting.
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
      `<div class="panel">Loading provider status…</div>`;

    try {
      const result = await api("/api/admin/providers/status");
      state.providers = result.providers || {};

      const young = state.providers.youngpg || {};
      const nexa = state.providers.nexar || {};

      const rows = [
        [
          "YoungPG — Visual Numbers",
          young.visualNumbers
        ],
        [
          "YoungPG — Social Logs",
          young.socialLogs
        ],
        [
          "Nexa — Official Numbers",
          nexa.officialNumbers
        ],
        [
          "Nexa — Social Boosting",
          nexa.socialBoosting
        ]
      ];

      holder.innerHTML = panel(
        "Provider connection status",
        "Status reported by the staging Worker.",
        `
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Provider / product</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(([label, item]) => {
                  const status =
                    item?.status ||
                    (item ? "Configured" : "Not configured");

                  const details =
                    item?.message ||
                    item?.note ||
                    item?.status ||
                    "No additional details returned.";

                  return `
                    <tr>
                      <td>${escapeHtml(label)}</td>
                      <td>${statusBadge(status)}</td>
                      <td>${escapeHtml(details)}</td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>

          <button class="secondary" id="refreshProviderStatusBtn">
            Refresh provider status
          </button>
        `
      );

      const button = $("refreshProviderStatusBtn");

      if (button) {
        button.onclick = loadProviders;
      }

    } catch (error) {
      holder.innerHTML =
        `<div class="panel">${escapeHtml(error.message)}</div>`;
    }
  }

  // PRICING

  function renderPricing() {
    return panel(
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
              <option value="nexar">Nexa</option>
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
            <label for="ruleCountry">Country</label>
            <input id="ruleCountry" value="*"
              placeholder="* or country">
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
    );
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

  // SETTINGS AND EXCHANGE RATE

  function renderSettings() {
    return panel(
      "Platform settings",
      "Only supported settings are displayed here.",
      `
        <div class="field">
          <label for="settingsJson">Settings returned by Worker</label>
          <textarea id="settingsJson"
            spellcheck="false"
            placeholder="Loading settings…"></textarea>
        </div>

        <div class="form-actions">
          <button class="secondary" id="reloadSettingsBtn">
            Reload settings
          </button>

          <button class="primary" id="saveSettingsBtn">
            Save settings
          </button>
        </div>

        <div class="callout">
          Do not paste API keys, passwords, Flutterwave secrets
          or provider credentials into this editor.
        </div>
      `
    );
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
      $("reloadDepositsBtn").onclick = loadDeposits;
    }

    if (page === "pricing") {
      $("reloadPricingBtn").onclick = loadPricing;
      $("savePricingRuleBtn").onclick = savePricingRule;

      $("pricingSearch").addEventListener(
        "input",
        renderPricingTable
      );

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
