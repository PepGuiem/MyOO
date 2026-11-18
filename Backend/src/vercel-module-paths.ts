/**
 * Solo para Vercel (con la variable VERCEL). Va importado lo PRIMERO en main.ts.
 *
 * Con «services» y NestJS, Vercel pone el main.js compilado en la raíz de la
 * función (/var/task) y las dependencias en otra carpeta (p. ej.
 * /var/task/Backend/node_modules), así que Node no las encuentra
 * («Cannot find module '@nestjs/common'»). Es un fallo abierto de Vercel:
 * https://github.com/vercel/vercel/issues/17712
 *
 * Aquí se busca esa carpeta node_modules y se añade a las rutas de Node.
 * No importa ningún paquete externo (aún no se encontrarían).
 */
import { existsSync, readdirSync } from 'node:fs';
import Module from 'node:module';
import { delimiter, join } from 'node:path';

const MARKER = join('@nestjs', 'common', 'package.json');

function findNodeModules(root: string): string[] {
  const found: string[] = [];
  const check = (dir: string) => {
    const nm = join(dir, 'node_modules');
    if (existsSync(join(nm, MARKER))) found.push(nm);
  };
  check(root);
  // Un par de niveles por debajo de la raíz de la función (Backend/, etc.).
  const walk = (dir: string, depth: number) => {
    if (depth === 0) return;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.'))
        .map((e) => e.name);
    } catch {
      return;
    }
    for (const name of entries) {
      check(join(dir, name));
      walk(join(dir, name), depth - 1);
    }
  };
  walk(root, 2);
  return found;
}

if (process.env.VERCEL) {
  const extra = [...new Set([__dirname, process.cwd()].flatMap(findNodeModules))];
  if (extra.length) {
    const current = (process.env.NODE_PATH ?? '').split(delimiter).filter(Boolean);
    process.env.NODE_PATH = [...new Set([...current, ...extra])].join(delimiter);
    // Node lee NODE_PATH al arrancar: así lo vuelve a leer ya.
    (Module as unknown as { _initPaths: () => void })._initPaths();
  }
  console.log(`[vercel-module-paths] node_modules: ${extra.join(', ') || 'ninguna extra'}`);
}
