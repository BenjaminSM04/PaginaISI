import { PointCategory, PointReason, PrismaClient, RoleName } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_ADMIN_PASSWORD = 'password123';
const adminEmail = process.env.ADMIN_SEED_EMAIL ?? 'admin@isi.edu.bo';
const adminUsername = process.env.ADMIN_SEED_USERNAME ?? 'admin';
const adminFullName = process.env.ADMIN_SEED_FULLNAME ?? 'Administrador del Portal';
const adminBio = process.env.ADMIN_SEED_BIO ?? 'Cuenta administrativa del portal ISI.';
const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
const forcePasswordReset = process.env.ADMIN_SEED_RESET_PASSWORD === 'true';

const roleNames: RoleName[] = ['STUDENT', 'TEACHER', 'COMMUNITY_LEADER', 'ADMIN'];

const pointRules: [PointReason, PointCategory, number, string, number?][] = [
  ['REGISTRO_COMPLETO', 'COMMUNITY', 10, 'Registro y perfil completo'],
  ['UNIRSE_COMUNIDAD', 'COMMUNITY', 5, 'Unirse a una comunidad'],
  ['INSCRIPCION_EVENTO', 'COMMUNITY', 5, 'Inscribirse a un evento'],
  ['PREGUNTA_PUBLICADA', 'DEV', 5, 'Publicar una pregunta válida'],
  ['RESPUESTA_PUBLICADA', 'DEV', 10, 'Responder una pregunta'],
  ['RESPUESTA_ACEPTADA', 'DEV', 30, 'Respuesta marcada como correcta'],
  ['PROYECTO_APROBADO', 'DEV', 40, 'Proyecto aprobado por docente'],
  ['ARTICULO_APROBADO', 'RESEARCH', 35, 'Artículo científico aprobado'],
  ['LIKE_RECIBIDO', 'COMMUNITY', 1, 'Like recibido en proyecto o artículo', 20],
  ['REPORTE_VALIDO', 'COMMUNITY', 5, 'Reporte válido de contenido indebido'],
  ['PENALIZACION_SPAM', 'COMMUNITY', -15, 'Penalización por contenido spam'],
  ['AJUSTE_ADMIN', 'COMMUNITY', 0, 'Ajuste manual del administrador'],
];

const badgeDefs: [string, string, string, string, string][] = [
  ['PRIMER_PROYECTO', 'Primer Proyecto', 'Publicó su primer proyecto aprobado', 'rocket', '#6366f1'],
  ['PRIMER_ARTICULO', 'Primer Artículo', 'Publicó su primer artículo científico aprobado', 'file-text', '#0ea5e9'],
  ['PRIMERA_RESPUESTA', 'Primera Respuesta', 'Respondió su primera pregunta en el foro', 'message-circle', '#22c55e'],
  ['MENTOR_INICIAL', 'Mentor Inicial', 'Dictó su primera mentoría', 'graduation-cap', '#f59e0b'],
  ['CAZADOR_BUGS', 'Cazador de Bugs', 'Reportes válidos que mejoraron la plataforma', 'bug', '#ef4444'],
  ['INVESTIGADOR_JUNIOR', 'Investigador Junior', 'Dos o más artículos aprobados', 'microscope', '#8b5cf6'],
  ['DEV_CONTRIBUTOR', 'Dev Contributor', 'Dos o más proyectos aprobados', 'code', '#06b6d4'],
  ['COMUNIDAD_ACTIVA', 'Comunidad Activa', 'Participa en 3+ comunidades o eventos', 'users', '#10b981'],
  ['TOP_10_MES', 'Top 10 del Mes', 'Estuvo en el top 10 del ranking mensual', 'trophy', '#eab308'],
  ['RESPUESTA_ACEPTADA', 'Respuesta Aceptada', 'Su respuesta fue marcada como correcta', 'check-circle', '#84cc16'],
];

async function main() {
  const roles: Record<RoleName, { id: number }> = {} as never;
  for (const name of roleNames) {
    roles[name] = await prisma.role.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }

  for (const [reason, category, points, label, dailyLimit] of pointRules) {
    await prisma.pointRule.upsert({
      where: { reason },
      create: { reason, category, points, label, dailyLimit: dailyLimit ?? null },
      // Un reinicio del inicializador conserva las reglas del administrador.
      update: {},
    });
  }

  for (const [code, name, description, icon, color] of badgeDefs) {
    await prisma.badge.upsert({
      where: { code },
      create: { code, name, description, icon, color },
      update: {},
    });
  }

  const hash = bcrypt.hashSync(adminPassword, 10);
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

  let admin;
  if (!existing) {
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        username: adminUsername,
        passwordHash: hash,
        mustChangePassword: true,
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: roles.ADMIN.id } },
        profile: { create: { fullName: adminFullName, bio: adminBio, career: 'Ingeniería de Sistemas' } },
      },
    });
    console.log(`Admin creado: ${adminEmail} (${adminUsername}).`);
  } else {
    admin = existing;
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: roles.ADMIN.id } },
      create: { userId: admin.id, roleId: roles.ADMIN.id },
      update: {},
    });
    await prisma.profile.upsert({
      where: { userId: admin.id },
      create: { userId: admin.id, fullName: adminFullName, bio: adminBio, career: 'Ingeniería de Sistemas' },
      update: {},
    });
    if (forcePasswordReset) {
      await prisma.$transaction(async tx => {
        const now = new Date();
        await tx.user.update({
          where: { id: admin.id },
          data: { passwordHash: hash, mustChangePassword: true, securityVersion: { increment: 1 }, refreshTokenHash: null },
        });
        await tx.refreshSession.updateMany({ where: { userId: admin.id, revokedAt: null }, data: { revokedAt: now } });
        await tx.authActionToken.updateMany({ where: { userId: admin.id, usedAt: null }, data: { usedAt: now } });
        await tx.twoFactorChallenge.deleteMany({ where: { userId: admin.id } });
        await tx.twoFactorCredential.updateMany({ where: { userId: admin.id }, data: { pendingEncrypted: null, pendingExpiresAt: null } });
      });
      console.log(`Admin existente: contraseña restablecida (${adminEmail}).`);
    } else {
      console.log(`Admin existente, sin cambios de credenciales: ${adminEmail}.`);
    }
  }

  await prisma.notificationPreference.upsert({
    where: { userId: admin.id },
    create: { userId: admin.id },
    update: {},
  });

  const rolesCount = await prisma.role.count();
  const rulesCount = await prisma.pointRule.count();
  const badgesCount = await prisma.badge.count();
  const rolesOfAdmin = await prisma.userRole.findMany({
    where: { userId: admin.id },
    select: { role: { select: { name: true } } },
  });
  console.log(`Datos base listos: ${rolesCount} roles, ${rulesCount} reglas de puntos y ${badgesCount} insignias.`);
  console.log(`Roles del admin ${adminEmail}: ${rolesOfAdmin.map((entry) => entry.role.name).join(', ')}`);
  if (adminPassword === DEFAULT_ADMIN_PASSWORD) {
    console.warn('ADMIN_SEED_PASSWORD no definido: se usó la contraseña por defecto. La cuenta requiere cambiarla en el primer acceso.');
  }
  console.log('Seed de despliegue completado.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
