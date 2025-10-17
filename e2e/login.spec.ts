import { test, expect } from '@playwright/test'

test('login form is present and validates', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()

  // basic validation: submitting empty form should show HTML validation
  await page.click('button:has-text("Sign In")')
  // still on the login page (browser will block submit due to required fields)
  await expect(page).toHaveURL(/.*\/login$/)
})
