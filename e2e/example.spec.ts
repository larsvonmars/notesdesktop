import { test, expect } from '@playwright/test'

test('home redirects to login when not authenticated', async ({ page, baseURL }) => {
  await page.goto('/')
  // since the app redirects to /login for unauthenticated users, assert location
  await expect(page).toHaveURL(/.*\/login$/)
  await expect(page.locator('text=Sign In')).toBeVisible()
})
