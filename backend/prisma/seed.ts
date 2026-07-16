import {
  ApprovalDecision,
  LikeTargetType,
  MembershipRole,
  NewsCategory,
  PointCategory,
  PointReason,
  PrismaClient,
  RoleName,
  VoteTargetType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const seedOnFirstRun = process.env.SEED_ON_FIRST_RUN === 'true';
const forceDemoSeed = process.env.ALLOW_DEMO_SEED === 'true';
const webOrigin = process.env.WEB_ORIGIN ?? '';
const configuredOrigins = webOrigin.split(',').map((origin) => origin.trim()).filter(Boolean);
const localDemoOrigin = configuredOrigins.length > 0 && configuredOrigins.every((origin) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin),
);

if (!seedOnFirstRun && !forceDemoSeed) {
  throw new Error('Seed no autorizado: usa SEED_ON_FIRST_RUN=true o ALLOW_DEMO_SEED=true');
}
if (process.env.NODE_ENV === 'production' && !seedOnFirstRun) {
  throw new Error('El reset manual del seed demo está bloqueado en producción');
}
if (process.env.NODE_ENV === 'production' && seedOnFirstRun && !localDemoOrigin && !forceDemoSeed) {
  throw new Error('Seed demo público bloqueado: desactiva SEED_ON_FIRST_RUN o confirma ALLOW_DEMO_SEED=true');
}

const prisma = new PrismaClient();

const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
const unsplash = (photoId: string, width = 1600) =>
  `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=${width}&q=72`;
const avatar = (name: string) =>
  `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundType=gradientLinear`;
const communityLogo = (name: string) =>
  `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(name)}`;
const PASSWORD = 'password123';
const FIRST_RUN_LOCK_ID = 741328519;

