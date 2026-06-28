import next from "eslint-config-next"

/**
 * Flat ESLint config for Next.js 16.
 * `eslint-config-next` (default export) bundles core-web-vitals + typescript
 * rules and ignores `.next/**`, `out/**`, `build/**`, `next-env.d.ts`.
 */
const eslintConfig = [...next]

export default eslintConfig
