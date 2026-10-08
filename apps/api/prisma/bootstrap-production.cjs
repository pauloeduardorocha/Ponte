// Run with DATABASE_URL supplied securely by the operator; never loads local .env.
const { PrismaClient } = require('@prisma/client');
const {
  INITIAL_ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
} = require('@church/shared');

async function main() {
  if (process.env.NODE_ENV !== 'production' || !process.env.DATABASE_URL) {
    throw new Error('Set NODE_ENV=production and DATABASE_URL explicitly');
  }
  const db = new PrismaClient();
  try {
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
          const permissions = await tx.permission.findMany({
            where: { code: { in: [...ROLE_PERMISSIONS[name]] } },
          });
          for (const permission of permissions) {
            await tx.rolePermission.upsert({
              where: {
                roleId_permissionId: {
                  roleId: role.id,
                  permissionId: permission.id,
                },
              },
              create: { roleId: role.id, permissionId: permission.id },
              update: {},
            });
          }
        }
        if (process.env.BOOTSTRAP_ADMIN_EMAIL) {
          const user = await tx.user.findUnique({
            where: {
              email: process.env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase(),
            },
          });
          if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
            throw new Error(
              'Register and verify an active administrator account before granting SUPER_ADMIN',
            );
          }
          const role = await tx.role.findUniqueOrThrow({
            where: { name: 'SUPER_ADMIN' },
          });
          await tx.userRole.upsert({
            where: { userId_roleId: { userId: user.id, roleId: role.id } },
            create: { userId: user.id, roleId: role.id },
            update: {},
          });
        }
      },
      { timeout: 60000 },
    );
    console.log(
      'Production roles provisioned. No demo data or passwords created.',
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
