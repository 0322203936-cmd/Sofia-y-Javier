---
name: authentication-authorization
description: >
  Sistema completo de autenticación y autorización para ERP empresariales. Cubre JWT con refresh tokens,
  OAuth2, RBAC (Role-Based Access Control) multi-nivel, permisos granulares por módulo y acción,
  multi-tenancy, 2FA, password hashing con bcrypt/argon2, protección CSRF, session management y
  middleware de autorización. Usa esta skill SIEMPRE que necesites implementar login, registro,
  roles, permisos, control de acceso, tokens, sesiones, autenticación o seguridad de usuarios.
  Se activa con "login", "auth", "JWT", "roles", "permisos", "RBAC", "2FA", "password", "OAuth",
  "token", "sesión", "multi-tenancy", o cualquier referencia a autenticación y control de acceso.
---

# Authentication & Authorization — Sistemas ERP

Sistema completo de seguridad para aplicaciones empresariales con control de acceso granular.

## Arquitectura de Auth

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│   Cliente    │────▶│  Auth Guard  │────▶│  Permission   │
│  (Frontend)  │     │  (JWT Check) │     │    Guard      │
└─────────────┘     └──────────────┘     └───────────────┘
       │                    │                     │
       │              ┌─────┴─────┐         ┌─────┴─────┐
       │              │  Decode   │         │   Check    │
       ▼              │  Token    │         │   RBAC     │
  Login/Register      └───────────┘         └───────────┘
       │
  ┌────┴────┐
  │  Issue  │
  │ Tokens  │
  └─────────┘
    Access (15min)
    Refresh (7d)
```

## JWT con Refresh Tokens

### Servicio de Tokens

```typescript
// src/shared/infrastructure/services/token.service.ts
import jwt from 'jsonwebtoken';
import { envConfig } from '../config/env.config';

interface TokenPayload {
  userId: string;
  email: string;
  roles: string[];
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class TokenService {
  generateTokenPair(payload: TokenPayload): TokenPair {
    const accessToken = jwt.sign(payload, envConfig.JWT_SECRET, {
      expiresIn: '15m',  // Access token corto
      issuer: 'erp-api',
    });

    const refreshToken = jwt.sign(
      { userId: payload.userId, type: 'refresh' },
      envConfig.JWT_SECRET,
      { expiresIn: '7d', issuer: 'erp-api' },
    );

    return { accessToken, refreshToken, expiresIn: 900 }; // 15min en segundos
  }

  verifyAccessToken(token: string): TokenPayload {
    return jwt.verify(token, envConfig.JWT_SECRET, { issuer: 'erp-api' }) as TokenPayload;
  }

  verifyRefreshToken(token: string): { userId: string } {
    const payload = jwt.verify(token, envConfig.JWT_SECRET, { issuer: 'erp-api' }) as any;
    if (payload.type !== 'refresh') throw new Error('Invalid token type');
    return { userId: payload.userId };
  }
}
```

### Endpoints de Auth

```typescript
// src/modules/auth/infrastructure/routes/auth.routes.ts
export function authRoutes(prisma: PrismaService): Router {
  const router = Router();
  const authController = new AuthController(/* dependencies */);

  router.post('/register', validate(RegisterSchema), authController.register);
  router.post('/login', loginLimiter, validate(LoginSchema), authController.login);
  router.post('/refresh', validate(RefreshSchema), authController.refresh);
  router.post('/logout', authMiddleware, authController.logout);
  router.post('/forgot-password', validate(ForgotPasswordSchema), authController.forgotPassword);
  router.post('/reset-password', validate(ResetPasswordSchema), authController.resetPassword);
  router.get('/me', authMiddleware, authController.me);
  router.patch('/me', authMiddleware, validate(UpdateProfileSchema), authController.updateProfile);
  router.post('/change-password', authMiddleware, validate(ChangePasswordSchema), authController.changePassword);

  return router;
}
```

### Login

```typescript
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly tokenService: TokenService,
    private readonly sessionRepository: SessionRepository,
    private readonly auditService: AuditService,
  ) {}

  async login(dto: LoginDTO, meta: RequestMeta): Promise<Result<AuthResponse>> {
    // 1. Buscar usuario
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      // No revelar si el email existe o no
      return Result.fail('Credenciales inválidas');
    }

    // 2. Verificar cuenta activa
    if (!user.isActive) {
      return Result.fail('Tu cuenta ha sido desactivada. Contacta al administrador.');
    }

    // 3. Verificar password
    const validPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!validPassword) {
      await this.auditService.log({
        userId: user.id,
        action: 'LOGIN_FAILED',
        module: 'auth',
        entityType: 'user',
        entityId: user.id,
        ipAddress: meta.ipAddress,
      });
      return Result.fail('Credenciales inválidas');
    }

    // 4. Obtener roles y permisos
    const roles = await this.userRepository.getRoles(user.id);
    const permissions = await this.userRepository.getPermissions(user.id);

    // 5. Generar tokens
    const tokens = this.tokenService.generateTokenPair({
      userId: user.id,
      email: user.email,
      roles: roles.map(r => r.slug),
    });

    // 6. Guardar sesión
    await this.sessionRepository.create({
      userId: user.id,
      token: tokens.refreshToken,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // 7. Actualizar último login
    await this.userRepository.updateLastLogin(user.id);

    // 8. Auditoría
    await this.auditService.log({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      module: 'auth',
      entityType: 'user',
      entityId: user.id,
      ipAddress: meta.ipAddress,
    });

    return Result.ok({
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
      roles,
      permissions,
      tokens,
    });
  }
}
```

## Middleware de Autenticación

```typescript
// src/shared/infrastructure/middleware/auth.middleware.ts
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token de acceso requerido' },
    });
  }

  try {
    const token = authHeader.substring(7);
    const payload = tokenService.verifyAccessToken(token);
    req.user = payload; // Disponible en todos los controllers
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Token expirado, usa refresh token' },
      });
    }
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Token inválido' },
    });
  }
}
```

## RBAC — Role-Based Access Control

### Estructura de Permisos

```
Módulo (inventory) + Acción (create) + Recurso (product)
         ↓                   ↓                ↓
  "inventory"          "create"          "product"
