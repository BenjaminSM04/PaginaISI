import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function isLocalPresentationEnvironment() {
  const origins = (process.env.WEB_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 && origins.every((origin) =>
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin),
  );
}

async function main() {
  if (!isLocalPresentationEnvironment()) {
    throw new Error('Los datos de presentación solo pueden prepararse con WEB_ORIGIN local');
  }

  const admin = await prisma.user.findUnique({
    where: { email: 'admin@isi.edu.bo' },
    select: { id: true },
  });
  if (!admin) throw new Error('No se encontró la base demo: falta admin@isi.edu.bo');

  const demoReady = await prisma.notification.count({
    where: { userId: admin.id, dedupeKey: 'demo-system-ready' },
  });
  if (!demoReady) {
    throw new Error('La base no tiene el marcador del seed demo; no se modificó');
  }

  const [owner, collaborator, reviewer, incubatorProjects] = await Promise.all([
    prisma.user.findUnique({ where: { email: 'jmamani@est.isi.edu.bo' }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: 'mrojas@est.isi.edu.bo' }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: 'rmendoza@isi.edu.bo' }, select: { id: true } }),
    prisma.project.findMany({
      where: { slug: { in: ['sistema-gestion-biblioteca', 'agromonitor-iot'] }, isIncubator: true },
      select: { id: true },
    }),
  ]);
  if (!owner || !collaborator || !reviewer || incubatorProjects.length !== 2) {
    throw new Error('La base demo no contiene los usuarios o proyectos esperados; no se modificó');
  }

  await prisma.$transaction(async (tx) => {
    const applications = [
      {
        id: 'demo-app-univalle',
        name: 'Sitio oficial de Univalle',
        description: 'Información institucional, sedes, oferta académica y servicios de la Universidad Privada del Valle.',
        icon: 'globe-2',
        url: 'https://www.univalle.edu/',
        category: 'Servicios institucionales',
        sortOrder: 10,
        openInNewTab: true,
      },
      {
        id: 'demo-app-siu',
        name: 'Portal del estudiante Univalle',
        description: 'Inicio de sesión en el portal institucional para estudiantes y comunidad universitaria.',
        icon: 'graduation-cap',
        url: 'https://login.univalle.edu/PortalUnivalle/WebForm/PAutenticar.aspx',
        category: 'Servicios institucionales',
        sortOrder: 20,
        openInNewTab: true,
      },
      {
        id: 'demo-app-portafolio',
        name: 'Portafolio de proyectos',
        description: 'Explora soluciones desarrolladas por estudiantes de Ingeniería de Sistemas.',
        icon: 'app-window',
        url: '/proyectos',
        category: 'Recursos de la carrera',
        sortOrder: 30,
        openInNewTab: false,
      },
      {
        id: 'demo-app-sociedad',
        name: 'Sociedad Científica',
        description: 'Comunidades técnicas, investigación estudiantil y actividades de la carrera.',
        icon: 'users',
        url: '/sociedad-cientifica',
        category: 'Recursos de la carrera',
        sortOrder: 40,
        openInNewTab: false,
      },
    ] as const;

    for (const application of applications) {
      await tx.institutionalApplication.upsert({
        where: { id: application.id },
        create: { ...application, visibleRoles: [], isActive: true },
        update: { ...application, visibleRoles: [], isActive: true },
      });
    }

    const client = await tx.incubatorClient.upsert({
      where: { normalizedName: 'empresa aliada (demostracion)' },
      create: {
        id: 'demo-incubator-client',
        name: 'Empresa aliada (demostración)',
        normalizedName: 'empresa aliada (demostracion)',
        logoUrl: '/demo/clientes/empresa-aliada.svg',
        isActive: true,
      },
      update: {
        name: 'Empresa aliada (demostración)',
        logoUrl: '/demo/clientes/empresa-aliada.svg',
        isActive: true,
      },
    });

    for (const project of incubatorProjects) {
      await tx.project.update({
        where: { id: project.id },
        data: { clients: { connect: { id: client.id } } },
      });
    }

    const idea = await tx.ideaProposal.upsert({
      where: { id: 'demo-idea-campus-inteligente' },
      create: {
        id: 'demo-idea-campus-inteligente',
        title: 'Mapa inteligente de servicios para estudiantes',
        description:
          'Propuesta demostrativa para centralizar ubicaciones, horarios y disponibilidad de servicios de apoyo estudiantil.',
        problem:
          'Los estudiantes nuevos consultan información dispersa y tardan en ubicar servicios, laboratorios y actividades.',
        proposedSolution:
          'Una aplicación web progresiva con mapa, buscador, rutas accesibles y avisos mantenidos por responsables institucionales.',
        technologies: ['Next.js', 'NestJS', 'PostgreSQL', 'Mapas'],
        isRealClient: false,
        status: 'APPROVED',
        reviewComment: 'Idea de demostración aprobada para mostrar el flujo público de Incubadora.',
        ownerId: owner.id,
        reviewerId: reviewer.id,
        decidedAt: new Date(),
      },
      update: {
        title: 'Mapa inteligente de servicios para estudiantes',
        description:
          'Propuesta demostrativa para centralizar ubicaciones, horarios y disponibilidad de servicios de apoyo estudiantil.',
        problem:
          'Los estudiantes nuevos consultan información dispersa y tardan en ubicar servicios, laboratorios y actividades.',
        proposedSolution:
          'Una aplicación web progresiva con mapa, buscador, rutas accesibles y avisos mantenidos por responsables institucionales.',
        technologies: ['Next.js', 'NestJS', 'PostgreSQL', 'Mapas'],
        isRealClient: false,
        status: 'APPROVED',
        reviewComment: 'Idea de demostración aprobada para mostrar el flujo público de Incubadora.',
        reviewerId: reviewer.id,
        decidedAt: new Date(),
      },
    });

    for (const userId of [owner.id, collaborator.id]) {
      await tx.ideaMember.upsert({
        where: { ideaId_userId: { ideaId: idea.id, userId } },
        create: { ideaId: idea.id, userId },
        update: {},
      });
    }
  });

  const [applications, clients, ideas] = await Promise.all([
    prisma.institutionalApplication.count({ where: { isActive: true } }),
    prisma.incubatorClient.count({ where: { isActive: true } }),
    prisma.ideaProposal.count({ where: { status: 'APPROVED' } }),
  ]);
  console.log(`Presentación preparada: ${applications} aplicaciones, ${clients} cliente(s) y ${ideas} idea(s) aprobada(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
