import { defineConfig } from 'vitest/config';

/**
 * Config séparée pour les tests marqués « .integration.spec.ts » : ils tapent
 * les vraies instances KPoe et servent de canari si une base URL tombe ou si
 * le format de réponse change. Exclus du run par défaut (vitest.config.ts),
 * lancés explicitement via `pnpm test:integration`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.integration.spec.ts'],
    // Espacement KPoe (≥5,5 s) + latence réseau réelle.
    testTimeout: 30_000,
  },
});
