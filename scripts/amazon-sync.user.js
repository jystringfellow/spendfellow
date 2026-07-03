// ==UserScript==
// @name         Budget App Amazon Sync
// @namespace    https://github.com/jystringfellow/spendfellow
// @version      0.1.20
// @description  User-authorized Amazon transaction/order import for a self-hosted budgeting app
// @match        https://www.amazon.com/*
// @match        https://www.amazon.com/cpe/yourpayments/transactions*
// @match        https://www.amazon.com/gp/css/summary/edit.html*
// @match        https://www.amazon.com/gp/css/order-details*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/jystringfellow/spendfellow/main/scripts/amazon-sync.user.js
// @downloadURL  https://raw.githubusercontent.com/jystringfellow/spendfellow/main/scripts/amazon-sync.user.js
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_VERSION = '0.1.20';
  const STORAGE_KEY = 'budgetAmazonSync';
  const MAX_TRANSACTION_PAGES = 10;
  const MAX_ORDER_DETAILS = 250;
  const MAX_CONSECUTIVE_SEEN_TRANSACTIONS = 10;
  const REQUEST_TIMEOUT_MS = 30000;

  function getParams() {
    return new URLSearchParams(window.location.search);
  }

  function isAllowedAppOrigin(value) {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      );
    } catch {
      return false;
    }
  }

  function loadState() {
    const params = getParams();
    const appOrigin = params.get('budgetAppOrigin');
    const token = params.get('budgetSyncToken');
    const cutoffDate = normalizeCutoffDate(params.get('budgetCutoffDate'));
    const forceReindex = params.get('budgetForceReindex') === '1';
    const stored = getStoredState();

    if (params.get('budgetSyncPreview') === '1' && appOrigin) {
      if (!isAllowedAppOrigin(appOrigin)) {
        setStatus('Stopped: app origin must be HTTPS or local loopback');
        return null;
      }

      if (stored?.previewOnly && stored.appOrigin === appOrigin && stored.transactionPagesScanned > 0) {
        stripBudgetSyncParamsFromLocation();
        return stored;
      }

      const state = {
        appOrigin,
        token: null,
        previewOnly: true,
        cutoffDate,
        startedAt: Date.now(),
        transactionPagesScanned: 0,
        orderDetailsImported: 0,
        consecutiveSeenTransactions: 0,
        forceReindex,
        stopAfterOrderQueue: null,
        orderQueue: [],
        transactionsUrl: getCleanTransactionsUrl(),
        nextTransactionsUrl: null,
      };
      GM_setValue(STORAGE_KEY, JSON.stringify(state));
      stripBudgetSyncParamsFromLocation();
      return state;
    }

    if (params.get('budgetSync') === '1' && appOrigin && token) {
      if (!isAllowedAppOrigin(appOrigin)) {
        setStatus('Stopped: app origin must be HTTPS or local loopback');
        return null;
      }

      if (stored?.token === token && stored.transactionPagesScanned > 0) {
        stripBudgetSyncParamsFromLocation();
        return stored;
      }

      const state = {
        appOrigin,
        token,
        cutoffDate,
        startedAt: Date.now(),
        transactionPagesScanned: 0,
        orderDetailsImported: 0,
        consecutiveSeenTransactions: 0,
        forceReindex,
        stopAfterOrderQueue: null,
        orderQueue: [],
        transactionsUrl: getCleanTransactionsUrl(),
        nextTransactionsUrl: null,
      };
      GM_setValue(STORAGE_KEY, JSON.stringify(state));
      stripBudgetSyncParamsFromLocation();
      return state;
    }

    return stored;
  }

  function getStoredState() {
    try {
      const stored = JSON.parse(GM_getValue(STORAGE_KEY, '{}'));
      if (
        stored.appOrigin &&
        isAllowedAppOrigin(stored.appOrigin) &&
        (stored.token || stored.previewOnly)
      ) {
        return stored;
      }
    } catch {
      return null;
    }

    return null;
  }

  function stripBudgetSyncParamsFromLocation() {
    const cleanUrl = getCleanTransactionsUrl();
    if (cleanUrl !== window.location.href) {
      window.history.replaceState(null, document.title, cleanUrl);
    }
  }

  function getCleanTransactionsUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('budgetSync');
    url.searchParams.delete('budgetSyncPreview');
    url.searchParams.delete('budgetAppOrigin');
    url.searchParams.delete('budgetSyncToken');
    url.searchParams.delete('budgetCutoffDate');
    url.searchParams.delete('budgetForceReindex');
    return url.toString();
  }

  function saveState(state) {
    GM_setValue(STORAGE_KEY, JSON.stringify(state));
  }

  function clearState() {
    GM_setValue(STORAGE_KEY, '{}');
  }

  function setStatus(message, detail) {
    let panel = document.getElementById('budget-amazon-sync-status');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'budget-amazon-sync-status';
      panel.style.cssText = [
        'position:fixed',
        'right:16px',
        'bottom:16px',
        'z-index:2147483647',
        'max-width:360px',
        'padding:12px 14px',
        'border:1px solid #1f6feb',
        'border-radius:8px',
        'background:#ffffff',
        'color:#111827',
        'box-shadow:0 8px 24px rgba(0,0,0,0.18)',
        'font:14px/1.4 Arial,sans-serif',
      ].join(';');
      document.body.appendChild(panel);
    }

    panel.textContent = detail ? `Amazon Budget Sync: ${message} ${detail}` : `Amazon Budget Sync: ${message}`;
  }

  function finishSync(state, message, detail) {
    setStatus(message, detail);
    clearState();

    if (!state.previewOnly) {
      window.setTimeout(() => window.close(), 1200);
    }
  }

  function showPreviewPayload(title, payload) {
    setStatus(`preview only: ${title}`);
    let output = document.getElementById('budget-amazon-sync-preview');
    if (!output) {
      output = document.createElement('pre');
      output.id = 'budget-amazon-sync-preview';
      output.style.cssText = [
        'position:fixed',
        'left:16px',
        'right:16px',
        'bottom:88px',
        'z-index:2147483647',
        'max-height:45vh',
        'overflow:auto',
        'padding:12px',
        'border:1px solid #9ca3af',
        'border-radius:8px',
        'background:#111827',
        'color:#f9fafb',
        'box-shadow:0 8px 24px rgba(0,0,0,0.24)',
        'font:12px/1.5 Menlo,Consolas,monospace',
        'white-space:pre-wrap',
      ].join(';');
      document.body.appendChild(output);
    }

    const json = JSON.stringify(payload, null, 2);
    output.textContent = json;
    console.log(`Amazon Budget Sync ${title}`, payload);
  }

  function isBlockedPage() {
    const text = document.body.innerText.slice(0, 5000).toLowerCase();
    return (
      text.includes('enter the characters you see below') ||
      text.includes('type the characters you see in this image') ||
      text.includes('sign in') && document.querySelector('form[name="signIn"], form[action*="signin"]')
    );
  }

  function textOf(node) {
    return (node && node.textContent ? node.textContent : '').replace(/\s+/g, ' ').trim();
  }

  function extractOrderId(textOrUrl) {
    const match = String(textOrUrl || '').match(/\b\d{3}-\d{7}-\d{7}\b/);
    return match ? match[0] : null;
  }

  function extractMoney(text) {
    const match = String(text || '').match(/[+-]?\$[\d,]+\.\d{2}|\(\$[\d,]+\.\d{2}\)/);
    return match ? match[0] : null;
  }

  function normalizeCutoffDate(value) {
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  }

  const MONTH_NUMBERS = {
    jan: '01',
    january: '01',
    feb: '02',
    february: '02',
    mar: '03',
    march: '03',
    apr: '04',
    april: '04',
    may: '05',
    jun: '06',
    june: '06',
    jul: '07',
    july: '07',
    aug: '08',
    august: '08',
    sep: '09',
    sept: '09',
    september: '09',
    oct: '10',
    october: '10',
    nov: '11',
    november: '11',
    dec: '12',
    december: '12',
  };

  function extractDate(text) {
    const match = String(text || '').match(
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),\s+(\d{4})\b/i
    );
    if (!match) {
      return null;
    }

    const monthKey = match[1].toLowerCase().replace(/\.$/, '');
    const month = MONTH_NUMBERS[monthKey];
    const day = Number.parseInt(match[2], 10);
    const year = match[3];
    if (!month || !Number.isInteger(day) || day < 1 || day > 31) {
      return null;
    }

    return `${year}-${month}-${String(day).padStart(2, '0')}`;
  }

  function extractAmazonTransactionGroupDate(row) {
    const lineItem = row.closest('.apx-transactions-line-item-component-container') || row;

    let current = lineItem;
    for (let depth = 0; current && depth < 5; depth += 1) {
      let previous = current.previousElementSibling;
      while (previous) {
        if (previous.classList && previous.classList.contains('apx-transaction-date-container')) {
          const date = extractDate(textOf(previous));
          if (date) {
            return date;
          }
        }

        previous = previous.previousElementSibling;
      }

      current = current.parentElement;
    }

    return null;
  }

  function extractNearbyDate(row) {
    const groupedDate = extractAmazonTransactionGroupDate(row);
    if (groupedDate) {
      return groupedDate;
    }

    const ownDate = extractDate(textOf(row));
    if (ownDate) {
      return ownDate;
    }

    let current = row;
    for (let depth = 0; current && depth < 4; depth += 1) {
      const previous = current.previousElementSibling;
      const previousDate = extractDate(textOf(previous));
      if (previousDate) {
        return previousDate;
      }
      current = current.parentElement;
    }

    return null;
  }

  function isBeforeCutoff(transactionDate, cutoffDate) {
    return Boolean(transactionDate && cutoffDate && transactionDate < cutoffDate);
  }

  function getConsecutiveSeenTransactionCount(currentCount, transactionStatuses) {
    if (!Array.isArray(transactionStatuses)) {
      return currentCount || 0;
    }

    let count = currentCount || 0;
    for (const transaction of transactionStatuses) {
      if (transaction && transaction.existing) {
        count += 1;
      } else {
        count = 0;
      }
    }
    return count;
  }

  function absoluteUrl(href) {
    try {
      return new URL(href, window.location.origin).toString();
    } catch {
      return null;
    }
  }

  function getTransactionsPageSignature() {
    return getTransactionRows()
      .map((row) => {
        const parsed = parseTransactionRow(row);
        return parsed ? `${parsed.transactionDate || 'no-date'}:${parsed.orderId}:${parsed.amount}` : null;
      })
      .filter(Boolean)
      .slice(0, 5)
      .join('|');
  }

  function waitForTransactionsPageChange(previousSignature, callback, attempt) {
    const currentAttempt = attempt || 0;
    const currentSignature = getTransactionsPageSignature();
    if (currentSignature && currentSignature !== previousSignature) {
      callback();
      return;
    }

    if (currentAttempt >= 20) {
      setStatus(
        'Stopped: next transaction page did not load',
        `Still seeing ${currentSignature || 'no transactions'}`
      );
      return;
    }

    window.setTimeout(() => waitForTransactionsPageChange(previousSignature, callback, currentAttempt + 1), 500);
  }

  function postToApp(state, path, body) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: `${state.appOrigin}${path}`,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ token: state.token, pageUrl: window.location.href, ...body }),
        timeout: REQUEST_TIMEOUT_MS,
        onload(response) {
          let parsed = {};
          try {
            parsed = JSON.parse(response.responseText || '{}');
          } catch {
            reject(new Error('App API returned non-JSON response.'));
            return;
          }

          if (response.status < 200 || response.status >= 300) {
            reject(new Error(parsed.error || `App API returned HTTP ${response.status}.`));
            return;
          }

          resolve(parsed);
        },
        ontimeout() {
          reject(new Error('App API request timed out.'));
        },
        onerror() {
          reject(new Error('App API request failed.'));
        },
      });
    });
  }

  function getTransactionRows() {
    const lineItemRows = Array.from(document.querySelectorAll('.apx-transactions-line-item-component-container')).filter(
      (row) => extractOrderId(textOf(row)) && extractMoney(textOf(row))
    );
    if (lineItemRows.length > 0) {
      return lineItemRows;
    }

    const orderLinks = Array.from(document.querySelectorAll('a[href*="orderID="], a[href*="orderId="]'));
    const rows = [];
    const seen = new Set();

    orderLinks.forEach((link) => {
      const orderId = extractOrderId(link.href) || extractOrderId(textOf(link));
      if (!orderId) {
        return;
      }

      const row =
        link.closest('.apx-transactions-line-item-component-container') ||
        link.closest('[data-testid], [class*="transaction"], [class*="Transaction"], tr, li') ||
        link.closest('.a-row') ||
        link.parentElement;
      if (!row || seen.has(row)) {
        return;
      }
      seen.add(row);
      rows.push(row);
    });

    return rows;
  }

  function parseTransactionRow(row) {
    const rawText = textOf(row);
    const orderLink = row.querySelector('a[href*="orderID="], a[href*="orderId="]');
    const orderDetailUrl = orderLink ? absoluteUrl(orderLink.getAttribute('href')) : null;
    const orderId = extractOrderId(orderDetailUrl) || extractOrderId(rawText);
    const amount = extractMoney(rawText);
    const transactionDate = extractNearbyDate(row);
    const paymentMatch = rawText.match(
      /\b(?:Prime Visa|Visa|Mastercard|MasterCard|American Express|Amex|Discover|Store Card|Gift Card)\b[^$#]{0,80}/i
    );
    const merchantMatch = rawText.match(/\b(?:AMZN Mktp US|Amazon\.com|Amazon|Whole Foods)\b/i);

    if (!orderId || !amount) {
      return null;
    }

    const paymentMethodHint = paymentMatch ? paymentMatch[0].replace(/[+-]\s*$/, '').trim() : null;
    const isRefund = /^\+\$/.test(amount) || /\bRefund\s*:/i.test(rawText);

    return {
      orderId,
      amount,
      transactionDate,
      paymentMethodHint,
      merchantText: merchantMatch ? merchantMatch[0].trim() : null,
      orderDetailUrl,
      rawText,
      isRefund,
    };
  }

  function findNextTransactionsPage() {
    const selectorMatches = Array.from(
      document.querySelectorAll(
        '.a-pagination .a-last:not(.a-disabled) a[href], li.a-last:not(.a-disabled) a[href], a[aria-label*="Next" i][href]'
      )
    );
    const nextLink =
      selectorMatches.find((link) => absoluteUrl(link.getAttribute('href'))) ||
      Array.from(document.querySelectorAll('a[href]')).find((link) => {
        const label = `${textOf(link)} ${link.getAttribute('aria-label') || ''} ${link.getAttribute('title') || ''}`.toLowerCase();
        const container = link.closest('li, span, div');
        const isDisabled =
          link.getAttribute('aria-disabled') === 'true' ||
          link.classList.contains('a-disabled') ||
          Boolean(container?.classList?.contains('a-disabled'));
        return /\bnext\b/.test(label) && !isDisabled && absoluteUrl(link.getAttribute('href'));
      });
    return nextLink ? absoluteUrl(nextLink.getAttribute('href')) : null;
  }

  function findNextTransactionsControl() {
    const controls = Array.from(
      document.querySelectorAll(
        '.a-pagination .a-last:not(.a-disabled) a, .a-pagination .a-last:not(.a-disabled) button, li.a-last:not(.a-disabled) a, li.a-last:not(.a-disabled) button, a[aria-label*="Next" i], button[aria-label*="Next" i], input[aria-label*="Next" i], input[name*="NextPageNavigationEvent"], [role="button"][aria-label*="Next" i]'
      )
    );
    const fallbackControls = Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"], [role="button"]'));
    return (
      controls.find((control) => !isDisabledControl(control)) ||
      fallbackControls.find((control) => {
        const label = getControlLabel(control);
        return /\bnext\b/i.test(label) && !isDisabledControl(control);
      }) ||
      null
    );
  }

  function getControlLabel(control) {
    const labelledBy = control.getAttribute('aria-labelledby');
    const labelledByText = labelledBy
      ? labelledBy
          .split(/\s+/)
          .map((id) => textOf(document.getElementById(id)))
          .join(' ')
      : '';
    const buttonText = textOf(control.closest('.a-button, button, a, [role="button"]'));

    return `${textOf(control)} ${labelledByText} ${buttonText} ${control.getAttribute('aria-label') || ''} ${
      control.getAttribute('title') || ''
    } ${control.getAttribute('value') || ''} ${control.getAttribute('name') || ''}`
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isDisabledControl(control) {
    const container = control.closest('li, span, div');
    return (
      control.getAttribute('aria-disabled') === 'true' ||
      control.getAttribute('disabled') === 'disabled' ||
      control.disabled === true ||
      control.classList.contains('a-disabled') ||
      control.classList.contains('a-button-disabled') ||
      Boolean(container?.classList?.contains('a-button-disabled')) ||
      Boolean(container?.classList?.contains('a-disabled'))
    );
  }

  function continueToNextTransactionsPage(state) {
    if (state.nextTransactionsUrl) {
      const nextTransactionsUrl = state.nextTransactionsUrl;
      state.nextTransactionsUrl = null;
      state.lastTransactionsPageDebug = null;
      saveState(state);
      setStatus(
        'scanning next transaction page...',
        `${(state.orderQueue || []).length} order details queued so far`
      );
      window.location.assign(nextTransactionsUrl);
      return true;
    }

    const nextControl = findNextTransactionsControl();
    if (!nextControl) {
      return false;
    }

    state.lastTransactionsPageDebug = null;
    const previousSignature = getTransactionsPageSignature();
    saveState(state);
    setStatus(
      'clicking next transaction page...',
      `${(state.orderQueue || []).length} order details queued so far`
    );
    nextControl.click();
    waitForTransactionsPageChange(previousSignature, () => {
      const storedState = loadState();
      if (storedState && window.location.pathname.includes('/cpe/yourpayments/transactions')) {
        void scanTransactions(storedState);
      }
    });
    return true;
  }

  function getTransactionPaginationDebug() {
    const paginationRoot =
      document.querySelector('.a-pagination') ||
      document.querySelector('[class*="pagination" i]') ||
      document.querySelector('[aria-label*="pagination" i]');
    const links = Array.from(document.querySelectorAll('a[href], button, input[type="button"], input[type="submit"], [role="button"]'))
      .map((link) => {
        const label = getControlLabel(link);
        const href = absoluteUrl(link.getAttribute('href'));
        return {
          label,
          href,
          classes: link.className || null,
          parentClasses: link.parentElement?.className || null,
        };
      })
      .filter((link) => /next|page|\b\d+\b/i.test(link.label) || /page|offset|start|token/i.test(link.href || ''))
      .slice(0, 25);

    return {
      paginationText: textOf(paginationRoot).slice(0, 500),
      paginationHtml: paginationRoot ? paginationRoot.outerHTML.slice(0, 3000) : null,
      candidateLinks: links,
    };
  }

  async function scanTransactions(state) {
    if (isBlockedPage()) {
      setStatus('Stopped: login/CAPTCHA/error page detected');
      return;
    }

    if (state.transactionPagesScanned >= MAX_TRANSACTION_PAGES) {
      finishSync(state, 'Stopped: conservative page limit reached');
      return;
    }

    setStatus('scanning transactions...');
    const rows = getTransactionRows();
    const transactions = [];
    let reachedCutoff = false;
    const nextPage = findNextTransactionsPage();
    const paginationDebug = getTransactionPaginationDebug();
    const orderLinkCount = document.querySelectorAll('a[href*="orderID="], a[href*="orderId="]').length;

    rows.forEach((row) => {
      const parsed = parseTransactionRow(row);
      if (!parsed) {
        return;
      }

      if (isBeforeCutoff(parsed.transactionDate, state.cutoffDate)) {
        reachedCutoff = true;
        return;
      }

      transactions.push(parsed);
    });

    state.transactionPagesScanned += 1;
    state.transactionsUrl = getCleanTransactionsUrl();
    state.nextTransactionsUrl = reachedCutoff ? null : nextPage;
    state.stopAfterOrderQueue = reachedCutoff ? 'cutoff date reached' : null;
    saveState(state);

    if (state.previewOnly) {
      const datedTransactionCount = transactions.filter((transaction) => transaction.transactionDate).length;
      showPreviewPayload('transactions payload', {
        token: 'preview-mode-does-not-create-a-token',
        pageUrl: window.location.href,
        cutoffDate: state.cutoffDate,
        datedTransactionCount,
        rowCount: rows.length,
        orderLinkCount,
        parsedTransactionCount: transactions.length,
        forceReindex: Boolean(state.forceReindex),
        nextTransactionsUrl: state.nextTransactionsUrl,
        nextTransactionsLinkFound: Boolean(nextPage),
        paginationDebug,
        reachedCutoff,
        note: state.cutoffDate
          ? 'Cutoff filtering requires transaction dates. If datedTransactionCount is 0, Amazon did not expose dates in the parsed transaction rows.'
          : 'No cutoff date was supplied.',
        transactions,
      });
      return;
    }

    setStatus(
      'saving transactions...',
      `${transactions.length}/${rows.length} parsed; ${(state.orderQueue || []).length} order details queued so far`
    );
    const result = await postToApp(state, '/api/amazon-sync/transactions', {
      transactions,
      forceReindex: Boolean(state.forceReindex),
    });
    state.cutoffDate = result.cutoff_date || state.cutoffDate || null;
    state.consecutiveSeenTransactions = state.forceReindex
      ? 0
      : getConsecutiveSeenTransactionCount(state.consecutiveSeenTransactions, result.transaction_statuses);
    if (state.consecutiveSeenTransactions >= MAX_CONSECUTIVE_SEEN_TRANSACTIONS) {
      state.nextTransactionsUrl = null;
      state.stopAfterOrderQueue = 'previously synced transactions reached';
    }
    const neededOrders = Array.isArray(result.needed_orders) ? result.needed_orders : [];

    if (neededOrders.length > 0) {
      state.orderQueue = [...(state.orderQueue || []), ...neededOrders].slice(0, MAX_ORDER_DETAILS);
      state.orderDetailsImported = state.orderDetailsImported || 0;
      state.lastTransactionsPageDebug = {
        pageUrl: window.location.href,
        nextTransactionsUrl: state.nextTransactionsUrl,
        nextTransactionsLinkFound: Boolean(nextPage),
        queuedOrderCount: state.orderQueue.length,
      };
      saveState(state);
    }

    if (reachedCutoff) {
      if ((state.orderQueue || []).length > 0) {
        setStatus(
          'cutoff reached; opening order details...',
          `${state.orderQueue.length} queued from ${state.transactionPagesScanned} transaction pages`
        );
        navigateToNextOrder(state);
        return;
      }

      finishSync(state, 'Stopped: cutoff date reached', `${state.orderDetailsImported || 0} orders imported`);
      return;
    }

    if (state.consecutiveSeenTransactions >= MAX_CONSECUTIVE_SEEN_TRANSACTIONS) {
      if ((state.orderQueue || []).length > 0) {
        setStatus(
          'known transactions reached; opening order details...',
          `${state.orderQueue.length} queued from ${state.transactionPagesScanned} transaction pages`
        );
        navigateToNextOrder(state);
        return;
      }

      finishSync(state, 'Stopped: reached previously synced transactions', `${state.consecutiveSeenTransactions} seen in a row`);
      return;
    }

    if (result.stop) {
      if ((state.orderQueue || []).length > 0) {
        setStatus(
          'transaction scan complete; opening order details...',
          `${state.orderQueue.length} queued from ${state.transactionPagesScanned} transaction pages`
        );
        navigateToNextOrder(state);
        return;
      }

      finishSync(state, 'Stopped: reached known data', `${state.orderDetailsImported || 0} orders imported`);
      return;
    }

    if (continueToNextTransactionsPage(state)) {
      return;
    }

    if ((state.orderQueue || []).length > 0) {
      setStatus(
        'transaction pages complete; opening order details...',
        `${state.orderQueue.length} queued from ${state.transactionPagesScanned} transaction pages`
      );
      navigateToNextOrder(state);
      return;
    }

    finishSync(state, 'Stopped: no more transaction pages', `${state.orderDetailsImported || 0} orders imported`);
  }

  function navigateToNextOrder(state) {
    const next = state.orderQueue.shift();
    saveState(state);
    if (!next) {
      setStatus(`${state.orderDetailsImported || 0} orders imported`);
      if (state.stopAfterOrderQueue) {
        const reason = state.stopAfterOrderQueue;
        state.stopAfterOrderQueue = null;
        saveState(state);
        finishSync(state, `Stopped: ${reason}`, `${state.orderDetailsImported || 0} orders imported`);
        return;
      }

      if (state.nextTransactionsUrl) {
        continueToNextTransactionsPage(state);
        return;
      }

      finishSync(
        state,
        'Stopped: no more transaction pages',
        state.lastTransactionsPageDebug
          ? JSON.stringify(state.lastTransactionsPageDebug)
          : `${state.orderDetailsImported || 0} orders imported`
      );
      return;
    }

    const fallbackUrl = `https://www.amazon.com/gp/css/summary/edit.html?orderID=${encodeURIComponent(next.orderId)}`;
    window.location.assign(next.orderDetailUrl || fallbackUrl);
  }

  function findSummaryMoney(labelPatterns) {
    const summaryRows = Array.from(
      document.querySelectorAll(
        '[data-component="chargeSummary"] .od-line-item-row, #od-subtotals .od-line-item-row'
      )
    );

    for (const row of summaryRows) {
      const label = textOf(row.querySelector('.od-line-item-row-label'));
      if (labelPatterns.some((pattern) => pattern.test(label))) {
        const money = extractMoney(textOf(row.querySelector('.od-line-item-row-content')));
        if (money) {
          return money;
        }
      }
    }

    const summaryText = textOf(
      document.querySelector('[data-component="chargeSummary"]') ||
        document.querySelector('#od-subtotals') ||
        document.body
    );
    const lines = summaryText.split(/(?=(?:Item|Shipping|Subscribe|Subscription|Total|Estimated|Grand)\b)/i);
    for (const line of lines) {
      const label = line.replace(/[+-]?\$[\d,]+\.\d{2}|\(\$[\d,]+\.\d{2}\)/g, '');
      if (labelPatterns.some((pattern) => pattern.test(label))) {
        const money = extractMoney(line);
        if (money) {
          return money;
        }
      }
    }

    return null;
  }

  function extractAsinFromHref(href) {
    const asinMatch = String(href || '').match(/[?&]asin=([A-Z0-9]{10})\b|\/(?:dp|gp\/product)\/([A-Z0-9]{10})\b/i);
    return asinMatch ? (asinMatch[1] || asinMatch[2]).toUpperCase() : null;
  }

  function findItemContainer(titleComponent) {
    let current = titleComponent;
    for (let depth = 0; current && depth < 8; depth += 1) {
      if (
        current.classList &&
        current.classList.contains('a-fixed-left-grid') &&
        current.querySelector('[data-component="itemTitle"]') &&
        current.querySelector('[data-component="unitPrice"], [data-component="itemImage"]')
      ) {
        return current;
      }
      current = current.parentElement;
    }

    return titleComponent.closest('.a-row, li, tr, .a-section') || titleComponent.parentElement;
  }

  function extractItemQuantity(container) {
    const imageQuantityText = textOf(container?.querySelector('.od-item-view-qty'));
    const imageQuantity = imageQuantityText.match(/\b(\d+)\b/);
    if (imageQuantity) {
      return imageQuantity[1];
    }

    const quantityText = textOf(container?.querySelector('[data-component="quantity"]'));
    const explicitQuantity = quantityText.match(/\b(?:Qty|Quantity)\s*:?\s*(\d+)\b/i) || quantityText.match(/\b(\d+)\b/);
    if (explicitQuantity) {
      return explicitQuantity[1];
    }

    const itemText = textOf(container);
    const nearbyQuantity = itemText.match(/\b(?:Qty|Quantity)\s*:?\s*(\d+)\b/i);
    return nearbyQuantity ? nearbyQuantity[1] : '1';
  }

  function parseOrderItems() {
    const titleComponents = Array.from(document.querySelectorAll('[data-component="itemTitle"]'));
    const seen = new Set();

    return titleComponents
      .map((titleComponent) => {
        const titleLink =
          titleComponent.querySelector('a[href*="/dp/"], a[href*="/gp/product/"]') ||
          titleComponent.querySelector('a[href]');
        const container = findItemContainer(titleComponent);
        const title = textOf(titleLink || titleComponent);
        const itemHref = titleLink ? titleLink.getAttribute('href') : '';
        const itemActionLink = container
          ? container.querySelector('a[href*="asin="], a[href*="/dp/"], a[href*="/gp/product/"]')
          : null;
        const asin = extractAsinFromHref(itemHref) || extractAsinFromHref(itemActionLink?.getAttribute('href'));
        const priceText = textOf(container?.querySelector('[data-component="unitPrice"] .a-offscreen')) ||
          textOf(container?.querySelector('[data-component="unitPrice"]'));
        const price = extractMoney(priceText);
        const key = asin || title;

        if (!key || seen.has(key)) {
          return null;
        }

        seen.add(key);
        return {
          title,
          price,
          asin,
          quantity: extractItemQuantity(container),
        };
      })
      .filter(Boolean);
  }

  async function scanOrderDetails(state) {
    if (isBlockedPage()) {
      setStatus('Stopped: login/CAPTCHA/error page detected');
      return;
    }

    const orderId = extractOrderId(window.location.href) || extractOrderId(textOf(document.body));
    if (!orderId) {
      setStatus('Stopped: could not find order id on order page');
      return;
    }

    setStatus('scanning order details...');
    const order = {
      orderId,
      orderDetailUrl: window.location.href,
      itemSubtotal: findSummaryMoney([/item\(s\) subtotal/i, /items subtotal/i]),
      shipping: findSummaryMoney([/shipping/i]),
      discounts: findSummaryMoney([/saving/i, /subscribe\s*&\s*save/i, /discount/i, /promotion/i]),
      tax: findSummaryMoney([/estimated tax/i, /tax to be collected/i]),
      grandTotal: findSummaryMoney([/grand total/i, /order total/i]),
      items: parseOrderItems(),
    };

    if (state.previewOnly) {
      showPreviewPayload('order details payload', {
        token: 'preview-mode-does-not-create-a-token',
        pageUrl: window.location.href,
        order,
      });
      return;
    }

    await postToApp(state, '/api/amazon-sync/orders', { order });
    state.orderDetailsImported = (state.orderDetailsImported || 0) + 1;
    saveState(state);
    setStatus(`${state.orderDetailsImported} orders imported`);
    navigateToNextOrder(state);
  }

  async function main() {
    console.info(`Amazon Budget Sync userscript ${SCRIPT_VERSION} loaded`, {
      href: window.location.href,
      hasPreviewParam: getParams().get('budgetSyncPreview') === '1',
      hasSyncParam: getParams().get('budgetSync') === '1',
    });

    const state = loadState();
    if (!state) {
      return;
    }

    try {
      if (isBlockedPage()) {
        setStatus('Stopped: login/CAPTCHA/error page detected');
        return;
      }

      if (window.location.pathname.includes('/cpe/yourpayments/transactions')) {
        await scanTransactions(state);
        return;
      }

      if (window.location.pathname.includes('/gp/css/summary') || window.location.pathname.includes('/gp/css/order-details')) {
        await scanOrderDetails(state);
        return;
      }

      setStatus(
        state.previewOnly ? 'preview mode active; open transactions or order details' : 'sync mode active; open transactions'
      );
    } catch (error) {
      setStatus('Stopped: error', error instanceof Error ? error.message : String(error));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void main());
  } else {
    void main();
  }
})();