async function acquireFirstRunLock() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const [result] = await prisma.$queryRaw<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_lock(${FIRST_RUN_LOCK_ID}) AS acquired
    `;
    if (result?.acquired) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('No se pudo obtener el bloqueo del seed inicial después de 120 segundos');
}

async function wipe() {
  // La bitácora está protegida por un trigger append-only. Solo este flujo de
  // reset demo, ya autorizado por las validaciones superiores, puede vaciarla.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ProjectAuditLog" CASCADE');
  await prisma.$transaction([
    prisma.authActionToken.deleteMany(),
    prisma.refreshSession.deleteMany(),
    prisma.notificationPreference.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.pointsTransaction.deleteMany(),
    prisma.userBadge.deleteMany(),
    prisma.approvalRequest.deleteMany(),
    prisma.report.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.like.deleteMany(),
    prisma.vote.deleteMany(),
    prisma.forumQuestion.updateMany({ data: { acceptedAnswerId: null } }),
    prisma.forumAnswer.deleteMany(),
    prisma.forumQuestion.deleteMany(),
    prisma.mentorshipEnrollment.deleteMany(),
    prisma.mentorship.deleteMany(),
    prisma.eventRegistration.deleteMany(),
    prisma.event.deleteMany(),
    prisma.articleAuthor.deleteMany(),
    prisma.article.deleteMany(),
    prisma.mediaAsset.deleteMany(),
    prisma.projectTechnology.deleteMany(),
    prisma.projectMember.deleteMany(),
    prisma.project.deleteMany(),
    prisma.news.deleteMany(),
    prisma.communityMember.deleteMany(),
    prisma.community.deleteMany(),
    prisma.userSkill.deleteMany(),
    prisma.skill.deleteMany(),
    prisma.pointRule.deleteMany(),
    prisma.badge.deleteMany(),
    prisma.profile.deleteMany(),
    prisma.userRole.deleteMany(),
    prisma.role.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

async function award(userId: string, reason: PointReason, category: PointCategory, points: number, sourceType?: string, sourceId?: string, note?: string) {
  await prisma.pointsTransaction.create({
    data: { userId, reason, category, points, sourceType: sourceType ?? null, sourceId: sourceId ?? null, note },
  });
  const field = category === 'DEV' ? 'devPoints' : category === 'RESEARCH' ? 'researchPoints' : 'communityPoints';
  await prisma.profile.update({
    where: { userId },
    data: { [field]: { increment: points }, totalPoints: { increment: points } },
  });
}

async function main() {
  if (seedOnFirstRun) {
    // El lock evita que dos réplicas intenten inicializar la misma base a la vez.
    // Se libera al desconectar Prisma en el finally inferior.
    await acquireFirstRunLock();
    const existingUsers = await prisma.user.count();
    if (existingUsers > 0) {
      console.log(`Seed inicial omitido: la base ya contiene ${existingUsers} usuario(s).`);
      const demoAdmin = await prisma.user.findUnique({ where: { email: 'admin@isi.edu.bo' }, select: { id: true } });
      if (demoAdmin) {
        const completionMarker = await prisma.notification.count({
          where: { userId: demoAdmin.id, dedupeKey: 'demo-system-ready' },
        });
        if (completionMarker === 0) {
          console.warn('La base parece contener una carga demo incompleta; se conservó sin cambios. Usa el reset demo explícito para reconstruirla.');
        }
      }
      return;
    }
    console.log('Primera base vacía detectada; cargando datos demo...');
  } else {
    console.warn('Reset demo confirmado: se reemplazarán todos los datos existentes.');
  }
  await wipe();

  // Roles
  const roleNames: RoleName[] = ['STUDENT', 'TEACHER', 'COMMUNITY_LEADER', 'ADMIN'];
  const roles: Record<string, { id: number }> = {};
  for (const name of roleNames) roles[name] = await prisma.role.create({ data: { name } });

  // Reglas de puntos
  const rules: [PointReason, PointCategory, number, string, number?][] = [
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
  for (const [reason, category, points, label, dailyLimit] of rules) {
    await prisma.pointRule.create({ data: { reason, category, points, label, dailyLimit: dailyLimit ?? null } });
  }

  // Insignias
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
  const badges: Record<string, { id: string }> = {};
  for (const [code, name, description, icon, color] of badgeDefs) {
    badges[code] = await prisma.badge.create({ data: { code, name, description, icon, color } });
  }

  // Usuarios
  const hash = bcrypt.hashSync(PASSWORD, 10);
  async function createUser(
    email: string,
    username: string,
    fullName: string,
    roleList: RoleName[],
    opts: { bio?: string; semester?: number; github?: string; linkedin?: string; website?: string } = {},
  ) {
    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash: hash,
        emailVerifiedAt: new Date(),
        roles: { create: roleList.map((r) => ({ roleId: roles[r].id })) },
        profile: {
          create: {
            fullName,
            avatarUrl: avatar(fullName),
            bio: opts.bio,
            semester: opts.semester ?? null,
            githubUrl: opts.github,
            linkedinUrl: opts.linkedin,
            websiteUrl: opts.website,
            career: 'Ingeniería de Sistemas Informáticos',
          },
        },
      },
    });
    return user;
  }

  const admin = await createUser('admin@isi.edu.bo', 'admin', 'Administrador del Portal', ['ADMIN'], { bio: 'Cuenta administrativa del portal ISI.' });
  const rmendoza = await createUser('rmendoza@isi.edu.bo', 'rmendoza', 'Roberto Mendoza', ['TEACHER'], { bio: 'Docente de Ingeniería de Software y tutor de proyectos de grado.', linkedin: 'https://www.linkedin.com/in/roberto-mendoza-demo' });
  const lgutierrez = await createUser('lgutierrez@isi.edu.bo', 'lgutierrez', 'Laura Gutiérrez', ['TEACHER'], { bio: 'Docente de Redes y Seguridad. Asesora de la Sociedad Científica.', linkedin: 'https://www.linkedin.com/in/laura-gutierrez-demo' });
  const avargas = await createUser('avargas@est.isi.edu.bo', 'avargas', 'Andrea Vargas', ['STUDENT', 'COMMUNITY_LEADER'], { bio: 'Apasionada por la ciberseguridad y los CTF. Líder de HackLab ISI.', semester: 8, github: 'https://github.com/avargas-demo', linkedin: 'https://www.linkedin.com/in/avargas-demo' });
  const jmamani = await createUser('jmamani@est.isi.edu.bo', 'jmamani', 'José Mamani', ['STUDENT'], { bio: 'Desarrollador full stack enfocado en productos académicos con impacto real.', semester: 7, github: 'https://github.com/jmamani-demo', website: 'https://jmamani-demo.example.com' });
  const cflores = await createUser('cflores@est.isi.edu.bo', 'cflores', 'Camila Flores', ['STUDENT'], { bio: 'Investigadora junior en IA aplicada a la salud.', semester: 9 });
  const dquispe = await createUser('dquispe@est.isi.edu.bo', 'dquispe', 'Diego Quispe', ['STUDENT', 'COMMUNITY_LEADER'], { bio: 'Cloud enthusiast. AWS Community Builder en formación.', semester: 6 });
  const mrojas = await createUser('mrojas@est.isi.edu.bo', 'mrojas', 'María Rojas', ['STUDENT'], { bio: 'Programación competitiva y algoritmos. Codeforces specialist.', semester: 5 });
  const pcondori = await createUser('pcondori@est.isi.edu.bo', 'pcondori', 'Pablo Condori', ['STUDENT'], { bio: 'Backend y bases de datos. Aprendiendo NestJS.', semester: 4 });

  const students = [avargas, jmamani, cflores, dquispe, mrojas, pcondori];

  // Skills
  const skillNames = ['JavaScript', 'TypeScript', 'Python', 'React', 'Next.js', 'Node.js', 'NestJS', 'PostgreSQL', 'Docker', 'AWS', 'Ciberseguridad', 'Machine Learning', 'Flutter', 'Git'];
  const skills: Record<string, { id: number }> = {};
  for (const name of skillNames) skills[name] = await prisma.skill.create({ data: { name } });
  const skillMap: [string, string[]][] = [
    [avargas.id, ['Ciberseguridad', 'Python', 'Docker', 'Git']],
    [jmamani.id, ['JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL']],
    [cflores.id, ['Python', 'Machine Learning', 'PostgreSQL']],
    [dquispe.id, ['AWS', 'Docker', 'Node.js', 'TypeScript']],
    [mrojas.id, ['Python', 'JavaScript', 'Git']],
    [pcondori.id, ['NestJS', 'PostgreSQL', 'TypeScript']],
  ];
  for (const [userId, names] of skillMap) {
    for (const n of names) await prisma.userSkill.create({ data: { userId, skillId: skills[n].id, level: 3 } });
  }

  // Registro completo (+10) para todos los estudiantes
  for (const s of students) await award(s.id, 'REGISTRO_COMPLETO', 'COMMUNITY', 10, 'USER', s.id);

  // Comunidades
  const hacklab = await prisma.community.create({
    data: {
      slug: 'ciberseguridad', name: 'HackLab — Ciberseguridad', accentColor: '#22d3ee',
      logoUrl: communityLogo('HackLab ISI'),
      coverUrl: unsplash('photo-1550751827-4bd374c3f58b'),
      description: 'Comunidad de hacking ético, CTF y seguridad ofensiva/defensiva.',
      longDescription: 'HackLab agrupa a estudiantes interesados en seguridad informática: resolvemos CTF nacionales e internacionales, organizamos talleres de pentesting y auditamos (con permiso) sistemas de la carrera.',
      teacherLeadId: lgutierrez.id, studentLeadId: avargas.id,
      whatsappUrl: 'https://chat.whatsapp.com/demo-hacklab', teamsUrl: 'https://teams.microsoft.com/l/team/demo-hacklab',
    },
  });
  const codewars = await prisma.community.create({
    data: {
      slug: 'programacion-competitiva', name: 'CodeArena — Programación Competitiva', accentColor: '#f472b6',
      logoUrl: communityLogo('CodeArena ISI'),
      coverUrl: unsplash('photo-1515879218367-8466d910aaa4'),
      description: 'Entrenamiento para ICPC, Codeforces y competencias internas.',
      longDescription: 'Sesiones semanales de resolución de problemas, simulacros de ICPC y acompañamiento de estudiantes veteranos.',
      teacherLeadId: rmendoza.id, studentLeadId: mrojas.id,
      whatsappUrl: 'https://chat.whatsapp.com/demo-codearena',
    },
  });
  const cloud = await prisma.community.create({
    data: {
      slug: 'aws-cloud', name: 'Cloud ISI — AWS & DevOps', accentColor: '#fb923c',
      logoUrl: communityLogo('Cloud ISI'),
      coverUrl: unsplash('photo-1451187580459-43490279c0fa'),
      description: 'Arquitecturas cloud, certificaciones AWS y prácticas DevOps.',
      longDescription: 'Preparación para certificaciones AWS, laboratorios con free tier y buenas prácticas de infraestructura como código.',
      teacherLeadId: rmendoza.id, studentLeadId: dquispe.id,
      teamsUrl: 'https://teams.microsoft.com/l/team/demo-cloud',
    },
  });
  const incubadora = await prisma.community.create({
    data: {
      slug: 'incubadora', name: 'Incubadora de Proyectos', accentColor: '#a78bfa',
      logoUrl: communityLogo('Incubadora ISI'),
      coverUrl: unsplash('photo-1522071820081-009f0129c71c'),
      description: 'Acompañamiento a proyectos con potencial de producto real.',
      longDescription: 'La incubadora conecta equipos estudiantiles con docentes mentores para convertir proyectos de materia en productos con usuarios reales.',
      teacherLeadId: rmendoza.id, studentLeadId: jmamani.id,
    },
  });
  const mentorias = await prisma.community.create({
    data: {
      slug: 'mentorias', name: 'Red de Mentorías', accentColor: '#34d399',
      logoUrl: communityLogo('Mentorias ISI'),
      coverUrl: unsplash('photo-1523240795612-9a054b0db644'),
      description: 'Estudiantes seniors y docentes acompañan a los primeros semestres.',
      longDescription: 'Programa de mentorías entre pares: nivelación en programación, orientación de carrera y preparación para prácticas.',
      teacherLeadId: lgutierrez.id, studentLeadId: cflores.id,
    },
  });
  const iacom = await prisma.community.create({
    data: {
      slug: 'ia-datos', name: 'IA & Ciencia de Datos', accentColor: '#60a5fa',
      logoUrl: communityLogo('IA Datos ISI'),
      coverUrl: unsplash('photo-1518770660439-4636190af475'),
      description: 'Machine learning, ciencia de datos y proyectos de investigación aplicada.',
      longDescription: 'Espacio interdisciplinario para estudiar inteligencia artificial de forma responsable, compartir datasets y desarrollar investigación aplicada a salud, educación y servicios públicos.',
      teacherLeadId: lgutierrez.id, studentLeadId: cflores.id,
    },
  });

  // Membresías (+5 c/u)
  const memberships: [string, string, MembershipRole][] = [
    [hacklab.id, avargas.id, 'STUDENT_LEAD'],
    [hacklab.id, mrojas.id, 'MEMBER'],
    [hacklab.id, pcondori.id, 'MEMBER'],
    [codewars.id, mrojas.id, 'STUDENT_LEAD'],
    [codewars.id, jmamani.id, 'MEMBER'],
    [codewars.id, avargas.id, 'MEMBER'],
    [cloud.id, dquispe.id, 'STUDENT_LEAD'],
    [cloud.id, jmamani.id, 'MEMBER'],
    [incubadora.id, jmamani.id, 'STUDENT_LEAD'],
    [incubadora.id, cflores.id, 'MEMBER'],
    [mentorias.id, cflores.id, 'STUDENT_LEAD'],
    [mentorias.id, pcondori.id, 'MEMBER'],
    [iacom.id, cflores.id, 'STUDENT_LEAD'],
  ];
  for (const [communityId, userId, role] of memberships) {
    await prisma.communityMember.create({ data: { communityId, userId, role } });
    await award(userId, 'UNIRSE_COMUNIDAD', 'COMMUNITY', 5, 'COMMUNITY', communityId);
  }

  // Diez noticias permiten demostrar en paralelo las vistas de "más recientes"
  // y "más valoradas". Los cuerpos son contenido editorial completo, no lorem ipsum.
  const newsData: {
    slug: string;
    title: string;
    summary: string;
    content: string;
    category: NewsCategory;
    tags: string[];
    likesCount: number;
    communityId?: string;
    authorId: string;
    coverUrl: string;
    publishedInDays: number;
  }[] = [
    {
      slug: 'convocatoria-hackathon-salud-2026',
      title: 'Abren inscripciones para el Hackathon de Tecnología para la Salud',
      summary: 'Equipos multidisciplinarios tendrán 48 horas para prototipar soluciones a retos propuestos por profesionales de salud.',
      content: 'La Incubadora de Proyectos abrió la convocatoria al Hackathon de Tecnología para la Salud 2026. La actividad reunirá a estudiantes de sistemas, medicina y diseño para trabajar sobre retos de seguimiento de pacientes, prevención y acceso a información confiable.\n\nLa inscripción es gratuita y puede realizarse de forma individual o por equipos. Quienes se registren individualmente participarán en una sesión previa de conformación de grupos. Durante el evento habrá mentoría técnica, validación con especialistas y una presentación final ante un jurado.\n\nLos prototipos serán evaluados por su impacto, viabilidad, experiencia de usuario y tratamiento responsable de datos sensibles.',
      category: 'EVENTOS', tags: ['hackathon', 'salud', 'convocatoria'], likesCount: 5,
      communityId: incubadora.id, authorId: admin.id,
      coverUrl: unsplash('photo-1504384308090-c894fdcc538d'), publishedInDays: -1,
    },
    {
      slug: 'agromonitor-inicia-piloto-valle-bajo',
      title: 'AgroMonitor inicia su piloto de riego inteligente en el Valle Bajo',
      summary: 'El equipo instaló sensores LoRa en dos parcelas para medir humedad y comparar el consumo de agua frente al riego tradicional.',
      content: 'AgroMonitor comenzó la fase de campo de su piloto de riego inteligente. El equipo desplegó nodos con sensores de humedad y temperatura que transmiten datos mediante LoRa hacia un tablero web de seguimiento.\n\nDurante ocho semanas se registrarán lecturas, decisiones de riego y consumo hídrico. Productores asociados participan en el diseño de las alertas para que la recomendación sea comprensible y útil incluso con conectividad limitada.\n\nLa siguiente entrega contempla una aplicación móvil de bajo consumo y la publicación anonimizada del conjunto de datos para proyectos académicos.',
      category: 'PROYECTOS', tags: ['iot', 'agricultura', 'impacto-social'], likesCount: 4,
      communityId: incubadora.id, authorId: dquispe.id,
      coverUrl: unsplash('photo-1625246333195-78d9c38ad449'), publishedInDays: -3,
    },
    {
      slug: 'convenio-empresa-tech',
      title: 'Nuevo convenio amplía las prácticas profesionales para estudiantes ISI',
      summary: 'La carrera firmó un acuerdo con TechCorp Bolivia para abrir plazas de prácticas, mentorías y revisiones de portafolio.',
      content: 'La carrera de Ingeniería de Sistemas Informáticos suscribió un convenio de cooperación con TechCorp Bolivia orientado a estudiantes de los últimos semestres. El acuerdo habilita prácticas supervisadas en desarrollo de software, datos, infraestructura y ciberseguridad.\n\nLa primera convocatoria ofrecerá doce plazas y un ciclo de preparación con revisión de currículum, simulación de entrevistas y acompañamiento docente. La selección considerará desempeño académico, portafolio y participación en proyectos.\n\nLos resultados y fechas de postulación se publicarán en el portal institucional.',
      category: 'CONVENIOS', tags: ['convenio', 'prácticas', 'empleabilidad'], likesCount: 0,
      authorId: admin.id, coverUrl: unsplash('photo-1521791055366-0d553872125f'), publishedInDays: -6,
    },
    {
      slug: 'equipo-isi-gana-ctf-nacional',
      title: 'Equipo de HackLab gana el CTF nacional universitario',
      summary: 'La delegación resolvió retos de seguridad web, criptografía, análisis forense y OSINT para alcanzar el primer lugar.',
      content: 'El equipo ByteBenders de HackLab ISI obtuvo el primer lugar en el CTF nacional universitario tras una jornada de ocho horas. La delegación sumó puntos en las cinco categorías y fue la única en completar el reto final de análisis forense.\n\nLa preparación incluyó laboratorios semanales, revisión de competencias anteriores y sesiones abiertas para estudiantes que recién ingresan a ciberseguridad. Sus integrantes compartirán las soluciones permitidas en una charla técnica.\n\nEl reconocimiento fortalece la participación de la carrera en competencias y servirá como base para conformar la siguiente selección.',
      category: 'LOGROS', tags: ['ctf', 'ciberseguridad', 'logros'], likesCount: 3,
      communityId: hacklab.id, authorId: avargas.id,
      coverUrl: unsplash('photo-1550751827-4bd374c3f58b'), publishedInDays: -9,
    },
    {
      slug: 'sistema-biblioteca-produccion',
      title: 'El sistema de biblioteca desarrollado por estudiantes entra en producción',
      summary: 'La plataforma ya gestiona catálogo, reservas y préstamos con código QR en la biblioteca de la facultad.',
      content: 'El Sistema de Gestión de Biblioteca completó su despliegue productivo después de un piloto de cuatro semanas. Bibliotecarios y estudiantes ya pueden consultar disponibilidad, reservar ejemplares y registrar préstamos mediante códigos QR.\n\nEl equipo trabajó con usuarios reales para simplificar los flujos y migró el catálogo histórico con controles de calidad. El panel incluye alertas de vencimiento, estadísticas de circulación y trazabilidad de operaciones.\n\nLa hoja de ruta incorpora reservas de salas de estudio y una API para integrar el catálogo con otros servicios académicos.',
      category: 'PROYECTOS', tags: ['incubadora', 'producción', 'biblioteca'], likesCount: 3,
      communityId: incubadora.id, authorId: jmamani.id,
      coverUrl: unsplash('photo-1481627834876-b7833e8f5570'), publishedInDays: -12,
    },
    {
      slug: 'paper-aceptado-congreso',
      title: 'Investigación estudiantil sobre retinopatía es aceptada en congreso internacional',
      summary: 'El trabajo propone un modelo de apoyo al tamizaje y reporta una sensibilidad del 91 % sobre el conjunto de validación.',
      content: 'El artículo sobre detección temprana de retinopatía diabética mediante redes neuronales convolucionales fue aceptado para presentación en un congreso latinoamericano de informática.\n\nLa investigación fue desarrollada por estudiantes de la comunidad IA & Ciencia de Datos con asesoría interdisciplinaria. Además del desempeño predictivo, el equipo evaluó sesgos, explicabilidad y condiciones de uso seguro.\n\nEl manuscrito y su resumen están disponibles en la sección de artículos científicos del portal.',
      category: 'INVESTIGACION', tags: ['investigación', 'salud', 'paper'], likesCount: 2,
      communityId: iacom.id, authorId: cflores.id,
      coverUrl: unsplash('photo-1576086213369-97a306d36557'), publishedInDays: -18,
    },
    {
      slug: 'nueva-comunidad-ia',
      title: 'Nace la comunidad de IA & Ciencia de Datos',
      summary: 'La Sociedad Científica abre un espacio para aprender, investigar y construir soluciones responsables basadas en datos.',
      content: 'IA & Ciencia de Datos inicia actividades con una ruta que combina fundamentos, laboratorios y proyectos interdisciplinarios. La comunidad recibirá a estudiantes desde tercer semestre y organizará grupos de estudio por nivel.\n\nEl primer ciclo abordará preparación de datos, aprendizaje supervisado, evaluación de modelos y principios de inteligencia artificial responsable. También se habilitará una clínica mensual para revisar propuestas de investigación.\n\nLas inscripciones y el calendario se encuentran en la página de la comunidad.',
      category: 'COMUNIDAD', tags: ['ia', 'datos', 'comunidades'], likesCount: 1,
      communityId: iacom.id, authorId: cflores.id,
      coverUrl: unsplash('photo-1518770660439-4636190af475'), publishedInDays: -25,
    },
    {
      slug: 'mentorias-abre-nueva-cohorte',
      title: 'La Red de Mentorías abre una nueva cohorte para primeros semestres',
      summary: 'El programa ofrecerá nivelación en programación, orientación académica y acompañamiento entre pares.',
      content: 'La Red de Mentorías recibirá a una nueva cohorte de estudiantes de primer y segundo semestre. Cada participante contará con sesiones grupales de fundamentos de programación y encuentros de orientación durante seis semanas.\n\nLos mentores son estudiantes avanzados y docentes voluntarios que fueron capacitados en acompañamiento, comunicación y derivación responsable. El programa no reemplaza las tutorías de materia: busca facilitar la adaptación y crear redes de apoyo.\n\nLos cupos son limitados y la inscripción se confirma desde el módulo de mentorías.',
      category: 'COMUNIDAD', tags: ['mentorias', 'estudiantes', 'comunidad'], likesCount: 2,
      communityId: mentorias.id, authorId: cflores.id,
      coverUrl: unsplash('photo-1523240795612-9a054b0db644'), publishedInDays: -31,
    },
    {
      slug: 'codearena-clasifica-regional-icpc',
      title: 'CodeArena clasifica dos equipos a la fase regional ICPC',
      summary: 'Los equipos obtuvieron los mejores puntajes de la maratón interna y representarán a la carrera en la competencia regional.',
      content: 'Tras cinco horas de competencia y doce problemas, los equipos Altiplano++ y Runtime Terror consiguieron la clasificación institucional a la fase regional ICPC. La tabla se definió por número de problemas resueltos y tiempo de penalización.\n\nCodeArena iniciará un plan intensivo con simulacros, revisión de algoritmos y sesiones de estrategia. Las prácticas abiertas continuarán cada semana para incorporar nuevos integrantes.\n\nLa comunidad agradeció a docentes, voluntarios y antiguos competidores que prepararon el banco de problemas.',
      category: 'LOGROS', tags: ['icpc', 'algoritmos', 'programación-competitiva'], likesCount: 3,
      communityId: codewars.id, authorId: mrojas.id,
      coverUrl: unsplash('photo-1515879218367-8466d910aaa4'), publishedInDays: -39,
    },
    {
      slug: 'semana-de-la-ingenieria-2026',
      title: 'Semana de la Ingeniería 2026 reunirá talleres, hackathon y feria de proyectos',
      summary: 'La agenda combinará actividades técnicas, vinculación con empresas y presentaciones abiertas de proyectos estudiantiles.',
      content: 'La Semana de la Ingeniería 2026 presentará una agenda de cinco días con talleres, charlas, competencias y una feria de proyectos. Las actividades estarán abiertas a estudiantes, docentes, egresados y organizaciones invitadas.\n\nLa programación incluye el Hackathon de Tecnología para la Salud, demostraciones de comunidades y espacios de orientación profesional. Cada evento tendrá su ficha con horario, lugar, cupo y opción para agregarlo a Google Calendar.\n\nLa agenda puede cambiar por disponibilidad de ambientes; las actualizaciones oficiales se publicarán en este portal.',
      category: 'EVENTOS', tags: ['semana-ingenieria', 'feria', 'hackathon'], likesCount: 0,
      communityId: incubadora.id, authorId: admin.id,
      coverUrl: unsplash('photo-1531058020387-3be344556be6'), publishedInDays: -45,
    },
  ];
  const createdNews = new Map<string, Awaited<ReturnType<typeof prisma.news.create>>>();
  for (const seed of newsData) {
    const news = await prisma.news.create({
      data: {
        slug: seed.slug,
        title: seed.title,
        summary: seed.summary,
        content: seed.content,
        category: seed.category,
        tags: seed.tags,
        likesCount: seed.likesCount,
        communityId: seed.communityId,
        coverUrl: seed.coverUrl,
        status: 'APPROVED',
        publishedAt: days(seed.publishedInDays),
        authorId: seed.authorId,
      },
    });
    createdNews.set(seed.slug, news);
  }

  // Proyectos
  const projSisBib = await prisma.project.create({
    data: {
      slug: 'sistema-gestion-biblioteca', title: 'Sistema de Gestión de Biblioteca',
      summary: 'Plataforma web para préstamos, reservas y catálogo digital de la biblioteca de la facultad.',
      description: 'Sistema completo con catálogo en línea, gestión de préstamos con código QR, notificaciones de vencimiento y panel administrativo. Actualmente en producción en la biblioteca de la facultad, gestionando más de 3.000 préstamos por semestre.',
      status: 'APPROVED', stage: 'FEATURED', isFeatured: true, isIncubator: true,
      subject: 'Ingeniería de Software II', semester: 7, phase: 'Operación y mejora continua',
      coverUrl: unsplash('photo-1481627834876-b7833e8f5570'),
      repoUrl: 'https://github.com/isi-demo/biblioteca', demoUrl: 'https://biblioteca-demo.example.com',
      tags: ['web', 'gestión', 'producción'], likesCount: 3, viewsCount: 214,
      ownerId: jmamani.id, reviewerId: rmendoza.id, communityId: incubadora.id,
      createdAt: days(-160), publishedAt: days(-40), startedAt: days(-160),
      technologies: { create: [{ name: 'React' }, { name: 'NestJS' }, { name: 'PostgreSQL' }, { name: 'Docker' }] },
      members: {
        create: [
          { userId: jmamani.id, roleInProject: 'Tech Lead' },
          { userId: pcondori.id, roleInProject: 'Backend' },
          { userId: mrojas.id, roleInProject: 'Frontend' },
        ],
      },
    },
  });
  const projPhish = await prisma.project.create({
    data: {
      slug: 'detector-phishing-ml', title: 'Detector de Phishing con Machine Learning',
      summary: 'Extensión de navegador que detecta sitios de phishing usando un modelo entrenado con URLs bolivianas.',
      status: 'APPROVED', stage: 'FINISHED', isFeatured: true,
      description: 'Extensión para Chrome/Firefox que analiza URLs y contenido de páginas en tiempo real. El modelo fue entrenado con un dataset de 50.000 URLs incluyendo casos de phishing bancario local. Precisión del 96,4% en validación.',
      subject: 'Inteligencia Artificial', semester: 8, phase: 'Versión 2.0 publicada',
      coverUrl: unsplash('photo-1563013544-824ae1b704d3'),
      repoUrl: 'https://github.com/isi-demo/antiphishing',
      tags: ['ml', 'seguridad', 'extensión'], likesCount: 2, viewsCount: 158,
      ownerId: avargas.id, reviewerId: lgutierrez.id, communityId: hacklab.id,
      createdAt: days(-120), publishedAt: days(-25), startedAt: days(-120),
      technologies: { create: [{ name: 'Python' }, { name: 'TensorFlow' }, { name: 'JavaScript' }] },
      members: { create: [{ userId: avargas.id, roleInProject: 'ML & Lead' }, { userId: mrojas.id, roleInProject: 'Data' }] },
    },
  });
  const projAgro = await prisma.project.create({
    data: {
      slug: 'agromonitor-iot', title: 'AgroMonitor: riego inteligente con IoT',
      summary: 'Red de sensores de humedad con panel web para optimizar riego en cultivos de valle.',
      status: 'APPROVED', stage: 'IN_DEVELOPMENT', isIncubator: true, recruiting: true,
      description: 'Sensores ESP32 con LoRa reportan humedad y temperatura a un backend que sugiere calendarios de riego. Piloto en ejecución con dos parcelas asociadas. Buscamos un desarrollador móvil para la app de campo.',
      subject: 'Proyecto Integrador', semester: 6, phase: 'Piloto de campo',
      coverUrl: unsplash('photo-1625246333195-78d9c38ad449'),
      repoUrl: 'https://github.com/isi-demo/agromonitor',
      tags: ['iot', 'agro', 'impacto-social'], likesCount: 1, viewsCount: 96,
      ownerId: dquispe.id, reviewerId: rmendoza.id, communityId: incubadora.id,
      createdAt: days(-70), publishedAt: days(-15), startedAt: days(-70),
      technologies: { create: [{ name: 'ESP32' }, { name: 'Node.js' }, { name: 'AWS IoT' }, { name: 'React' }] },
      members: { create: [{ userId: dquispe.id, roleInProject: 'IoT & Cloud' }, { userId: jmamani.id, roleInProject: 'Backend' }] },
    },
  });
  const projTutor = await prisma.project.create({
    data: {
      slug: 'tutor-virtual-algoritmos', title: 'Tutor virtual de algoritmos',
      summary: 'Plataforma que genera ejercicios de algoritmos con retroalimentación automática paso a paso.',
      status: 'PENDING', stage: 'IN_DEVELOPMENT',
      description: 'Generador de ejercicios parametrizados de estructuras de datos con corrección automática y pistas progresivas, pensado para estudiantes de segundo semestre.',
      subject: 'Estructuras de Datos', semester: 5, phase: 'MVP en revisión docente',
      coverUrl: unsplash('photo-1509062522246-3755977927d7'),
      repoUrl: 'https://github.com/isi-demo/tutor-algoritmos',
      tags: ['educación', 'algoritmos'], viewsCount: 12,
      ownerId: mrojas.id, reviewerId: rmendoza.id, communityId: codewars.id,
      createdAt: days(-30), startedAt: days(-30),
      technologies: { create: [{ name: 'Next.js' }, { name: 'Python' }] },
      members: { create: [{ userId: mrojas.id, roleInProject: 'Lead' }] },
    },
  });
  const projVota = await prisma.project.create({
    data: {
      slug: 'sistema-votacion-blockchain', title: 'Sistema de votación estudiantil con blockchain',
      summary: 'Prototipo de votación electrónica auditable para elecciones del centro de estudiantes.',
      status: 'OBSERVED', stage: 'PROPOSED',
      description: 'Prototipo que registra votos como transacciones en una cadena privada, con verificación pública de integridad sin exponer identidad del votante.',
      subject: 'Seguridad de Sistemas', semester: 8, phase: 'Corrección de observaciones',
      coverUrl: unsplash('photo-1639762681485-074b7f938ba0'),
      tags: ['blockchain', 'votación'], viewsCount: 8,
      ownerId: pcondori.id, reviewerId: lgutierrez.id, communityId: hacklab.id,
      createdAt: days(-18), startedAt: days(-18),
      technologies: { create: [{ name: 'Solidity' }, { name: 'Node.js' }] },
      members: { create: [{ userId: pcondori.id, roleInProject: 'Lead' }] },
    },
  });
  const projBus = await prisma.project.create({
    data: {
      slug: 'rutas-transporte-publico', title: '¿Dónde está mi micro? — rutas de transporte público',
      summary: 'App comunitaria de rutas y frecuencias del transporte público de la ciudad.',
      status: 'APPROVED', stage: 'FINISHED',
      description: 'Aplicación móvil con mapa de rutas crowdsourced, estimación de frecuencias por franja horaria y reportes de la comunidad.',
      subject: 'Desarrollo Móvil', semester: 6, phase: 'Mantenimiento comunitario',
      coverUrl: unsplash('photo-1494522358652-f30e61a60313'),
      repoUrl: 'https://github.com/isi-demo/mimicro', demoUrl: 'https://mimicro-demo.example.com',
      tags: ['móvil', 'ciudad', 'open-data'], likesCount: 2, viewsCount: 174,
      ownerId: cflores.id, reviewerId: rmendoza.id,
      createdAt: days(-140), publishedAt: days(-55), startedAt: days(-140),
      technologies: { create: [{ name: 'Flutter' }, { name: 'Firebase' }, { name: 'Google Maps API' }] },
      members: { create: [{ userId: cflores.id, roleInProject: 'Móvil' }, { userId: dquispe.id, roleInProject: 'Backend' }] },
    },
  });

  // Noticias escritas desde el espacio colaborativo de cada proyecto.
  const linkedProjectNews: {
    news: Awaited<ReturnType<typeof prisma.news.update>>;
    actor: typeof admin;
  }[] = [];
  for (const link of [
    { slug: 'sistema-biblioteca-produccion', project: projSisBib, actor: jmamani },
    { slug: 'agromonitor-inicia-piloto-valle-bajo', project: projAgro, actor: dquispe },
  ]) {
    const news = await prisma.news.update({
      where: { id: createdNews.get(link.slug)!.id },
      data: { projectId: link.project.id, communityId: link.project.communityId },
    });
    createdNews.set(link.slug, news);
    linkedProjectNews.push({ news, actor: link.actor });
  }

  // Capturas representativas por proyecto. Las URLs solicitan formato moderno y
  // calidad 72 para mantener ligera la demo; las cargas reales usan compresión WebP.
  const projectGallerySeeds = [
    { id: 'demo-project-library-catalog', projectId: projSisBib.id, uploaderId: jmamani.id, url: unsplash('photo-1521587760476-6c12a4b040da', 1200), createdAt: days(-38) },
    { id: 'demo-project-library-mobile', projectId: projSisBib.id, uploaderId: mrojas.id, url: unsplash('photo-1516321318423-f06f85e504b3', 1200), createdAt: days(-34) },
    { id: 'demo-project-library-qr', projectId: projSisBib.id, uploaderId: pcondori.id, url: unsplash('photo-1556742049-0cfed4f6a45d', 1200), createdAt: days(-29) },
    { id: 'demo-project-phishing-dashboard', projectId: projPhish.id, uploaderId: avargas.id, url: unsplash('photo-1563013544-824ae1b704d3', 1200), createdAt: days(-22) },
    { id: 'demo-project-phishing-lab', projectId: projPhish.id, uploaderId: mrojas.id, url: unsplash('photo-1510511459019-5dda7724fd87', 1200), createdAt: days(-19) },
    { id: 'demo-project-agro-sensors', projectId: projAgro.id, uploaderId: dquispe.id, url: unsplash('photo-1625246333195-78d9c38ad449', 1200), createdAt: days(-11) },
    { id: 'demo-project-agro-field', projectId: projAgro.id, uploaderId: dquispe.id, url: unsplash('photo-1416879595882-3373a0480b5b', 1200), createdAt: days(-8) },
    { id: 'demo-project-agro-dashboard', projectId: projAgro.id, uploaderId: jmamani.id, url: unsplash('photo-1551288049-bebda4e38f71', 1200), createdAt: days(-4) },
    { id: 'demo-project-tutor-session', projectId: projTutor.id, uploaderId: mrojas.id, url: unsplash('photo-1509062522246-3755977927d7', 1200), createdAt: days(-5) },
    { id: 'demo-project-voting-audit', projectId: projVota.id, uploaderId: pcondori.id, url: unsplash('photo-1639762681485-074b7f938ba0', 1200), createdAt: days(-3) },
    { id: 'demo-project-transit-map', projectId: projBus.id, uploaderId: cflores.id, url: unsplash('photo-1494522358652-f30e61a60313', 1200), createdAt: days(-48) },
    { id: 'demo-project-transit-mobile', projectId: projBus.id, uploaderId: dquispe.id, url: unsplash('photo-1512428559087-560fa5ceab42', 1200), createdAt: days(-44) },
  ];
  await prisma.mediaAsset.createMany({
    data: projectGallerySeeds.map((asset) => ({ ...asset, mime: 'image/jpeg' })),
  });
  const seededProjectGallery = await prisma.mediaAsset.findMany({
    where: { id: { in: projectGallerySeeds.map((asset) => asset.id) } },
    orderBy: { createdAt: 'asc' },
  });

  // Calendario de demostración: cada equipo tiene fechas reales para enseñar
  // la edición colaborativa sin tener que cargar contenido durante la defensa.
  const milestoneSeeds = [
    { project: projSisBib, actor: jmamani, title: 'Entrega de la versión 1.0', description: 'Salida inicial a producción en la biblioteca.', startsAt: days(-90), status: 'COMPLETED' as const },
    { project: projSisBib, actor: pcondori, title: 'Módulo de reserva de salas', description: 'Diseño, implementación y validación con usuarios.', startsAt: days(14), endsAt: days(28), status: 'IN_PROGRESS' as const },
    { project: projPhish, actor: avargas, title: 'Curación del dataset boliviano', description: 'Limpieza y etiquetado de URLs para entrenamiento.', startsAt: days(-80), status: 'COMPLETED' as const },
    { project: projPhish, actor: mrojas, title: 'Publicación de extensión v2', description: 'Versión para Chrome y Firefox con actualización del modelo.', startsAt: days(18), status: 'PLANNED' as const },
    { project: projAgro, actor: dquispe, title: 'Instalación del piloto de sensores', description: 'Despliegue LoRa en las dos parcelas asociadas.', startsAt: days(3), endsAt: days(5), status: 'IN_PROGRESS' as const, location: 'Parcela piloto — Valle Bajo' },
    { project: projAgro, actor: jmamani, title: 'Beta de la aplicación móvil', description: 'Prueba cerrada con productores y registro de observaciones.', startsAt: days(30), status: 'PLANNED' as const },
    { project: projAgro, actor: dquispe, title: 'Evaluación de ahorro de agua', description: 'Comparación del consumo frente al riego tradicional.', startsAt: days(48), status: 'PLANNED' as const },
    { project: projTutor, actor: mrojas, title: 'MVP de ejercicios parametrizados', description: 'Primer banco funcional para estructuras de datos.', startsAt: days(10), status: 'IN_PROGRESS' as const },
    { project: projTutor, actor: mrojas, title: 'Piloto con estudiantes', description: 'Sesión guiada y encuesta de usabilidad.', startsAt: days(35), status: 'PLANNED' as const, location: 'Laboratorio 2' },
    { project: projVota, actor: pcondori, title: 'Análisis formal de amenazas', description: 'Corrección solicitada por la revisión docente.', startsAt: days(12), status: 'IN_PROGRESS' as const },
    { project: projVota, actor: pcondori, title: 'Prueba de auditoría del escrutinio', description: 'Simulación con datos no reales y validadores independientes.', startsAt: days(32), status: 'PLANNED' as const },
    { project: projBus, actor: cflores, title: 'Actualización comunitaria de rutas', description: 'Jornada para verificar paradas y frecuencias.', startsAt: days(7), status: 'IN_PROGRESS' as const, location: 'Campus central' },
    { project: projBus, actor: dquispe, title: 'Publicación móvil 2.1', description: 'Mejoras de rendimiento y modo de bajo consumo.', startsAt: days(24), status: 'PLANNED' as const },
  ];
  const seededMilestones: { milestone: Awaited<ReturnType<typeof prisma.projectMilestone.create>>; actor: typeof admin }[] = [];
  for (const seed of milestoneSeeds) {
    const startsInDays = Math.floor((seed.startsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    const milestone = await prisma.projectMilestone.create({
      data: {
        projectId: seed.project.id,
        title: seed.title,
        description: seed.description,
        startsAt: seed.startsAt,
        endsAt: seed.endsAt ?? null,
        status: seed.status,
        location: seed.location ?? null,
        createdAt: days(Math.min(-2, startsInDays - 7)),
      },
    });
    seededMilestones.push({ milestone, actor: seed.actor });
  }

  const seededProjects = [
    { project: projSisBib, actor: jmamani },
    { project: projPhish, actor: avargas },
    { project: projAgro, actor: dquispe },
    { project: projTutor, actor: mrojas },
    { project: projVota, actor: pcondori },
    { project: projBus, actor: cflores },
  ];
  for (const { project, actor } of seededProjects) {
    await prisma.projectAuditLog.create({
      data: {
        projectId: project.id,
        actorId: actor.id,
        actorEmailSnapshot: actor.email,
        action: 'PROJECT_CREATED',
        entityType: 'PROJECT',
        entityId: project.id,
        after: { id: project.id, title: project.title, status: project.status, stage: project.stage },
        metadata: { source: 'seed-demo', request: { ip: null, userAgent: 'seed-demo' }, security: { riskSignals: [] } },
        delivery: { create: { status: 'SKIPPED' } },
        createdAt: project.createdAt,
      },
    });
  }
  for (const { milestone, actor } of seededMilestones) {
    await prisma.projectAuditLog.create({
      data: {
        projectId: milestone.projectId,
        actorId: actor.id,
        actorEmailSnapshot: actor.email,
        action: 'MILESTONE_CREATED',
        entityType: 'MILESTONE',
        entityId: milestone.id,
        after: {
          id: milestone.id,
          projectId: milestone.projectId,
          title: milestone.title,
          description: milestone.description,
          startsAt: milestone.startsAt.toISOString(),
          endsAt: milestone.endsAt?.toISOString() ?? null,
          allDay: milestone.allDay,
          status: milestone.status,
          location: milestone.location,
          url: milestone.url,
        },
        metadata: { source: 'seed-demo', request: { ip: null, userAgent: 'seed-demo' }, security: { riskSignals: [] } },
        delivery: { create: { status: 'SKIPPED' } },
        createdAt: milestone.createdAt,
      },
    });
  }

  for (const { news, actor } of linkedProjectNews) {
    await prisma.projectAuditLog.create({
      data: {
        projectId: news.projectId!,
        actorId: actor.id,
        actorEmailSnapshot: actor.email,
        action: 'NEWS_CREATED',
        entityType: 'NEWS',
        entityId: news.id,
        after: {
          id: news.id,
          projectId: news.projectId,
          authorId: news.authorId,
          slug: news.slug,
          title: news.title,
          summary: news.summary,
          content: news.content,
          category: news.category,
          coverUrl: news.coverUrl,
          tags: news.tags,
          status: news.status,
          publishedAt: news.publishedAt?.toISOString() ?? null,
          communityId: news.communityId,
          eventId: news.eventId,
        },
        metadata: { source: 'seed-demo', request: { ip: null, userAgent: 'seed-demo' }, security: { riskSignals: [] } },
        delivery: { create: { status: 'SKIPPED' } },
        createdAt: news.publishedAt ?? news.createdAt,
      },
    });
  }

  const demoUsersById = new Map(
    [admin, rmendoza, lgutierrez, ...students].map((user) => [user.id, user]),
  );
  for (const asset of seededProjectGallery) {
    const actor = demoUsersById.get(asset.uploaderId)!;
    await prisma.projectAuditLog.create({
      data: {
        projectId: asset.projectId!,
        actorId: actor.id,
        actorEmailSnapshot: actor.email,
        action: 'GALLERY_ATTACHED',
        entityType: 'MEDIA',
        entityId: asset.id,
        after: {
          id: asset.id,
          projectId: asset.projectId,
          uploaderId: asset.uploaderId,
          url: asset.url,
          mime: asset.mime,
          archivedAt: null,
        },
        metadata: { source: 'seed-demo', request: { ip: null, userAgent: 'seed-demo' }, security: { riskSignals: [] } },
        delivery: { create: { status: 'SKIPPED' } },
        createdAt: asset.createdAt,
      },
    });
  }

  // La versión refleja las mutaciones colaborativas ya representadas en la bitácora.
  const mutationCounts = new Map<string, number>();
  const countMutation = (projectId: string) => mutationCounts.set(projectId, (mutationCounts.get(projectId) ?? 0) + 1);
  for (const { milestone } of seededMilestones) countMutation(milestone.projectId);
  for (const asset of seededProjectGallery) countMutation(asset.projectId!);
  for (const { news } of linkedProjectNews) countMutation(news.projectId!);
  for (const [projectId, count] of mutationCounts) {
    await prisma.project.update({ where: { id: projectId }, data: { version: { increment: count } } });
  }

  // Historial de aprobaciones de proyectos
  const projApprovals: [string, string, string, ApprovalDecision | null, string | null][] = [
    [projSisBib.id, jmamani.id, rmendoza.id, 'APPROVED', 'Excelente trabajo, listo para la vitrina. Felicitaciones al equipo.'],
    [projPhish.id, avargas.id, lgutierrez.id, 'APPROVED', 'Metodología sólida y resultados verificables.'],
    [projAgro.id, dquispe.id, rmendoza.id, 'APPROVED', 'Aprobado. Documentar el protocolo LoRa en el repositorio.'],
    [projBus.id, cflores.id, rmendoza.id, 'APPROVED', 'Aprobado.'],
    [projVota.id, pcondori.id, lgutierrez.id, 'OBSERVED', 'Falta el análisis de amenazas y el plan de pruebas. Corregir y reenviar.'],
    [projTutor.id, mrojas.id, null, null, null],
  ];
  for (const [targetId, requesterId, reviewerId, decision, comment] of projApprovals) {
    await prisma.approvalRequest.create({
      data: {
        targetType: 'PROJECT', targetId, requesterId,
        reviewerId: reviewerId ?? undefined,
        decision: decision ?? undefined,
        comment: comment ?? undefined,
        decidedAt: decision ? days(-10) : undefined,
      },
    });
  }

  // Puntos por proyectos aprobados (+40 al owner)
  for (const p of [projSisBib, projPhish, projAgro, projBus]) {
    await award(p.ownerId, 'PROYECTO_APROBADO', 'DEV', 40, 'PROJECT', p.id);
  }

  // Artículos
  const artRetino = await prisma.article.create({
    data: {
      slug: 'deteccion-retinopatia-diabetica-cnn', title: 'Detección temprana de retinopatía diabética mediante redes neuronales convolucionales',
      abstract: 'Se propone un modelo CNN entrenado con imágenes de fondo de ojo para apoyar el tamizaje de retinopatía diabética en centros de salud con acceso limitado a oftalmólogos. El modelo alcanza una sensibilidad del 91% sobre el conjunto de validación.',
      area: 'Inteligencia Artificial en Salud', impact: 'Potencial de tamizaje de bajo costo en centros de salud rurales.',
      status: 'APPROVED', publishedAt: days(-30), doi: '10.0000/demo.2026.001',
      content: 'El estudio describe la preparación anonimizada de imágenes, la arquitectura evaluada, las métricas por clase y un protocolo de validación clínica pendiente. El modelo se plantea como apoyo al tamizaje y no como sustituto del diagnóstico profesional.',
      // PDFs académicos públicos y temáticamente afines mantienen operativo el visor.
      pdfUrl: 'https://arxiv.org/pdf/2310.10806',
      externalUrl: 'https://arxiv.org/abs/2310.10806',
      coverUrl: unsplash('photo-1576086213369-97a306d36557'),
      tags: ['cnn', 'salud', 'visión-computacional'], likesCount: 2,
      ownerId: cflores.id, reviewerId: lgutierrez.id,
      authors: { create: [{ userId: cflores.id }, { userId: jmamani.id }, { externalName: 'Dra. Patricia Salazar (Fac. Medicina)' }] },
    },
  });
  const artPhish = await prisma.article.create({
    data: {
      slug: 'analisis-phishing-bancario-bolivia', title: 'Análisis de campañas de phishing bancario en Bolivia: patrones y contramedidas',
      abstract: 'Estudio de 240 campañas de phishing dirigidas a usuarios de banca boliviana durante 2025, identificando patrones de infraestructura, técnicas de evasión y proponiendo contramedidas aplicables por entidades locales.',
      area: 'Ciberseguridad', impact: 'Insumos para equipos de seguridad de la banca local.',
      status: 'APPROVED', publishedAt: days(-20),
      content: 'Se comparan características léxicas, reputación de infraestructura y señales visuales. El documento incluye análisis de falsos positivos y recomendaciones de despliegue seguro ante cambios de distribución.',
      pdfUrl: 'https://arxiv.org/pdf/2004.03960',
      externalUrl: 'https://arxiv.org/abs/2004.03960',
      coverUrl: unsplash('photo-1563013544-824ae1b704d3'),
      tags: ['phishing', 'seguridad'], likesCount: 1,
      ownerId: avargas.id, reviewerId: lgutierrez.id,
      authors: { create: [{ userId: avargas.id }] },
    },
  });
  const artRiego = await prisma.article.create({
    data: {
      slug: 'optimizacion-riego-sensores-lora', title: 'Optimización de riego con redes de sensores LoRa de bajo costo',
      abstract: 'Se evalúa el desempeño de una red de sensores de humedad basada en LoRa para agricultura de valle, comparando consumo hídrico frente a riego tradicional durante un ciclo de cultivo.',
      area: 'IoT y Sistemas Embebidos', impact: 'Reducción del 28% de consumo hídrico en el piloto.',
      status: 'APPROVED', publishedAt: days(-8),
      content: 'La evaluación compara cobertura, consumo energético y pérdida de paquetes de los nodos LoRa. También documenta la calibración de sensores y las limitaciones de extrapolar resultados de un piloto corto.',
      pdfUrl: 'https://arxiv.org/pdf/2409.11200',
      externalUrl: 'https://arxiv.org/abs/2409.11200',
      coverUrl: unsplash('photo-1625246333195-78d9c38ad449'),
      tags: ['iot', 'lora', 'agro'], likesCount: 1,
      ownerId: dquispe.id, reviewerId: rmendoza.id,
      authors: { create: [{ userId: dquispe.id }, { userId: cflores.id }] },
    },
  });
  const artPend = await prisma.article.create({
    data: {
      slug: 'benchmark-orm-typescript', title: 'Benchmark de ORMs TypeScript sobre PostgreSQL: Prisma, TypeORM y Drizzle',
      abstract: 'Comparación de rendimiento y ergonomía de tres ORMs del ecosistema TypeScript bajo cargas transaccionales típicas de sistemas académicos.',
      area: 'Ingeniería de Software',
      status: 'PENDING',
      content: 'Borrador sometido a revisión docente. El protocolo propone medir latencia, uso de memoria, productividad y comportamiento bajo transacciones concurrentes.',
      coverUrl: unsplash('photo-1558494949-ef010cbdcc31'),
      tags: ['orm', 'benchmark', 'typescript'],
      ownerId: pcondori.id, reviewerId: rmendoza.id,
      authors: { create: [{ userId: pcondori.id }] },
    },
  });

  const artApprovals: [string, string, string | null, ApprovalDecision | null, string | null][] = [
    [artRetino.id, cflores.id, lgutierrez.id, 'APPROVED', 'Trabajo destacado, recomendado para el congreso.'],
    [artPhish.id, avargas.id, lgutierrez.id, 'APPROVED', 'Aprobado.'],
    [artRiego.id, dquispe.id, rmendoza.id, 'APPROVED', 'Aprobado con felicitaciones.'],
    [artPend.id, pcondori.id, null, null, null],
  ];
  for (const [targetId, requesterId, reviewerId, decision, comment] of artApprovals) {
    await prisma.approvalRequest.create({
      data: {
        targetType: 'ARTICLE', targetId, requesterId,
        reviewerId: reviewerId ?? undefined, decision: decision ?? undefined,
        comment: comment ?? undefined, decidedAt: decision ? days(-7) : undefined,
      },
    });
  }
  for (const a of [artRetino, artPhish, artRiego]) {
    await award(a.ownerId, 'ARTICULO_APROBADO', 'RESEARCH', 35, 'ARTICLE', a.id);
  }

  // Likes en proyectos, artículos y noticias (+1 al dueño por like)
  const likeTargets: [LikeTargetType, string, string, string][] = [
    ['PROJECT', projSisBib.id, avargas.id, jmamani.id],
    ['PROJECT', projSisBib.id, cflores.id, jmamani.id],
    ['PROJECT', projSisBib.id, dquispe.id, jmamani.id],
    ['PROJECT', projPhish.id, jmamani.id, avargas.id],
    ['PROJECT', projPhish.id, mrojas.id, avargas.id],
    ['PROJECT', projAgro.id, cflores.id, dquispe.id],
    ['PROJECT', projBus.id, avargas.id, cflores.id],
    ['PROJECT', projBus.id, pcondori.id, cflores.id],
    ['ARTICLE', artRetino.id, avargas.id, cflores.id],
    ['ARTICLE', artRetino.id, dquispe.id, cflores.id],
    ['ARTICLE', artPhish.id, cflores.id, avargas.id],
    ['ARTICLE', artRiego.id, jmamani.id, dquispe.id],
    ['NEWS', createdNews.get('convocatoria-hackathon-salud-2026')!.id, avargas.id, admin.id],
    ['NEWS', createdNews.get('convocatoria-hackathon-salud-2026')!.id, jmamani.id, admin.id],
    ['NEWS', createdNews.get('convocatoria-hackathon-salud-2026')!.id, cflores.id, admin.id],
    ['NEWS', createdNews.get('convocatoria-hackathon-salud-2026')!.id, dquispe.id, admin.id],
    ['NEWS', createdNews.get('convocatoria-hackathon-salud-2026')!.id, mrojas.id, admin.id],
    ['NEWS', createdNews.get('agromonitor-inicia-piloto-valle-bajo')!.id, avargas.id, dquispe.id],
    ['NEWS', createdNews.get('agromonitor-inicia-piloto-valle-bajo')!.id, cflores.id, dquispe.id],
    ['NEWS', createdNews.get('agromonitor-inicia-piloto-valle-bajo')!.id, mrojas.id, dquispe.id],
    ['NEWS', createdNews.get('agromonitor-inicia-piloto-valle-bajo')!.id, pcondori.id, dquispe.id],
    ['NEWS', createdNews.get('equipo-isi-gana-ctf-nacional')!.id, jmamani.id, avargas.id],
    ['NEWS', createdNews.get('equipo-isi-gana-ctf-nacional')!.id, cflores.id, avargas.id],
    ['NEWS', createdNews.get('equipo-isi-gana-ctf-nacional')!.id, dquispe.id, avargas.id],
    ['NEWS', createdNews.get('nueva-comunidad-ia')!.id, avargas.id, cflores.id],
    ['NEWS', createdNews.get('paper-aceptado-congreso')!.id, avargas.id, cflores.id],
    ['NEWS', createdNews.get('paper-aceptado-congreso')!.id, pcondori.id, cflores.id],
    ['NEWS', createdNews.get('sistema-biblioteca-produccion')!.id, mrojas.id, jmamani.id],
    ['NEWS', createdNews.get('sistema-biblioteca-produccion')!.id, cflores.id, jmamani.id],
    ['NEWS', createdNews.get('sistema-biblioteca-produccion')!.id, dquispe.id, jmamani.id],
    ['NEWS', createdNews.get('mentorias-abre-nueva-cohorte')!.id, dquispe.id, cflores.id],
    ['NEWS', createdNews.get('mentorias-abre-nueva-cohorte')!.id, mrojas.id, cflores.id],
    ['NEWS', createdNews.get('codearena-clasifica-regional-icpc')!.id, avargas.id, mrojas.id],
    ['NEWS', createdNews.get('codearena-clasifica-regional-icpc')!.id, jmamani.id, mrojas.id],
    ['NEWS', createdNews.get('codearena-clasifica-regional-icpc')!.id, pcondori.id, mrojas.id],
  ];
  for (const [targetType, targetId, likerId, ownerId] of likeTargets) {
    await prisma.like.create({ data: { targetType, targetId, userId: likerId } });
    await award(ownerId, 'LIKE_RECIBIDO', 'COMMUNITY', 1, targetType, `${targetId}:by:${likerId}`);
  }

  // Comentarios
  await prisma.comment.create({ data: { targetType: 'PROJECT', targetId: projSisBib.id, authorId: avargas.id, body: 'Lo uso cada semana en la biblioteca, funciona muy bien. ¿Piensan agregar reservas de salas de estudio?' } });
  await prisma.comment.create({ data: { targetType: 'PROJECT', targetId: projAgro.id, authorId: cflores.id, body: 'Me interesa el dataset de humedad para un modelo predictivo, ¿está disponible?' } });
  await prisma.comment.create({ data: { targetType: 'ARTICLE', targetId: artRetino.id, authorId: lgutierrez.id, body: 'Excelente trabajo. Sugiero probar con el dataset APTOS para comparar.' } });

  // Eventos
  const evCtf = await prisma.event.create({
    data: {
      slug: 'ctf-isi-2026', title: 'CTF ISI 2026 — Capture The Flag', category: 'CTF',
      description: 'Competencia anual de seguridad informática por equipos: web, cripto, forense, reversing y OSINT. Abierta a todos los semestres, con categoría novatos.',
      startsAt: days(12), endsAt: days(12.25), location: 'Laboratorio 3 + remoto', isOnline: false,
      isFeatured: true, capacity: 80, rulesUrl: 'https://example.com/bases-ctf-2026.pdf',
      coverUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1600&q=75',
      organizerId: avargas.id, communityId: hacklab.id,
    },
  });
  const evTaller = await prisma.event.create({
    data: {
      slug: 'taller-docker-kubernetes', title: 'Taller: Docker y Kubernetes desde cero', category: 'TALLER',
      description: 'Taller práctico de contenedores: del Dockerfile al despliegue en un clúster k3s. Traer laptop con Docker instalado.',
      startsAt: days(5), endsAt: days(5.17), location: 'Aula 12', capacity: 40,
      coverUrl: 'https://images.unsplash.com/photo-1542831371-29b0f74f9713?auto=format&fit=crop&w=1600&q=75',
      organizerId: dquispe.id, communityId: cloud.id,
    },
  });
  const evHack = await prisma.event.create({
    data: {
      slug: 'hackathon-salud-2026', title: 'Hackathon: Tecnología para la Salud', category: 'HACKATHON',
      description: '48 horas para prototipar soluciones tecnológicas a problemas reales planteados por la Facultad de Medicina.',
      startsAt: days(26), endsAt: days(28), location: 'Campus central', capacity: 60,
      coverUrl: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1600&q=75',
      organizerId: admin.id, communityId: incubadora.id,
    },
  });
  const evCharla = await prisma.event.create({
    data: {
      slug: 'charla-carrera-en-ciberseguridad', title: 'Charla: cómo construir una carrera en ciberseguridad', category: 'CHARLA',
      description: 'Egresados trabajando en SOCs y equipos de red team comparten su ruta profesional. Incluye sesión de preguntas.',
      startsAt: days(8), endsAt: days(8.08), isOnline: true, meetingUrl: 'https://teams.microsoft.com/l/meetup/demo-charla',
      coverUrl: unsplash('photo-1516321318423-f06f85e504b3'),
      organizerId: lgutierrez.id, communityId: hacklab.id,
    },
  });
  const evCompe = await prisma.event.create({
    data: {
      slug: 'maraton-programacion-interna', title: 'Maratón interna de programación (clasificatoria ICPC)', category: 'COMPETENCIA',
      description: 'Cinco horas, doce problemas. Los tres mejores equipos representarán a la carrera en la regional.',
      startsAt: days(19), endsAt: days(19.21), location: 'Laboratorio 1', capacity: 45,
      coverUrl: unsplash('photo-1515879218367-8466d910aaa4'),
      organizerId: rmendoza.id, communityId: codewars.id,
    },
  });
  const evPasado = await prisma.event.create({
    data: {
      slug: 'taller-git-github-2026', title: 'Taller: Git y GitHub para trabajo en equipo', category: 'TALLER',
      description: 'Flujo de ramas, pull requests y resolución de conflictos con ejercicios en vivo.',
      startsAt: days(-14), endsAt: days(-13.88), location: 'Aula 8',
      coverUrl: unsplash('photo-1556075798-4825dfaaf498'),
      organizerId: jmamani.id, communityId: mentorias.id,
    },
  });
  const evMentores = await prisma.event.create({
    data: {
      slug: 'encuentro-mentores-nueva-cohorte', title: 'Encuentro de mentores: acompañar sin resolver por el estudiante', category: 'MENTORIA',
      description: 'Sesión de preparación para mentores pares sobre escucha activa, retroalimentación, límites y rutas de derivación.',
      startsAt: days(3), endsAt: days(3.1), location: 'Sala de la Sociedad Científica', capacity: 30,
      coverUrl: unsplash('photo-1523240795612-9a054b0db644'),
      organizerId: cflores.id, communityId: mentorias.id,
    },
  });

  // Galerías visuales de muestra. Son recursos remotos optimizados; las fotos
  // subidas por usuarios pasan por el compresor WebP del endpoint /media/upload.
  await prisma.mediaAsset.createMany({
    data: [
      { id: 'demo-event-ctf-security', url: unsplash('photo-1550751827-4bd374c3f58b', 1200), uploaderId: avargas.id, eventId: evCtf.id, mime: 'image/jpeg' },
      { id: 'demo-event-ctf-team', url: unsplash('photo-1516321318423-f06f85e504b3', 1200), uploaderId: avargas.id, eventId: evCtf.id, mime: 'image/jpeg' },
      { id: 'demo-event-hack-team', url: unsplash('photo-1522071820081-009f0129c71c', 1200), uploaderId: admin.id, eventId: evHack.id, mime: 'image/jpeg' },
      { id: 'demo-event-hack-stage', url: unsplash('photo-1531058020387-3be344556be6', 1200), uploaderId: admin.id, eventId: evHack.id, mime: 'image/jpeg' },
      { id: 'demo-event-git-workshop', url: unsplash('photo-1516321165247-4aa89a48be28', 1200), uploaderId: jmamani.id, eventId: evPasado.id, mime: 'image/jpeg' },
      { id: 'demo-event-git-collaboration', url: unsplash('photo-1556075798-4825dfaaf498', 1200), uploaderId: jmamani.id, eventId: evPasado.id, mime: 'image/jpeg' },
      { id: 'demo-event-mentors-circle', url: unsplash('photo-1523240795612-9a054b0db644', 1200), uploaderId: cflores.id, eventId: evMentores.id, mime: 'image/jpeg' },
      { id: 'demo-event-mentors-session', url: unsplash('photo-1531482615713-2afd69097998', 1200), uploaderId: cflores.id, eventId: evMentores.id, mime: 'image/jpeg' },
    ],
  });

  // Las noticias de agenda permiten navegar directamente al evento y heredan su comunidad.
  await prisma.news.update({
    where: { id: createdNews.get('semana-de-la-ingenieria-2026')!.id },
    data: { eventId: evHack.id },
  });
  await prisma.news.update({
    where: { id: createdNews.get('convocatoria-hackathon-salud-2026')!.id },
    data: { eventId: evHack.id },
  });
  await prisma.news.update({
    where: { id: createdNews.get('codearena-clasifica-regional-icpc')!.id },
    data: { eventId: evCompe.id },
  });
  await prisma.news.update({
    where: { id: createdNews.get('mentorias-abre-nueva-cohorte')!.id },
    data: { eventId: evMentores.id },
  });

  // Inscripciones (+5)
  const regs: [string, string][] = [
    [evCtf.id, avargas.id], [evCtf.id, mrojas.id], [evCtf.id, pcondori.id], [evCtf.id, jmamani.id],
    [evTaller.id, dquispe.id], [evTaller.id, pcondori.id], [evTaller.id, cflores.id],
    [evHack.id, jmamani.id], [evHack.id, cflores.id],
    [evCharla.id, avargas.id], [evCharla.id, pcondori.id],
    [evCompe.id, mrojas.id], [evCompe.id, jmamani.id],
    [evPasado.id, pcondori.id], [evPasado.id, mrojas.id],
    [evMentores.id, cflores.id], [evMentores.id, mrojas.id], [evMentores.id, pcondori.id],
  ];
  for (const [eventId, userId] of regs) {
    await prisma.eventRegistration.create({ data: { eventId, userId } });
    await award(userId, 'INSCRIPCION_EVENTO', 'COMMUNITY', 5, 'EVENT', eventId);
  }

  // Mentorías
  const mentNivel = await prisma.mentorship.create({
    data: {
      slug: 'nivelacion-programacion-1', title: 'Nivelación: fundamentos de programación',
      description: 'Refuerzo semanal de lógica y programación en Python para estudiantes de primer y segundo semestre.',
      area: 'Programación', difficulty: 'BASICO', startsAt: days(4),
      syllabus: ['Variables y tipos', 'Condicionales y bucles', 'Funciones', 'Listas y diccionarios', 'Mini proyecto final'],
      mentorId: mrojas.id, communityId: mentorias.id, capacity: 25,
      teamsUrl: 'https://teams.microsoft.com/l/team/demo-nivelacion',
    },
  });
  const mentAws = await prisma.mentorship.create({
    data: {
      slug: 'preparacion-aws-cloud-practitioner', title: 'Preparación AWS Cloud Practitioner',
      description: 'Ruta de 6 semanas para rendir la certificación CLF-C02 con laboratorios en free tier.',
      area: 'Cloud', difficulty: 'INTERMEDIO', startsAt: days(10),
      syllabus: ['Conceptos de nube', 'IAM y seguridad', 'Cómputo y almacenamiento', 'Redes', 'Facturación', 'Simulacros de examen'],
      mentorId: dquispe.id, communityId: cloud.id, capacity: 20,
    },
  });
  const mentPentest = await prisma.mentorship.create({
    data: {
      slug: 'introduccion-pentesting-web', title: 'Introducción al pentesting web',
      description: 'OWASP Top 10 en laboratorio controlado: de la teoría a explotar y reportar vulnerabilidades.',
      area: 'Ciberseguridad', difficulty: 'AVANZADO', startsAt: days(15),
      syllabus: ['Reconocimiento', 'Inyecciones', 'XSS y CSRF', 'Broken auth', 'Reporte profesional'],
      mentorId: avargas.id, communityId: hacklab.id, capacity: 15,
    },
  });
  for (const [mid, uid] of [[mentNivel.id, pcondori.id], [mentAws.id, jmamani.id], [mentPentest.id, mrojas.id]] as [string, string][]) {
    await prisma.mentorshipEnrollment.create({ data: { mentorshipId: mid, userId: uid } });
  }

  // Foro
  async function question(authorId: string, title: string, body: string, tags: string[], subject: string, semester: number, views: number) {
    const q = await prisma.forumQuestion.create({ data: { authorId, title, body, tags, subject, semester, viewsCount: views } });
    await award(authorId, 'PREGUNTA_PUBLICADA', 'DEV', 5, 'QUESTION', q.id);
    return q;
  }
  async function answer(questionId: string, authorId: string, body: string) {
    const a = await prisma.forumAnswer.create({ data: { questionId, authorId, body } });
    await prisma.forumQuestion.update({ where: { id: questionId }, data: { answersCount: { increment: 1 } } });
    await award(authorId, 'RESPUESTA_PUBLICADA', 'DEV', 10, 'ANSWER', a.id);
    return a;
  }

  const q1 = await question(pcondori.id, '¿Cómo evitar el error N+1 con Prisma en NestJS?', 'Estoy listando proyectos con sus miembros y por cada proyecto se dispara una consulta adicional. ¿Cuál es la forma correcta de traer las relaciones en una sola consulta con Prisma?', ['prisma', 'nestjs', 'postgresql'], 'Base de Datos II', 4, 87);
  const a1a = await answer(q1.id, jmamani.id, 'Usa `include` (o `select` anidado) en la consulta: `prisma.project.findMany({ include: { members: { include: { user: true } } } })`. Prisma genera un join/batch en lugar de N consultas. Si necesitas solo algunos campos, `select` anidado es más eficiente.');
  const a1b = await answer(q1.id, dquispe.id, 'Complementando: activa el log de queries con `log: ["query"]` en el cliente para verificar cuántas consultas se ejecutan realmente.');
  const q2 = await question(mrojas.id, '¿Cómo calcular complejidad de un algoritmo recursivo con memoización?', 'Para un problema de programación dinámica tipo Fibonacci con memo, ¿la complejidad se mide por llamadas únicas o totales?', ['algoritmos', 'complejidad', 'dp'], 'Análisis de Algoritmos', 5, 64);
  const a2a = await answer(q2.id, jmamani.id, 'Con memoización cuentas estados únicos × costo por estado. En Fibonacci memoizado hay O(n) estados y O(1) por estado, así que O(n) total, aunque las llamadas brutas sean más.');
  const q3 = await question(jmamani.id, '¿JWT en localStorage o en cookie httpOnly?', 'Para el proyecto final quiero manejar sesiones con JWT. ¿Qué es más seguro y qué usa la industria?', ['jwt', 'seguridad', 'web'], 'Seguridad de Sistemas', 7, 132);
  const a3a = await answer(q3.id, avargas.id, 'Cookie httpOnly + SameSite para el refresh token (inmune a XSS de lectura) y access token corto en memoria. localStorage es vulnerable a XSS: cualquier script inyectado puede leerlo. Si usas cookies, considera protección CSRF.');
  const a3b = await answer(q3.id, pcondori.id, 'En clase vimos que también depende del despliegue: si front y API están en dominios distintos hay que configurar CORS con credentials.');
  const q4 = await question(cflores.id, '¿Cómo balancear un dataset médico pequeño para CNN?', 'Tengo 1.200 imágenes con clases muy desbalanceadas (90/10). ¿Data augmentation, class weights o ambos?', ['ml', 'cnn', 'datasets'], 'Inteligencia Artificial', 9, 45);
  const q5 = await question(dquispe.id, '¿Diferencia real entre ECS Fargate y EC2 para un proyecto pequeño?', 'Para desplegar el backend del proyecto integrador, ¿vale la pena Fargate o con una t3.micro alcanza?', ['aws', 'docker', 'despliegue'], 'Proyecto Integrador', 6, 51);
  const a5a = await answer(q5.id, jmamani.id, 'Para un proyecto de materia: EC2 t3.micro (free tier) con Docker Compose es más barato y suficiente. Fargate brilla cuando no quieres administrar el host o necesitas escalar por demanda.');
  const q6 = await question(pcondori.id, '¿Por qué mi migración de Prisma borra datos en producción?', 'Al correr migrate dev en el servidor me pidió resetear la base. ¿Cuál es el flujo correcto para producción?', ['prisma', 'migraciones', 'devops'], 'Base de Datos II', 4, 29);

  // Adjuntos visuales: demuestran el límite de dos imágenes tanto en preguntas
  // como en respuestas sin depender de una carga manual durante la presentación.
  await prisma.mediaAsset.createMany({
    data: [
      { id: 'demo-forum-q1-query-log', url: unsplash('photo-1555949963-ff9fe0c870eb', 1200), mime: 'image/jpeg', uploaderId: pcondori.id, forumQuestionId: q1.id },
      { id: 'demo-forum-q4-retina-sample', url: unsplash('photo-1576091160399-112ba8d25d1d', 1200), mime: 'image/jpeg', uploaderId: cflores.id, forumQuestionId: q4.id },
      { id: 'demo-forum-q4-training-chart', url: unsplash('photo-1551288049-bebda4e38f71', 1200), mime: 'image/jpeg', uploaderId: cflores.id, forumQuestionId: q4.id },
      { id: 'demo-forum-a1-prisma-code', url: unsplash('photo-1515879218367-8466d910aaa4', 1200), mime: 'image/jpeg', uploaderId: jmamani.id, forumAnswerId: a1a.id },
      { id: 'demo-forum-a1-query-result', url: unsplash('photo-1558494949-ef010cbdcc31', 1200), mime: 'image/jpeg', uploaderId: jmamani.id, forumAnswerId: a1a.id },
    ],
  });

  // Respuesta aceptada (q1 → a1a de jmamani, q3 → a3a de avargas)
  await prisma.forumAnswer.update({ where: { id: a1a.id }, data: { isAccepted: true } });
  await prisma.forumQuestion.update({ where: { id: q1.id }, data: { acceptedAnswerId: a1a.id } });
  await award(jmamani.id, 'RESPUESTA_ACEPTADA', 'DEV', 30, 'ANSWER', a1a.id);
  await prisma.forumAnswer.update({ where: { id: a3a.id }, data: { isAccepted: true } });
  await prisma.forumQuestion.update({ where: { id: q3.id }, data: { acceptedAnswerId: a3a.id } });
  await award(avargas.id, 'RESPUESTA_ACEPTADA', 'DEV', 30, 'ANSWER', a3a.id);

  // Votos del foro
  const votes: [VoteTargetType, string, string, number][] = [
    ['QUESTION', q1.id, jmamani.id, 1], ['QUESTION', q1.id, mrojas.id, 1], ['QUESTION', q1.id, dquispe.id, 1],
    ['QUESTION', q3.id, avargas.id, 1], ['QUESTION', q3.id, cflores.id, 1], ['QUESTION', q3.id, mrojas.id, 1], ['QUESTION', q3.id, dquispe.id, 1],
    ['QUESTION', q2.id, jmamani.id, 1], ['QUESTION', q4.id, avargas.id, 1], ['QUESTION', q5.id, pcondori.id, 1],
    ['ANSWER', a1a.id, pcondori.id, 1], ['ANSWER', a1a.id, mrojas.id, 1], ['ANSWER', a1a.id, dquispe.id, 1],
    ['ANSWER', a3a.id, jmamani.id, 1], ['ANSWER', a3a.id, cflores.id, 1], ['ANSWER', a3a.id, pcondori.id, 1], ['ANSWER', a3a.id, mrojas.id, 1],
    ['ANSWER', a2a.id, mrojas.id, 1], ['ANSWER', a5a.id, dquispe.id, 1], ['ANSWER', a3b.id, jmamani.id, -1],
    ['ANSWER', a1b.id, pcondori.id, 1],
  ];
  for (const [targetType, targetId, userId, value] of votes) {
    await prisma.vote.create({ data: { targetType, targetId, userId, value } });
    if (targetType === 'QUESTION') {
      await prisma.forumQuestion.update({ where: { id: targetId }, data: { votesScore: { increment: value } } });
    } else {
      await prisma.forumAnswer.update({ where: { id: targetId }, data: { votesScore: { increment: value } } });
    }
  }

  // Preferencias explícitas para que el panel no dependa de crear defaults al abrirlo.
  await prisma.notificationPreference.createMany({
    data: [admin, rmendoza, lgutierrez, ...students].map((user) => ({ userId: user.id })),
  });

  // Notificaciones representativas para que la bandeja pueda demostrarse desde el primer arranque.
  await prisma.notification.createMany({
    data: [
      {
        userId: pcondori.id,
        type: 'FORUM_ANSWER',
        title: 'Recibiste una nueva respuesta',
        body: `@${jmamani.username} respondió “${q1.title}”.`,
        href: `/foro/${q1.id}`,
        dedupeKey: `demo-forum-answer:${a1a.id}`,
        createdAt: days(-1),
      },
      {
        userId: jmamani.id,
        type: 'FORUM_ACCEPTED',
        title: 'Tu respuesta fue aceptada',
        body: `Tu respuesta en “${q1.title}” fue marcada como la solución.`,
        href: `/foro/${q1.id}`,
        dedupeKey: `demo-forum-accepted:${a1a.id}`,
        readAt: days(-1),
        createdAt: days(-2),
      },
      {
        userId: avargas.id,
        type: 'EVENT_REGISTRATION',
        title: 'Nueva inscripción en tu evento',
        body: `@${mrojas.username} se inscribió en “${evCtf.title}”.`,
        href: `/eventos/${evCtf.slug}`,
        dedupeKey: `demo-event-registration:${evCtf.id}`,
        createdAt: days(-2),
      },
      {
        userId: pcondori.id,
        type: 'MENTORSHIP_ENROLLMENT',
        title: 'Inscripción a mentoría confirmada',
        body: `Ya formas parte de “${mentNivel.title}”.`,
        href: `/mentorias/${mentNivel.slug}`,
        dedupeKey: `demo-mentorship-enrollment:${mentNivel.id}`,
        createdAt: days(-3),
      },
      {
        userId: admin.id,
        type: 'SYSTEM',
        title: 'Portal de demostración listo',
        body: 'La base demo, las migraciones y los módulos principales se cargaron correctamente.',
        href: '/admin',
        dedupeKey: 'demo-system-ready',
        createdAt: days(-1),
      },
      {
        userId: pcondori.id,
        type: 'SYSTEM',
        title: 'Ya puedes colaborar en Sistema de Gestión de Biblioteca',
        body: 'Tu rol es Backend. Puedes mantener el calendario, las noticias y la galería del proyecto.',
        href: `/proyectos/gestionar/${projSisBib.id}`,
        dedupeKey: `demo-project-collaboration:${projSisBib.id}:${pcondori.id}`,
        createdAt: days(-4),
      },
      {
        userId: mrojas.id,
        type: 'CONTENT_REVIEW',
        title: 'Tu proyecto está en revisión',
        body: `“${projTutor.title}” fue enviado al docente revisor.`,
        href: `/proyectos/${projTutor.slug}`,
        dedupeKey: `demo-project-review:${projTutor.id}`,
        createdAt: days(-2),
      },
      {
        userId: admin.id,
        type: 'SYSTEM',
        title: 'Actividad colaborativa disponible para auditar',
        body: 'La demo incluye ediciones de calendario, noticias y galería con correo del actor y snapshots de rollback.',
        href: '/admin/auditoria',
        dedupeKey: 'demo-collaboration-audit-ready',
        createdAt: days(-1),
      },
    ],
  });

  // Insignias
  const userBadges: [string, string][] = [
    [jmamani.id, 'PRIMER_PROYECTO'], [jmamani.id, 'DEV_CONTRIBUTOR'], [jmamani.id, 'RESPUESTA_ACEPTADA'], [jmamani.id, 'PRIMERA_RESPUESTA'],
    [avargas.id, 'PRIMER_PROYECTO'], [avargas.id, 'PRIMER_ARTICULO'], [avargas.id, 'RESPUESTA_ACEPTADA'], [avargas.id, 'COMUNIDAD_ACTIVA'], [avargas.id, 'TOP_10_MES'],
    [cflores.id, 'PRIMER_ARTICULO'], [cflores.id, 'INVESTIGADOR_JUNIOR'], [cflores.id, 'PRIMER_PROYECTO'],
    [dquispe.id, 'PRIMER_PROYECTO'], [dquispe.id, 'PRIMER_ARTICULO'], [dquispe.id, 'COMUNIDAD_ACTIVA'],
    [mrojas.id, 'PRIMERA_RESPUESTA'], [mrojas.id, 'MENTOR_INICIAL'],
    [pcondori.id, 'PRIMERA_RESPUESTA'],
  ];
  for (const [userId, code] of userBadges) {
    await prisma.userBadge.create({ data: { userId, badgeId: badges[code].id } });
  }

  // Un reporte de ejemplo
  await prisma.report.create({
    data: {
      targetType: 'ANSWER', targetId: a3b.id, reporterId: mrojas.id,
      reason: 'La respuesta no aporta a la pregunta, parece copiada de otro hilo.',
      status: 'PENDING',
    },
  });

  // Autoverificación del escenario. Si alguien modifica el seed en el futuro,
  // evitamos entregar una demo con contadores o límites visualmente incoherentes.
  const seededNewsRows = await prisma.news.findMany({
    where: { id: { in: [...createdNews.values()].map((news) => news.id) } },
    select: { id: true, likesCount: true },
  });
  const newsLikeGroups = await prisma.like.groupBy({
    by: ['targetId'],
    where: { targetType: 'NEWS', targetId: { in: seededNewsRows.map((news) => news.id) } },
    _count: { _all: true },
  });
  const newsLikesById = new Map(newsLikeGroups.map((group) => [group.targetId, group._count._all]));
  for (const news of seededNewsRows) {
    if (news.likesCount !== (newsLikesById.get(news.id) ?? 0)) {
      throw new Error(`Seed inconsistente: likesCount de noticia ${news.id}`);
    }
  }

  const questionAnswerCounts = await prisma.forumQuestion.findMany({
    select: { id: true, answersCount: true, _count: { select: { answers: true } } },
  });
  if (questionAnswerCounts.some((question) => question.answersCount !== question._count.answers)) {
    throw new Error('Seed inconsistente: answersCount no coincide con las respuestas del foro');
  }

  const imageGroups = await prisma.mediaAsset.groupBy({
    by: ['forumQuestionId', 'forumAnswerId', 'projectId'],
    where: { archivedAt: null },
    _count: { _all: true },
  });
  if (imageGroups.some((group) => group.forumQuestionId && group._count._all > 2)) {
    throw new Error('Seed inconsistente: una pregunta supera el límite de dos imágenes');
  }
  if (imageGroups.some((group) => group.forumAnswerId && group._count._all > 2)) {
    throw new Error('Seed inconsistente: una respuesta supera el límite de dos imágenes');
  }
  if (imageGroups.some((group) => group.projectId && group._count._all > 12)) {
    throw new Error('Seed inconsistente: una galería de proyecto supera el límite de doce imágenes');
  }

  const profiles = await prisma.profile.findMany({
    select: { fullName: true, devPoints: true, researchPoints: true, communityPoints: true, totalPoints: true },
  });
  if (profiles.some((profile) => profile.totalPoints !== profile.devPoints + profile.researchPoints + profile.communityPoints)) {
    throw new Error('Seed inconsistente: el total del ranking no coincide con sus categorías');
  }

  const approvedWithoutPdf = await prisma.article.count({ where: { status: 'APPROVED', pdfUrl: null } });
  const linkedNewsCount = await prisma.news.count({ where: { projectId: { not: null } } });
  const deliveredAuditCount = await prisma.projectAuditDelivery.count({ where: { status: 'SKIPPED' } });
  if (approvedWithoutPdf > 0 || linkedNewsCount < 2 || deliveredAuditCount < 1) {
    throw new Error('Seed incompleto: faltan PDFs, noticias vinculadas o estados de entrega de auditoría');
  }

  const [
    usersCount, communitiesCount, newsCount, projectsCount, milestonesCount,
    articlesCount, eventsCount, mentorshipsCount, questionsCount, answersCount,
    mediaCount, auditCount, likesCount, pointsCount,
  ] = await Promise.all([
    prisma.user.count(), prisma.community.count(), prisma.news.count(), prisma.project.count(),
    prisma.projectMilestone.count(), prisma.article.count(), prisma.event.count(), prisma.mentorship.count(),
    prisma.forumQuestion.count(), prisma.forumAnswer.count(), prisma.mediaAsset.count(),
    prisma.projectAuditLog.count(), prisma.like.count(), prisma.pointsTransaction.count(),
  ]);

  const totals = await prisma.profile.findMany({ select: { fullName: true, totalPoints: true }, orderBy: { totalPoints: 'desc' } });
  console.log('Escenario de presentación verificado:');
  console.log(`  ${usersCount} usuarios, ${communitiesCount} comunidades, ${projectsCount} proyectos y ${milestonesCount} hitos`);
  console.log(`  ${newsCount} noticias, ${articlesCount} artículos, ${eventsCount} eventos y ${mentorshipsCount} mentorías`);
  console.log(`  ${questionsCount} preguntas, ${answersCount} respuestas, ${mediaCount} imágenes y ${likesCount} likes`);
  console.log(`  ${auditCount} entradas de auditoría y ${pointsCount} movimientos de puntos`);
  console.log('Ranking sembrado:');
  for (const t of totals) console.log(`  ${t.fullName}: ${t.totalPoints} pts`);
  console.log('Seed completado. Credenciales demo: admin@isi.edu.bo / password123 (todos los usuarios usan la misma contraseña).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