```

### Middleware de Permisos

```typescript
// src/shared/infrastructure/middleware/permission.middleware.ts
export function requirePermission(module: string, action: string, resource?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'No autenticado' },
      });
    }

    // Los admins tienen acceso a todo
    if (req.user.roles.includes('admin')) {
      return next();
    }

    // Verificar permisos del usuario
    const permissions = await permissionService.getUserPermissions(req.user.userId);
    const hasPermission = permissions.some(p =>
      p.module === module &&
      p.action === action &&
      (resource ? p.resource === resource : true)
    );

    if (!hasPermission) {
      logger.warn('Access denied', {
        userId: req.user.userId,
        module,
        action,
        resource,
        url: req.originalUrl,
      });
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `No tienes permiso para ${action} en ${module}`,
        },
      });
    }

    next();
  };
}

// Uso en rutas
router.post('/products',
  authMiddleware,
  requirePermission('inventory', 'create', 'product'),
  validate(CreateProductSchema),
  productController.create,
);

router.delete('/products/:id',
  authMiddleware,
  requirePermission('inventory', 'delete', 'product'),
  productController.delete,
);
```

### Roles Predefinidos

```typescript
// Seed de roles y permisos del sistema
const systemRoles = [
  {
    name: 'Administrador',
    slug: 'admin',
    description: 'Acceso total al sistema',
    permissions: ['*'], // Acceso a todo
  },
  {
    name: 'Gerente',
    slug: 'manager',
    description: 'Gestión de ventas, inventario y reportes',
    permissions: [
      'inventory:*:*',         // Todo en inventario
      'sales:*:*',             // Todo en ventas
      'reports:read:*',        // Leer todos los reportes
      'crm:*:*',               // Todo en CRM
    ],
  },
  {
    name: 'Vendedor',
    slug: 'seller',
    description: 'Crear y gestionar órdenes de venta',
    permissions: [
      'inventory:read:product',    // Ver productos (no editar)
      'sales:create:order',        // Crear órdenes
      'sales:read:order',          // Ver órdenes
      'sales:update:order',        // Editar órdenes propias
      'crm:read:customer',         // Ver clientes
      'crm:create:customer',       // Crear clientes
    ],
  },
  {
    name: 'Almacenista',
    slug: 'warehouse',
    description: 'Gestión de inventario y stock',
    permissions: [
      'inventory:*:product',        // Todo con productos
      'inventory:*:stock',          // Todo con stock
      'inventory:*:warehouse',      // Todo con almacenes
      'purchasing:read:*',          // Ver compras
    ],
  },
  {
    name: 'Contador',
    slug: 'accountant',
    description: 'Acceso a facturación y contabilidad',
    permissions: [
      'accounting:*:*',             // Todo en contabilidad
      'sales:read:invoice',         // Ver facturas
      'sales:update:invoice',       // Actualizar facturas
      'reports:read:*',             // Todos los reportes
    ],
  },
];
```

## Password Hashing

```typescript
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12; // Balance entre seguridad y performance

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Validación de contraseña segura
const PasswordSchema = z.string()
  .min(8, 'Mínimo 8 caracteres')
  .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
  .regex(/[a-z]/, 'Debe contener al menos una minúscula')
  .regex(/[0-9]/, 'Debe contener al menos un número')
  .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial');
