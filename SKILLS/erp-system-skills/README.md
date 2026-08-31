# 🏢 ERP System Skills — Paquete Completo

Colección profesional de 20 skills organizadas para construir **sistemas ERP completos** de forma eficiente, escalable y sin errores.

## 📋 Stack Tecnológico Base

| Capa | Tecnología |
|------|-----------|
| **Frontend** | React 18+ / Next.js 14+ con TypeScript |
| **Backend** | Node.js + Express / NestJS con TypeScript |
| **Base de Datos** | PostgreSQL + Prisma ORM |
| **Cache** | Redis |
| **Testing** | Vitest + Testing Library + Supertest |
| **CI/CD** | GitHub Actions + Docker |

> Las skills son agnósticas y pueden adaptarse a otros stacks, pero los ejemplos usan este por defecto.

## 🗂️ Estructura de Áreas

```
erp-system-skills/
├── architecture/    → Arquitectura y planificación de módulos
├── database/        → Diseño y optimización de BD
├── backend/         → APIs, auth, jobs y patrones backend
├── frontend/        → Componentes ERP, estado y layouts
├── quality/         → Testing, errores, CI/CD, calidad de código
└── data/            → Reportes, import/export, auditoría, lógica de negocio
```

## 🚀 Instalación

### Opción A: Configuración global (recomendada)
Copia la carpeta `erp-system-skills/` a tu directorio de configuración global:
- **Windows**: `C:\Users\<tu-usuario>\.gemini\config\skills\`
- **Mac/Linux**: `~/.gemini/config/skills/`

### Opción B: Configuración por proyecto
Copia la carpeta a `.agents/skills/` en la raíz de tu proyecto.

### Opción C: Referencia vía skills.json
Agrega una entrada en tu `skills.json` apuntando a esta carpeta:
```json
{
  "entries": [
    { "path": "C:/Users/<tu-usuario>/Desktop/PAGINA BODA ANAHI/SKILLS/erp-system-skills" }
  ]
}
```

## 📖 Skills Incluidas

### 📐 Arquitectura (2 skills)
| Skill | Descripción |
|-------|-------------|
| `system-architecture` | Clean Architecture, patrones de diseño, estructura de proyecto |
| `erp-module-planner` | Planificación de módulos ERP con entidades y flujos |

### 🗄️ Base de Datos (2 skills)
| Skill | Descripción |
|-------|-------------|
| `database-design` | Esquemas, normalización, migraciones, seeders |
| `database-optimization` | Índices, query tuning, cache, connection pooling |

### 🔧 Backend & API (4 skills)
| Skill | Descripción |
|-------|-------------|
| `api-design` | REST API design, OpenAPI, versionamiento |
| `backend-node-patterns` | Node.js patterns, middleware, validación |
| `authentication-authorization` | JWT, RBAC, multi-tenancy, 2FA |
| `background-jobs-automation` | Colas, cron jobs, workflows, notificaciones |

### 🖥️ Frontend ERP (3 skills)
| Skill | Descripción |
|-------|-------------|
| `erp-ui-components` | DataTables, formularios, dashboards, exports |
| `state-management-erp` | Zustand, TanStack Query, WebSockets |
| `responsive-layout-system` | Layouts dashboard, sidebar, design tokens |

### ✅ Calidad & DevOps (4 skills)
| Skill | Descripción |
|-------|-------------|
| `testing-strategy` | Unit, Integration, E2E testing |
| `error-handling-logging` | Error handling global, logging, monitoreo |
| `ci-cd-deployment` | GitHub Actions, Docker, deployment strategies |
| `code-quality-standards` | ESLint, Prettier, Husky, conventions |

### 📊 Datos & Reportes (4 skills)
| Skill | Descripción |
|-------|-------------|
| `reporting-engine` | Reportes PDF/Excel, dashboards KPI |
| `data-import-export` | Importación masiva, validación, transformación |
| `audit-trail` | Auditoría, historial de cambios, compliance |
| `business-logic-patterns` | Lógica de negocio, cálculos, flujos de aprobación |

## 🔄 Compatibilidad

Estas skills son compatibles con:
- ✅ Gemini / Antigravity IDE
- ✅ Claude Code / Claude.ai
- ✅ Cursor
- ✅ Cualquier IDE con soporte de skills (formato estándar SKILL.md)
