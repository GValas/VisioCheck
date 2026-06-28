import { expect, test } from '@playwright/test';

test('affiche le titre de l’application', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('VisioCheck');
});

test('bascule en mode démo sans backend', async ({ page }) => {
  await page.goto('/');
  // Sans backend joignable, l'app passe en démo après l'échec de connexion.
  await expect(page.locator('.status')).toHaveText(/démo/, { timeout: 20_000 });
});

test('alimente le fil d’événements en mode démo', async ({ page }) => {
  await page.goto('/');
  // Le générateur de démo produit des événements/descriptions simulés.
  await expect(page.locator('aside.feed article').first()).toBeVisible({
    timeout: 20_000,
  });
});

test('démarre la capture webcam (webcam virtuelle)', async ({ page, context }) => {
  await context.grantPermissions(['camera']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await expect(page.getByRole('button', { name: 'Arrêter' })).toBeVisible();
});
