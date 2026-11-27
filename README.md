# MyOO

Aplicación web para gestionar armarios, prendas y outfits, con las prendas representadas como modelos 3D.

- `Backend/`: API NestJS + Prisma + PostgreSQL (Docker). Ver `Backend/README.md`.
- `Frontend/`: React + Vite + React Three Fiber. Ver `Frontend/README.md`.

## Arranque rápido

```bash
# Terminal 1: API y base de datos
cd Backend
cp .env.example .env && cp .env.test.example .env.test
npm install
npm run db:up
npx prisma migrate dev --name init
npm run db:seed
npm run start:dev

# Terminal 2: web
cd Frontend
npm install
npm run dev
```

Abre http://localhost:5173 y entra con `demo@myout.dev` / `Demo1234!`. Es una base de datos local de prueba, con 39 prendas y 10 outfits.

Correo (opcional): con `RESEND_API_KEY` y `EMAIL_FROM` en el backend se activan «¿Olvidaste tu contraseña?», verificar el email y los avisos por correo. Sin ellas todo funciona igual. Cómo crear la cuenta de Resend, verificar un dominio y qué poner en Vercel: «Correo con Resend» en `Backend/README.md`.
