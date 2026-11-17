import { expect, test as base, type Route } from '@playwright/test';

export interface Findings {
  /** Content Security Policy violations, from the page, from workers and from the browser's own audit. */
  readonly csp: string[];
  /** Console errors and warnings, uncaught exceptions, failed requests and error responses. */
  readonly errors: string[];
  /** Messages a test expects exactly once (the browser logs the 404 of a navigation); each pattern forgives one match. */
  readonly expectedOnce: RegExp[];
}

interface ReportedIssue {
  readonly issue: {
    readonly code: string;
    readonly details: { readonly contentSecurityPolicyIssueDetails?: unknown };
  };
}

/** Every test fails at the end if the page broke its Content Security Policy or logged anything wrong. */
export const test = base.extend<{ guard: Findings }>({
  guard: [
    async ({ page }, use) => {
      const findings: Findings = { csp: [], errors: [], expectedOnce: [] };

      await page.exposeFunction('reportCspViolation', (text: string) => findings.csp.push(text));
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          const report = (window as unknown as { reportCspViolation: (text: string) => void })
            .reportCspViolation;
          report(
            `${event.violatedDirective} blocked ${event.blockedURI} (${event.sourceFile}:${String(event.lineNumber)})`,
          );
        });
      });

      // Chromium also reports violations from workers, which the page never sees, through its audit domain.
      const cdp = await page.context().newCDPSession(page);
      cdp.on('Audits.issueAdded', ({ issue }: ReportedIssue) => {
        if (issue.code === 'ContentSecurityPolicyIssue') {
          findings.csp.push(JSON.stringify(issue.details.contentSecurityPolicyIssueDetails));
        }
      });
      await cdp.send('Audits.enable');

      page.on('console', (message) => {
        // Chromium on Linux has no Web Bluetooth, so it does not know the `bluetooth` policy feature we deny in `_headers`.
        if (/Permissions-Policy header: Unrecognized feature: 'bluetooth'/.test(message.text()))
          return;
        if (message.type() === 'error' || message.type() === 'warning') {
          findings.errors.push(`console.${message.type()}: ${message.text()}`);
        }
      });
      page.on('pageerror', (error) =>
        findings.errors.push(`pageerror: ${error.stack ?? error.message}`),
      );
      page.on('requestfailed', (request) =>
        findings.errors.push(
          `request failed: ${request.url()} (${request.failure()?.errorText ?? 'unknown'})`,
        ),
      );
      page.on('response', (response) => {
        const request = response.request();
        if (response.status() >= 400 && request.resourceType() !== 'document') {
          findings.errors.push(`HTTP ${String(response.status())}: ${response.url()}`);
        }
      });

      await use(findings);

      expect(findings.csp, 'Content Security Policy violations').toEqual([]);
      const remaining = [...findings.errors];
      for (const pattern of findings.expectedOnce) {
        const index = remaining.findIndex((message) => pattern.test(message));
        if (index >= 0) remaining.splice(index, 1);
      }
      expect(remaining, 'console errors and failed requests').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST',
};

/** Answers a cross-origin request, and its preflight, with a JSON body. */
export async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: CORS });
    return;
  }
  await route.fulfill({
    status,
    headers: CORS,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}