```

## Multi-Tenancy (Multi-Empresa)

### Patrón: Schema per Tenant

```typescript
// Middleware que determina el tenant
export function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  // El tenant se determina por subdominio o header
  const tenantId = req.headers['x-tenant-id'] as string
    ?? req.hostname.split('.')[0]; // empresa1.erp.com → empresa1

  if (!tenantId) {
    return res.status(400).json({
      success: false,
      error: { code: 'TENANT_REQUIRED', message: 'Tenant no especificado' },
    });
  }

  req.tenantId = tenantId;
  next();
}

// Todas las queries se filtran por tenant automáticamente
prisma.$use(async (params, next) => {
  // Models que son multi-tenant
  const tenantModels = ['Product', 'Order', 'Customer', 'Invoice'];

  if (tenantModels.includes(params.model)) {
    if (['findMany', 'findFirst', 'count'].includes(params.action)) {
      params.args.where = { ...params.args?.where, tenantId: currentTenantId() };
    }
    if (['create', 'createMany'].includes(params.action)) {
      params.args.data = { ...params.args.data, tenantId: currentTenantId() };
    }
  }

  return next(params);
});
```

## Seguridad — Checklist

- [ ] Passwords hasheados con bcrypt (mínimo 12 rounds)
- [ ] JWT con expiración corta (15min access, 7d refresh)
- [ ] Rate limiting en login (máx 10 intentos / 15min)
- [ ] CORS configurado solo para dominios permitidos
- [ ] Helmet configurado para headers de seguridad
- [ ] Input sanitizado (Zod validation en todos los endpoints)
- [ ] SQL injection prevenido (ORM con parametrized queries)
- [ ] XSS prevenido (no renderizar HTML de usuarios)
- [ ] CSRF protection para formularios (si usas cookies)
- [ ] Audit log de acciones sensibles
- [ ] Sesiones invalidables (logout revoca refresh token)
- [ ] Error messages genéricos en login (no revelar si el email existe)
- [ ] HTTPS obligatorio en producción

### 🧠 HUMAN-LIKE THINKING & EXPERT EXECUTION DIRECTIVES
- **STOP BEING GENERIC**: A simple login form returning a JWT is unacceptable for an ERP. Think like a DevSecOps Architect.
- **Real-World Security**: Mitigate brute force with rate limiting. Anticipate race conditions in token refreshing. 
- **Graceful Session Handling**: What happens when a user's token expires mid-request? Do not just throw a 401. Implement silent background refreshing.
- **Granular RBAC**: Do not just check `if (role === 'admin')`. A human engineer checks fine-grained permissions per resource, handling edge cases where a user can view their *own* data but not others.
- **Attack Vectors**: Preemptively code defenses against CSRF, XSS, and Timing Attacks.
