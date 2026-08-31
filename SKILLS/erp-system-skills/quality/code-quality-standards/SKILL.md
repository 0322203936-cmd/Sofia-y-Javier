---
name: code-quality-standards
description: >
  Estándares de calidad de código para proyectos ERP con TypeScript. Cubre configuración profesional
  de ESLint y Prettier, Husky con lint-staged para pre-commit hooks, Conventional Commits,
  templates de Pull Request, code review checklist, y mejores prácticas de organización de código.
  Usa esta skill SIEMPRE que necesites configurar linting, formateo, hooks de git, convenciones
  de commits, o establecer estándares de código. Se activa con "ESLint", "Prettier", "lint",
  "formato", "Husky", "pre-commit", "commit convention", "code review", "PR template",
  "calidad de código", o cualquier referencia a estándares y herramientas de calidad de código.
---

# Code Quality Standards — Sistemas ERP

Estándares profesionales de calidad de código para equipos de desarrollo.

## ESLint

```javascript
// eslint.config.js (Flat Config — ESLint 9+)
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: { import: importPlugin },
    rules: {
      // TypeScript
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // Imports
      'import/order': ['error', {
        groups: [['builtin', 'external'], 'internal', ['parent', 'sibling'], 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc' },
      }],
      'import/no-duplicates': 'error',

      // General
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      'no-throw-literal': 'error',
    },
  },
  {
    // Reglas más flexibles para tests
    files: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', '*.config.*'],
  },
);
```

## Prettier

```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf",
  "bracketSpacing": true
}
```

```
# .prettierignore
dist
node_modules
coverage
*.lock
prisma/migrations
```

## Husky + lint-staged

```bash
# Instalación
npm install -D husky lint-staged
npx husky init
```

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,yml,yaml,css}": [
      "prettier --write"
    ],
    "prisma/schema.prisma": [
      "npx prisma format"
    ]
  },
  "scripts": {
    "lint": "eslint src/ --max-warnings 0",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx,json,css}\"",
    "format:check": "prettier --check \"src/**/*.{ts,tsx,json,css}\"",
    "type-check": "tsc --noEmit",
    "prepare": "husky"
  }
}
```

```bash
# .husky/pre-commit
npx lint-staged
```

```bash
# .husky/commit-msg
npx --no -- commitlint --edit "$1"
```

## Conventional Commits

```javascript
// commitlint.config.js
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat',     // Nueva funcionalidad
      'fix',      // Corrección de bug
      'refactor', // Refactorización (no cambia comportamiento)
      'perf',     // Mejora de rendimiento
      'test',     // Agregar o modificar tests
      'docs',     // Documentación
      'style',    // Formateo, punto y coma, etc.
      'chore',    // Configuración, dependencias
      'ci',       // Cambios en CI/CD
      'revert',   // Revertir commit anterior
    ]],
    'scope-enum': [1, 'always', [
      'inventory', 'sales', 'purchasing', 'hr', 'accounting',
      'auth', 'api', 'db', 'ui', 'config', 'deps',
    ]],
    'subject-max-length': [2, 'always', 72],
  },
};
```

### Ejemplos de Commits

```
feat(inventory): add barcode scanning for products
fix(sales): correct tax calculation for multi-item orders
refactor(auth): extract token service to separate module
test(inventory): add integration tests for stock adjustment
chore(deps): update prisma to v6.2.0
docs(api): add OpenAPI docs for purchasing module
perf(db): add composite index for order status queries
ci: add integration test job to GitHub Actions
```

## PR Template

```markdown
<!-- .github/pull_request_template.md -->

## Descripción
<!-- Describe qué cambia este PR y por qué -->

## Tipo de Cambio
- [ ] 🆕 Nueva funcionalidad (feat)
- [ ] 🐛 Corrección de bug (fix)
- [ ] ♻️ Refactorización (refactor)
- [ ] 📝 Documentación (docs)
- [ ] 🧪 Tests
- [ ] 🔧 Configuración (chore)

## Módulo(s) Afectado(s)
- [ ] Inventario
- [ ] Ventas
- [ ] Compras
- [ ] Auth/Usuarios
- [ ] Otro: ___

## Checklist
- [ ] El código sigue las convenciones del proyecto
- [ ] Los tests pasan localmente
- [ ] Se agregaron tests para la nueva funcionalidad
- [ ] La documentación se actualizó si es necesario
- [ ] No hay `console.log` innecesarios
- [ ] No hay `any` sin justificación
- [ ] Las migraciones de BD son reversibles

## Screenshots (si aplica)
<!-- Para cambios de UI -->

## ¿Cómo probar?
<!-- Pasos para que el reviewer pueda probar -->
```

## TypeScript Config

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "outDir": "./dist",
    "rootDir": "./src",

    // Estricto
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,

    // Módulos
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,

    // Paths
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@shared/*": ["src/shared/*"],
      "@tests/*": ["tests/*"]
    },

    // Output
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

## Convenciones de Código

### Nombres

| Elemento | Convención | Ejemplo |
|----------|-----------|---------|
| Archivos | kebab-case | `product.entity.ts`, `create-product.use-case.ts` |
| Clases | PascalCase | `ProductService`, `CreateOrderUseCase` |
| Interfaces | PascalCase (sin I) | `ProductRepository` (no `IProductRepository`) |
| Funciones | camelCase | `findById`, `calculateTotal` |
| Variables | camelCase | `currentStock`, `orderItems` |
| Constantes | UPPER_SNAKE | `MAX_RETRIES`, `DEFAULT_PAGE_SIZE` |
| Tipos/Enums | PascalCase | `OrderStatus`, `PaymentMethod` |
| Archivos test | `*.test.ts` | `product.entity.test.ts` |

### Estructura de Archivos por Módulo

```
módulo/
├── domain/
│   ├── entities/          → {nombre}.entity.ts
│   ├── value-objects/     → {nombre}.vo.ts
│   ├── events/            → {nombre}.event.ts
│   └── repositories/      → {nombre}.repository.ts (interface)
├── application/
│   ├── use-cases/         → {acción}-{entidad}.use-case.ts
│   ├── dtos/              → {acción}-{entidad}.dto.ts
│   └── mappers/           → {entidad}.mapper.ts
├── infrastructure/
│   ├── repositories/      → prisma-{entidad}.repository.ts
│   ├── controllers/       → {entidad}.controller.ts
│   └── routes/            → {módulo}.routes.ts
└── index.ts               → barrel exports
```

## Code Review Checklist

### Para el Autor
- [ ] El PR tiene un título descriptivo siguiendo Conventional Commits
- [ ] La descripción explica el **por qué**, no solo el **qué**
- [ ] El PR es de tamaño razonable (< 400 líneas cambiadas)
- [ ] Los tests están escritos y pasan
- [ ] No hay código comentado sin razón

### Para el Reviewer
- [ ] La lógica de negocio es correcta
- [ ] Los edge cases están cubiertos
- [ ] No hay problemas de seguridad (SQL injection, XSS, etc.)
- [ ] Las queries de BD son eficientes (N+1, índices)
- [ ] Los error messages son claros para el usuario
- [ ] El código es legible sin necesidad de comentarios excesivos
