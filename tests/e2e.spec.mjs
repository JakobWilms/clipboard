import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const tinyImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function accessibilityInsightsScan(page, testInfo) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  await testInfo.attach('accessibility-insights-automated-checks', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible();
});

test('desktop layout fills viewport and keeps composer action visible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.entries-panel')).toBeVisible();
  await expect(page.locator('.composer-panel')).toBeVisible();
  await expect(page.getByText(/^v1\.4\.0$/)).toBeVisible();
  const entries = await page.locator('.entries-panel').boundingBox();
  const composer = await page.locator('.composer-panel').boundingBox();
  const send = await page.getByRole('button', { name: 'Send entry' }).boundingBox();
  expect(entries.x).toBeLessThan(composer.x);
  expect(send.y + send.height).toBeLessThanOrEqual(900);
});

test('composer collapses horizontally and restores', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const before = await page.locator('.entries-panel').boundingBox();
  await page.getByRole('button', { name: 'Collapse composer' }).click();
  await expect(page.locator('.composer-panel')).toHaveClass(/is-collapsed/);
  await page.waitForTimeout(400);
  const after = await page.locator('.entries-panel').boundingBox();
  expect(after.width).toBeGreaterThan(before.width);
  await page.getByRole('button', { name: 'Expand composer' }).click();
  await expect(page.locator('.composer-panel')).not.toHaveClass(/is-collapsed/);
});

test('creates, copies rich text with an image, and deletes an entry', async ({ page, context }) => {
  await page.evaluate(() => {
    const stored = { items: [] };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      write: async (items) => { stored.items = items; },
      read: async () => stored.items,
      readText: async () => (stored.items[0] ? stored.items[0].getType('text/plain').then((blob) => blob.text()) : ''),
    } });
    window.ClipboardItem = class ClipboardItem {
      constructor(items) { this.items = items; this.types = Object.keys(items); }
      getType(type) { return Promise.resolve(this.items[type]); }
    };
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const marker = `QA-${Date.now()}`;
  const editor = page.locator('.rich-editor');
  await editor.fill(marker);
  await page.evaluate(({ marker: value, image }) => {
    const target = document.querySelector('.rich-editor');
    target.innerHTML = `<p><strong>${value}</strong></p><p><img alt="Test pixel" src="${image}"></p>`;
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  }, { marker, image: tinyImage });
  await page.getByRole('button', { name: 'Send entry' }).click();
  const card = page.locator('.entry-card', { hasText: marker });
  await expect(card).toBeVisible();
  await expect(card.locator('img')).toBeVisible();
  await card.getByRole('button', { name: 'Copy entry' }).click();
  const clipboard = await page.evaluate(async () => ({
    text: await navigator.clipboard.readText(),
    types: (await navigator.clipboard.read())[0]?.types || [],
  }));
  expect(clipboard.text).toContain(marker);
  expect(clipboard.types).toContain('text/html');
  await card.getByRole('button', { name: 'Delete entry' }).click();
  await expect(card).toHaveCount(0);
});

test('mobile layout remains usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Send entry' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('Accessibility Insights automated checks find no WCAG A/AA violations', async ({ page }, testInfo) => {
  await accessibilityInsightsScan(page, testInfo);
  await page.getByRole('button', { name: 'Collapse composer' }).click();
  await accessibilityInsightsScan(page, testInfo);
});

test('Accessibility Insights tab-stop check has logical focus order and no traps', async ({ page }) => {
  const names = [];
  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press('Tab');
    const name = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim() || document.activeElement?.className);
    names.push(name);
    if (name === 'Send entry') break;
  }
  expect(names[0]).toContain('Skip to saved entries');
  expect(names).toContain('Collapse composer');
  expect(names).toContain('Rich text editor');
  expect(names).toContain('Bold');
  await expect(page.getByRole('button', { name: 'Send entry' })).toBeDisabled();
  expect(names).not.toContain('Send entry');
});

test('formatting toolbar works with keyboard activation', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  await editor.fill('keyboard formatting');
  await editor.press('Control+A');
  const bold = page.getByRole('button', { name: 'Bold' });
  await bold.focus();
  await page.keyboard.press('Enter');
  await expect(editor.locator('b, strong')).toContainText('keyboard formatting');
});

test('200 percent zoom equivalent reflows without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 700 });
  await expect(page.getByRole('button', { name: 'Send entry' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
