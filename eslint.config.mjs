import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "coverage/**", "test-results/**", "playwright-report/**"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript", "prettier"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
              importNames: ["PrismaClient"],
              message: "Use the shared client from '@/lib/db' (server-only).",
            },
          ],
        },
      ],
    },
  },
  // Test harnesses and the seed open their own client against an explicitly chosen database.
  { files: ["src/lib/db/**", "prisma/**", "tests/**", "e2e/**"], rules: { "no-restricted-imports": "off" } },
];

export default config;
