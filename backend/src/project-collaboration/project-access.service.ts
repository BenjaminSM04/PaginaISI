import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

type AccessDatabase = Prisma.TransactionClient | PrismaService;

export interface ProjectAccess {
  isAdmin: boolean;
  isOwner: boolean;
  isMember: boolean;
  canManageMembers: boolean;
  role: 'ADMIN' | 'Líder' | 'Colaborador';
}

@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  forProject(user: AuthUser, project: { ownerId: string; members: { userId: string }[] }): ProjectAccess {
    const isAdmin = user.roles.includes('ADMIN');
    const isOwner = project.ownerId === user.id;
    const isMember = project.members.some((member) => member.userId === user.id);
    return {
      isAdmin,
      isOwner,
      isMember,
      canManageMembers: isAdmin || isOwner,
      role: isAdmin ? 'ADMIN' : isOwner ? 'Líder' : 'Colaborador',
    };
  }

  manageableWhere(user: AuthUser): Prisma.ProjectWhereInput {
    if (user.roles.includes('ADMIN')) return {};
    return { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] };
  }

  async assertEditor(user: AuthUser, projectId: string, db: AccessDatabase = this.prisma) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true, version: true, status: true, communityId: true, title: true, members: { select: { userId: true } } },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    const access = this.forProject(user, project);
    if (!access.isAdmin && !access.isOwner && !access.isMember) {
      // No revelar a terceros si el id privado existe.
      throw new NotFoundException('Proyecto no encontrado');
    }
    return { project, access };
  }

  async assertOwnerOrAdmin(user: AuthUser, projectId: string, db: AccessDatabase = this.prisma) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true, version: true, status: true, communityId: true, title: true, members: { select: { userId: true } } },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    const access = this.forProject(user, project);
    if (!access.canManageMembers) {
      throw new ForbiddenException('Solo el líder o un administrador pueden realizar esta acción');
    }
    return { project, access };
  }
}
