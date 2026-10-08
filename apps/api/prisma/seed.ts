import { seedDemoData } from './demo-data';
import { PrismaClient } from '@prisma/client';
import { INITIAL_ROLES, PERMISSIONS, ROLE_PERMISSIONS } from '@church/shared';
import * as argon2 from 'argon2';

async function seed() {
  if (
    process.env.NODE_ENV !== 'development' ||
    process.env.SEED_DEMO !== 'true'
  ) {
    throw new Error(
      'Demo seed requires NODE_ENV=development and SEED_DEMO=true; never run against production data',
    );
  }
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password.length < 12 || password.length > 128) {
    throw new Error(
      'Set SEED_DEMO_PASSWORD to a development-only password of 12-128 characters',
    );
  }
  const db = new PrismaClient();
  try {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await db.$transaction(
      async (tx) => {
        for (const code of PERMISSIONS) {
          await tx.permission.upsert({
            where: { code },
            create: { code },
            update: {},
          });
        }
        for (const name of INITIAL_ROLES) {
          const role = await tx.role.upsert({
            where: { name },
            create: { name },
            update: {},
          });
          const allowed = await tx.permission.findMany({
            where: { code: { in: [...ROLE_PERMISSIONS[name]] } },
          });
          await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
          for (const permission of allowed) {
            await tx.rolePermission.create({
              data: { roleId: role.id, permissionId: permission.id },
            });
          }
        }
        const demos = [
          {
            name: 'Super Administrador Demo',
            email: 'superadmin@ponte.example',
            role: 'SUPER_ADMIN',
          },
          {
            name: 'Administrador Demo',
            email: 'admin@ponte.example',
            role: 'ADMIN',
          },
          {
            name: 'Secretaria Demo',
            email: 'secretaria@ponte.example',
            role: 'SECRETARY',
          },
          {
            name: 'Membro Demo',
            email: 'membro@ponte.example',
            role: 'MEMBER',
          },
          {
            name: 'Biblioteca Demo',
            email: 'biblioteca@ponte.example',
            role: 'LIBRARY',
          },
        ];
        demos.push({
          name: 'Financeiro Demo',
          email: 'financeiro@ponte.example',
          role: 'FINANCE',
        });
        for (const demo of demos) {
          const user = await tx.user.upsert({
            where: { email: demo.email },
            create: {
              name: demo.name,
              email: demo.email,
              passwordHash,
              status: 'ACTIVE',
            },
            update: {},
          });
          const role = await tx.role.findUniqueOrThrow({
            where: { name: demo.role },
          });
          await tx.userRole.upsert({
            where: { userId_roleId: { userId: user.id, roleId: role.id } },
            create: { userId: user.id, roleId: role.id },
            update: {},
          });
        }
        const members = [
          {
            id: 'a0b00000-0000-4000-8000-000000000001',
            name: 'Ana Demonstração',
            email: 'ana@ponte.example',
            status: 'ACTIVE' as const,
          },
          {
            id: 'a0b00000-0000-4000-8000-000000000002',
            name: 'Bruno Demonstração',
            email: 'bruno@ponte.example',
            status: 'ACTIVE' as const,
          },
          {
            id: 'a0b00000-0000-4000-8000-000000000003',
            name: 'Carla Demonstração',
            email: 'carla@ponte.example',
            status: 'INACTIVE' as const,
          },
        ];
        for (const member of members) {
          await tx.member.upsert({
            where: { id: member.id },
            create: member,
            update: {},
          });
        }
        const book = await tx.book.upsert({
          where: { isbn: 'DEMO-PONTE-001' },
          create: {
            title: 'Biblioteca Ponte: guia de demonstração',
            author: 'Equipe Ponte',
            isbn: 'DEMO-PONTE-001',
            category: 'Comunidade',
            keywords: ['demo'],
          },
          update: {},
        });
        await tx.bookCopy.upsert({
          where: { assetCode: 'DEMO-001' },
          create: {
            bookId: book.id,
            assetCode: 'DEMO-001',
            location: 'Estante Demo',
          },
          update: {},
        });
        await seedDemoData(tx);
        await tx.librarySettings.upsert({
          where: { id: 1 },
          create: { id: 1 },
          update: {},
        });
      },
      { timeout: 30000 },
    );
    console.info(
      'Development demo seed completed (existing users/passwords and members preserved).',
    );
  } finally {
    await db.$disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
